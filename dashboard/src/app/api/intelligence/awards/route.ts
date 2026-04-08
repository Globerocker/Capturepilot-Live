import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * GET /api/intelligence/awards?naics=237110&agency=DOD&limit=25
 *
 * On-demand USASpending.gov award intelligence endpoint.
 * Returns recent contract awards for a given NAICS code and optional agency filter.
 *
 * Use cases:
 * - Incumbent identification (who won similar contracts)
 * - Market sizing (total spend by NAICS)
 * - Competitor intelligence (award amounts, dates, agencies)
 *
 * Results are cached in memory for 1 hour to reduce API calls.
 * USASpending API is free and requires no authentication.
 */

// Simple in-memory cache: key -> { data, timestamp }
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached(key: string): unknown | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key: string, data: unknown): void {
    // Limit cache size to prevent memory leaks
    if (cache.size > 200) {
        // Evict oldest entries
        const entries = Array.from(cache.entries());
        entries.sort((a, b) => a[1].ts - b[1].ts);
        for (let i = 0; i < 50; i++) {
            cache.delete(entries[i][0]);
        }
    }
    cache.set(key, { data, ts: Date.now() });
}

interface AwardResult {
    award_id: string;
    recipient_name: string;
    recipient_uei: string | null;
    description: string;
    award_amount: number;
    total_obligation: number;
    awarding_agency: string;
    awarding_sub_agency: string;
    naics_code: string;
    naics_description: string;
    start_date: string | null;
    end_date: string | null;
    last_modified: string | null;
    contract_type: string;
    set_aside_type: string | null;
    place_of_performance: {
        state: string | null;
        city: string | null;
        zip: string | null;
    };
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const naics = searchParams.get("naics") || "";
        const agency = searchParams.get("agency") || "";
        const limit = Math.min(parseInt(searchParams.get("limit") || "25"), 100);
        const years = parseInt(searchParams.get("years") || "2");

        if (!naics) {
            return NextResponse.json(
                { error: "naics query parameter is required" },
                { status: 400 }
            );
        }

        // Check cache
        const cacheKey = `awards:${naics}:${agency}:${limit}:${years}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return NextResponse.json({ ...(cached as Record<string, unknown>), cached: true });
        }

        const endDate = new Date().toISOString().split("T")[0];
        const startDate = new Date(Date.now() - years * 365 * 86400000).toISOString().split("T")[0];

        // Build USASpending filters
        const filters: Record<string, unknown> = {
            time_period: [{ start_date: startDate, end_date: endDate }],
            award_type_codes: ["A", "B", "C", "D"], // Contracts only
            naics_codes: [{ naics_code: naics }],
        };
        if (agency) {
            filters.agencies = [{ type: "awarding", tier: "toptier", name: agency }];
        }

        // Parallel: individual awards + top recipients + spending over time
        const [awardsRes, recipientRes, timeRes] = await Promise.all([
            // 1. Individual award details
            fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filters,
                    fields: [
                        "Award ID",
                        "Recipient Name",
                        "Recipient UEI",
                        "Description",
                        "Award Amount",
                        "Total Outlayed Amount",
                        "Awarding Agency",
                        "Awarding Sub Agency",
                        "NAICS Code",
                        "NAICS Description",
                        "Start Date",
                        "End Date",
                        "Last Modified Date",
                        "Contract Award Type",
                        "Type of Set Aside",
                        "Place of Performance State Code",
                        "Place of Performance City Code",
                        "Place of Performance Zip5",
                    ],
                    limit,
                    page: 1,
                    sort: "Award Amount",
                    order: "desc",
                    subawards: false,
                }),
                signal: AbortSignal.timeout(25000),
            }),

            // 2. Top recipients (aggregated)
            fetch("https://api.usaspending.gov/api/v2/search/spending_by_category/recipient/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filters, limit: 15, page: 1 }),
                signal: AbortSignal.timeout(20000),
            }),

            // 3. Spending over time
            fetch("https://api.usaspending.gov/api/v2/search/spending_over_time/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filters, group: "fiscal_year" }),
                signal: AbortSignal.timeout(15000),
            }),
        ]);

        // Parse individual awards
        const awards: AwardResult[] = [];
        if (awardsRes.ok) {
            const data = await awardsRes.json();
            for (const r of (data.results || []) as Record<string, unknown>[]) {
                awards.push({
                    award_id: String(r["Award ID"] || ""),
                    recipient_name: String(r["Recipient Name"] || ""),
                    recipient_uei: r["Recipient UEI"] ? String(r["Recipient UEI"]) : null,
                    description: String(r["Description"] || ""),
                    award_amount: Number(r["Award Amount"] || 0),
                    total_obligation: Number(r["Total Outlayed Amount"] || r["Award Amount"] || 0),
                    awarding_agency: String(r["Awarding Agency"] || ""),
                    awarding_sub_agency: String(r["Awarding Sub Agency"] || ""),
                    naics_code: String(r["NAICS Code"] || ""),
                    naics_description: String(r["NAICS Description"] || ""),
                    start_date: r["Start Date"] ? String(r["Start Date"]) : null,
                    end_date: r["End Date"] ? String(r["End Date"]) : null,
                    last_modified: r["Last Modified Date"] ? String(r["Last Modified Date"]) : null,
                    contract_type: String(r["Contract Award Type"] || ""),
                    set_aside_type: r["Type of Set Aside"] ? String(r["Type of Set Aside"]) : null,
                    place_of_performance: {
                        state: r["Place of Performance State Code"] ? String(r["Place of Performance State Code"]) : null,
                        city: r["Place of Performance City Code"] ? String(r["Place of Performance City Code"]) : null,
                        zip: r["Place of Performance Zip5"] ? String(r["Place of Performance Zip5"]) : null,
                    },
                });
            }
        }

        // Parse top recipients
        let topRecipients: Array<{ name: string; total_amount: number; contract_count: number }> = [];
        if (recipientRes.ok) {
            const data = await recipientRes.json();
            topRecipients = (data.results || []).map((r: Record<string, unknown>) => ({
                name: String(r.recipient_name || r.name || "Unknown"),
                total_amount: Number(r.aggregated_amount || 0),
                contract_count: Number(r.count || 0),
            }));
        }

        // Parse spending trends
        let spendingByYear: Array<{ fiscal_year: string; amount: number }> = [];
        if (timeRes.ok) {
            const data = await timeRes.json();
            spendingByYear = (data.results || [])
                .map((r: Record<string, unknown>) => ({
                    fiscal_year: String((r.time_period as Record<string, unknown>)?.fiscal_year || ""),
                    amount: Number(r.aggregated_amount || 0),
                }))
                .filter((r: { fiscal_year: string }) => r.fiscal_year)
                .sort((a: { fiscal_year: string }, b: { fiscal_year: string }) =>
                    a.fiscal_year.localeCompare(b.fiscal_year)
                );
        }

        // Compute summary statistics
        const totalSpend = awards.reduce((s, a) => s + a.award_amount, 0);
        const avgAwardSize = awards.length > 0 ? totalSpend / awards.length : 0;

        // Identify unique incumbents from awards
        const incumbentMap = new Map<string, { name: string; uei: string | null; total: number; count: number }>();
        for (const a of awards) {
            if (!a.recipient_name) continue;
            const key = a.recipient_name.toLowerCase();
            const existing = incumbentMap.get(key);
            if (existing) {
                existing.total += a.award_amount;
                existing.count++;
            } else {
                incumbentMap.set(key, {
                    name: a.recipient_name,
                    uei: a.recipient_uei,
                    total: a.award_amount,
                    count: 1,
                });
            }
        }
        const incumbents = Array.from(incumbentMap.values())
            .sort((a, b) => b.total - a.total)
            .slice(0, 20);

        const result = {
            success: true,
            cached: false,
            query: { naics, agency: agency || null, limit, years, start_date: startDate, end_date: endDate },
            summary: {
                total_awards_returned: awards.length,
                total_spend_returned: totalSpend,
                avg_award_size: Math.round(avgAwardSize),
                unique_incumbents: incumbentMap.size,
            },
            incumbents,
            top_recipients: topRecipients,
            spending_by_year: spendingByYear,
            awards,
        };

        // Cache the result
        setCache(cacheKey, result);

        return NextResponse.json(result);

    } catch (e) {
        console.error("Awards intelligence error:", e);
        return NextResponse.json(
            { error: (e as Error).message },
            { status: 500 }
        );
    }
}
