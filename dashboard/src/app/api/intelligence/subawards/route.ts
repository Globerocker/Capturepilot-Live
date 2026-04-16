import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * GET /api/intelligence/subawards?name=ACME&years=5&direction=as_sub|as_prime
 *
 * Pulls teaming / sub-contracting relationships from USASpending.gov.
 *
 *   direction=as_sub (default):  shows primes this company has SUB-contracted TO
 *                                — useful for "who does this company sub under?"
 *   direction=as_prime:          shows subs this company has HIRED as prime
 *                                — useful for "who teams under this company?"
 *
 * The UI on partner/competitor detail renders both so the user sees a full
 * teaming picture.
 */

interface SubawardRow {
    "Sub-Award ID"?: string;
    "Sub-Awardee Name"?: string;
    "Sub-Award Amount"?: number;
    "Sub-Award Date"?: string;
    "Prime Award ID"?: string;
    "Prime Recipient Name"?: string;
    "Awarding Agency"?: string;
    prime_award_generated_internal_id?: string;
}

export async function GET(req: NextRequest) {
    const name = req.nextUrl.searchParams.get("name")?.trim();
    const uei = req.nextUrl.searchParams.get("uei")?.trim();
    const years = Math.min(parseInt(req.nextUrl.searchParams.get("years") || "5", 10), 10);
    const direction = req.nextUrl.searchParams.get("direction") === "as_prime" ? "as_prime" : "as_sub";
    if (!name && !uei) return NextResponse.json({ error: "name or uei required" }, { status: 400 });

    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - years * 365 * 86400_000).toISOString().split("T")[0];

    // USASpending subawards search accepts recipient_search_text which matches
    // EITHER sub-recipient OR prime-recipient depending on how we filter.
    // The endpoint itself doesn't differentiate — we use the search to find
    // sub-award records where our target company appears, then classify
    // direction per row in aggregation below.
    const filters: Record<string, unknown> = {
        time_period: [{ start_date: startDate, end_date: endDate }],
    };
    if (uei) filters.recipient_search_text = [uei];
    else if (name) filters.recipient_search_text = [name];

    let subs: SubawardRow[] = [];
    try {
        const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filters,
                subawards: true,
                fields: ["Sub-Award ID", "Sub-Awardee Name", "Sub-Award Amount", "Sub-Award Date", "Prime Award ID", "Prime Recipient Name", "Awarding Agency"],
                page: 1,
                limit: 100,
                sort: "Sub-Award Date",
                order: "desc",
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
            const data = await res.json();
            subs = (data.results || []) as SubawardRow[];
        }
    } catch {
        return NextResponse.json({
            name, direction, years, source: "live_error",
            relationships: [], total_value: 0, total_subs: 0,
        });
    }

    // Classify each row as as_sub or as_prime by comparing the target name
    // against prime-recipient vs sub-awardee. USASpending doesn't guarantee
    // an exact string match; we use case-insensitive contains as a heuristic.
    const needle = (name || uei || "").toLowerCase();
    const filtered = subs.filter(row => {
        const subName = (row["Sub-Awardee Name"] || "").toLowerCase();
        const primeName = (row["Prime Recipient Name"] || "").toLowerCase();
        if (direction === "as_sub") {
            // Our target is the sub-recipient — we want rows where target appears in subName
            return subName.includes(needle) || needle.includes(subName);
        }
        // as_prime — target appears in primeName
        return primeName.includes(needle) || needle.includes(primeName);
    });

    // Group into a partner-relationship view:
    //   as_sub → one row per prime contractor (they're the prime, we're the sub)
    //   as_prime → one row per sub-awardee (they're the sub, we're the prime)
    const otherPartyMap = new Map<string, { total: number; count: number; agency_top: Record<string, number>; last_date: string | null }>();
    let totalValue = 0;
    for (const row of filtered) {
        const otherParty = direction === "as_sub"
            ? (row["Prime Recipient Name"] || "Unknown Prime")
            : (row["Sub-Awardee Name"] || "Unknown Sub");
        const amt = Number(row["Sub-Award Amount"] || 0);
        totalValue += amt;
        const prev = otherPartyMap.get(otherParty) || { total: 0, count: 0, agency_top: {}, last_date: null };
        prev.total += amt;
        prev.count++;
        const agency = row["Awarding Agency"] || "";
        if (agency) prev.agency_top[agency] = (prev.agency_top[agency] || 0) + 1;
        const d = row["Sub-Award Date"];
        if (d && (!prev.last_date || d > prev.last_date)) prev.last_date = d;
        otherPartyMap.set(otherParty, prev);
    }

    const relationships = [...otherPartyMap.entries()]
        .map(([partner, v]) => ({
            partner,
            total_value: v.total,
            sub_count: v.count,
            primary_agency: Object.entries(v.agency_top).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
            last_date: v.last_date,
        }))
        .sort((a, b) => b.total_value - a.total_value)
        .slice(0, 15);

    return NextResponse.json({
        name: name || uei || "",
        direction,
        years,
        source: "live" as const,
        total_subs: filtered.length,
        total_value: totalValue,
        relationships,
    });
}
