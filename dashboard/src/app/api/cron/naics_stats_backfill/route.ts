import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withCronTelemetry } from "@/lib/cron-telemetry";
import { guardCron } from "@/lib/cron-auth";

export const maxDuration = 300;

/**
 * NAICS market stats — compute from our OWN opportunities table.
 *
 * Refreshes ~514 rows today (one per distinct NAICS in opportunities that has
 * at least one awarded opp in the last 3 years; will grow with ingest). Before
 * migration 126 this cron pulled `opportunities.select("naics_code")` through
 * the JS client which silently capped at 1000 rows, so only ~30 NAICS in the
 * low-numbered range ever made it into the cache and every market-intel panel
 * for a common code like 541990 ($104B) rendered blank.
 *
 * The full aggregation is now done in one SQL pass via the
 * `compute_naics_market_stats(p_years)` RPC (defined in migration 126). We just
 * fetch the rows and upsert them. No N+1, no row-cap surprises.
 *
 * Runs weekly Sunday 03:00 UTC. Safe to hit on demand.
 */

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

async function GET_handler(req: NextRequest) {
    // Fail-closed cron auth (CRON_SECRET or SUPABASE_SERVICE_KEY bearer).
    const denied = guardCron(req);
    if (denied) return denied;

    const db = admin();
    const startTime = Date.now();
    const now = new Date();
    const refreshAfter = new Date(now.getTime() + 7 * 86400_000).toISOString();

    // 1) One server-side aggregation — returns one row per NAICS with awards.
    const { data: rows, error: rpcErr } = await db.rpc("compute_naics_market_stats", { p_years: 3 });
    if (rpcErr) {
        return NextResponse.json({ error: `compute RPC failed: ${rpcErr.message}` }, { status: 500 });
    }

    const stats = (rows || []) as Array<{
        naics_code: string;
        period_years: number;
        start_date: string;
        end_date: string;
        total_spend: number;
        avg_yearly_spend: number;
        yoy_growth_pct: number | null;
        market_trend: string;
        yearly_spend: unknown;
        top_agencies: unknown;
        top_states: unknown;
        top_sub_agencies: unknown;
        opp_count: number;
    }>;

    // 2) Stamp computed_at / refresh_after and upsert in chunks.
    const upserts = stats.map(s => ({
        naics_code: s.naics_code,
        period_years: s.period_years,
        start_date: s.start_date,
        end_date: s.end_date,
        total_spend: s.total_spend,
        avg_yearly_spend: s.avg_yearly_spend,
        yoy_growth_pct: s.yoy_growth_pct,
        market_trend: s.market_trend,
        yearly_spend: s.yearly_spend,
        top_agencies: s.top_agencies,
        top_states: s.top_states,
        top_sub_agencies: s.top_sub_agencies,
        computed_at: now.toISOString(),
        refresh_after: refreshAfter,
    }));

    let written = 0;
    let errors = 0;
    for (let i = 0; i < upserts.length; i += 100) {
        const chunk = upserts.slice(i, i + 100);
        const { error, count } = await db.from("naics_market_stats").upsert(chunk, {
            onConflict: "naics_code",
            count: "exact",
        });
        if (error) {
            errors += chunk.length;
            console.error(`[naics_stats_backfill] upsert chunk ${i} failed:`, error.message);
        } else {
            written += count ?? chunk.length;
        }
    }

    // 3) How many NAICS in opportunities still lack a stats row? (Diagnostic
    //    for the "blank market intel" class of bugs.)
    const { count: cachedCount } = await db
        .from("naics_market_stats")
        .select("naics_code", { count: "exact", head: true });

    return NextResponse.json({
        success: true,
        naics_processed: stats.length,
        rows_upserted: written,
        rows_failed: errors,
        cache_size: cachedCount ?? null,
        elapsed_ms: Date.now() - startTime,
    });
}

export const GET = withCronTelemetry("/api/cron/naics_stats_backfill", GET_handler);
