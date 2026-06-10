/**
 * Re-score every active opportunity for a single user profile and rewrite the
 * `user_matches` table accordingly.
 *
 * Extracted from /api/matches/refresh on 2026-06-10 because the synchronous
 * route was timing out — loading 78k opportunities + scoring + delete/upsert
 * commonly exceeded the Vercel function ceiling, leaving the UI hanging. The
 * route now just enqueues a `rescore_user_matches` worker job which the
 * `/api/cron/run_worker_jobs_rescore` consumer claims and runs end-to-end via
 * this function.
 *
 * The `match.hot` webhook fires from inside this function so subscribers see
 * the event AFTER the rescore actually finishes — previously it fired from
 * the route handler which was misleading when the work was queued instead of
 * run inline.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
    scoreOpportunity,
    type ProfileForScoring,
    type OpportunityForScoring,
    type KeywordEntry,
} from "@/lib/match-scoring";
import { fireWebhookEvent } from "@/lib/webhooks";

// Persist all matches with score above MIN_MATCH_SCORE. No hard cap.
// Previous behavior capped at top 500, which hid ~99% of ~54k opportunities
// from users.
const MIN_MATCH_SCORE = 0.3; // classifications: COLD 0.3-0.5, WARM 0.5-0.7, HOT 0.7+

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

export type RescoreResult = {
    user_profile_id: string;
    total_scored: number;
    written: number;
    hot: number;
    warm: number;
    cold: number;
};

function adminClient(): SbAny {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

/**
 * Re-score every active opportunity against the given profile and replace the
 * `user_matches` rows for that profile. Returns counts for telemetry.
 *
 * Throws on profile-not-found or DB errors so the worker_jobs runner records
 * the failure on the job.
 */
export async function rescoreUserMatches(args: {
    user_profile_id: string;
    sb?: SbAny;
}): Promise<RescoreResult> {
    const sb = args.sb ?? adminClient();
    const userProfileId = args.user_profile_id;

    // Load the profile by primary key — the trigger and the API route both
    // pass `user_profiles.id`, not `auth_user_id`.
    const { data: profile, error: profileErr } = await sb
        .from("user_profiles")
        .select(
            "id, naics_codes, sba_certifications, state, target_states, revenue, " +
            "federal_awards_count, target_psc_codes, preferred_agencies, " +
            "primary_keywords, secondary_keywords, is_veteran_owned, veteran_cert_type"
        )
        .eq("id", userProfileId)
        .single();

    if (profileErr) throw new Error(`profile lookup failed: ${profileErr.message}`);
    if (!profile) throw new Error(`no profile found for id=${userProfileId}`);

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
            (kwRows || []).map((r: { keyword: string; aliases: string[] | null }) => [
                r.keyword,
                r.aliases || [],
            ]),
        );
    }
    const toEntries = (list: string[]): KeywordEntry[] =>
        list.map((kw) => ({ keyword: kw, aliases: keywordLibraryMap.get(kw) || [] }));

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

    // Load active opportunities (paginate). Fetch title/description/
    // structured_requirements only when the profile has keywords, to keep the
    // payload small for the common keyword-less path.
    const hasKeywords = primaryKw.length > 0 || secondaryKw.length > 0;
    const oppSelect = hasKeywords
        ? "id, naics_code, psc_code, notice_type, agency, set_aside_code, place_of_performance_state, award_amount, response_deadline, title, description, structured_requirements"
        : "id, naics_code, psc_code, notice_type, agency, set_aside_code, place_of_performance_state, award_amount, response_deadline";

    const allOpps: OpportunityForScoring[] = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
        const { data: batch, error: batchErr } = await sb
            .from("opportunities")
            .select(oppSelect)
            .eq("is_archived", false)
            .range(offset, offset + batchSize - 1);
        if (batchErr) throw new Error(`opps fetch failed: ${batchErr.message}`);
        if (!batch || batch.length === 0) break;
        allOpps.push(...(batch as unknown as OpportunityForScoring[]));
        if (batch.length < batchSize) break;
        offset += batchSize;
    }

    // Score all opportunities
    const scored: {
        user_profile_id: string;
        opportunity_id: string;
        score: number;
        classification: string;
        score_breakdown: Record<string, unknown>;
    }[] = [];

    for (const opp of allOpps) {
        const result = scoreOpportunity(profileForScoring, opp);
        if (!result) continue;
        scored.push({
            user_profile_id: userProfileId,
            ...result,
        });
    }

    // Keep all matches above MIN_MATCH_SCORE, sorted by score descending
    scored.sort((a, b) => b.score - a.score);
    const top = scored.filter((m) => m.score >= MIN_MATCH_SCORE);

    // Clean stale matches — delete everything for this user, then reinsert.
    // Using an IN-list with thousands of UUIDs fails on Postgres (URL length +
    // param limits).
    const { error: delErr } = await sb
        .from("user_matches")
        .delete()
        .eq("user_profile_id", userProfileId);
    if (delErr) throw new Error(`stale-match delete failed: ${delErr.message}`);

    // Upsert matches (in chunks of 500)
    let written = 0;
    for (let i = 0; i < top.length; i += 500) {
        const chunk = top.slice(i, i + 500);
        const { error } = await sb
            .from("user_matches")
            .upsert(chunk, { onConflict: "user_profile_id,opportunity_id" });
        if (!error) written += chunk.length;
    }

    const hot = top.filter((m) => m.classification === "HOT").length;
    const warm = top.filter((m) => m.classification === "WARM").length;
    const cold = top.filter((m) => m.classification === "COLD").length;

    // Fire webhook: one "match.hot" event with the top 10 HOT matches for
    // this rescore. Subscribers get the list + score so they can Zap them.
    // Moved here from /api/matches/refresh so the event reflects the actual
    // completion of scoring, not the moment a job was queued.
    if (hot > 0) {
        const topHot = top.filter((m) => m.classification === "HOT").slice(0, 10);
        fireWebhookEvent(userProfileId, "match.hot", {
            total_hot: hot,
            matches: topHot.map((m) => ({
                opportunity_id: m.opportunity_id,
                score: m.score,
            })),
        }).catch(() => {
            /* logged in webhook_deliveries */
        });
    }

    return {
        user_profile_id: userProfileId,
        total_scored: scored.length,
        written,
        hot,
        warm,
        cold,
    };
}
