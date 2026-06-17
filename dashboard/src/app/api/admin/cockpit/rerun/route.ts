/**
 * POST /api/admin/cockpit/rerun — admin-only "re-run" control for a cockpit lead.
 *
 * Two modes, dispatched by which id is in the body:
 *
 *  • { contractor_id, full? }  — a SAM.gov contractor lead.
 *      Sets top_match_count = NULL, which re-queues the contractor for the
 *      match-drop scoring lane (/api/cron/enrich_contractor_matches claims rows
 *      WHERE top_match_count IS NULL). If full === true it ALSO sets
 *      qc_enriched = false (and clears qc_claimed_at) so the full QC re-crawl
 *      lane (/api/cron/enrich_contractors_quickcheck claims qc_enriched = false)
 *      re-runs the crawl + capability analysis from scratch.
 *      Returns requeued: 'matches' | 'full'.
 *
 *  • { analysis_id }  — an inbound Quick Checker lead (company_analyses).
 *      Replays the existing rescore path (/api/analyze-company/rescore) against
 *      the analysis's current NAICS so preview_matches / competitors / readiness
 *      / ai_match_summaries are recomputed against live opportunities.
 *      Returns requeued: 'rescore'.
 *
 * Service client for the writes; assertAdmin() gate.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { POST as rescorePost } from "@/app/api/analyze-company/rescore/route";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

/** Pull 6-digit NAICS codes from an analysis row (inferred_naics first, then inferred_profile). */
function naicsFromAnalysis(a: any): string[] {
    const out: string[] = [];
    const fromInferred = Array.isArray(a?.inferred_naics) ? a.inferred_naics : [];
    for (const n of fromInferred) {
        const code = typeof n === "string" ? n : String(n?.code || "");
        if (/^\d{6}$/.test(code)) out.push(code);
    }
    if (out.length === 0) {
        const profileCodes = a?.inferred_profile?.naics_codes;
        if (Array.isArray(profileCodes)) {
            for (const c of profileCodes) {
                const code = String(c || "");
                if (/^\d{6}$/.test(code)) out.push(code);
            }
        }
    }
    return out.filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 5);
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({}));
    const contractorId = (body?.contractor_id as string | undefined)?.trim() || null;
    const analysisId = (body?.analysis_id as string | undefined)?.trim() || null;
    const full = body?.full === true;

    if (!contractorId && !analysisId) {
        return NextResponse.json({ error: "contractor_id or analysis_id required" }, { status: 400 });
    }

    const sb = svc();

    // ── Contractor: re-queue match enrichment (and optionally full re-crawl) ──
    if (contractorId) {
        const patch: Record<string, unknown> = { top_match_count: null };
        if (full) {
            patch.qc_enriched = false;
            // Clear the claim stamp so the QC lane (which orders by qc_claimed_at)
            // can pick it back up immediately rather than treating it as in-flight.
            patch.qc_claimed_at = null;
        }
        const { error } = await sb.from("contractors").update(patch).eq("id", contractorId);
        if (error) {
            // qc_claimed_at may not exist in every environment — retry without it.
            if (full && /qc_claimed_at/i.test(error.message)) {
                const { error: retryErr } = await sb
                    .from("contractors")
                    .update({ top_match_count: null, qc_enriched: false })
                    .eq("id", contractorId);
                if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 });
            } else {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        }
        return NextResponse.json({ ok: true, requeued: full ? "full" : "matches" });
    }

    // ── Inbound analysis: replay the existing rescore path ───────────────────
    const { data: analysis, error: aErr } = await sb
        .from("company_analyses")
        .select("id, inferred_naics, inferred_profile")
        .eq("id", analysisId)
        .maybeSingle();
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
    if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });

    const naicsCodes = naicsFromAnalysis(analysis);
    if (naicsCodes.length === 0) {
        return NextResponse.json(
            { error: "Analysis has no NAICS codes to rescore against" },
            { status: 422 },
        );
    }

    // Replay through the canonical rescore handler so all of its logic
    // (scoring, competitors, readiness, AI summaries, persistence) runs exactly
    // as it does for the Edit & Re-Match button. Build a synthetic request.
    const rescoreReq = new NextRequest(new URL("/api/analyze-company/rescore", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis_id: analysisId, naics_codes: naicsCodes }),
    });

    const rescoreRes = await rescorePost(rescoreReq);
    const rescoreJson = await rescoreRes.json().catch(() => ({}));
    if (!rescoreRes.ok) {
        return NextResponse.json(
            { error: (rescoreJson as any)?.error || "rescore failed", status: rescoreRes.status },
            { status: rescoreRes.status },
        );
    }

    return NextResponse.json({ ok: true, requeued: "rescore", rescore: rescoreJson });
}
