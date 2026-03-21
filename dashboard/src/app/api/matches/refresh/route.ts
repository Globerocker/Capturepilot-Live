import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { scoreOpportunity, type ProfileForScoring, type OpportunityForScoring } from "@/lib/match-scoring";

const MAX_MATCHES = 500;

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
            "federal_awards_count, target_psc_codes, preferred_agencies")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) {
        return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const p = profile as unknown as Record<string, unknown>;

    const profileForScoring: ProfileForScoring = {
        naics_codes: (p.naics_codes as string[]) || [],
        sba_certifications: (p.sba_certifications as string[]) || [],
        state: (p.state as string) || "",
        target_states: (p.target_states as string[]) || [],
        revenue: p.revenue as number | null,
        federal_awards_count: (p.federal_awards_count as number) || 0,
        target_psc_codes: (p.target_psc_codes as string[]) || [],
        preferred_agencies: (p.preferred_agencies as string[]) || [],
    };

    // Load active opportunities (paginate)
    const allOpps: OpportunityForScoring[] = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
        const { data: batch } = await sb
            .from("opportunities")
            .select("id, naics_code, psc_code, notice_type, agency, set_aside_code, place_of_performance_state, award_amount, response_deadline")
            .eq("is_archived", false)
            .range(offset, offset + batchSize - 1);
        if (!batch || batch.length === 0) break;
        allOpps.push(...(batch as unknown as OpportunityForScoring[]));
        if (batch.length < batchSize) break;
        offset += batchSize;
    }

    // Score all opportunities
    const scored: { user_profile_id: string; opportunity_id: string; score: number; classification: string; score_breakdown: Record<string, number> }[] = [];

    for (const opp of allOpps) {
        const result = scoreOpportunity(profileForScoring, opp);
        if (!result) continue;

        scored.push({
            user_profile_id: p.id as string,
            ...result,
        });
    }

    // Sort and keep top MAX_MATCHES
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, MAX_MATCHES);

    // Clean stale matches
    if (top.length > 0) {
        const keepIds = top.map(m => m.opportunity_id);
        try {
            await sb.from("user_matches").delete()
                .eq("user_profile_id", p.id as string)
                .not("opportunity_id", "in", `(${keepIds.join(",")})`);
        } catch { /* ok */ }
    }

    // Upsert matches (in chunks of 200)
    let written = 0;
    for (let i = 0; i < top.length; i += 200) {
        const chunk = top.slice(i, i + 200);
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
