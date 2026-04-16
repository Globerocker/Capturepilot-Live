import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * Cron: enrich contractor rows with USASpending.gov past-award data.
 *
 * Schedule: daily 06:30 UTC (after SAM ingest at 02:00 and contractor
 * discovery; before score_matches doesn't need this to run but we put it
 * early to keep the data fresh).
 *
 * For each contractor (prioritized by stale `last_usaspending_refresh` +
 * having a UEI), we call USASpending /spending_by_award aggregated 5yr
 * and persist: federal_awards_count, total_award_volume,
 * agency_relationships, naics_awards, last_award_date.
 *
 * Budget: USASpending is free and generally tolerant. We still cap batch
 * size to 100 per run so a single cron never runs long on Vercel.
 * Rows get refreshed every 14 days on a rolling basis.
 */
export async function GET(req: NextRequest) {
    // Same auth guard pattern the other crons use.
    const auth = req.headers.get("authorization");
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const batchSize = parseInt(req.nextUrl.searchParams.get("limit") || "100", 10);

    // Prefer: contractors with a UEI, ordered by oldest last_usaspending_refresh
    // (nulls first so unseen rows get priority).
    const { data: targets } = await admin
        .from("contractors")
        .select("id, uei, company_name")
        .not("uei", "is", null)
        .order("last_usaspending_refresh", { ascending: true, nullsFirst: true })
        .limit(batchSize);

    const rows = (targets || []) as Array<{ id: string; uei: string; company_name: string }>;
    if (rows.length === 0) {
        return NextResponse.json({ processed: 0, note: "no contractors with UEI" });
    }

    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 5 * 365 * 86400_000).toISOString().split("T")[0];

    const stats = { processed: 0, hit: 0, miss: 0, errors: 0 };

    // Process serially — USASpending tolerates it, and parallel burst can
    // trigger their slow-path caching which makes later calls slower.
    for (const row of rows) {
        try {
            const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filters: {
                        time_period: [{ start_date: startDate, end_date: endDate }],
                        award_type_codes: ["A", "B", "C", "D"],
                        recipient_search_text: [row.uei],
                    },
                    fields: ["Award ID", "Award Amount", "Awarding Agency", "Last Modified Date", "NAICS"],
                    page: 1,
                    limit: 100,
                    sort: "Last Modified Date",
                    order: "desc",
                }),
                signal: AbortSignal.timeout(20_000),
            });

            if (!res.ok) { stats.errors++; continue; }
            const data = await res.json();
            const awards = (data.results || []) as Array<{
                "Award Amount"?: number; "Awarding Agency"?: string;
                "Last Modified Date"?: string;
                NAICS?: { code?: string; description?: string };
            }>;

            if (awards.length === 0) {
                // Mark as refreshed so we don't keep retrying this contractor.
                await admin.from("contractors")
                    .update({
                        federal_awards_count: 0,
                        total_award_volume: 0,
                        agency_relationships: [],
                        naics_awards: [],
                        last_usaspending_refresh: new Date().toISOString(),
                    })
                    .eq("id", row.id);
                stats.miss++;
                stats.processed++;
                continue;
            }

            // Aggregate
            const agencyMap = new Map<string, { amount: number; count: number }>();
            const naicsMap = new Map<string, { description: string; amount: number; count: number }>();
            let total = 0;
            let lastDate: string | null = null;
            for (const a of awards) {
                const amt = Number(a["Award Amount"] || 0);
                total += amt;
                const ag = a["Awarding Agency"] || "Unknown Agency";
                const prevA = agencyMap.get(ag) || { amount: 0, count: 0 };
                agencyMap.set(ag, { amount: prevA.amount + amt, count: prevA.count + 1 });
                const nc = a.NAICS?.code || "";
                if (nc) {
                    const prevN = naicsMap.get(nc) || { description: a.NAICS?.description || "", amount: 0, count: 0 };
                    naicsMap.set(nc, { description: prevN.description, amount: prevN.amount + amt, count: prevN.count + 1 });
                }
                const d = a["Last Modified Date"];
                if (d && (!lastDate || d > lastDate)) lastDate = d;
            }
            const topAgencies = [...agencyMap.entries()]
                .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 10);
            const topNaics = [...naicsMap.entries()]
                .map(([code, v]) => ({ code, description: v.description, amount: v.amount, count: v.count }))
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 10);

            await admin.from("contractors")
                .update({
                    federal_awards_count: awards.length,
                    total_award_volume: total,
                    agency_relationships: topAgencies,
                    naics_awards: topNaics,
                    last_award_date: lastDate,
                    last_usaspending_refresh: new Date().toISOString(),
                })
                .eq("id", row.id);
            stats.hit++;
            stats.processed++;
        } catch {
            stats.errors++;
        }
    }

    return NextResponse.json({ ...stats, batch: rows.length });
}
