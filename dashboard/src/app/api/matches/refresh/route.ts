import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { scoreOpportunity, type ProfileForScoring, type OpportunityForScoring, type KeywordEntry } from "@/lib/match-scoring";

// Persist all matches with score above MIN_MATCH_SCORE. No hard cap.
// Previous behavior capped at top 500, which hid ~99% of ~54k opportunities from users.
const MIN_MATCH_SCORE = 0.3; // classifications: COLD 0.3-0.5, WARM 0.5-0.7, HOT 0.7+

export async function POST() {
    // Auth check
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use service key for writes
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );

    // Load user profile
    const { data: profile } = await sb
        .from("user_profiles")
        .select("id, naics_codes, sba_certifications, state, target_states, revenue, " +
            "federal_awards_count, target_psc_codes, preferred_agencies, " +
            "primary_keywords, secondary_keywords, is_veteran_owned, veteran_cert_type")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) {
        return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const p = profile as unknown as Record<string, unknown>;

    // Resolve profile keywords to gov_keywords entries (with aliases) once.
    const primaryKw = (p.primary_keywords as string[]) || [];
    const secondaryKw = (p.secondary_keywords as string[]) || [];
    const allProfileKw = [...primaryKw, ...secondaryKw];
    let keywordLibraryMap: Map<string, string[]> = new Map();
    if (allProfileKw.length > 0) {
        const { data: kwRows } = await sb
            .from("gov_keywords")
            .select("keyword, aliases")
            .in("keyword", allProfileKw);
        keywordLibraryMap = new Map(
            (kwRows || []).map(r => [r.keyword as string, (r.aliases as string[]) || []]),
        );
    }
    const toEntries = (list: string[]): KeywordEntry[] =>
        list.map(kw => ({ keyword: kw, aliases: keywordLibraryMap.get(kw) || [] }));

    const profileForScoring: ProfileForScoring = {
        naics_codes: (p.naics_codes as string[]) || [],
        sba_certifications: (p.sba_certifications as string[]) || [],
        state: (p.state as string) || "",
        target_states: (p.target_states as string[]) || [],
        revenue: p.revenue as number | null,
        federal_awards_count: (p.federal_awards_count as number) || 0,
        target_psc_codes: (p.target_psc_codes as string[]) || [],
        preferred_agencies: (p.preferred_agencies as string[]) || [],
        primary_keywords: toEntries(primaryKw),
        secondary_keywords: toEntries(secondaryKw),
        is_veteran_owned: p.is_veteran_owned === true,
        veteran_cert_type: (p.veteran_cert_type as string | null) || null,
    };

    // Load active opportunities (paginate). We fetch title/description/
    // structured_requirements only when the profile has keywords, to keep
    // the payload small for the common keyword-less path.
    const hasKeywords = primaryKw.length > 0 || secondaryKw.length > 0;
    const oppSelect = hasKeywords
        ? "id, naics_code, psc_code, notice_type, agency, set_aside_code, place_of_performance_state, award_amount, response_deadline, title, description, structured_requirements"
        : "id, naics_code, psc_code, notice_type, agency, set_aside_code, place_of_performance_state, award_amount, response_deadline";

    const allOpps: OpportunityForScoring[] = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
        const { data: batch } = await sb
            .from("opportunities")
            .select(oppSelect)
            .eq("is_archived", false)
            .range(offset, offset + batchSize - 1);
        if (!batch || batch.length === 0) break;
        allOpps.push(...(batch as unknown as OpportunityForScoring[]));
        if (batch.length < batchSize) break;
        offset += batchSize;
    }

    // Score all opportunities
    const scored: { user_profile_id: string; opportunity_id: string; score: number; classification: string; score_breakdown: Record<string, unknown> }[] = [];

    for (const opp of allOpps) {
        const result = scoreOpportunity(profileForScoring, opp);
        if (!result) continue;

        scored.push({
            user_profile_id: p.id as string,
            ...result,
        });
    }

    // Keep all matches above MIN_MATCH_SCORE, sorted by score descending
    scored.sort((a, b) => b.score - a.score);
    const top = scored.filter(m => m.score >= MIN_MATCH_SCORE);

    // Clean stale matches — delete everything for this user, then reinsert.
    // Using an IN-list with thousands of UUIDs fails on Postgres (URL length + param limits).
    await sb.from("user_matches")
        .delete()
        .eq("user_profile_id", p.id as string);

    // Upsert matches (in chunks of 500)
    let written = 0;
    for (let i = 0; i < top.length; i += 500) {
        const chunk = top.slice(i, i + 500);
        const { error } = await sb.from("user_matches")
            .upsert(chunk, { onConflict: "user_profile_id,opportunity_id" });
        if (!error) written += chunk.length;
    }

    const hot = top.filter(m => m.classification === "HOT").length;
    const warm = top.filter(m => m.classification === "WARM").length;
    const cold = top.filter(m => m.classification === "COLD").length;

    return NextResponse.json({
        success: true,
        total_scored: scored.length,
        written,
        hot,
        warm,
        cold,
    });
}
