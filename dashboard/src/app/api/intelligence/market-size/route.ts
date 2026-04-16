import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

/**
 * GET /api/intelligence/market-size?naics=237110,237120&years=5
 * Comprehensive market sizing using USASpending.gov.
 *
 * Strategy:
 *   1) Try to read pre-computed aggregates from `naics_market_stats` table
 *      (populated by POST /api/intelligence/market-size/backfill).
 *   2) If the table has a fresh row for every requested NAICS, merge them and
 *      return instantly.
 *   3) Otherwise, fall back to calling USASpending live (the original path) so
 *      niche NAICS still work. This keeps the UI functional while the table
 *      gets backfilled over time.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const naicsStr = searchParams.get("naics") || "";
        const years = parseInt(searchParams.get("years") || "5");

        if (!naicsStr) return NextResponse.json({ error: "naics parameter required" }, { status: 400 });

        const naicsCodes = naicsStr.split(",").map(s => s.trim()).filter(Boolean);

        // ---- 1) Table-cache path -------------------------------------------
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (url && serviceKey) {
            const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
            const { data: cached } = await admin
                .from("naics_market_stats")
                .select("*")
                .in("naics_code", naicsCodes)
                .gt("refresh_after", new Date().toISOString());

            if (cached && cached.length === naicsCodes.length) {
                // Merge per-NAICS aggregates into a single response.
                const merged = mergeStats(cached);
                return NextResponse.json({
                    success: true,
                    source: "cache",
                    naics_codes: naicsCodes,
                    period: { years },
                    ...merged,
                });
            }
        }

        // ---- 2) Live fallback ----------------------------------------------
        const live = await fetchLive(naicsCodes, years);
        return NextResponse.json({ success: true, source: "live", naics_codes: naicsCodes, ...live });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

type Stat = {
    naics_code: string;
    total_spend: number;
    avg_yearly_spend: number;
    yoy_growth_pct: number;
    market_trend: string;
    yearly_spend: Array<{ year: string; amount: number }>;
    top_agencies: Array<{ name: string; amount: number }>;
    top_states: Array<{ name: string; amount: number }>;
    top_sub_agencies: Array<{ name: string; amount: number }>;
    start_date: string;
    end_date: string;
};

function mergeStats(rows: Stat[]) {
    const yearlyMap = new Map<string, number>();
    const agencyMap = new Map<string, number>();
    const stateMap = new Map<string, number>();
    const subAgencyMap = new Map<string, number>();

    for (const r of rows) {
        for (const y of r.yearly_spend || []) yearlyMap.set(y.year, (yearlyMap.get(y.year) || 0) + (y.amount || 0));
        for (const a of r.top_agencies || []) agencyMap.set(a.name, (agencyMap.get(a.name) || 0) + (a.amount || 0));
        for (const s of r.top_states || []) stateMap.set(s.name, (stateMap.get(s.name) || 0) + (s.amount || 0));
        for (const s of r.top_sub_agencies || []) subAgencyMap.set(s.name, (subAgencyMap.get(s.name) || 0) + (s.amount || 0));
    }

    const yearlySpend = Array.from(yearlyMap, ([year, amount]) => ({ year, amount })).sort((a, b) => a.year.localeCompare(b.year));
    const totalSpend = yearlySpend.reduce((s, y) => s + y.amount, 0);
    const avgYearly = yearlySpend.length > 0 ? totalSpend / yearlySpend.length : 0;
    let yoy = 0;
    if (yearlySpend.length >= 2) {
        const last = yearlySpend[yearlySpend.length - 1].amount;
        const prev = yearlySpend[yearlySpend.length - 2].amount;
        yoy = prev > 0 ? ((last - prev) / prev) * 100 : 0;
    }

    const sortTop = (m: Map<string, number>) =>
        Array.from(m, ([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 10);

    return {
        summary: {
            total_spend: totalSpend,
            avg_yearly_spend: avgYearly,
            yoy_growth_pct: Math.round(yoy * 10) / 10,
            market_trend: yoy > 5 ? "GROWING" : yoy < -5 ? "DECLINING" : "STABLE",
        },
        yearly_spend: yearlySpend,
        top_agencies: sortTop(agencyMap),
        top_states: sortTop(stateMap),
        top_sub_agencies: sortTop(subAgencyMap),
    };
}

export async function fetchLive(naicsCodes: string[], years: number) {
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - years * 365 * 86400000).toISOString().split("T")[0];

    // USASpending expects naics_codes as an array of plain strings.
    // The previous object-wrapped shape { naics_code: "541611" } produced the
    // API error "Invalid value in 'filters|naics_codes'" and silently yielded
    // zeros — which is why the cache had total_spend=$0 for every NAICS.
    const filters: Record<string, unknown> = {
        time_period: [{ start_date: startDate, end_date: endDate }],
        award_type_codes: ["A", "B", "C", "D"],
        naics_codes: naicsCodes,
    };

    const [timeRes, agencyRes, stateRes, setAsideRes] = await Promise.all([
        fetch("https://api.usaspending.gov/api/v2/search/spending_over_time/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters, group: "fiscal_year" }),
            signal: AbortSignal.timeout(15000),
        }),
        fetch("https://api.usaspending.gov/api/v2/search/spending_by_category/awarding_agency/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters, limit: 10, page: 1 }),
            signal: AbortSignal.timeout(15000),
        }),
        fetch("https://api.usaspending.gov/api/v2/search/spending_by_category/recipient_location/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters, limit: 10, page: 1 }),
            signal: AbortSignal.timeout(15000),
        }),
        fetch("https://api.usaspending.gov/api/v2/search/spending_by_category/awarding_subagency/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters, limit: 10, page: 1 }),
            signal: AbortSignal.timeout(15000),
        }),
    ]);

    const parseResults = async (res: Response) => {
        if (!res.ok) return [];
        const data = await res.json();
        return data.results || [];
    };

    const timeData = await parseResults(timeRes);
    const agencyData = await parseResults(agencyRes);
    const stateData = await parseResults(stateRes);
    const subAgencyData = await parseResults(setAsideRes);

    const yearlySpend = timeData.map((r: Record<string, unknown>) => ({
        year: String((r.time_period as Record<string, unknown>)?.fiscal_year || ""),
        amount: Number(r.aggregated_amount || 0),
    })).filter((r: { year: string }) => r.year).sort((a: { year: string }, b: { year: string }) => a.year.localeCompare(b.year));

    const totalSpend = yearlySpend.reduce((s: number, y: { amount: number }) => s + y.amount, 0);
    const avgYearlySpend = yearlySpend.length > 0 ? totalSpend / yearlySpend.length : 0;

    let yoyGrowth = 0;
    if (yearlySpend.length >= 2) {
        const last = yearlySpend[yearlySpend.length - 1].amount;
        const prev = yearlySpend[yearlySpend.length - 2].amount;
        yoyGrowth = prev > 0 ? ((last - prev) / prev) * 100 : 0;
    }

    const topAgencies = agencyData.map((r: Record<string, unknown>) => ({
        name: String(r.awarding_toptier_agency_name || r.name || ""),
        amount: Number(r.aggregated_amount || 0),
    }));

    const topStates = stateData.map((r: Record<string, unknown>) => ({
        name: String(r.recipient_location_state_name || r.name || ""),
        amount: Number(r.aggregated_amount || 0),
    }));

    const topSubAgencies = subAgencyData.map((r: Record<string, unknown>) => ({
        name: String(r.awarding_subtier_agency_name || r.name || ""),
        amount: Number(r.aggregated_amount || 0),
    }));

    return {
        period: { start: startDate, end: endDate, years },
        summary: {
            total_spend: totalSpend,
            avg_yearly_spend: avgYearlySpend,
            yoy_growth_pct: Math.round(yoyGrowth * 10) / 10,
            market_trend: yoyGrowth > 5 ? "GROWING" : yoyGrowth < -5 ? "DECLINING" : "STABLE",
        },
        yearly_spend: yearlySpend,
        top_agencies: topAgencies,
        top_states: topStates,
        top_sub_agencies: topSubAgencies,
    };
}
