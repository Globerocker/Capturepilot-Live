import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeOpportunityScore } from "@/lib/opportunity-score";
import { guardCron } from "@/lib/cron-auth";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * Opportunity-score backfill cron.
 *
 * Audit fix (2026-06-10): #9 — `opportunity_score` was NULL on 100% of
 * opportunities (78,007/78,007). Column exists but no producer wrote to it,
 * so any UI sort/filter on the score read 0 for every row.
 *
 * This cron claims up to 5000 rows where `opportunity_score IS NULL`, computes
 * a deterministic 0-100 score via `computeOpportunityScore`, and writes back.
 * Wired through the enrichment_orchestrator (we're at the 40-cron Pro ceiling
 * on vercel.json, so a dedicated slot isn't available).
 */
async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    const db = getSupabase();
    const startTime = Date.now();
    const stats = { processed: 0, updated: 0, errors: 0 };

    try {
        // Pull oldest-first so the backfill drains the historical NULLs before
        // catching newly-ingested rows. Limit 5000 fits well inside maxDuration
        // (300s) and the row-update loop typically processes ~80 rows/sec.
        // Audit evidence (#9) flagged both `IS NULL` and `=0` rows. The column
        // schema has DEFAULT 0 (migration 010) but production shows 100% NULL,
        // so cover both states to make this cron self-healing either way.
        const { data: opps, error } = await db
            .from("opportunities")
            .select("id, notice_type, set_aside_code, sources_sought_flag, response_deadline, agency_name, estimated_value")
            .or("opportunity_score.is.null,opportunity_score.eq.0")
            .eq("is_archived", false)
            .order("response_deadline", { ascending: true, nullsFirst: false })
            .limit(5000);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!opps || opps.length === 0) {
            return NextResponse.json({ success: true, message: "Nothing to score", ...stats });
        }

        for (const opp of opps as Array<{
            id: string;
            notice_type: string | null;
            set_aside_code: string | null;
            sources_sought_flag: boolean | null;
            response_deadline: string | null;
            agency_name: string | null;
            estimated_value: number | null;
        }>) {
            // Stop short of maxDuration so the response can return cleanly.
            if (Date.now() - startTime > 270_000) break;
            stats.processed++;
            try {
                const score = computeOpportunityScore({
                    set_aside: opp.set_aside_code,
                    sources_sought_flag: opp.sources_sought_flag,
                    notice_type: opp.notice_type,
                    deadline: opp.response_deadline,
                    agency: opp.agency_name,
                    estimated_value: opp.estimated_value,
                });
                const { error: upErr } = await db
                    .from("opportunities")
                    .update({ opportunity_score: score })
                    .eq("id", opp.id);
                if (upErr) stats.errors++;
                else stats.updated++;
            } catch {
                stats.errors++;
            }
        }

        return NextResponse.json({ success: true, ...stats });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ success: false, error: message, ...stats }, { status: 500 });
    }
}

export const GET = withCronTelemetry("/api/cron/backfill_opportunity_score", GET_handler);
