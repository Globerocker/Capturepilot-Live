/**
 * Dashboard contractors list — drives /contract-winners.
 *
 * This is the dashboard-side counterpart to /api/public/contractors.
 * Differences:
 *   - Authenticated route (assertion handled by middleware or page)
 *   - Defaults to "has past awards" filter (the whole point of this page —
 *     show me contractors who've actually won contracts, those are the hot
 *     partnership leads)
 *   - Filters: naics, state, certifications, has_awards, sort
 *
 * Backing data is the same `contractors` table populated by
 * bulk_enrich_contractors_sam (POC + certs + business_url) and
 * /api/intelligence/recipient-awards (federal_awards_count + total_award_volume).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const naics = url.searchParams.getAll("naics").filter(Boolean);
    const stateList = url.searchParams.getAll("state").map(s => s.trim().toUpperCase()).filter(Boolean);
    const certs = url.searchParams.getAll("cert").filter(Boolean);
    const keyword = url.searchParams.get("keyword")?.trim();
    const onlyWithAwards = url.searchParams.get("only_awards") !== "false"; // default ON
    const sort = url.searchParams.get("sort") || "awards";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    let q = sb
        .from("contractors")
        .select(
            `uei, company_name, dba_name, state, city, naics_codes, primary_naics_code,
             email, direct_phone, primary_poc_name, primary_poc_title, business_url,
             certifications, expiration_date,
             federal_awards_count, total_award_volume, last_award_date,
             agency_relationships, naics_awards, last_usaspending_refresh,
             capability_summary_ai, capability_summary_refreshed_at`,
            { count: "exact" }
        );

    if (onlyWithAwards) q = q.gt("federal_awards_count", 0);
    if (naics.length > 0) q = q.overlaps("naics_codes", naics);
    if (stateList.length > 0) q = q.in("state", stateList);
    if (certs.length > 0) q = q.overlaps("certifications", certs);
    if (keyword) q = q.ilike("company_name", `%${keyword}%`);

    if (sort === "value") {
        q = q.order("total_award_volume", { ascending: false, nullsFirst: false });
    } else if (sort === "recent") {
        q = q.order("last_award_date", { ascending: false, nullsFirst: false });
    } else {
        q = q.order("federal_awards_count", { ascending: false, nullsFirst: false });
    }

    q = q.range(offset, offset + limit - 1);

    const { data, count, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        ok: true,
        total: count ?? 0,
        offset,
        limit,
        contractors: data || [],
    });
}
