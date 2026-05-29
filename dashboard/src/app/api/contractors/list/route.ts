/**
 * Dashboard contractors list — drives /contract-winners.
 *
 * Source of truth: `contractor_profile_pages` (curated published rows
 * with past-performance rollups + AI summary + rank context). Joined to
 * `contractors` by UEI for POC enrichment (email, phone, POC name).
 *
 * The raw `contractors` table has 82K+ rows but most lack past-performance
 * data. profile_pages is the ~1230 contractors we've actually enriched
 * end-to-end — exactly the partnership-lead population we want here.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProfileRow {
    contractor_uei: string;
    slug: string;
    business_name: string;
    primary_naics: string | null;
    state: string | null;
    city: string | null;
    cage_code: string | null;
    sba_certifications: string[] | null;
    total_awarded_amount: number | null;
    total_awards_count: number | null;
    top_agency: string | null;
    top_agency_amount: number | null;
    awards_by_year: unknown;
    top_naics_codes: string[] | null;
    ai_summary: string | null;
    company_website: string | null;
    company_linkedin: string | null;
    federal_score: number | null;
    naics_rank: number | null;
    state_rank: number | null;
    badges: string[] | null;
}

interface ContractorPocRow {
    uei: string;
    email: string | null;
    direct_phone: string | null;
    primary_poc_name: string | null;
    primary_poc_title: string | null;
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const naics = url.searchParams.getAll("naics").filter(Boolean);
    const stateList = url.searchParams.getAll("state").map(s => s.trim().toUpperCase()).filter(Boolean);
    const certs = url.searchParams.getAll("cert").filter(Boolean);
    const keyword = url.searchParams.get("keyword")?.trim();
    const onlyWithAwards = url.searchParams.get("only_awards") !== "false";
    const sort = url.searchParams.get("sort") || "awards";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    let q = sb
        .from("contractor_profile_pages")
        .select(
            `contractor_uei, slug, business_name, primary_naics, state, city, cage_code,
             sba_certifications, total_awarded_amount, total_awards_count, top_agency,
             top_agency_amount, awards_by_year, top_naics_codes, ai_summary,
             company_website, company_linkedin, federal_score, naics_rank,
             state_rank, badges`,
            { count: "exact" }
        )
        .eq("is_published", true);

    if (onlyWithAwards) q = q.gt("total_awards_count", 0);
    if (naics.length > 0) q = q.in("primary_naics", naics);
    if (stateList.length > 0) q = q.in("state", stateList);
    if (certs.length > 0) q = q.overlaps("sba_certifications", certs);
    if (keyword) q = q.ilike("business_name", `%${keyword}%`);

    if (sort === "value") {
        q = q.order("total_awarded_amount", { ascending: false, nullsFirst: false });
    } else if (sort === "recent") {
        q = q.order("published_at", { ascending: false, nullsFirst: false });
    } else {
        q = q.order("total_awards_count", { ascending: false, nullsFirst: false });
    }
    q = q.range(offset, offset + limit - 1);

    const { data, count, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const profiles = (data || []) as ProfileRow[];

    // Batch-join POC info from contractors table by UEI.
    const ueis = profiles.map(p => p.contractor_uei).filter(Boolean);
    const pocMap = new Map<string, ContractorPocRow>();
    if (ueis.length > 0) {
        const { data: pocs } = await sb
            .from("contractors")
            .select("uei, email, direct_phone, primary_poc_name, primary_poc_title")
            .in("uei", ueis);
        for (const p of (pocs || []) as ContractorPocRow[]) {
            if (p.uei) pocMap.set(p.uei, p);
        }
    }

    // Project into the shape the frontend list card expects.
    // Field names match the legacy ContractorListCard contract so we don't
    // need to also touch the frontend.
    const contractors = profiles.map(p => {
        const poc = pocMap.get(p.contractor_uei);
        return {
            uei: p.contractor_uei,
            slug: p.slug,
            company_name: p.business_name,
            primary_naics_code: p.primary_naics,
            naics_codes: p.top_naics_codes || [],
            state: p.state,
            city: p.city,
            cage_code: p.cage_code,
            certifications: p.sba_certifications || [],
            email: poc?.email || null,
            direct_phone: poc?.direct_phone || null,
            primary_poc_name: poc?.primary_poc_name || null,
            primary_poc_title: poc?.primary_poc_title || null,
            business_url: p.company_website,
            federal_awards_count: p.total_awards_count,
            total_award_volume: p.total_awarded_amount,
            top_agency: p.top_agency,
            top_agency_amount: p.top_agency_amount,
            awards_by_year: p.awards_by_year,
            ai_summary: p.ai_summary,
            federal_score: p.federal_score,
            naics_rank: p.naics_rank,
            state_rank: p.state_rank,
            badges: p.badges || [],
            // agency_relationships isn't on profile_pages — leaving null so
            // the card just hides the section. Detail page hits a separate
            // live USAspending fetch for full agency breakdown.
            agency_relationships: null,
            last_award_date: null,
        };
    });

    return NextResponse.json({
        ok: true,
        total: count ?? 0,
        offset,
        limit,
        contractors,
    });
}
