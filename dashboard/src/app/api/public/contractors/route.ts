import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public listing endpoint — drives the overview page at
 * www.capturepilot.com/contractors and the NAICS / state aggregator pages.
 *
 * Query params:
 *   ?naics=561720    — filter by primary NAICS
 *   ?state=TX        — filter by state
 *   ?limit=50        — default 30, max 200
 *   ?sort=score|awards   — default score
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

export async function GET(req: NextRequest) {
    const headers = corsHeaders(req.headers.get("origin"));
    const url = new URL(req.url);
    const naics = url.searchParams.get("naics");
    const state = url.searchParams.get("state");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 200);
    const sort = url.searchParams.get("sort") === "awards" ? "total_awarded_amount" : "federal_score";

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
    );

    let q = sb
        .from("contractor_profile_pages")
        .select("slug, business_name, primary_naics, state, city, federal_score, total_awarded_amount, top_agency, badges, industry, published_at")
        .eq("is_published", true)
        .order(sort, { ascending: false })
        .limit(limit);
    if (naics) q = q.eq("primary_naics", naics);
    if (state) q = q.eq("state", state);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });

    // Compute aggregate stats for the overview page header
    const total = (data || []).length;
    const avgScore = total > 0
        ? Math.round((data || []).reduce((s, r) => s + (r.federal_score || 0), 0) / total)
        : 0;
    const totalAwarded = (data || []).reduce((s, r) => s + Number(r.total_awarded_amount || 0), 0);

    return NextResponse.json({
        contractors: data || [],
        meta: { total, avg_score: avgScore, total_awarded: totalAwarded, filters: { naics, state }, sort },
    }, { status: 200, headers });
}
