/**
 * POST /api/admin/cockpit/enrich — on-demand "Pro AI enrich" for ONE contractor
 * from the cockpit lead queue.
 *
 * Runs two best-effort sub-steps for the given contractor:
 *   1. Firmographic cascade (Apollo → SAM → OpenCorporates → Wayback) via the
 *      shared enrichFirmographics() helper — fills employee_count /
 *      years_in_business that the QC crawl couldn't extract.
 *   2. Owner/CEO LinkedIn finder (Brave-primary, DuckDuckGo-fallback) for the
 *      contractor's primary POC.
 *
 * Write-back rules (mirrors the Phase-8 cascade in quick-checker-finish):
 *   - Only OVERWRITE a column when the new value is REAL (non-null, real source).
 *     Never clobber a good existing value with null.
 *   - Always stamp owner_linkedin_searched_at when we ran the LinkedIn finder
 *     (found or not) so the cron never re-searches this row.
 *
 * Each sub-step is independently try/caught — a slow/failed third-party never
 * fails the whole request. Returns the resolved scalars + per-field source map.
 *
 * Admin-gated via assertAdmin(). Service client for the read + write.
 *
 * Body: { contractor_id: string }
 * Returns: { ok, updated: { employee_count?, years_in_business?, owner_linkedin? }, sources }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { enrichFirmographics } from "@/lib/quick-checker/firmographics";
import { findOwnerLinkedIn } from "@/lib/quick-checker/find-linkedin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = "nodejs";
export const maxDuration = 60;

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

/** Extract a bare hostname (no protocol, no www.) from a website/business_url field. */
function toDomain(raw: string | null | undefined): string {
    const v = (raw || "").trim();
    if (!v) return "";
    try {
        const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
        return new URL(withProto).hostname.replace(/^www\./i, "");
    } catch {
        return "";
    }
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const contractor_id = typeof body.contractor_id === "string" ? body.contractor_id.trim() : "";
    if (!contractor_id) {
        return NextResponse.json({ ok: false, error: "contractor_id required" }, { status: 400 });
    }

    const db = svc();

    // ── Load the contractor row ──────────────────────────────────────────────
    const { data: c, error } = await db
        .from("contractors")
        .select(
            "id, company_name, website, business_url, uei, primary_poc_name, employee_count, years_in_business, owner_linkedin",
        )
        .eq("id", contractor_id)
        .maybeSingle();
    if (error) {
        console.error("[cockpit/enrich] contractor lookup failed:", error.message);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!c) {
        return NextResponse.json({ ok: false, error: "contractor not found" }, { status: 404 });
    }

    const row = c as any;
    const domain = toDomain(row.website || row.business_url);
    const companyName = (row.company_name as string) || "";

    const updated: { employee_count?: number; years_in_business?: number; owner_linkedin?: string } = {};
    const sources: Record<string, string> = {};
    const patch: Record<string, unknown> = {};

    // ── Sub-step 1: firmographic cascade (employees / years_in_business) ───────
    try {
        const firmo = await enrichFirmographics({
            domain,
            companyName,
            uei: (row.uei as string | null) || null,
            existing: {
                employee_count: (row.employee_count as number | null) ?? null,
                founded_year: (row.years_in_business as number | null)
                    ? new Date().getFullYear() - (row.years_in_business as number)
                    : null,
            },
        });

        // employee_count — only set when resolved to a real source AND the row
        // doesn't already carry a value (never clobber a good value).
        if (
            firmo.employee_count.value !== null &&
            firmo.employee_count.source !== "missing" &&
            firmo.employee_count.source !== "crawl" &&
            !(row.employee_count > 0)
        ) {
            patch.employee_count = firmo.employee_count.value;
            updated.employee_count = firmo.employee_count.value;
            sources.employee_count = firmo.employee_count.source;
        }

        // years_in_business — derived from founded_year by the cascade. Only fill
        // when real and the row is empty.
        if (
            firmo.years_in_business.value !== null &&
            firmo.years_in_business.source !== "missing" &&
            firmo.years_in_business.source !== "crawl" &&
            !(row.years_in_business > 0)
        ) {
            patch.years_in_business = firmo.years_in_business.value;
            updated.years_in_business = firmo.years_in_business.value;
            sources.years_in_business = firmo.years_in_business.source;
        }
    } catch (e) {
        console.error("[cockpit/enrich] firmographics failed:", e instanceof Error ? e.message : String(e));
    }

    // ── Sub-step 2: owner/CEO LinkedIn finder (Brave → DDG) ────────────────────
    // Always stamp searched_at so the cron lane never re-walks this row. Never
    // clobber an already-resolved owner_linkedin.
    try {
        patch.owner_linkedin_searched_at = new Date().toISOString();
        if (!row.owner_linkedin && row.primary_poc_name) {
            const li = await findOwnerLinkedIn(row.primary_poc_name as string, companyName);
            if (li?.url) {
                patch.owner_linkedin = li.url;
                updated.owner_linkedin = li.url;
                sources.owner_linkedin = process.env.BRAVE_SEARCH_API_KEY ? "brave" : "duckduckgo";
            }
        }
    } catch (e) {
        console.error("[cockpit/enrich] linkedin finder failed:", e instanceof Error ? e.message : String(e));
    }

    // ── Persist (resilient — log on failure, still return what we resolved) ────
    try {
        if (Object.keys(patch).length) {
            const { error: upErr } = await db.from("contractors").update(patch).eq("id", contractor_id);
            if (upErr) {
                console.error("[cockpit/enrich] write-back failed:", upErr.message);
                return NextResponse.json(
                    { ok: false, error: upErr.message, updated, sources },
                    { status: 500 },
                );
            }
        }
    } catch (e) {
        console.error("[cockpit/enrich] write-back threw:", e instanceof Error ? e.message : String(e));
        return NextResponse.json(
            { ok: false, error: "write-back failed", updated, sources },
            { status: 500 },
        );
    }

    return NextResponse.json({ ok: true, updated, sources });
}
