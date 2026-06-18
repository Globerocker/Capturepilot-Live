import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const maxDuration = 300;

/**
 * Backfill fpds_awards.number_of_offers_received + extent_competed.
 *
 * Context: migration 047 declared both columns but the USAspending ingest
 * (`ingest_fpds_awards`) never populated them — they are NULL on all ~7,595
 * rows. They power the single-offer pitch stat ("X% of awards in your NAICS
 * got only one bid — you're competing against almost nobody").
 *
 * Why a dedicated detail fetch (and not the search endpoint):
 *   USAspending's /search/spending_by_award endpoint accepts the
 *   "Number of Offers Received" + "extent competed" fields but returns them
 *   as NULL for nearly every row, even when the per-award detail endpoint has
 *   the real value. Verified empirically: search said offers=null for
 *   36C24226P0380 while /api/v2/awards/<generated_internal_id>/ returned
 *   offers=1, extent=C. So the search projection is unreliable; the
 *   authoritative source is the award-detail endpoint.
 *
 * Join key: we store the human PIID (e.g. "W912PM23C0020") in `fpds_awards.piid`.
 * The award-detail endpoint keys off USAspending's `generated_internal_id`
 * (e.g. "CONT_AWD_W912PM23C0020_9700_-NONE-_-NONE-"), which we do NOT store on
 * the historical 7,595 rows (`source_url` is NULL on all of them). So per row:
 *   1. If `source_url` already holds a generated_internal_id → 1-step detail.
 *   2. Otherwise → search /spending_by_award filtered by award_ids=[piid] to
 *      resolve generated_internal_id (verified to return exactly 1 row per
 *      stored PIID in our sample), disambiguating with the stored
 *      contractor_uei (== USAspending recipient_id, case-insensitive) when a
 *      PIID ever returns >1, then fetch detail.
 * We persist the resolved generated_internal_id back into `source_url` so a
 * re-run (or a future ingest that already captured it) is a cheap 1-step fetch.
 *
 * Cost / rate guards:
 *   - USAspending is free + keyless but rate-limits aggressively. We cap the
 *     batch (`limit`, default 300), gap each request (`gap_ms`, default 120ms),
 *     retry once on 429/5xx with backoff, abort-timeout every request, and
 *     stop at 270s wall clock so the response returns cleanly inside the 300s
 *     maxDuration. Resumable: each pass claims the next NULL batch.
 *
 * Query params (all optional, also accepted from POST JSON body):
 *   ?limit=300        rows to attempt this run
 *   ?gap_ms=120       inter-request delay
 *   ?dry=1            fetch + log, do not write
 */

const SEARCH_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const AWARD_DETAIL_BASE = "https://api.usaspending.gov/api/v2/awards/";
const REQ_TIMEOUT_MS = 25_000;
const WALL_CLOCK_BUDGET_MS = 270_000;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const UA = "CapturePilot-FPDS-OffersBackfill/1.0";

/** GET with one retry on 429/5xx. Returns parsed JSON or null on hard failure. */
async function fetchJson(
    url: string,
    init: RequestInit,
    gapMs: number,
): Promise<any | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(url, {
                ...init,
                headers: {
                    "User-Agent": UA,
                    Accept: "application/json",
                    ...(init.headers || {}),
                },
                signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
            });
            if (res.status === 429 || res.status >= 500) {
                if (attempt === 0) { await sleep(gapMs * 5 + 500); continue; }
                return null;
            }
            if (!res.ok) return null;
            return await res.json();
        } catch {
            if (attempt === 0) { await sleep(gapMs * 5 + 500); continue; }
            return null;
        }
    }
    return null;
}

/** Resolve generated_internal_id for a PIID via the search endpoint. */
async function resolveGeneratedId(
    piid: string,
    storedUei: string | null,
    gapMs: number,
): Promise<string | null> {
    const j = await fetchJson(
        SEARCH_URL,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filters: {
                    award_type_codes: ["A", "B", "C", "D"],
                    award_ids: [piid],
                },
                fields: ["Award ID", "generated_internal_id", "recipient_id"],
                page: 1,
                limit: 10,
            }),
        },
        gapMs,
    );
    const rows: Array<Record<string, unknown>> = j?.results || [];
    if (rows.length === 0) return null;
    if (rows.length === 1) return (rows[0].generated_internal_id as string) || null;
    // >1 hit: disambiguate by recipient_id == stored contractor_uei (the ingest
    // stored recipient_id, upper-cased, in contractor_uei).
    if (storedUei) {
        const match = rows.find(
            r => String(r.recipient_id || "").toUpperCase() === storedUei.toUpperCase(),
        );
        if (match) return (match.generated_internal_id as string) || null;
    }
    // Ambiguous and no UEI match — take the first deterministically rather than
    // risk writing a wrong award's offer count.
    return null;
}

/** Fetch offers + extent_competed from the award-detail endpoint. */
async function fetchCompetition(
    generatedId: string,
    gapMs: number,
): Promise<{ offers: number | null; extent: string | null } | null> {
    const j = await fetchJson(
        AWARD_DETAIL_BASE + encodeURIComponent(generatedId) + "/",
        { method: "GET" },
        gapMs,
    );
    if (!j) return null;
    const lc = (j.latest_transaction_contract_data || {}) as Record<string, unknown>;
    const rawOffers = lc.number_of_offers_received;
    let offers: number | null = null;
    if (rawOffers !== null && rawOffers !== undefined && rawOffers !== "") {
        const n = parseInt(String(rawOffers), 10);
        offers = Number.isFinite(n) ? n : null;
    }
    const extent = (lc.extent_competed as string) || null;
    return { offers, extent };
}

function readParams(req: NextRequest, body: Record<string, unknown>) {
    const sp = req.nextUrl.searchParams;
    const num = (key: string, dflt: number) => {
        const v = sp.get(key) ?? (body[key] != null ? String(body[key]) : null);
        const n = v != null ? parseInt(v, 10) : NaN;
        return Number.isFinite(n) ? n : dflt;
    };
    const limit = Math.min(Math.max(num("limit", 300), 1), 2000);
    const gapMs = Math.min(Math.max(num("gap_ms", 120), 0), 2000);
    const dry = sp.get("dry") === "1" || body.dry === true || body.dry === "1";
    return { limit, gapMs, dry };
}

async function handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
        try { body = await req.json(); } catch { body = {}; }
    }
    const { limit, gapMs, dry } = readParams(req, body);

    const db = getSupabase();
    const startTime = Date.now();
    const stats = {
        limit,
        gap_ms: gapMs,
        dry,
        considered: 0,
        resolved_id: 0,        // generated_internal_id obtained (stored or freshly resolved)
        unresolved_id: 0,      // search couldn't pin a single award
        detail_ok: 0,          // award-detail fetch succeeded
        detail_failed: 0,
        offers_populated: 0,   // offers value written (non-null)
        extent_populated: 0,   // extent_competed written (non-null)
        no_data_on_source: 0,  // detail succeeded but both fields null upstream
        updated: 0,
        errors: 0,
    };

    // Claim rows never backfilled: both competition columns NULL + a usable PIID.
    // `source_url IS NULL` is the "not yet attempted" marker — the backfill
    // always writes the resolved generated_internal_id into source_url, so a
    // row that legitimately has no offers/extent upstream gets source_url set
    // and is excluded from future runs instead of being re-fetched forever.
    // Oldest fetched first so the historical NULLs drain before new ingests.
    const { data: rows, error } = await db
        .from("fpds_awards")
        .select("id, piid, contractor_uei, source_url, number_of_offers_received, extent_competed")
        .is("number_of_offers_received", null)
        .is("extent_competed", null)
        .is("source_url", null)
        .not("piid", "is", null)
        .neq("piid", "")
        .order("fetched_at", { ascending: true, nullsFirst: true })
        .limit(limit);

    if (error) {
        return NextResponse.json({ success: false, error: error.message, ...stats }, { status: 500 });
    }
    if (!rows || rows.length === 0) {
        return NextResponse.json({ success: true, message: "Nothing to backfill", ...stats });
    }

    for (const row of rows as Array<{
        id: string;
        piid: string;
        contractor_uei: string | null;
        source_url: string | null;
    }>) {
        if (Date.now() - startTime > WALL_CLOCK_BUDGET_MS) break;
        stats.considered++;

        try {
            // 1. Resolve generated_internal_id (stored in source_url, else search).
            let generatedId = row.source_url || null;
            if (!generatedId) {
                await sleep(gapMs);
                generatedId = await resolveGeneratedId(row.piid, row.contractor_uei, gapMs);
            }
            if (!generatedId) { stats.unresolved_id++; continue; }
            stats.resolved_id++;

            // 2. Fetch competition fields from the authoritative detail endpoint.
            await sleep(gapMs);
            const comp = await fetchCompetition(generatedId, gapMs);
            if (!comp) { stats.detail_failed++; continue; }
            stats.detail_ok++;

            if (comp.offers !== null) stats.offers_populated++;
            if (comp.extent !== null) stats.extent_populated++;
            if (comp.offers === null && comp.extent === null) stats.no_data_on_source++;

            // 3. Persist. Always stash the generated_internal_id so a re-run is a
            //    cheap 1-step detail fetch. We write whatever the source had —
            //    rows where USAspending genuinely has no offer count keep
            //    number_of_offers_received NULL but get source_url + (often)
            //    extent_competed, so the next pass still skips them (extent NN).
            if (dry) continue;
            const update: Record<string, unknown> = { source_url: generatedId };
            if (comp.offers !== null) update.number_of_offers_received = comp.offers;
            if (comp.extent !== null) update.extent_competed = comp.extent;

            const { error: upErr } = await db
                .from("fpds_awards")
                .update(update)
                .eq("id", row.id);
            if (upErr) stats.errors++;
            else stats.updated++;
        } catch {
            stats.errors++;
        }
    }

    return NextResponse.json({
        success: true,
        ...stats,
        elapsed_ms: Date.now() - startTime,
        remaining_note: "Re-run until considered < limit (or offers/extent both populated).",
    });
}

export const GET = withCronTelemetry("/api/cron/backfill_fpds_offers", handler);
export const POST = withCronTelemetry("/api/cron/backfill_fpds_offers", handler);
