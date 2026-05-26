import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/intelligence/related-contractors
 *
 * Returns top published contractors from contractor_profile_pages that
 * match the opportunity's context:
 *   - same primary NAICS (best signal)
 *   - same state (fallback when NAICS missing)
 *   - any of the supplied keywords overlapping top_naics_codes or
 *     business_name (lower-confidence fallback)
 *
 * Powers the "Who wins contracts like this?" panel on opportunity
 * detail pages — particularly valuable for SLED opps that don't have
 * a NAICS code to feed the existing /api/intelligence/market-size.
 *
 * Query params:
 *   ?naics=541330       primary NAICS
 *   ?state=TX           place of performance state
 *   ?keywords=a,b,c     comma-sep keywords from opp.extracted_keywords
 *   ?limit=5
 */
export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const naics = url.searchParams.get("naics");
    const state = url.searchParams.get("state");
    const keywordsParam = url.searchParams.get("keywords");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 5, 1), 20);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
    );

    type Contractor = {
        slug: string;
        business_name: string;
        primary_naics: string | null;
        state: string | null;
        city: string | null;
        federal_score: number | null;
        total_awarded_amount: number | null;
        top_agency: string | null;
        badges: string[] | null;
    };

    // Tier 1: exact NAICS match — strongest signal.
    const buckets: Contractor[] = [];
    const seen = new Set<string>();
    const select = "slug, business_name, primary_naics, state, city, federal_score, total_awarded_amount, top_agency, badges";

    if (naics) {
        const { data } = await sb.from("contractor_profile_pages")
            .select(select)
            .eq("is_published", true)
            .eq("primary_naics", naics)
            .order("federal_score", { ascending: false })
            .limit(limit + 5);
        for (const c of ((data || []) as Contractor[])) {
            if (!seen.has(c.slug)) { seen.add(c.slug); buckets.push(c); }
        }
    }

    // Tier 2: same state, regardless of NAICS — fills in for SLED rows.
    if (state && buckets.length < limit) {
        const { data } = await sb.from("contractor_profile_pages")
            .select(select)
            .eq("is_published", true)
            .eq("state", state)
            .order("federal_score", { ascending: false })
            .limit(limit + 5);
        for (const c of ((data || []) as Contractor[])) {
            if (!seen.has(c.slug) && buckets.length < limit * 2) {
                seen.add(c.slug);
                buckets.push(c);
            }
        }
    }

    // Tier 3: keyword overlap on top_naics_codes via the GIN-indexed extracted_keywords.
    // Best for SLED opps where NAICS is missing and state still isn't enough.
    if (keywordsParam && buckets.length < limit) {
        const keywords = keywordsParam
            .split(",")
            .map((k) => k.trim().toLowerCase())
            .filter((k) => k.length >= 3)
            .slice(0, 5);
        if (keywords.length > 0) {
            // contractor_profile_pages doesn't carry extracted_keywords. We
            // soft-match on business_name + industry via ilike chains.
            for (const kw of keywords) {
                if (buckets.length >= limit * 2) break;
                const { data } = await sb.from("contractor_profile_pages")
                    .select(select)
                    .eq("is_published", true)
                    .or(`business_name.ilike.%${kw}%,industry.ilike.%${kw}%`)
                    .order("federal_score", { ascending: false })
                    .limit(3);
                for (const c of ((data || []) as Contractor[])) {
                    if (!seen.has(c.slug) && buckets.length < limit * 2) {
                        seen.add(c.slug);
                        buckets.push(c);
                    }
                }
            }
        }
    }

    return NextResponse.json({
        contractors: buckets.slice(0, limit),
        meta: { count: buckets.slice(0, limit).length, tier_used: naics ? "naics" : state ? "state" : "keyword" },
    });
}
