import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * GET /api/intelligence/recipient-awards?name=ACME%20INC&uei=ABC123&years=5
 *
 * Returns a summary of federal awards won by a specific company, pulled live
 * from USASpending.gov. Used by <PastAwardsPanel> on competitor/partner/
 * Quick-Checker pages.
 *
 * Strategy:
 *   1) If we've cached this recipient recently (contractors table with
 *      federal_award_count populated), serve that.
 *   2) Otherwise hit USASpending /spending_by_award, aggregate top-level
 *      stats, and return. We also upsert what we learned onto the
 *      contractors row so subsequent calls are fast.
 *
 * Response shape:
 *   {
 *     recipient_name, years,
 *     summary: { award_count, total_value, agencies_count, naics_codes_count, last_award_date },
 *     top_agencies: [{ name, amount, count }],
 *     top_naics:    [{ code, description, amount, count }],
 *     recent_awards: [{ award_id, agency, amount, date, naics_code, naics_description }]
 *   }
 */

interface AwardRow {
    internal_id?: number;
    "Award ID"?: string;
    "Recipient Name"?: string;
    "Award Amount"?: number;
    "Awarding Agency"?: string;
    "Last Modified Date"?: string;
    NAICS?: { code?: string; description?: string };
    generated_internal_id?: string;
}

export async function GET(req: NextRequest) {
    const name = req.nextUrl.searchParams.get("name")?.trim();
    const uei = req.nextUrl.searchParams.get("uei")?.trim();
    const years = Math.min(parseInt(req.nextUrl.searchParams.get("years") || "5", 10), 10);
    if (!name && !uei) return NextResponse.json({ error: "name or uei required" }, { status: 400 });

    // ---- 1) Cache peek on the contractors table ---------------------------
    // We don't use the cache as truth — USASpending data drifts fast — but if
    // a recent record exists we return it and refresh async. Kept simple:
    // UEI match only; name match is too fuzzy.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    let cachedRow: Record<string, unknown> | null = null;
    if (url && serviceKey && uei) {
        const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
        const { data } = await admin
            .from("contractors")
            .select("company_name, dba_name, federal_awards_count, total_award_volume, agency_relationships, naics_awards, last_award_date, last_usaspending_refresh")
            .eq("uei", uei)
            .maybeSingle();
        cachedRow = data as Record<string, unknown> | null;
        const freshEnough = cachedRow?.last_usaspending_refresh &&
            new Date(cachedRow.last_usaspending_refresh as string).getTime() > Date.now() - 14 * 86400_000;
        if (freshEnough && cachedRow && typeof cachedRow.federal_awards_count === "number" && cachedRow.federal_awards_count > 0) {
            return NextResponse.json({
                recipient_name: (cachedRow.company_name as string) || name || "",
                years,
                source: "cache",
                summary: {
                    award_count: cachedRow.federal_awards_count as number,
                    total_value: (cachedRow.total_award_volume as number) || 0,
                    agencies_count: Array.isArray(cachedRow.agency_relationships) ? (cachedRow.agency_relationships as unknown[]).length : 0,
                    naics_codes_count: Array.isArray(cachedRow.naics_awards) ? (cachedRow.naics_awards as unknown[]).length : 0,
                    last_award_date: cachedRow.last_award_date || null,
                },
                top_agencies: (cachedRow.agency_relationships as Array<{ name: string; amount: number; count: number }> | null) || [],
                top_naics: (cachedRow.naics_awards as Array<{ code: string; description: string; amount: number; count: number }> | null) || [],
                recent_awards: [],
            });
        }
    }

    // ---- 2) Live fetch from USASpending -----------------------------------
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - years * 365 * 86400_000).toISOString().split("T")[0];

    // Prefer UEI-exact search when we have it; fall back to recipient_search_text (fuzzy).
    // USASpending recipient_search_text matches on name + DUNS + UEI substrings —
    // good for discovery but sometimes too loose.
    const filters: Record<string, unknown> = {
        time_period: [{ start_date: startDate, end_date: endDate }],
        award_type_codes: ["A", "B", "C", "D"],   // contracts only; grants = F/G
    };
    if (uei) filters.recipient_search_text = [uei];
    else if (name) filters.recipient_search_text = [name];

    let awards: AwardRow[] = [];
    try {
        const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filters,
                fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Last Modified Date", "NAICS"],
                page: 1,
                limit: 100,
                sort: "Last Modified Date",
                order: "desc",
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
            const data = await res.json();
            awards = (data.results || []) as AwardRow[];
        }
    } catch {
        // Network fail — return empty with a flag so the UI can show a soft message.
        return NextResponse.json({
            recipient_name: name || "",
            years,
            source: "live_error",
            summary: { award_count: 0, total_value: 0, agencies_count: 0, naics_codes_count: 0, last_award_date: null },
            top_agencies: [], top_naics: [], recent_awards: [],
        });
    }

    // Aggregate
    const agencyMap = new Map<string, { amount: number; count: number }>();
    const naicsMap = new Map<string, { description: string; amount: number; count: number }>();
    let totalValue = 0;
    let lastAwardDate: string | null = null;
    for (const a of awards) {
        const amt = Number(a["Award Amount"] || 0);
        totalValue += amt;
        const agency = a["Awarding Agency"] || "Unknown Agency";
        const prevA = agencyMap.get(agency) || { amount: 0, count: 0 };
        agencyMap.set(agency, { amount: prevA.amount + amt, count: prevA.count + 1 });
        const naicsCode = a.NAICS?.code || "";
        if (naicsCode) {
            const prevN = naicsMap.get(naicsCode) || { description: a.NAICS?.description || "", amount: 0, count: 0 };
            naicsMap.set(naicsCode, { description: prevN.description, amount: prevN.amount + amt, count: prevN.count + 1 });
        }
        const d = a["Last Modified Date"];
        if (d && (!lastAwardDate || d > lastAwardDate)) lastAwardDate = d;
    }

    const topAgencies = [...agencyMap.entries()]
        .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);
    const topNaics = [...naicsMap.entries()]
        .map(([code, v]) => ({ code, description: v.description, amount: v.amount, count: v.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);
    const recentAwards = awards.slice(0, 10).map(a => ({
        award_id: a["Award ID"] || "",
        agency: a["Awarding Agency"] || "",
        amount: Number(a["Award Amount"] || 0),
        date: a["Last Modified Date"] || "",
        naics_code: a.NAICS?.code || "",
        naics_description: a.NAICS?.description || "",
        internal_id: a.generated_internal_id || "",
    }));

    const result = {
        recipient_name: awards[0]?.["Recipient Name"] || name || "",
        years,
        source: "live" as const,
        summary: {
            award_count: awards.length,
            total_value: totalValue,
            agencies_count: agencyMap.size,
            naics_codes_count: naicsMap.size,
            last_award_date: lastAwardDate,
        },
        top_agencies: topAgencies,
        top_naics: topNaics,
        recent_awards: recentAwards,
    };

    // ---- 3) Persist to contractors table if we have a UEI to key on -------
    // Fire-and-forget — don't block the response.
    if (url && serviceKey && uei && awards.length > 0) {
        const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
        admin.from("contractors")
            .update({
                federal_awards_count: awards.length,
                total_award_volume: totalValue,
                agency_relationships: topAgencies,
                naics_awards: topNaics,
                last_award_date: lastAwardDate,
                last_usaspending_refresh: new Date().toISOString(),
            })
            .eq("uei", uei)
            .then(() => { /* ignore errors */ });
    }

    return NextResponse.json(result);
}
