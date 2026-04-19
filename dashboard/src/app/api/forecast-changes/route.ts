import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * GET /api/forecast-changes
 *   ?days=30               — look-back window
 *   ?only_matching_naics=1 — filter to changes whose naics_detected intersects the user's NAICS
 *
 * Returns the user's agency-forecast feed, sorted newest-first. Each row
 * joins source metadata so the UI can show the agency + URL + last-checked
 * without a second query.
 */
export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "30", 10)));
    const onlyMatching = searchParams.get("only_matching_naics") === "1";

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let userNaics: string[] = [];
    if (onlyMatching) {
        const { data: profile } = await admin
            .from("user_profiles")
            .select("naics_codes")
            .eq("auth_user_id", user.id)
            .single();
        userNaics = ((profile?.naics_codes as string[]) || []).slice(0, 50);
    }

    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    let query = admin
        .from("agency_forecast_changes")
        .select("id, detected_at, diff_summary, added_lines, naics_detected, raw_snippet, agency_forecast_sources!inner(agency, label, url)")
        .gt("detected_at", since)
        .order("detected_at", { ascending: false })
        .limit(100);

    if (onlyMatching && userNaics.length > 0) {
        query = query.overlaps("naics_detected", userNaics);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        changes: data || [],
        user_naics: userNaics,
        filter: { days, only_matching_naics: onlyMatching },
    });
}
