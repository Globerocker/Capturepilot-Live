/**
 * Single-contractor detail. Source of truth: contractor_profile_pages
 * (the curated published row); joined with contractors table for POC
 * fields by UEI. The frontend ContractorDetailView consumes this.
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

    // Try profile_pages first (richer, has past-perf rollups + AI summary).
    // Fall back to raw contractors row for UEIs not yet promoted to profile.
    const { data: profile, error: profileErr } = await sb
        .from("contractor_profile_pages")
        .select(
            `contractor_uei, slug, business_name, primary_naics, state, city, cage_code,
             sba_certifications, total_awarded_amount, total_awards_count, top_agency,
             top_agency_amount, awards_by_year, top_naics_codes, ai_summary,
             company_website, company_linkedin, federal_score, naics_rank, naics_total,
             state_rank, state_total, badges, is_published, published_at`
        )
        .eq("contractor_uei", uei)
        .maybeSingle();
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

    // POC fields from contractors table.
    const { data: poc } = await sb
        .from("contractors")
        .select("uei, email, direct_phone, primary_poc_name, primary_poc_title, business_url, capability_summary_ai, capability_summary_refreshed_at, social_linkedin, company_linkedin, owner_linkedin, social_facebook, social_twitter, social_instagram, social_youtube, social_other, website_cms, top_match_count, qc_enriched")
        .eq("uei", uei)
        .maybeSingle();

    if (!profile && !poc) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Build the unified contractor record the frontend expects.
    const p = profile as Record<string, unknown> | null;
    const c = poc as Record<string, unknown> | null;
    const contractor = {
        uei,
        slug: p?.slug ?? null,
        cage_code: p?.cage_code ?? null,
        company_name: (p?.business_name as string) ?? "Unknown",
        dba_name: null,
        state: p?.state ?? null,
        city: p?.city ?? null,
        address_line_1: null,
        naics_codes: (p?.top_naics_codes as string[] | null) ?? [],
        primary_naics_code: p?.primary_naics ?? null,
        email: c?.email ?? null,
        direct_phone: c?.direct_phone ?? null,
        primary_poc_name: c?.primary_poc_name ?? null,
        primary_poc_title: c?.primary_poc_title ?? null,
        business_url: (c?.business_url as string | null) ?? (p?.company_website as string | null) ?? null,
        certifications: (p?.sba_certifications as string[] | null) ?? [],
        expiration_date: null,
        registration_status: null,
        entity_structure: null,
        business_types: null,
        federal_awards_count: p?.total_awards_count ?? null,
        total_award_volume: p?.total_awarded_amount ?? null,
        last_award_date: null,
        agency_relationships: p?.top_agency
            ? [{ name: p.top_agency, amount: Number(p.top_agency_amount) || 0, count: 0 }]
            : null,
        naics_awards: null,
        awards_by_year: p?.awards_by_year ?? null,
        last_usaspending_refresh: null,
        // AI summary preference: prefer the structured contractor-analysis JSON
        // (strengths/weaknesses), fall back to the prose ai_summary from profile_pages.
        capability_summary_ai: c?.capability_summary_ai ?? null,
        capability_summary_refreshed_at: c?.capability_summary_refreshed_at ?? null,
        capability_summary_source: null,
        ai_summary_prose: p?.ai_summary ?? null,
        federal_score: p?.federal_score ?? null,
        naics_rank: p?.naics_rank ?? null,
        naics_total: p?.naics_total ?? null,
        state_rank: p?.state_rank ?? null,
        state_total: p?.state_total ?? null,
        badges: p?.badges ?? [],
        // Web presence (deterministic social + CMS capture from QC enrichment).
        website_cms: c?.website_cms ?? null,
        qc_enriched: c?.qc_enriched ?? null,
        top_match_count: c?.top_match_count ?? null,
        social_links: {
            linkedin: (c?.social_linkedin as string | null) ?? (c?.company_linkedin as string | null) ?? (p?.company_linkedin as string | null) ?? null,
            owner_linkedin: (c?.owner_linkedin as string | null) ?? null,
            facebook: (c?.social_facebook as string | null) ?? null,
            twitter: (c?.social_twitter as string | null) ?? null,
            instagram: (c?.social_instagram as string | null) ?? null,
            youtube: (c?.social_youtube as string | null) ?? null,
            other: (c?.social_other as Record<string, string> | null) ?? null,
        },
        created_at: null,
        updated_at: null,
    };

    // Active opps this UEI is the incumbent on.
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
