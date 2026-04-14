import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeStrategicScoring } from "@/lib/strategic-scoring";
import { extractStructuredRequirements } from "@/lib/extract-requirements";

export const maxDuration = 300;

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * POST /api/admin/backfill-enrichment
 *
 * Bulk backfill for the strategic_scoring + structured_requirements columns on
 * opportunities that currently have them empty/null. Does NOT call any paid
 * LLM — this is a pure-deterministic backfill suitable for 50k+ rows.
 *
 * Body (optional):
 *   { limit?: number = 2000, only?: "strategic" | "requirements" | "both" = "both" }
 *
 * Returns: counts of rows processed + updated for each field.
 */
export async function POST(req: NextRequest) {
    let body: { limit?: number; only?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    const LIMIT = Math.min(5000, Math.max(1, body.limit || 2000));
    const only = body.only || "both";
    const doScoring = only === "both" || only === "strategic";
    const doReqs = only === "both" || only === "requirements";

    const admin = getAdmin();
    const startTime = Date.now();

    const stats = {
        limit: LIMIT,
        only,
        scoring_processed: 0,
        scoring_updated: 0,
        reqs_processed: 0,
        reqs_updated: 0,
        errors: 0,
        elapsed_ms: 0,
    };

    // --- Pass 1: strategic_scoring ---
    if (doScoring) {
        // Use range() instead of limit() — Supabase REST silently caps .limit() at 1000
        // unless the project's max-rows setting is raised. range(0, N-1) bypasses that cap.
        const { data: opps, error } = await admin
            .from("opportunities")
            .select("id, notice_type, set_aside_code, naics_code, estimated_value, award_amount, description, incumbent_contractor_name, response_deadline, sources_sought_flag")
            .eq("is_archived", false)
            .or("strategic_scoring.is.null,strategic_scoring.eq.{}")
            .range(0, LIMIT - 1);

        if (!error && opps) {
            for (const opp of opps) {
                if (Date.now() - startTime > 260_000) break;
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
        } else if (error) {
            stats.errors++;
        }
    }

    // --- Pass 2: structured_requirements ---
    if (doReqs && Date.now() - startTime < 250_000) {
        const { data: opps, error } = await admin
            .from("opportunities")
            .select("id, description")
            .eq("is_archived", false)
            .not("description", "is", null)
            .or("structured_requirements.is.null,structured_requirements.eq.{}")
            .range(0, LIMIT - 1);

        if (!error && opps) {
            for (const opp of opps) {
                if (Date.now() - startTime > 275_000) break;
                stats.reqs_processed++;
                const desc = String(opp.description || "");
                // Skip if still a URL (no real text to extract from)
                if (desc.startsWith("https://")) continue;
                if (desc.length < 100) continue;

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
        } else if (error) {
            stats.errors++;
        }
    }

    stats.elapsed_ms = Date.now() - startTime;
    return NextResponse.json({ success: true, ...stats });
}
