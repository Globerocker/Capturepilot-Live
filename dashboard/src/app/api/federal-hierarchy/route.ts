import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * GET /api/federal-hierarchy
 *   ?q=Veterans
 *   ?fpds_code=36C2
 *   ?parent=<fh_id>
 *
 * Thin search over our federal_hierarchy snapshot (populated by the
 * ingest_federal_hierarchy cron against open.gsa.gov FH API).
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const fpdsCode = searchParams.get("fpds_code");
    const parent = searchParams.get("parent");

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let query = admin
        .from("federal_hierarchy")
        .select("fh_id, org_name, org_type, parent_fh_id, parent_name, agency_code, fpds_code, dodaac, status, address_state")
        .eq("status", "active")
        .limit(50);

    if (q) query = query.ilike("org_name", `%${q}%`);
    if (fpdsCode) query = query.eq("fpds_code", fpdsCode);
    if (parent) query = query.eq("parent_fh_id", parent);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ results: data || [] });
}
