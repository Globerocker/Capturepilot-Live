import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { protectCrawl } from "@/lib/crawl-protection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public NAICS-summary endpoint — drives the aggregator pages at
 * www.capturepilot.com/contractors/in/<naics-slug>. Returns an array
 * of NAICS codes that have ≥ 3 published contractors, plus per-NAICS
 * stats and the top-N contractors in each.
 *
 * Query params:
 *   ?min=3              minimum contractor count to surface a NAICS (default 3, max 50)
 *   ?include_top=true   include top 5 contractor slugs per NAICS (heavier)
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
    return { "Access-Control-Allow-Origin": allowed, "Vary": "Origin" };
}

export async function GET(req: NextRequest) {
    const headers = corsHeaders(req.headers.get("origin"));
    const blocked = await protectCrawl(req, { route: "public-contractors-by-naics", maxPerMin: 40 });
    if (blocked) return blocked;
    const url = new URL(req.url);
    const min = Math.min(Math.max(Number(url.searchParams.get("min")) || 3, 1), 50);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
    );

    const { data, error } = await sb
        .from("contractor_profile_pages")
        .select("primary_naics, federal_score, total_awarded_amount")
        .eq("is_published", true)
        .not("primary_naics", "is", null)
        .limit(5000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });

    type Row = { primary_naics: string | null; federal_score: number | null; total_awarded_amount: number | null };
    const rows = (data || []) as Row[];

    const grouped = new Map<string, { count: number; total_awarded: number; avg_score: number; scores: number[] }>();
    for (const r of rows) {
        if (!r.primary_naics) continue;
        const k = r.primary_naics;
        if (!grouped.has(k)) grouped.set(k, { count: 0, total_awarded: 0, avg_score: 0, scores: [] });
        const slot = grouped.get(k)!;
        slot.count += 1;
        slot.total_awarded += Number(r.total_awarded_amount || 0);
        slot.scores.push(Number(r.federal_score || 0));
    }

    const aggregated = Array.from(grouped.entries())
        .map(([naics, s]) => ({
            naics,
            count: s.count,
            total_awarded: s.total_awarded,
            avg_score: s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 0,
        }))
        .filter((r) => r.count >= min)
        .sort((a, b) => b.total_awarded - a.total_awarded);

    return NextResponse.json({
        groups: aggregated,
        meta: { naics_groups: aggregated.length, min },
    }, { status: 200, headers });
}
