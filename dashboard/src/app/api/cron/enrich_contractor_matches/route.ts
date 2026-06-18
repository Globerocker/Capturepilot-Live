/**
 * Match-Drop enrichment — post-QC scoring lane.
 *
 * For contractors that already have a QC profile (qc_enriched = true) it:
 *   1. Builds a scoring profile from the contractor + capability_summary_ai.
 *   2. Pulls live, future-deadline opportunities matching their NAICS.
 *   3. Scores them with scoreOpportunityLeadMagnet() — the same model behind
 *      the public Quick Checker — and keeps the top 6 biddable matches, each
 *      with notice_id/title/agency/score/pwin PLUS matched_keywords +
 *      score_breakdown + the opp's naics_code/set_aside_code (the cockpit
 *      detail card uses these to build "why it fits" bullets without rescoring).
 *   4. Computes the website data-gaps (the email hooks).
 *   5. Merges { top_matches, data_gaps, gap_hook, match_enriched_at } into
 *      capability_summary_ai.
 *
 * No crawl, no LLM — pure DB scoring — so it's cheap and self-throttling
 * (a no-op once every QC-enriched contractor has matches). Emailable
 * contractors are processed first so the campaign audience fills fastest.
 *
 * Guarded; ridden by enrichment_orchestrator every tick.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { computeDataGaps, topMatchesFor, buildFindingsSummary } from "@/lib/outreach/match-drop";
import type { OpportunityForScoring } from "@/lib/match-scoring";

export const runtime = "nodejs";
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

const BUDGET_MS = 250_000;

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const params = new URL(req.url).searchParams;
    const batch = Math.min(120, Math.max(1, parseInt(params.get("batch") || "20", 10)));
    // Drain modes for the keyword-aware rematch:
    //   ?all=1   → match non-emailable contractors too (default keeps the email
    //              filter so the campaign audience fills first).
    //   ?force=1 → re-score already-matched contractors (default only touches
    //              never-scored rows). With force we order by match_enriched_at
    //              nulls-first so unmatched go first, then the stalest, with no
    //              re-processing loop.
    const all = params.get("all") === "1";
    const force = params.get("force") === "1";
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    const nowIso = new Date().toISOString();

    let q = db
        .from("contractors")
        .select("id, company_name, email, naics_codes, certifications, state, federal_awards_count, employee_count, years_in_business, capability_keywords, capability_summary_ai")
        .eq("qc_enriched", true)
        .limit(batch);
    if (!all) q = q.not("email", "is", null);
    if (!force) q = q.is("top_match_count", null);
    q = force
        ? q.order("match_enriched_at", { ascending: true, nullsFirst: true })
        : q.order("federal_awards_count", { ascending: false, nullsFirst: false });
    const { data: rows, error } = await q;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rows?.length) return NextResponse.json({ ok: true, processed: 0, with_matches: 0 });

    const t0 = Date.now();
    let processed = 0;
    let withMatches = 0;
    let withGap = 0;

    for (const c of rows as any[]) {
        if (Date.now() - t0 > BUDGET_MS) break;
        const blob = (c.capability_summary_ai || {}) as any;
        processed++;

        // Candidate opportunities by exact NAICS — active + future (or undated).
        let opps: Array<OpportunityForScoring & { notice_id?: string | null; title?: string | null; agency?: string | null }> = [];
        const naics: string[] = Array.isArray(c.naics_codes) ? c.naics_codes.filter(Boolean) : [];
        if (naics.length) {
            const { data: oppRows } = await db
                .from("opportunities")
                .select("id, notice_id, naics_code, psc_code, notice_type, agency, department, set_aside_code, place_of_performance_state, award_amount, response_deadline, title, description")
                .in("naics_code", naics)
                .neq("is_archived", true)
                .or(`response_deadline.is.null,response_deadline.gte.${nowIso}`)
                .order("response_deadline", { ascending: true, nullsFirst: false })
                .limit(400);
            opps = (oppRows || []) as any[];
        }

        const top = topMatchesFor(c, blob, opps, 6);
        const { gaps, gap_hook } = computeDataGaps(blob, c);
        const findings_summary = buildFindingsSummary(gaps, top);

        if (top.length) withMatches++;
        if (gap_hook) withGap++;

        const patch = {
            // top_match_count is the filterable "processed" marker (NULL → unscored).
            top_match_count: top.length,
            // Real column (migration 191) so the rematch drain can order by it.
            match_enriched_at: nowIso,
            capability_summary_ai: {
                ...blob,
                top_matches: top,
                data_gaps: gaps,
                gap_hook,
                findings_summary,
                match_enriched_at: nowIso,
            },
        };
        await db.from("contractors").update(patch).eq("id", c.id);
    }

    return NextResponse.json({
        ok: true,
        processed,
        with_matches: withMatches,
        with_gap: withGap,
        elapsed_ms: Date.now() - t0,
    });
}
