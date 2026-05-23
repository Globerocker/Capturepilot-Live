/**
 * Pre-warm the GovTribe MCP cache for opportunities we care about.
 *
 * Calls govtribe lib directly (not via internal API routes — those require
 * a logged-in Supabase session, not a service key). Each call seeds the
 * `govtribe_cache` table (migration 062) so the per-opportunity detail
 * page renders fast from cache.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withCronTelemetry } from "@/lib/cron-telemetry";
import { fetchAwardsSummary, fetchSubAwards } from "@/lib/govtribe";
import { guardCron } from "@/lib/cron-auth";

export const maxDuration = 300;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    if (!process.env.GOVTRIBE_API_KEY) {
        return NextResponse.json({
            success: false,
            note: "GOVTRIBE_API_KEY not configured — sync skipped",
        }, { status: 200 });
    }

    const t0 = Date.now();
    const db = getDb();
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "20", 10), 100);
    const stats = {
        opps_considered: 0,
        prewarmed_awards: 0,
        prewarmed_subawards: 0,
        errors: 0,
        error_samples: [] as Array<{ kind: string; sol: string; message: string }>,
    };

    // Target active federal opps with a solicitation_number, deadline soon
    const horizon = new Date(Date.now() + 60 * 86400_000).toISOString();
    const { data: opps, error } = await db
        .from("opportunities")
        .select("solicitation_number, response_deadline")
        .eq("is_archived", false)
        .or("source.is.null,source.eq.sam")
        .not("solicitation_number", "is", null)
        .gt("response_deadline", new Date().toISOString())
        .lt("response_deadline", horizon)
        .order("response_deadline", { ascending: true })
        .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    stats.opps_considered = (opps || []).length;

    for (const opp of opps || []) {
        if (Date.now() - t0 > 270_000) break;
        const sol = (opp as { solicitation_number?: string }).solicitation_number;
        if (!sol) continue;
        try {
            await fetchAwardsSummary(sol);
            stats.prewarmed_awards++;
        } catch (e) {
            stats.errors++;
            if (stats.error_samples.length < 5) {
                stats.error_samples.push({ kind: "awards", sol, message: (e as Error).message.slice(0, 200) });
            }
        }
        try {
            await fetchSubAwards(sol);
            stats.prewarmed_subawards++;
        } catch (e) {
            stats.errors++;
            if (stats.error_samples.length < 5) {
                stats.error_samples.push({ kind: "subawards", sol, message: (e as Error).message.slice(0, 200) });
            }
        }
        // GovTribe MCP rate-limit
        await new Promise(r => setTimeout(r, 600));
    }

    // Clean very-old cache rows opportunistically
    await db.from("govtribe_cache").delete().lt("expires_at", new Date(Date.now() - 30 * 86400_000).toISOString());

    return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - t0 });
}

export const GET = withCronTelemetry("/api/cron/sync_govtribe_activity", GET_handler);
