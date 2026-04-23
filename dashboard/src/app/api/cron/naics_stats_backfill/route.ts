import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * NAICS market stats — compute from our OWN opportunities table.
 * We don't pay the USASpending tax for market intel; every NAICS we've
 * ingested (674 distinct right now) gets per-NAICS spend, top agencies,
 * top states, YoY growth.
 *
 * Runs weekly Sunday 03:00 UTC. Rebuilds all stats from scratch since
 * they don't change by the minute.
 */

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = admin();
    const startTime = Date.now();

    // Get distinct NAICS in use
    const { data: naicsRows } = await db
        .from("opportunities")
        .select("naics_code")
        .not("naics_code", "is", null)
        .order("naics_code", { ascending: true });
    const uniqueNaics = Array.from(new Set((naicsRows || []).map((r: { naics_code: string }) => r.naics_code))).filter(Boolean);

    const now = new Date();
    const threeYearsAgo = new Date(now.getTime() - 3 * 365 * 86400_000);
    const oneYearAgo = new Date(now.getTime() - 365 * 86400_000);

    const upserts: Array<Record<string, unknown>> = [];

    for (const naics of uniqueNaics) {
        if (Date.now() - startTime > 260_000) break;

        // Pull all awarded opps for this NAICS in last 3 years
        const { data: opps } = await db
            .from("opportunities")
            .select("award_amount, posted_date, agency, sub_agency, place_of_performance_state")
            .eq("naics_code", naics)
            .not("award_amount", "is", null)
            .gt("award_amount", 0)
            .gte("posted_date", threeYearsAgo.toISOString())
            .limit(5000);
        if (!opps || opps.length === 0) continue;

        let total = 0;
        const yearlyTotals: Record<string, number> = {};
        const agencyTotals: Record<string, number> = {};
        const subAgencyTotals: Record<string, number> = {};
        const stateTotals: Record<string, number> = {};
        let latestYearTotal = 0, priorYearTotal = 0;

        for (const o of opps as Array<Record<string, unknown>>) {
            const amt = Number(o.award_amount) || 0;
            total += amt;
            const posted = new Date(o.posted_date as string);
            const yk = posted.getUTCFullYear().toString();
            yearlyTotals[yk] = (yearlyTotals[yk] || 0) + amt;
            if (posted > oneYearAgo) latestYearTotal += amt;
            else if (posted > new Date(oneYearAgo.getTime() - 365 * 86400_000)) priorYearTotal += amt;

            const ag = (o.agency as string) || "Unknown";
            const sub = (o.sub_agency as string) || null;
            const st = (o.place_of_performance_state as string) || null;
            agencyTotals[ag] = (agencyTotals[ag] || 0) + amt;
            if (sub) subAgencyTotals[sub] = (subAgencyTotals[sub] || 0) + amt;
            if (st) stateTotals[st] = (stateTotals[st] || 0) + amt;
        }

        const yoyGrowth = priorYearTotal > 0 ? Math.round(((latestYearTotal - priorYearTotal) / priorYearTotal) * 100) : null;
        const trend = yoyGrowth === null ? "unknown" :
                      yoyGrowth > 15 ? "hot" :
                      yoyGrowth > 0 ? "stable" :
                      yoyGrowth > -15 ? "soft" : "declining";

        const topAgencies = Object.entries(agencyTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, spend]) => ({ name, spend }));
        const topSubAgencies = Object.entries(subAgencyTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, spend]) => ({ name, spend }));
        const topStates = Object.entries(stateTotals).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, spend]) => ({ code, spend }));
        const yearlySpend = Object.entries(yearlyTotals).sort(([a], [b]) => a.localeCompare(b)).map(([year, spend]) => ({ year, spend }));

        upserts.push({
            naics_code: naics,
            period_years: 3,
            start_date: threeYearsAgo.toISOString().slice(0, 10),
            end_date: now.toISOString().slice(0, 10),
            total_spend: total,
            avg_yearly_spend: Math.round(total / 3),
            yoy_growth_pct: yoyGrowth,
            market_trend: trend,
            yearly_spend: yearlySpend,
            top_agencies: topAgencies,
            top_states: topStates,
            top_sub_agencies: topSubAgencies,
            computed_at: now.toISOString(),
            refresh_after: new Date(now.getTime() + 7 * 86400_000).toISOString(),
        });
    }

    // Upsert in chunks
    let written = 0;
    for (let i = 0; i < upserts.length; i += 100) {
        const chunk = upserts.slice(i, i + 100);
        const { error, count } = await db.from("naics_market_stats").upsert(chunk, {
            onConflict: "naics_code",
            count: "exact",
        });
        if (!error) written += count ?? chunk.length;
    }

    return NextResponse.json({
        success: true,
        naics_processed: upserts.length,
        rows_upserted: written,
        elapsed_ms: Date.now() - startTime,
    });
}
