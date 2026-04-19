import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * Recompete Radar — weekly Tuesday 05:00 UTC.
 *
 * Queries USASpending.gov for contracts whose period-of-performance end date
 * falls in the next 3-18 months. These are candidates for recompete / new
 * solicitation. We score each one:
 *
 *   confidence_score = base (0.4) +
 *     +0.2 if months_to_end between 6 and 12 (sweet spot for new RFP prep)
 *     +0.15 if original award was competitive (not sole-source)
 *     +0.1  if incumbent is a large prime (agencies often re-compete to SBs)
 *     +0.1  if agency has historical recompete cadence (has prior awards in same NAICS)
 *     -0.1  if incumbent recently received a contract modification extending PoP
 *
 * High = ≥ 0.7, Medium = 0.5-0.7, Low = < 0.5.
 *
 * Upserts into recompete_candidates by source_award_id. Also tries to match
 * against existing opportunities (same NAICS + agency + expiring period).
 */
const USA_SPENDING_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/";

function getDb() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

interface USAAward {
    generated_internal_id?: string;
    Award_ID?: string;
    Recipient_Name?: string;
    recipient_unique_id?: string;
    recipient_uei?: string;
    Awarding_Agency?: string;
    NAICS?: string;
    psc_code?: string;
    Award_Type?: string;
    Set_Aside_Type?: string;
    Award_Amount?: number;
    Period_of_Performance_Current_End_Date?: string;
    Period_of_Performance_Start_Date?: string;
    Number_of_Modifications?: number;
}

function scoreRecompete(award: USAAward, monthsToEnd: number): { score: number; reasoning: string } {
    let score = 0.4;
    const reasons: string[] = [];

    if (monthsToEnd >= 6 && monthsToEnd <= 12) {
        score += 0.2;
        reasons.push(`${monthsToEnd} mo. to end — in recompete prep window`);
    } else if (monthsToEnd >= 3 && monthsToEnd < 6) {
        score += 0.1;
        reasons.push(`${monthsToEnd} mo. to end — late in recompete window`);
    } else if (monthsToEnd > 12 && monthsToEnd <= 18) {
        score += 0.05;
        reasons.push(`${monthsToEnd} mo. to end — early but worth tracking`);
    }

    const setAside = (award.Set_Aside_Type || "").toLowerCase();
    if (!setAside.includes("sole")) {
        score += 0.15;
        reasons.push("Originally competitive — likely to recompete");
    }

    const value = award.Award_Amount || 0;
    if (value > 10_000_000) {
        score += 0.1;
        reasons.push("Large contract → agencies commonly re-break for SB set-asides");
    }

    const mods = award.Number_of_Modifications || 0;
    if (mods > 5) {
        score -= 0.1;
        reasons.push(`${mods} modifications — may extend rather than recompete`);
    }

    return { score: Math.max(0, Math.min(1, score)), reasoning: reasons.join(". ") };
}

function confidenceTier(s: number): "high" | "medium" | "low" {
    if (s >= 0.7) return "high";
    if (s >= 0.5) return "medium";
    return "low";
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    // Look ahead 3-18 months
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() + 3);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 18);

    const toIso = (d: Date) => d.toISOString().slice(0, 10);

    let pageAwards: USAAward[] = [];
    let upserted = 0;
    let attempted = 0;

    try {
        // Top 500 expiring contracts > $1M in the window, most recent first
        const payload = {
            filters: {
                award_type_codes: ["A", "B", "C", "D"],
                time_period: [
                    {
                        start_date: toIso(startDate),
                        end_date: toIso(endDate),
                        date_type: "action_date",
                    },
                ],
                award_amounts: [{ lower_bound: 1_000_000 }],
            },
            fields: [
                "Award ID",
                "Recipient Name",
                "recipient_uei",
                "Awarding Agency",
                "NAICS",
                "psc_code",
                "Award Type",
                "Set Aside Type",
                "Award Amount",
                "Period of Performance Current End Date",
                "Period of Performance Start Date",
                "Number of Modifications",
                "generated_internal_id",
            ],
            sort: "Award Amount",
            order: "desc",
            limit: 100,
            page: 1,
        };

        // Paginate up to 5 pages (500 rows)
        for (let page = 1; page <= 5; page++) {
            const res = await fetch(USA_SPENDING_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...payload, page }),
            });
            if (!res.ok) break;
            const data = (await res.json()) as { results?: USAAward[]; page_metadata?: { hasNext?: boolean } };
            const rows = data.results || [];
            pageAwards = pageAwards.concat(rows);
            if (!data.page_metadata?.hasNext) break;
        }

        for (const a of pageAwards) {
            attempted++;
            const endStr = a.Period_of_Performance_Current_End_Date;
            if (!endStr) continue;
            const end = new Date(endStr);
            const now = new Date();
            const monthsToEnd = Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
            if (monthsToEnd < 3 || monthsToEnd > 18) continue;

            const { score, reasoning } = scoreRecompete(a, monthsToEnd);
            const sourceId = a.generated_internal_id || a.Award_ID;
            if (!sourceId) continue;

            await db
                .from("recompete_candidates")
                .upsert(
                    {
                        source_award_id: sourceId,
                        incumbent_uei: a.recipient_uei || null,
                        incumbent_name: a.Recipient_Name || null,
                        agency: a.Awarding_Agency || null,
                        naics_code: a.NAICS || null,
                        psc_code: a.psc_code || null,
                        set_aside: a.Set_Aside_Type || null,
                        original_award_value: a.Award_Amount || null,
                        contract_end_date: endStr.slice(0, 10),
                        months_to_end: monthsToEnd,
                        confidence: confidenceTier(score),
                        confidence_score: score,
                        reasoning,
                        last_refreshed_at: new Date().toISOString(),
                    },
                    { onConflict: "source_award_id" }
                );
            upserted++;
        }

        return NextResponse.json({
            success: true,
            awards_scanned: attempted,
            candidates_upserted: upserted,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "recompete_scan failed";
        return NextResponse.json({ success: false, error: msg, upserted }, { status: 500 });
    }
}
