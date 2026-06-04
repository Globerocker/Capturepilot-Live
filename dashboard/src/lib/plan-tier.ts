import { createClient } from "@supabase/supabase-js";

/**
 * Plan-tier feature gating. Read the tier limits once per request, then
 * call `gate(profile_id, "feature_key", currentValue?)` to enforce.
 *
 * Tier definitions live in the `plan_tiers` table (migration 071) so we can
 * change pricing/limits without a deploy. The shape of `limits` is:
 *   {
 *     max_saved_searches: 5,
 *     proposals_per_month: 3,
 *     matches_per_day: 200,
 *     capability_statement_ai: true,
 *     sam_passthrough: true,
 *     partners_search: true,
 *     api_access: false,
 *     team_seats: 1,
 *   }
 *
 * Callers should NEVER hard-code tier names ('pro') — always use the
 * feature key. Lets us add a 'starter_plus' tier later without touching
 * application code.
 */

export type FeatureKey =
    | "max_saved_searches"
    | "proposals_per_month"
    | "matches_per_day"
    | "capability_statement_ai"
    | "sam_passthrough"
    | "partners_search"
    | "api_access"
    | "team_seats"
    // ── Migration 107 (Light + Pro restructure, June 2026):
    | "competitor_profiles"   // view competitor pages (Light+)
    | "partner_profiles"      // view + save partner pages (Light+)
    | "state_local_access"    // SLED opportunity feed (Pro+ only)
    | "ai_proposals"          // full AI proposal writer (Pro+ only)
    | "ai_summaries"          // per-opportunity AI summaries (Pro+ only)
    | "export_data";          // CSV/XLSX downloads (Pro+ only, anti-scrape)

export interface PlanLimits {
    max_saved_searches: number;
    proposals_per_month: number;
    matches_per_day: number;
    capability_statement_ai: boolean;
    sam_passthrough: boolean;
    partners_search: boolean;
    api_access: boolean;
    team_seats: number;
    // ── Migration 107:
    competitor_profiles: boolean;
    partner_profiles: boolean;
    state_local_access: boolean;
    ai_proposals: boolean;
    ai_summaries: boolean;
    export_data: boolean;
}

// Fallback used when the DB lookup fails — equivalent to the Free tier.
// Keeps the app functioning if plan_tiers somehow gets nuked.
const FALLBACK_LIMITS: PlanLimits = {
    max_saved_searches: 1,
    proposals_per_month: 0,
    matches_per_day: 50,
    capability_statement_ai: false,
    sam_passthrough: false,
    partners_search: false,
    competitor_profiles: false,
    partner_profiles: false,
    state_local_access: false,
    ai_proposals: false,
    ai_summaries: false,
    export_data: false,
    api_access: false,
    team_seats: 1,
};

function service() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

// Per-request memo so repeated calls within one handler don't re-hit DB.
const cache = new Map<string, { limits: PlanLimits; tierCode: string; tierLabel: string; expiresAt: number }>();
const TTL_MS = 60_000;

export async function loadPlanLimits(profileId: string): Promise<{ tierCode: string; tierLabel: string; limits: PlanLimits }> {
    const now = Date.now();
    const hit = cache.get(profileId);
    if (hit && hit.expiresAt > now) return { tierCode: hit.tierCode, tierLabel: hit.tierLabel, limits: hit.limits };

    const sb = service();
    const { data: profile } = await sb
        .from("user_profiles")
        .select("plan_tier")
        .eq("id", profileId)
        .maybeSingle();
    const code = (profile?.plan_tier as string | undefined) || "free";
    const { data: tier } = await sb
        .from("plan_tiers")
        .select("code, label, limits")
        .eq("code", code)
        .maybeSingle();
    const limits = (tier?.limits as Partial<PlanLimits> | undefined) || {};
    const merged: PlanLimits = { ...FALLBACK_LIMITS, ...limits };
    const result = {
        tierCode: tier?.code || "free",
        tierLabel: (tier?.label as string) || "Free",
        limits: merged,
    };
    cache.set(profileId, { ...result, expiresAt: now + TTL_MS });
    return result;
}

/**
 * Boolean feature check. Returns false for missing-tier and for `false`
 * values. Use as: `if (!await isAllowed(id, "sam_passthrough")) return 402`.
 */
export async function isAllowed(profileId: string, key: FeatureKey): Promise<boolean> {
    const { limits } = await loadPlanLimits(profileId);
    const v = limits[key];
    return v === true || (typeof v === "number" && v > 0);
}

/**
 * Numeric limit check. Pass the current usage; returns whether one more
 * action would still be within budget. Use as:
 *   const ok = await withinLimit(id, "max_saved_searches", currentCount);
 *   if (!ok.ok) return NextResponse.json({ error: "limit reached", limit: ok.limit }, { status: 402 });
 */
export async function withinLimit(
    profileId: string,
    key: FeatureKey,
    currentValue: number,
): Promise<{ ok: boolean; limit: number; remaining: number; tierCode: string }> {
    const { tierCode, limits } = await loadPlanLimits(profileId);
    const limit = Number(limits[key] || 0);
    const remaining = Math.max(0, limit - currentValue);
    return { ok: currentValue < limit, limit, remaining, tierCode };
}

/**
 * Test helper — clears the in-memory cache. Don't call from app code.
 */
export function _clearPlanTierCache() {
    cache.clear();
}
