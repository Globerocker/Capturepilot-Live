import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 60;

/**
 * GET /api/opportunities/stats
 *
 * Public-friendly counts for live "Wow, that's a lot of opportunities" badges.
 * Returns total + breakdown by source-level and freshness. No PII, no per-user
 * data — safe to expose without auth.
 */
function admin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase env vars missing");
    return createClient(url, key, { auth: { persistSession: false } });
}

const FEDERAL_SOURCES = ["sam", "grants_gov", "sbir"];
const SLED_SOURCES = ["sled", "state", "local"];
const ACTIVE_STATUSES = ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"];

export async function GET() {
    try {
        const db = admin();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // estimated counts — exact COUNT on 37k rows is wasteful for a 60s-cached widget.
        const [total, federal, sled, fresh7d, expiringSoon, sourcesSought] = await Promise.all([
            db.from("opportunities").select("*", { count: "estimated", head: true })
                .eq("is_archived", false)
                .in("status", ACTIVE_STATUSES),
            db.from("opportunities").select("*", { count: "estimated", head: true })
                .eq("is_archived", false)
                .in("status", ACTIVE_STATUSES)
                .in("source", FEDERAL_SOURCES),
            db.from("opportunities").select("*", { count: "estimated", head: true })
                .eq("is_archived", false)
                .in("status", ACTIVE_STATUSES)
                .in("source", SLED_SOURCES),
            db.from("opportunities").select("*", { count: "estimated", head: true })
                .eq("is_archived", false)
                .gte("created_at", sevenDaysAgo),
            db.from("opportunities").select("*", { count: "estimated", head: true })
                .eq("is_archived", false)
                .eq("status", "EXPIRING_SOON"),
            db.from("opportunities").select("*", { count: "estimated", head: true })
                .eq("is_archived", false)
                .in("status", ACTIVE_STATUSES)
                .eq("sources_sought_flag", true),
        ]);

        return NextResponse.json({
            total: total.count || 0,
            federal: federal.count || 0,
            sled: sled.count || 0,
            new_last_7d: fresh7d.count || 0,
            expiring_soon: expiringSoon.count || 0,
            sources_sought: sourcesSought.count || 0,
            generated_at: new Date().toISOString(),
        }, {
            headers: {
                // Allow CDN-edge caching for 60s so the marketing site can hit
                // this endpoint without burning the Postgres connection pool.
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (e) {
        return NextResponse.json(
            { error: (e as Error).message || "stats query failed" },
            { status: 500, headers: { "Access-Control-Allow-Origin": "*" } },
        );
    }
}
