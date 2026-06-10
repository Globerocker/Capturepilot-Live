// Central Stripe price + tier configuration.
// Env vars are read at runtime so they pick up Vercel Production/Development overrides.

export type StripeTier = "pro" | "team";
export type StripeInterval = "monthly" | "yearly";

export interface TierPriceConfig {
    monthly: string | undefined;
    yearly: string | undefined;
}

/** Resolve the Stripe price ID for a (tier, interval) pair. */
export function getStripePriceId(tier: StripeTier, interval: StripeInterval): string | undefined {
    if (tier === "team") {
        return interval === "yearly"
            ? process.env.STRIPE_PRICE_TEAM_YEARLY
            : process.env.STRIPE_PRICE_TEAM_MONTHLY;
    }
    // Pro (legacy env var names kept for back-compat)
    return interval === "yearly"
        ? (process.env.STRIPE_PRICE_YEARLY || process.env.STRIPE_PRO_PRICE_ID)
        : (process.env.STRIPE_PRICE_MONTHLY || process.env.STRIPE_PRO_PRICE_ID);
}

/** Display prices in USD. TODO(R2-X4): make these dynamic from Stripe product metadata. */
export const TIER_PRICES = {
    pro: { monthly: 199, yearly: 159 },     // yearly shown as monthly equivalent
    team: { monthly: 299, yearly: 239 },    // 2870.40 / 12 = 239.20
} as const;

export const TIER_YEARLY_TOTALS = {
    pro: 1908,
    team: 2870,
} as const;

/** A minimal profile shape we can check tier against. */
interface ProfileTierShape {
    tier?: string | null;
    plan_tier?: string | null;
    account_type?: string | null;
    subscription_status?: string | null;
}

/** Pure check: is the profile on the Team tier? Used for future feature gating. */
export function isTeamTier(profile: ProfileTierShape | null | undefined): boolean {
    if (!profile) return false;
    const tier = (profile.tier || "").toLowerCase();
    return tier === "team";
}

/** Pure check: profile is on Pro or above (Pro, Team). */
export function isProOrAbove(profile: ProfileTierShape | null | undefined): boolean {
    if (!profile) return false;
    const tier = (profile.tier || "pro").toLowerCase();
    const status = (profile.subscription_status || "").toLowerCase();
    const accountType = (profile.account_type || "").toLowerCase();
    if (accountType === "consulting" || accountType === "admin") return true;
    if (!["active", "trialing"].includes(status)) return false;
    return tier === "pro" || tier === "team" || tier === "enterprise";
}

/** Quick Checker monthly allowance per tier. Pro is the baseline. */
export const QUICK_CHECKER_MONTHLY_LIMIT = {
    free: 1,
    pro: 50,
    team: 500,
    enterprise: 5000,
} as const;

export function quickCheckerLimitForTier(tier: string | null | undefined): number {
    const t = (tier || "pro").toLowerCase();
    if (t in QUICK_CHECKER_MONTHLY_LIMIT) {
        return QUICK_CHECKER_MONTHLY_LIMIT[t as keyof typeof QUICK_CHECKER_MONTHLY_LIMIT];
    }
    return QUICK_CHECKER_MONTHLY_LIMIT.pro;
}

/** Seat allowance per tier. Pro is single-user; Team is up to 5. */
export const SEAT_LIMIT = {
    free: 1,
    pro: 1,
    team: 5,
    enterprise: 25,
} as const;

export function seatLimitForTier(tier: string | null | undefined): number {
    const t = (tier || "pro").toLowerCase();
    if (t in SEAT_LIMIT) {
        return SEAT_LIMIT[t as keyof typeof SEAT_LIMIT];
    }
    return SEAT_LIMIT.pro;
}
