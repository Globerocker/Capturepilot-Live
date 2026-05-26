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

    const today = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Run aggregates in parallel
    const [federal, sled, total, contractors, portals, newToday, matches24h, enrich24h] = await Promise.all([
        countQuery(sb, "opportunities", { source: "eq.sam", is_archived: "eq.false" }),
        countQuery(sb, "opportunities", { source: "eq.sled", is_archived: "eq.false" }),
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
        },
    });
}

async function countQuery(
    sb: SbAny,
    table: string,
    filters: Record<string, string>,
): Promise<number> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = sb.from(table).select("id", { count: "exact", head: true });
        for (const [k, v] of Object.entries(filters)) {
            const [op, val] = v.split(".", 2);
            if (op === "eq") q = q.eq(k, val);
            else if (op === "gte") q = q.gte(k, val);
            else if (op === "lt") q = q.lt(k, val);
        }
        const { count } = await q;
        return count || 0;
    } catch {
        return 0;
    }
}
