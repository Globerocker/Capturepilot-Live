import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 15;

/**
 * GET /api/spend-radar
 *   ?fy=2026&period=Q4   (optional — defaults to latest published row set)
 *
 * Returns the agency_spend_forecast entries enriched with a boolean
 * `matches_profile` flag for each row so the dashboard widget can
 * bubble NAICS-relevant agencies to the top. Rows are already static
 * and small (~10 rows per period), so we return the whole set.
 */
export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { searchParams } = req.nextUrl;
    const fy     = parseInt(searchParams.get("fy") || "0", 10) || null;
    const period = searchParams.get("period") || null;

    const { data: profile } = await admin
        .from("user_profiles")
        .select("naics_codes")
        .eq("auth_user_id", user.id)
        .maybeSingle<{ naics_codes: string[] | null }>();
    const profileNaics = new Set(profile?.naics_codes || []);

    let query = admin.from("agency_spend_forecast").select("*").order("rank", { ascending: true });
    if (fy)     query = query.eq("fiscal_year", fy);
    if (period) query = query.eq("fiscal_period", period);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If no fy/period specified, pick the latest (max fiscal_year, then first fiscal_period found).
    let rows = data || [];
    if (!fy && rows.length) {
        const latestFy = rows.reduce((m, r) => Math.max(m, r.fiscal_year), 0);
        rows = rows.filter(r => r.fiscal_year === latestFy);
    }

    const enriched = rows.map(r => {
        const hot = (r.hot_naics || []) as string[];
        const naics_match_count = hot.filter(n => {
            if (profileNaics.has(n)) return true;
            // Prefix match on 2-digit so "54" in profile matches "541512" hot NAICS.
            return Array.from(profileNaics).some(p => p.length >= 2 && n.startsWith(p.slice(0, Math.min(p.length, 4))));
        }).length;
        return { ...r, matches_profile: naics_match_count > 0, naics_match_count };
    });

    // Sort: profile matches first (by overlap count), then rank.
    enriched.sort((a, b) => {
        if (b.naics_match_count !== a.naics_match_count) return b.naics_match_count - a.naics_match_count;
        return (a.rank || 99) - (b.rank || 99);
    });

    const totalUnobligated = enriched.reduce((sum, r) => sum + (Number(r.unobligated_balance_usd) || 0), 0);

    return NextResponse.json({
        agencies: enriched,
        total_unobligated_usd: totalUnobligated,
        fiscal_year:   enriched[0]?.fiscal_year || null,
        fiscal_period: enriched[0]?.fiscal_period || null,
        has_profile_matches: enriched.some(r => r.matches_profile),
    });
}
