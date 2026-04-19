import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * GET /api/recompetes
 *   ?naics=541511,541512       — filter by NAICS (comma-separated)
 *   ?min_confidence=medium     — low | medium | high (default medium)
 *   ?months_max=12             — max months to contract end
 *   ?agency=Veterans
 *
 * Returns recompete candidates ranked by confidence_score desc.
 * Automatically pre-filters by the caller's profile NAICS if no naics param
 * is given, so the dashboard shows "my" recompetes by default.
 */
export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const naicsParam = searchParams.get("naics");
    const minConfidence = (searchParams.get("min_confidence") || "medium").toLowerCase();
    const monthsMax = parseInt(searchParams.get("months_max") || "18", 10);
    const agency = searchParams.get("agency");

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Determine which NAICS codes to filter on
    let naicsFilter: string[] = [];
    if (naicsParam) {
        naicsFilter = naicsParam.split(",").map((n) => n.trim()).filter(Boolean);
    } else {
        const { data: profile } = await admin
            .from("user_profiles")
            .select("naics_codes")
            .eq("auth_user_id", user.id)
            .single();
        naicsFilter = ((profile?.naics_codes as string[]) || []).slice(0, 20);
    }

    const confidenceLevels =
        minConfidence === "high" ? ["high"] :
        minConfidence === "low" ? ["high", "medium", "low"] :
        ["high", "medium"];

    let query = admin
        .from("recompete_candidates")
        .select("id, source_award_id, incumbent_uei, incumbent_name, agency, naics_code, psc_code, set_aside, original_award_value, contract_end_date, months_to_end, confidence, confidence_score, reasoning, matched_sam_notice_id")
        .in("confidence", confidenceLevels)
        .lte("months_to_end", monthsMax)
        .order("confidence_score", { ascending: false })
        .limit(100);

    if (naicsFilter.length > 0) {
        query = query.in("naics_code", naicsFilter);
    }
    if (agency) {
        query = query.ilike("agency", `%${agency}%`);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ candidates: data || [], filter: { naics: naicsFilter, min_confidence: minConfidence, months_max: monthsMax, agency } });
}
