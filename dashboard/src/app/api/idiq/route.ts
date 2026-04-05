import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * GET /api/idiq?naics=237110&agency=DOD&limit=20
 * Search for IDIQ (Indefinite Delivery / Indefinite Quantity) contracts
 * and their task orders using USASpending.gov API.
 *
 * IDIQs are umbrella contracts — getting on one means steady work for years.
 * This helps users find which IDIQs exist in their industry.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const naics = searchParams.get("naics") || "";
        const agency = searchParams.get("agency") || "";
        const keyword = searchParams.get("keyword") || "";
        const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

        if (!naics && !agency && !keyword) {
            return NextResponse.json({ error: "naics, agency, or keyword required" }, { status: 400 });
        }

        const endDate = new Date().toISOString().split("T")[0];
        const startDate = new Date(Date.now() - 5 * 365 * 86400000).toISOString().split("T")[0];

        // Search for IDV (Indefinite Delivery Vehicle) awards
        const filters: Record<string, unknown> = {
            time_period: [{ start_date: startDate, end_date: endDate }],
            award_type_codes: ["IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"],
        };
        if (naics) filters.naics_codes = [{ naics_code: naics }];
        if (agency) filters.agencies = [{ type: "awarding", tier: "toptier", name: agency }];
        if (keyword) filters.keywords = [keyword];

        const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filters,
                fields: [
                    "Award ID", "Recipient Name", "Award Amount",
                    "Awarding Agency", "Start Date", "End Date",
                    "Description", "NAICS Code", "Award Type",
                    "Awarding Sub Agency",
                ],
                limit,
                page: 1,
                sort: "Award Amount",
                order: "desc",
            }),
            signal: AbortSignal.timeout(20000),
        });

        if (!res.ok) return NextResponse.json({ error: `USASpending API error: ${res.status}` }, { status: res.status });

        const data = await res.json();
        const results = (data.results || []).map((r: Record<string, unknown>) => ({
            award_id: String(r["Award ID"] || ""),
            recipient: String(r["Recipient Name"] || ""),
            amount: Number(r["Award Amount"] || 0),
            agency: String(r["Awarding Agency"] || ""),
            sub_agency: String(r["Awarding Sub Agency"] || ""),
            start_date: String(r["Start Date"] || ""),
            end_date: String(r["End Date"] || ""),
            description: String(r["Description"] || "").substring(0, 300),
            naics: String(r["NAICS Code"] || ""),
            type: String(r["Award Type"] || ""),
        }));

        const totalValue = results.reduce((s: number, r: { amount: number }) => s + r.amount, 0);

        return NextResponse.json({
            success: true,
            total: results.length,
            total_value: totalValue,
            query: { naics, agency, keyword },
            contracts: results,
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
