/**
 * Cron: SAM-REFRESH lane — re-confirm SAM registration state for contractors.
 *
 * The `contractors` table holds 80k+ SAM entities but the live SAM record drifts:
 * firms let their registration lapse (Inactive), renew (new expiration_date), or
 * pick up / drop SBA program certifications. The cockpit's set-aside hard gate
 * and the "Active · expires in N days" badge are only as good as the last refresh.
 *
 * This lane re-pulls the SAM Entity API (entityRegistration + coreData) for a
 * prioritized slice of contractors and writes back the AUTHORITATIVE:
 *   • registration_status   'Active' | 'Inactive'   (new column, migration 187)
 *   • sam_registration_date  from entityRegistration.registrationDate ("registered since")
 *   • expiration_date        re-confirmed from registrationExpirationDate
 *   • sba_certifications     merged canonical set-aside certs (SAM = source of truth)
 *   • is_sam_registered      (status === 'Active')
 *   • sam_refreshed_at        now() — stamped even on not-found so we don't loop
 *
 * SBA cert path (probed live 2026-06-17):
 *   coreData.businessTypes.sbaBusinessTypeList[]  → { sbaBusinessTypeCode, sbaBusinessTypeDesc }
 *     e.g. "A6" = "SBA Certified 8(a) Program Participant"
 *   coreData.businessTypes.businessTypeList[]     → { businessTypeCode, businessTypeDesc }
 *     HUBZone / SDVOSB / VOSB / WOSB / EDWOSB descriptions live here.
 *   (NOTE: the old bulk_enrich cron read assertions.goodsAndServices.sbaBusinessTypeList,
 *    which the live v3 API returns undefined for — coreData.businessTypes is correct.)
 *
 * Prioritization (most decision-relevant first):
 *   1. queue firms (top_match_count > 0)
 *   2. award holders (federal_awards_count > 0)
 *   3. expiring-soon (expiration_date within 120 days)
 *   4. never-refreshed (sam_refreshed_at is null)
 * Within the slice we only touch rows that are stale (sam_refreshed_at null or > 30d).
 *
 * SAM Entity API is rate-limited (~1000/h/key, easily throttled on bursts), so we
 * keep concurrency LOW (~3) with small delays between waves.
 *
 * Query params:
 *   ?limit=N   batch size (default 25, cap 100)
 *
 * Schedule: nodejs runtime, maxDuration 300.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const CONCURRENCY = 3;
const WAVE_DELAY_MS = 350;
const STALE_DAYS = 30;
const EXPIRING_WINDOW_DAYS = 120;
const SAM_ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities";

/** Resolve a SAM API key. Prefer the dedicated entity key, then the pool members. */
function resolveSamKey(): string {
    return (
        process.env.SAM_API_KEY ||
        process.env.SAM_API_KEY_2 ||
        process.env.SAM_API_KEY_3 ||
        ""
    );
}

interface SamEntity {
    entityRegistration?: {
        ueiSAM?: string;
        registrationStatus?: string;
        registrationDate?: string;
        registrationExpirationDate?: string;
    };
    coreData?: {
        businessTypes?: {
            businessTypeList?: Array<{ businessTypeCode?: string; businessTypeDesc?: string }>;
            sbaBusinessTypeList?: Array<{
                sbaBusinessTypeCode?: string | null;
                sbaBusinessTypeDesc?: string | null;
            }>;
        };
    };
}

/**
 * Map the SAM businessTypes lists to our canonical set-aside cert codes.
 * We match on BOTH the SBA program list (coreData.businessTypes.sbaBusinessTypeList)
 * and the general business-type list (coreData.businessTypes.businessTypeList).
 * Matching is description-text-first (robust to code churn) with the known SBA
 * code "A6" (8(a)) recognized explicitly. Returns canonical codes used by the
 * set-aside hard gate: 8(a) / HUBZone / SDVOSB / VOSB / WOSB / EDWOSB / SDB.
 */
function certsFromEntity(e: SamEntity): string[] {
    const bt = e.coreData?.businessTypes;
    const general = bt?.businessTypeList || [];
    const sba = bt?.sbaBusinessTypeList || [];

    const codes = new Set<string>();
    const text = [
        ...general.map((t) => `${t.businessTypeCode || ""} ${t.businessTypeDesc || ""}`),
        ...sba.map((s) => `${s.sbaBusinessTypeCode || ""} ${s.sbaBusinessTypeDesc || ""}`),
    ]
        .join(" | ")
        .toLowerCase();

    // Known SBA program code: A6 = SBA Certified 8(a) Program Participant.
    for (const s of sba) {
        if ((s.sbaBusinessTypeCode || "").toUpperCase() === "A6") codes.add("8(a)");
    }

    const out = new Set<string>();
    if (codes.has("8(a)") || /8\s*\(?a\)?/.test(text)) out.add("8(a)");
    if (text.includes("hubzone")) out.add("HUBZone");
    if (text.includes("service-disabled veteran") || text.includes("sdvosb")) out.add("SDVOSB");
    else if (text.includes("veteran-owned") || text.includes("veteran owned") || text.includes("vosb")) out.add("VOSB");
    if (text.includes("economically disadvantaged women") || text.includes("edwosb")) out.add("EDWOSB");
    if (text.includes("women-owned") || text.includes("women owned") || text.includes("wosb")) out.add("WOSB");
    if (text.includes("small disadvantaged business") || /\bsdb\b/.test(text)) out.add("SDB");

    return [...out];
}

/** The set of certs this lane treats as authoritative-from-SAM (the set-aside gate certs). */
const SET_ASIDE_CERTS = new Set(["8(a)", "HUBZone", "SDVOSB", "VOSB", "WOSB", "EDWOSB", "SDB"]);

/**
 * Merge SAM-authoritative set-aside certs with whatever we already hold.
 *  • For the set-aside certs (the hard-gate ones), SAM is the source of truth:
 *    if SAM returns ANY set-aside cert we replace our set-aside certs with SAM's
 *    (so a dropped cert is removed). If SAM returns NONE we DON'T blindly wipe —
 *    we keep the existing set-aside certs (avoids clobbering on a partial/odd
 *    response), per the "do not drop certs we can't reconfirm without care" rule.
 *  • Non-set-aside entries we already had (e.g. ISO, raw SAM type codes) are
 *    preserved untouched.
 */
function mergeCerts(existing: string[], samCerts: string[]): { merged: string[]; changed: boolean } {
    const ex = Array.isArray(existing) ? existing.filter(Boolean).map(String) : [];
    const samSetAside = samCerts.filter((c) => SET_ASIDE_CERTS.has(c));
    const nonSetAside = ex.filter((c) => !SET_ASIDE_CERTS.has(c));

    let resolvedSetAside: string[];
    if (samSetAside.length > 0) {
        // SAM is authoritative — adopt its set-aside certs verbatim.
        resolvedSetAside = samSetAside;
    } else {
        // SAM reconfirmed nothing — keep what we had rather than wiping.
        resolvedSetAside = ex.filter((c) => SET_ASIDE_CERTS.has(c));
    }

    const merged = [...new Set([...resolvedSetAside, ...nonSetAside])];
    const before = [...new Set(ex)].sort().join("|");
    const after = [...merged].sort().join("|");
    return { merged, changed: before !== after };
}

async function fetchEntity(uei: string, apiKey: string): Promise<SamEntity | null> {
    const params = new URLSearchParams({
        ueiSAM: uei.toUpperCase(),
        includeSections: "entityRegistration,coreData",
    });
    const res = await fetch(`${SAM_ENTITY_URL}?${params}`, {
        headers: { "X-Api-Key": apiKey },
        signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) throw new Error("SAM 429 — quota exhausted");
    if (res.status === 403) throw new Error("SAM 403 — throttled/forbidden");
    if (!res.ok) {
        // 404 / 400 etc. — entity not found or bad request; not fatal for the lane.
        if (res.status === 404) return null;
        // A throttle sometimes returns an HTML body with a 2xx-ish wrapper; guard JSON parse.
        return null;
    }
    let data: { entityData?: SamEntity[] };
    try {
        data = (await res.json()) as { entityData?: SamEntity[] };
    } catch {
        // Throttle pages return non-JSON HTML — treat as a soft throttle.
        throw new Error("SAM non-JSON response — likely throttled");
    }
    return data.entityData?.[0] ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ContractorRow {
    id: string;
    uei: string;
    sba_certifications: string[] | null;
    top_match_count: number | null;
    federal_awards_count: number | null;
    expiration_date: string | null;
}

async function GET_handler(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const apiKey = resolveSamKey();
    if (!apiKey) {
        return NextResponse.json(
            { ok: false, error: "SAM API key missing (SAM_API_KEY / SAM_API_KEY_2 / SAM_API_KEY_3)" },
            { status: 500 },
        );
    }

    const url = new URL(req.url);
    const reqLimit = Number(url.searchParams.get("limit") || "");
    const limit = Math.min(
        MAX_LIMIT,
        Math.max(1, Number.isFinite(reqLimit) && reqLimit > 0 ? Math.floor(reqLimit) : DEFAULT_LIMIT),
    );

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const nowMs = Date.now();
    const staleCutoff = new Date(nowMs - STALE_DAYS * 86400000).toISOString();
    const expiringCutoff = new Date(nowMs + EXPIRING_WINDOW_DAYS * 86400000).toISOString();

    // Stale predicate, reused across the prioritized passes: never refreshed OR
    // refreshed more than STALE_DAYS ago. PostgREST `.or()` over the two cases.
    const STALE_OR = `sam_refreshed_at.is.null,sam_refreshed_at.lt.${staleCutoff}`;
    const COLS = "id, uei, sba_certifications, top_match_count, federal_awards_count, expiration_date";

    // Pull a prioritized candidate set, de-duped by id, until we hit `limit`.
    const picked = new Map<string, ContractorRow>();
    const remaining = () => limit - picked.size;

    async function pass(refine: (q: any) => any) {
        if (remaining() <= 0) return;
        let q = db
            .from("contractors")
            .select(COLS)
            .not("uei", "is", null)
            // length(uei)=12 — PostgREST can't call length() directly; use a regex
            // match for exactly 12 alphanumerics (the SAM UEI shape).
            .filter("uei", "match", "^[A-Za-z0-9]{12}$")
            .or(STALE_OR)
            .limit(remaining());
        q = refine(q);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        for (const r of (data || []) as ContractorRow[]) {
            if (!picked.has(r.id)) picked.set(r.id, r);
        }
    }

    try {
        // 1) queue firms (have matches) — most outreach-relevant.
        await pass((q) =>
            q.gt("top_match_count", 0).order("top_match_count", { ascending: false, nullsFirst: false }),
        );
        // 2) award holders.
        await pass((q) =>
            q.gt("federal_awards_count", 0).order("federal_awards_count", { ascending: false, nullsFirst: false }),
        );
        // 3) expiring soon (within EXPIRING_WINDOW_DAYS) — catch lapses before they bite.
        await pass((q) =>
            q
                .not("expiration_date", "is", null)
                .lte("expiration_date", expiringCutoff)
                .order("expiration_date", { ascending: true, nullsFirst: false }),
        );
        // 4) never-refreshed backfill (oldest/never first).
        await pass((q) => q.order("sam_refreshed_at", { ascending: true, nullsFirst: true }));
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "candidate select failed" }, { status: 500 });
    }

    const targets = [...picked.values()];
    if (targets.length === 0) {
        return NextResponse.json({
            ok: true,
            scanned: 0,
            refreshed: 0,
            active: 0,
            inactive: 0,
            certs_updated: 0,
            message: "no stale candidates",
        });
    }

    const stats = { scanned: 0, refreshed: 0, active: 0, inactive: 0, certs_updated: 0, not_found: 0, errors: 0 };
    let throttled = false;
    const startedAt = Date.now();
    const nowIso = new Date().toISOString();

    // Process in low-concurrency waves with a small delay between waves to stay
    // under SAM's rate limit. Each contractor is independently try/caught.
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        if (throttled) break;
        if (Date.now() - startedAt > 270_000) break; // leave headroom

        const wave = targets.slice(i, i + CONCURRENCY);
        await Promise.all(
            wave.map(async (c) => {
                stats.scanned++;
                try {
                    let entity: SamEntity | null = null;
                    try {
                        entity = await fetchEntity(c.uei, apiKey);
                    } catch (e: any) {
                        const msg = String(e?.message || "");
                        if (msg.includes("429") || msg.includes("403") || msg.includes("throttl")) {
                            throttled = true;
                            return; // stop hammering; row stays un-stamped, retried next run
                        }
                        stats.errors++;
                        return;
                    }

                    if (!entity || !entity.entityRegistration) {
                        // Not found in SAM (deregistered / bad UEI). Stamp refreshed_at
                        // so we don't loop on it, but don't fabricate a status.
                        stats.not_found++;
                        await db
                            .from("contractors")
                            .update({ sam_refreshed_at: nowIso })
                            .eq("id", c.id);
                        return;
                    }

                    const reg = entity.entityRegistration;
                    const statusRaw = (reg.registrationStatus || "").trim();
                    const isActive = statusRaw.toLowerCase() === "active";
                    if (isActive) stats.active++;
                    else if (statusRaw) stats.inactive++;

                    const update: Record<string, unknown> = {
                        sam_refreshed_at: nowIso,
                    };
                    if (statusRaw) {
                        update.registration_status = statusRaw;
                        update.is_sam_registered = isActive;
                    }
                    if (reg.registrationDate) update.sam_registration_date = reg.registrationDate;
                    if (reg.registrationExpirationDate) update.expiration_date = reg.registrationExpirationDate;

                    // Merge authoritative SAM set-aside certs (source of truth) with
                    // any non-set-aside certs we already hold.
                    const samCerts = certsFromEntity(entity);
                    const { merged, changed } = mergeCerts(c.sba_certifications || [], samCerts);
                    if (changed) {
                        update.sba_certifications = merged;
                        stats.certs_updated++;
                    }

                    const { error: upErr } = await db.from("contractors").update(update).eq("id", c.id);
                    if (upErr) stats.errors++;
                    else stats.refreshed++;
                } catch {
                    stats.errors++;
                }
            }),
        );

        if (!throttled && i + CONCURRENCY < targets.length) await sleep(WAVE_DELAY_MS);
    }

    return NextResponse.json({
        ok: true,
        limit,
        elapsed_ms: Date.now() - startedAt,
        throttled,
        scanned: stats.scanned,
        refreshed: stats.refreshed,
        active: stats.active,
        inactive: stats.inactive,
        certs_updated: stats.certs_updated,
        not_found: stats.not_found,
        errors: stats.errors,
    });
}

export const GET = withCronTelemetry("/api/cron/refresh_sam_registration", GET_handler);
