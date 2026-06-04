import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { protectCrawl } from "@/lib/crawl-protection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public read-only endpoint serving contractor profile pages.
 * Powers www.capturepilot.com/contractors/<slug>.
 *
 * CORS is permissive because both capturepilot.com domains hit this.
 * RLS already restricts to is_published = true.
 */

const ALLOWED_ORIGINS = new Set([
    "https://www.capturepilot.com",
    "https://capturepilot.com",
    "https://www.americurial.com",
    "https://americurial.com",
    "http://localhost:3000",
    "http://localhost:3001",
]);

function corsHeaders(origin: string | null): Record<string, string> {
    const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.capturepilot.com";
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Vary": "Origin",
    };
}

export async function OPTIONS(req: NextRequest) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const headers = corsHeaders(req.headers.get("origin"));
    if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400, headers });
    // Crawl protection — contractor detail pages are individually shallow but
    // a scraper iterating slug-by-slug could pull all 80K. 60/min/IP is fine
    // for genuine browse; sustained higher rates get 429.
    const blocked = await protectCrawl(req, { route: "public-contractor-detail", maxPerMin: 60 });
    if (blocked) return blocked;

    // Use the anon client + RLS rather than service key — anyone reading
    // this endpoint sees what an unauthenticated visitor would.
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
    );

    const { data, error } = await sb
        .from("contractor_profile_pages")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404, headers });

    // Fallback enrichment — Apollo doesn't match every contractor, so
    // many profile_pages rows ship with empty company_website / city /
    // state / sba_certifications / cage_code. The contractors table has
    // most of these from SAM ingest (bulk_enrich_contractors_sam). Merge
    // what's missing so the public detail page renders something useful
    // instead of bare columns. We only fill blanks — profile_pages wins
    // when it has a value (curated/AI-enriched values may be better than
    // raw SAM strings).
    const uei = (data as { contractor_uei?: string }).contractor_uei;
    if (uei) {
        const { data: c } = await sb
            .from("contractors")
            .select("business_url, city, state, cage_code, certifications, primary_naics_code, naics_codes, primary_poc_name, primary_poc_title, expiration_date, entity_structure")
            .eq("uei", uei)
            .maybeSingle();
        if (c) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const merged: any = { ...data };
            if (!merged.company_website && c.business_url) merged.company_website = c.business_url;
            if (!merged.city && c.city) merged.city = c.city;
            if (!merged.state && c.state) merged.state = c.state;
            if (!merged.cage_code && c.cage_code) merged.cage_code = c.cage_code;
            if ((!merged.sba_certifications || merged.sba_certifications.length === 0) && c.certifications) {
                merged.sba_certifications = c.certifications;
            }
            if ((!merged.top_naics_codes || merged.top_naics_codes.length === 0) && c.naics_codes) {
                merged.top_naics_codes = c.naics_codes;
            }
            // Expose POC info as an additional block. profile_pages
            // historically didn't track this; pass it through under a
            // distinct key so the page can render it without overwriting
            // any existing schema field.
            merged._poc = {
                name: c.primary_poc_name || null,
                title: c.primary_poc_title || null,
            };
            merged._sam = {
                expiration_date: c.expiration_date || null,
                entity_structure: c.entity_structure || null,
            };
            return NextResponse.json({ contractor: merged }, { status: 200, headers });
        }
    }

    return NextResponse.json({ contractor: data }, { status: 200, headers });
}
