import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * GET /api/intelligence/market-size?naics=237110,237120&years=5
 * Comprehensive market sizing using USASpending.gov.
 *
 * Returns total spend, YoY growth, top agencies, set-aside breakdown,
 * geographic distribution — all free from USASpending API.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const naicsStr = searchParams.get("naics") || "";
        const years = parseInt(searchParams.get("years") || "5");

        if (!naicsStr) return NextResponse.json({ error: "naics parameter required" }, { status: 400 });

        const naicsCodes = naicsStr.split(",").map(s => s.trim()).filter(Boolean);
        const endDate = new Date().toISOString().split("T")[0];
        const startDate = new Date(Date.now() - years * 365 * 86400000).toISOString().split("T")[0];

        const filters: Record<string, unknown> = {
            time_period: [{ start_date: startDate, end_date: endDate }],
            award_type_codes: ["A", "B", "C", "D"],
            naics_codes: naicsCodes.map(c => ({ naics_code: c })),
        };

        // Parallel requests
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

        // Parse results
        const parseResults = async (res: Response) => {
            if (!res.ok) return [];
            const data = await res.json();
            return data.results || [];
        };

        const timeData = await parseResults(timeRes);
        const agencyData = await parseResults(agencyRes);
        const stateData = await parseResults(stateRes);
        const subAgencyData = await parseResults(setAsideRes);

        // Calculate totals and trends
        const yearlySpend = timeData.map((r: Record<string, unknown>) => ({
            year: String((r.time_period as Record<string, unknown>)?.fiscal_year || ""),
            amount: Number(r.aggregated_amount || 0),
        })).filter((r: { year: string }) => r.year).sort((a: { year: string }, b: { year: string }) => a.year.localeCompare(b.year));

        const totalSpend = yearlySpend.reduce((s: number, y: { amount: number }) => s + y.amount, 0);
        const avgYearlySpend = yearlySpend.length > 0 ? totalSpend / yearlySpend.length : 0;

        // YoY growth
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

        return NextResponse.json({
            success: true,
            naics_codes: naicsCodes,
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
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
