import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeStrategicScoring } from "@/lib/strategic-scoring";
import { extractStructuredRequirements } from "@/lib/extract-requirements";

export const maxDuration = 300;

const PAGE_SIZE = 1000; // PostgREST default max-rows cap
const SCORING_PHASE_BUDGET_MS = 200_000;
const REQS_PHASE_BUDGET_MS = 280_000;

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

interface Stats {
    limit: number;
    only: string;
    pages: number;
    scoring_processed: number;
    scoring_updated: number;
    reqs_processed: number;
    reqs_updated: number;
    errors: number;
    elapsed_ms: number;
}

/**
 * POST /api/admin/backfill-enrichment
 *
 * Bulk backfill for the strategic_scoring + structured_requirements columns on
 * opportunities that currently have them empty/null. Pure-deterministic — no
 * paid LLM calls.
 *
 * The route loops in 1000-row pages (PostgREST's max-rows cap) until either
 * the requested `limit` is reached or the per-phase time budget runs out.
 *
 * Body (optional):
 *   { limit?: number = 5000, only?: "strategic" | "requirements" | "both" = "both" }
 */
export async function POST(req: NextRequest) {
    let body: { limit?: number; only?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    const LIMIT = Math.min(20_000, Math.max(1, body.limit || 5000));
    const only = body.only || "both";
    const doScoring = only === "both" || only === "strategic";
    const doReqs = only === "both" || only === "requirements";

    const admin = getAdmin();
    const startTime = Date.now();

    const stats: Stats = {
        limit: LIMIT,
        only,
        pages: 0,
        scoring_processed: 0,
        scoring_updated: 0,
        reqs_processed: 0,
        reqs_updated: 0,
        errors: 0,
        elapsed_ms: 0,
    };

    // --- Pass 1: strategic_scoring (page until LIMIT or budget) ---
    if (doScoring) {
        while (
            stats.scoring_processed < LIMIT &&
            Date.now() - startTime < SCORING_PHASE_BUDGET_MS
        ) {
            const remaining = LIMIT - stats.scoring_processed;
            const pageSize = Math.min(PAGE_SIZE, remaining);

            const { data: opps, error } = await admin
                .from("opportunities")
                .select("id, notice_type, set_aside_code, naics_code, estimated_value, award_amount, description, incumbent_contractor_name, response_deadline, sources_sought_flag")
                .eq("is_archived", false)
                .or("strategic_scoring.is.null,strategic_scoring.eq.{}")
                .range(0, pageSize - 1);

            if (error || !opps || opps.length === 0) {
                if (error) stats.errors++;
                break;
            }
            stats.pages++;

            for (const opp of opps) {
                if (Date.now() - startTime > SCORING_PHASE_BUDGET_MS) break;
                stats.scoring_processed++;
                try {
                    const scoring = computeStrategicScoring(opp);
                    const { error: upErr } = await admin
                        .from("opportunities")
                        .update({ strategic_scoring: scoring })
                        .eq("id", opp.id);
                    if (upErr) stats.errors++;
                    else stats.scoring_updated++;
                } catch {
                    stats.errors++;
                }
            }

            // Filtering on `strategic_scoring is null` means just-updated rows
            // drop out of the next page automatically — no offset needed.
            if (opps.length < pageSize) break; // no more rows match the filter
        }
    }

    // --- Pass 2: structured_requirements (page until LIMIT or budget) ---
    if (doReqs && Date.now() - startTime < REQS_PHASE_BUDGET_MS) {
        while (
            stats.reqs_processed < LIMIT &&
            Date.now() - startTime < REQS_PHASE_BUDGET_MS
        ) {
            const remaining = LIMIT - stats.reqs_processed;
            const pageSize = Math.min(PAGE_SIZE, remaining);

            const { data: opps, error } = await admin
                .from("opportunities")
                .select("id, description")
                .eq("is_archived", false)
                .not("description", "is", null)
                .or("structured_requirements.is.null,structured_requirements.eq.{}")
                .range(0, pageSize - 1);

            if (error || !opps || opps.length === 0) {
                if (error) stats.errors++;
                break;
            }
            stats.pages++;

            for (const opp of opps) {
                if (Date.now() - startTime > REQS_PHASE_BUDGET_MS) break;
                stats.reqs_processed++;
                const desc = String(opp.description || "");
                if (desc.startsWith("https://")) {
                    // Mark it processed with an empty struct so it stops re-appearing in the page.
                    await admin
                        .from("opportunities")
                        .update({ structured_requirements: { _skipped: "url_only" } })
                        .eq("id", opp.id);
                    continue;
                }
                if (desc.length < 100) {
                    await admin
                        .from("opportunities")
                        .update({ structured_requirements: { _skipped: "too_short" } })
                        .eq("id", opp.id);
                    continue;
                }

                try {
                    const reqs = extractStructuredRequirements(desc);
                    const { error: upErr } = await admin
                        .from("opportunities")
                        .update({ structured_requirements: reqs })
                        .eq("id", opp.id);
                    if (upErr) stats.errors++;
                    else stats.reqs_updated++;
                } catch {
                    stats.errors++;
                }
            }

            if (opps.length < pageSize) break;
        }
    }

    stats.elapsed_ms = Date.now() - startTime;
    return NextResponse.json({ success: true, ...stats });
}
