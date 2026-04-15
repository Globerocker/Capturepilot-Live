import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchLive } from "../route";

export const maxDuration = 300;

/**
 * POST /api/intelligence/market-size/backfill
 * Body: { naics?: string[], limit?: number, years?: number }
 *
 * Computes per-NAICS market aggregates from USASpending.gov and upserts them
 * into `naics_market_stats`. If `naics` is omitted, auto-discovers the most
 * common NAICS codes across `opportunities` and backfills those.
 *
 * Intended to be hit:
 *   - Manually by admin after a deploy.
 *   - On a cron (can be wired into vercel.json later).
 *
 * Guards on SUPABASE_SERVICE_KEY to avoid unauthenticated writes.
 */
export async function POST(req: NextRequest) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        return NextResponse.json({ error: "Supabase service credentials not configured" }, { status: 500 });
    }
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    let naicsList: string[] = [];
    let limit = 25;
    let years = 5;
    try {
        const body = await req.json().catch(() => ({}));
        if (Array.isArray(body.naics)) naicsList = body.naics.map((x: unknown) => String(x)).filter(Boolean);
        if (typeof body.limit === "number") limit = Math.min(Math.max(1, body.limit), 200);
        if (typeof body.years === "number") years = Math.min(Math.max(1, body.years), 10);
    } catch { /* body optional */ }

    // Auto-discover common NAICS when caller didn't supply a list.
    if (naicsList.length === 0) {
        const { data } = await admin
            .from("opportunities")
            .select("naics_code")
            .not("naics_code", "is", null)
            .eq("is_archived", false)
            .limit(5000);
        const counts = new Map<string, number>();
        for (const row of (data || [])) {
            const code = String((row as { naics_code?: string }).naics_code || "").trim();
            if (!code) continue;
            counts.set(code, (counts.get(code) || 0) + 1);
        }
        naicsList = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([code]) => code);
    } else {
        naicsList = naicsList.slice(0, limit);
    }

    const results: Array<{ naics_code: string; status: "ok" | "error"; error?: string }> = [];

    // USASpending rate-limits aggressively — serialise rather than fan out.
    for (const code of naicsList) {
        try {
            const live = await fetchLive([code], years);
            const endDate = new Date().toISOString().split("T")[0];
            const startDate = new Date(Date.now() - years * 365 * 86400000).toISOString().split("T")[0];
            const refreshAfter = new Date(Date.now() + 30 * 86400000).toISOString();

            const { error } = await admin
                .from("naics_market_stats")
                .upsert({
                    naics_code: code,
                    period_years: years,
                    start_date: startDate,
                    end_date: endDate,
                    total_spend: live.summary.total_spend,
                    avg_yearly_spend: live.summary.avg_yearly_spend,
                    yoy_growth_pct: live.summary.yoy_growth_pct,
                    market_trend: live.summary.market_trend,
                    yearly_spend: live.yearly_spend,
                    top_agencies: live.top_agencies,
                    top_states: live.top_states,
                    top_sub_agencies: live.top_sub_agencies,
                    computed_at: new Date().toISOString(),
                    refresh_after: refreshAfter,
                }, { onConflict: "naics_code" });

            if (error) {
                results.push({ naics_code: code, status: "error", error: error.message });
            } else {
                results.push({ naics_code: code, status: "ok" });
            }
        } catch (e) {
            results.push({ naics_code: code, status: "error", error: (e as Error).message });
        }
    }

    const ok = results.filter(r => r.status === "ok").length;
    return NextResponse.json({
        success: true,
        processed: results.length,
        ok,
        errors: results.length - ok,
        results,
    });
}
