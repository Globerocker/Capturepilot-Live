/**
 * Public stats endpoint — drives the live counters on the marketing site
 * + the Quick Checker loading page. Returns big-number aggregates only:
 * no per-row data, so no PII risk and safe to expose anonymously.
 *
 * Cached 5 min at the edge — these numbers are visible to anyone hitting
 * the landing page, so we don't need real-time precision and we don't
 * want to slam the DB on every page load.
 */

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

export const runtime = "nodejs";
export const revalidate = 300; // 5 min

interface PublicStats {
    federal_opps: number;
    sled_opps: number;
    state_opps: number;
    county_opps: number;
    city_opps: number;
    district_opps: number;
    /** SLED rows not yet tagged with jurisdiction_level. Equals
     *  sled_opps - (state + county + city + district). ~76% currently
     *  per the 2026-05-27 audit; gets backfilled by Sprint C. */
    sled_uncategorized: number;
    active_total: number;
    contractors_tracked: number;
    portals_tracked: number;
    new_today: number;
    matches_scored_24h: number;
    enrichments_completed_24h: number;
    last_updated: string;
}

export async function GET() {
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Fast path: read the pre-computed snapshot (refreshed every 10 min by
    // /api/cron/compute_public_stats). Skip the live aggregates entirely if
    // we have a fresh-enough snapshot — the marketing page only needs ~10 min
    // freshness, and this drops 12 queries to 1.
    try {
        const { data: snap } = await sb
            .from("public_stats_snapshot")
            .select("payload, computed_at")
            .eq("id", 1)
            .maybeSingle();
        if (snap?.payload) {
            const computed = snap.computed_at ? new Date(snap.computed_at as string).getTime() : 0;
            const ageMin = (Date.now() - computed) / 60_000;
            // Accept snapshots up to 30 min old. Older than that falls through
            // to the live query so the user always gets fresh-ish data even
            // if the snapshot cron is dead.
            if (ageMin < 30) {
                return NextResponse.json(snap.payload, {
                    headers: {
                        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, OPTIONS",
                        "X-Stats-Source": "snapshot",
                    },
                });
            }
        }
    } catch {
        /* fall through to live query */
    }

    const today = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Run aggregates in parallel. SLED rows are subdivided by jurisdiction_level
    // so the marketing site can show separate State / County / City counters.
    const [
        federal, sled, state, county, city, district,
        total, contractors, portals, newToday, matches24h, enrich24h,
    ] = await Promise.all([
        countQuery(sb, "opportunities", { source: "eq.sam", is_archived: "eq.false" }),
        countQuery(sb, "opportunities", { source: "eq.sled", is_archived: "eq.false" }),
        countQuery(sb, "opportunities", { source: "eq.sled", jurisdiction_level: "eq.state", is_archived: "eq.false" }),
        countQuery(sb, "opportunities", { source: "eq.sled", jurisdiction_level: "eq.county", is_archived: "eq.false" }),
        countQuery(sb, "opportunities", { source: "eq.sled", jurisdiction_level: "eq.city", is_archived: "eq.false" }),
        countQuery(sb, "opportunities", { source: "eq.sled", jurisdiction_level: "eq.district", is_archived: "eq.false" }),
        countQuery(sb, "opportunities", { is_archived: "eq.false" }),
        countQuery(sb, "contractors", {}),
        countQuery(sb, "rss_sources", { enabled: "eq.true" }),
        countQuery(sb, "opportunities", { posted_date: `gte.${today}`, is_archived: "eq.false" }),
        countQuery(sb, "user_matches", { created_at: `gte.${today}` }),
        countQuery(sb, "worker_jobs", { status: "eq.done", finished_at: `gte.${today}` }),
    ]);

    const stats: PublicStats = {
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

    return NextResponse.json(stats, {
        headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
            // CORS: marketing site (capturepilot.com), embedded widgets, and
            // any presentation deck need to fetch this anonymously. The
            // payload has no PII — only big-number aggregates — so wildcard
            // origin is safe.
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
    });
}

// Preflight handler — browsers send OPTIONS before cross-origin fetches.
export function OPTIONS() {
    return new Response(null, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
        },
    });
}

async function countQuery(
    sb: SbAny,
    table: string,
    filters: Record<string, string>,
    countMode: "exact" | "estimated" = "estimated",
): Promise<number> {
    try {
        // Default to `estimated` for marketing counters — `exact` runs a full
        // SELECT COUNT(*) which silently times out on large tables (opportunities
        // is 60k+ rows). The planner's row estimate is good enough for
        // big-number widgets and was the reason the dashboard page also uses
        // `estimated` on this table. We saw `federal_opps: 0` in production
        // for hours because the exact-count query was failing silently.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = sb.from(table).select("id", { count: countMode, head: true });
        for (const [k, v] of Object.entries(filters)) {
            // Use indexOf instead of split — values like "gte.2026-05-27T13:00:00Z"
            // contain dots in the timestamp and split would truncate the date.
            const dotIdx = v.indexOf(".");
            const op = dotIdx === -1 ? v : v.slice(0, dotIdx);
            const val = dotIdx === -1 ? "" : v.slice(dotIdx + 1);
            if (op === "eq") q = q.eq(k, val);
            else if (op === "gte") q = q.gte(k, val);
            else if (op === "lt") q = q.lt(k, val);
        }
        const { count, error } = await q;
        if (error) {
            // Log but don't throw — counter widgets shouldn't crash the page.
            console.warn(`[public/stats] countQuery ${table} ${JSON.stringify(filters)} → ${error.message}`);
            return 0;
        }
        return count || 0;
    } catch (e) {
        console.warn(`[public/stats] countQuery threw on ${table} ${JSON.stringify(filters)}:`, e);
        return 0;
    }
}
