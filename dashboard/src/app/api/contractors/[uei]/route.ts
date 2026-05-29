/**
 * Single-contractor detail endpoint. Returns everything we know about a
 * UEI: SAM-derived fields (POC, certs, NAICS, address), past-awards
 * aggregates (federal_awards_count, total_award_volume, top agencies/NAICS),
 * AI capability summary (Ollama-generated; see /api/intelligence/contractor-analysis),
 * and optionally a list of recent recompetes/opportunities they're tied to.
 *
 * Used by /contract-winners/[uei] + the new ContractorDetailView component
 * that's embedded on partner/competitor detail pages too.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
    params: Promise<{ uei: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
    const { uei } = await ctx.params;
    if (!uei) return NextResponse.json({ error: "uei required" }, { status: 400 });

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const { data: contractor, error } = await sb
        .from("contractors")
        .select(
            `uei, cage_code, company_name, dba_name, state, city, address_line_1,
             naics_codes, primary_naics_code,
             email, direct_phone, primary_poc_name, primary_poc_title, business_url,
             certifications, expiration_date, registration_status,
             entity_structure, business_types,
             federal_awards_count, total_award_volume, last_award_date,
             agency_relationships, naics_awards, last_usaspending_refresh,
             capability_summary_ai, capability_summary_refreshed_at, capability_summary_source,
             created_at, updated_at`
        )
        .eq("uei", uei)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!contractor) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Subawards as prime — opps where this UEI is the listed incumbent.
    // Useful for "what is this contractor currently working on" surface.
    const { data: incumbentOpps } = await sb
        .from("opportunities")
        .select("id, title, agency, response_deadline, link, source, estimated_value")
        .eq("incumbent_uei", uei)
        .eq("is_archived", false)
        .order("response_deadline", { ascending: true, nullsFirst: false })
        .limit(10);

    return NextResponse.json({
        ok: true,
        contractor,
        incumbent_on_active_opps: incumbentOpps || [],
    });
}
