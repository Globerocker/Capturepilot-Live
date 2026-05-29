/**
 * Cron: compute and upsert the public_stats_snapshot row.
 *
 * The previous design ran all 12 aggregate queries on every /api/public/stats
 * hit (cached 5 min at edge but still costly on revalidation + the silent
 * count(*) timeouts that gave us federal_opps=0 in production). Now this
 * cron does the work every 10 min and writes one snapshot row; the public
 * endpoint just reads it.
 *
 * Schedule: every 10 min via vercel.json. Idempotent — re-running just
 * overwrites the snapshot.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

/**
 * Count helper. Now uses count="exact" because estimated counts come from
 * pg_class.reltuples which lags autovacuum — after a big insert burst
 * (e.g. SAM backfill of 4k rows), reltuples can return 0 or stale numbers
 * for 15+ minutes. Exact is slower but accurate; migration 099 added the
 * matching created_at index that keeps it fast enough.
 */
async function n(sb: SbAny, table: string, filt: Record<string, string> = {}): Promise<number> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = sb.from(table).select("id", { count: "exact", head: true });
        for (const [k, v] of Object.entries(filt)) {
            const dot = v.indexOf(".");
            const op = dot === -1 ? v : v.slice(0, dot);
            const val = dot === -1 ? "" : v.slice(dot + 1);
            if (op === "eq") q = q.eq(k, val);
            else if (op === "gte") q = q.gte(k, val);
        }
        const { count, error } = await q;
        if (error) {
            console.error(`[compute_stats] count failed for ${table}`, { filt, error: error.message });
            return 0;
        }
        return count || 0;
    } catch (e) {
        console.error(`[compute_stats] count threw for ${table}`, { filt, error: (e as Error).message });
        return 0;
    }
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const today = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
        federal, sled, state, county, city, district,
        total, contractors, portals, newToday, matches24h, enrich24h,
    ] = await Promise.all([
        n(sb, "opportunities", { source: "eq.sam", is_archived: "eq.false" }),
        n(sb, "opportunities", { source: "eq.sled", is_archived: "eq.false" }),
        n(sb, "opportunities", { source: "eq.sled", jurisdiction_level: "eq.state", is_archived: "eq.false" }),
        n(sb, "opportunities", { source: "eq.sled", jurisdiction_level: "eq.county", is_archived: "eq.false" }),
        n(sb, "opportunities", { source: "eq.sled", jurisdiction_level: "eq.city", is_archived: "eq.false" }),
        n(sb, "opportunities", { source: "eq.sled", jurisdiction_level: "eq.district", is_archived: "eq.false" }),
        n(sb, "opportunities", { is_archived: "eq.false" }),
        n(sb, "contractors", {}),
        n(sb, "rss_sources", { enabled: "eq.true" }),
        n(sb, "opportunities", { posted_date: `gte.${today}`, is_archived: "eq.false" }),
        n(sb, "user_matches", { created_at: `gte.${today}` }),
        n(sb, "worker_jobs", { status: "eq.done", finished_at: `gte.${today}` }),
    ]);

    const payload = {
        federal_opps: federal,
        sled_opps: sled,
        state_opps: state,
        county_opps: county,
        city_opps: city,
        district_opps: district,
        sled_uncategorized: Math.max(0, sled - state - county - city - district),
        active_total: total,
        contractors_tracked: contractors,
        portals_tracked: portals,
        new_today: newToday,
        matches_scored_24h: matches24h,
        enrichments_completed_24h: enrich24h,
        last_updated: new Date().toISOString(),
    };

    const { error } = await sb
        .from("public_stats_snapshot")
        .upsert({ id: 1, payload, computed_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, payload });
}
