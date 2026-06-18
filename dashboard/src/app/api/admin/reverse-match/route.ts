/**
 * GET /api/admin/reverse-match?opportunity_id=UUID[&top_n=50]
 *
 * Given a government opportunity, returns the ranked CONTRACTORS that fit it —
 * the inverse of forward matching, for the (future) government-buyer product.
 *
 * SET-ASIDE HARD GATE: see src/lib/reverse-match.ts. We recompute LIVE on every
 * call (the NAICS+cert GIN pre-filter keeps the pool to hundreds) and re-run the
 * canonical per-row eligibility gate on the contractor's live SAM certs, so a
 * stale cache can never leak an ineligible vendor. Results are also written to
 * opportunity_contractor_matches for auditability (best-effort, non-blocking).
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { reverseMatchOpportunity } from "@/lib/reverse-match";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const sp = req.nextUrl.searchParams;
    const opportunityId = (sp.get("opportunity_id") || "").trim();
    const topN = Math.min(Math.max(Number(sp.get("top_n") || 50), 1), 200);
    if (!opportunityId) {
        return NextResponse.json({ ok: false, error: "opportunity_id required" }, { status: 400 });
    }

    const sb = svc();
    let result;
    try {
        result = await reverseMatchOpportunity(sb, opportunityId, { topN });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = msg.includes("not found") ? 404 : 500;
        return NextResponse.json({ ok: false, error: msg }, { status });
    }

    // ── Best-effort audit cache write (never blocks the response) ────────────
    // Use the RESOLVED opportunity UUID (the param may have been a notice_id).
    void writeCache(sb, result.opportunity.id, result);

    return NextResponse.json({ ok: true, ...result });
}

async function writeCache(sb: any, opportunityId: string, result: Awaited<ReturnType<typeof reverseMatchOpportunity>>) {
    try {
        // Replace this opp's cache rows with the fresh ranking.
        await sb.from("opportunity_contractor_matches").delete().eq("opportunity_id", opportunityId);
        if (!result.leads.length) return;
        const rows = result.leads.map((l) => ({
            opportunity_id: opportunityId,
            contractor_id: l.contractor_id,
            score: l.score,
            classification: l.classification,
            eligibility: "eligible",
            score_breakdown: l.score_breakdown,
            set_aside_snapshot: result.opportunity.set_aside_code,
            computed_at: new Date().toISOString(),
        }));
        const { error } = await sb.from("opportunity_contractor_matches").insert(rows);
        if (error) console.warn("[reverse-match] cache write failed:", error.message);
    } catch (e) {
        console.warn("[reverse-match] cache write threw:", e instanceof Error ? e.message : String(e));
    }
}
