import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * GET /api/intelligence/fpds?naics=237110&agency=DOD&years=3
 * Query FPDS (Federal Procurement Data System) via USASpending for
 * historical contract award intelligence.
 *
 * Returns: who wins contracts in this NAICS/agency, how much, trends.
 * Uses USASpending.gov API (free, no key needed).
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const naics = searchParams.get("naics") || "";
        const agency = searchParams.get("agency") || "";
        const companyName = searchParams.get("company") || "";
        const years = parseInt(searchParams.get("years") || "3");

        if (!naics && !agency && !companyName) {
            return NextResponse.json({ error: "naics, agency, or company parameter required" }, { status: 400 });
        }

        const endDate = new Date().toISOString().split("T")[0];
        const startDate = new Date(Date.now() - years * 365 * 86400000).toISOString().split("T")[0];

        // Build filters
        const filters: Record<string, unknown> = {
            time_period: [{ start_date: startDate, end_date: endDate }],
            award_type_codes: ["A", "B", "C", "D", "IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_C", "IDV_D", "IDV_E"],
        };
        if (naics) filters.naics_codes = [{ naics_code: naics }];
        if (agency) filters.agencies = [{ type: "awarding", tier: "toptier", name: agency }];
        if (companyName) filters.recipient_search_text = [companyName];

        // 1. Top recipients (who wins the most)
        const recipientRes = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_category/recipient/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters, limit: 15, page: 1 }),
            signal: AbortSignal.timeout(20000),
        });

        let topRecipients: Array<{ name: string; amount: number; count?: number }> = [];
        if (recipientRes.ok) {
            const data = await recipientRes.json();
            topRecipients = (data.results || []).map((r: Record<string, unknown>) => ({
                name: String(r.recipient_name || r.name || ""),
                amount: Number(r.aggregated_amount || 0),
                count: Number(r.count || 0),
            }));
        }

        // 2. Spending by agency
        const agencyRes = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_category/awarding_agency/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters, limit: 10, page: 1 }),
            signal: AbortSignal.timeout(15000),
        });

        let topAgencies: Array<{ name: string; amount: number }> = [];
        if (agencyRes.ok) {
            const data = await agencyRes.json();
            topAgencies = (data.results || []).map((r: Record<string, unknown>) => ({
                name: String(r.awarding_toptier_agency_name || r.name || ""),
                amount: Number(r.aggregated_amount || 0),
            }));
        }

        // 3. Spending over time (trends)
        const timeRes = await fetch("https://api.usaspending.gov/api/v2/search/spending_over_time/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters, group: "fiscal_year" }),
            signal: AbortSignal.timeout(15000),
        });

        let spendingTrend: Array<{ year: string; amount: number }> = [];
        if (timeRes.ok) {
            const data = await timeRes.json();
            spendingTrend = (data.results || []).map((r: Record<string, unknown>) => ({
                year: String((r.time_period as Record<string, unknown>)?.fiscal_year || r.fiscal_year || ""),
                amount: Number(r.aggregated_amount || 0),
            })).filter((r: { year: string }) => r.year);
        }

        // 4. Total market size
        const totalAmount = topRecipients.reduce((s, r) => s + r.amount, 0);
        const totalContracts = topRecipients.reduce((s, r) => s + (r.count || 0), 0);

        return NextResponse.json({
            success: true,
            query: { naics, agency, company: companyName, years, start_date: startDate, end_date: endDate },
            market_size: {
                total_amount: totalAmount,
                total_contracts: totalContracts,
                avg_contract_value: totalContracts > 0 ? totalAmount / totalContracts : 0,
            },
            top_recipients: topRecipients,
            top_agencies: topAgencies,
            spending_trend: spendingTrend,
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
