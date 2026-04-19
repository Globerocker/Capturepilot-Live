import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * GET /api/labor-rates?q=software+engineer&education=Bachelors&min_years=5
 *
 * Returns median / p25 / p75 awarded hourly rates from the GSA CALC
 * ingestion. Used by the Price-to-Win tab on the opportunity detail page.
 *
 * Response: {
 *   query: { q, education, min_years },
 *   total_matches: number,
 *   median: number | null,
 *   p25: number | null,
 *   p75: number | null,
 *   top_sample: [{ labor_category, contractor, rate, schedule }]
 * }
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const education = searchParams.get("education");
    const minYears = searchParams.get("min_years");

    if (!q) {
        return NextResponse.json({ error: "q (labor category) required" }, { status: 400 });
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Use plain ILIKE; the GIN tsvector index covers fuzzier phrase matching
    // as a later optimization.
    let query = admin
        .from("labor_rates")
        .select("labor_category, education_level, min_years_experience, contractor_name, schedule, sin, hourly_rate_current, hourly_rate_year1, business_size")
        .ilike("labor_category", `%${q}%`)
        .not("hourly_rate_current", "is", null)
        .limit(500);

    if (education) query = query.eq("education_level", education);
    if (minYears) {
        const n = parseInt(minYears, 10);
        if (!isNaN(n)) query = query.gte("min_years_experience", n);
    }

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rates: number[] = (data || [])
        .map((r) => Number(r.hourly_rate_current))
        .filter((r) => r > 0 && isFinite(r))
        .sort((a, b) => a - b);

    const percentile = (p: number): number | null => {
        if (!rates.length) return null;
        const idx = Math.floor((rates.length - 1) * p);
        return Math.round(rates[idx] * 100) / 100;
    };

    return NextResponse.json({
        query: { q, education, min_years: minYears },
        total_matches: rates.length,
        p25: percentile(0.25),
        median: percentile(0.5),
        p75: percentile(0.75),
        top_sample: (data || []).slice(0, 10),
    });
}
