import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeStrategicScoring } from "@/lib/strategic-scoring";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * Strategic Scoring cron.
 *
 * Populates the `strategic_scoring` JSONB field on opportunities with deterministic
 * signals (competition level, complexity, win probability tier) that the dashboard
 * UI reads. No LLM — pure rules based on notice_type, set_aside_code, NAICS,
 * value, incumbent presence, and description length.
 *
 * Runs daily, batch of 500. Safe to re-run: idempotent overwrites.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET) {
        const expectedCron = `Bearer ${process.env.CRON_SECRET}`;
        const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
        if (authHeader !== expectedCron && authHeader !== expectedSvc) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    const db = getSupabase();
    const startTime = Date.now();
    const stats = { processed: 0, updated: 0, errors: 0 };

    try {
        const { data: opps, error } = await db
            .from("opportunities")
            .select("id, notice_type, set_aside_code, naics_code, estimated_value, award_amount, description, incumbent_contractor_name, response_deadline, sources_sought_flag")
            .eq("is_archived", false)
            .or("strategic_scoring.is.null,strategic_scoring.eq.{}")
            .order("response_deadline", { ascending: true, nullsFirst: false })
            .limit(500);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!opps || opps.length === 0) {
            return NextResponse.json({ success: true, message: "Nothing to score", ...stats });
        }

        // Batch update (Supabase doesn't support bulk-update, so we loop)
        for (const opp of opps) {
            if (Date.now() - startTime > 270_000) break;
            stats.processed++;
            try {
                const scoring = computeStrategicScoring(opp);
                const { error: upErr } = await db
                    .from("opportunities")
                    .update({ strategic_scoring: scoring })
                    .eq("id", opp.id);
                if (upErr) {
                    stats.errors++;
                } else {
                    stats.updated++;
                }
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
