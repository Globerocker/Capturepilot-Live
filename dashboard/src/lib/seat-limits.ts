// Seat limits per subscription tier. Keep in sync with plan_tiers seed
// (currently migration 111). Owner (user_profiles.auth_user_id) counts
// toward the total.

export const SEAT_LIMITS: Record<string, number> = {
    free: 1,
    light: 1,
    pro: 5,
    agency: 9999,
    consulting: 10,
    // Legacy codes — kept so existing rows don't crash. Migration 112 moves
    // free_beta + starter + enterprise users to their new equivalents, but
    // the keys remain here as a belt-and-suspenders fallback.
    free_beta: 1,
    starter: 1,
    enterprise: 9999,
};

export function seatsFor(planTier: string | null | undefined): number {
    if (!planTier) return SEAT_LIMITS.free;
    return SEAT_LIMITS[planTier] ?? SEAT_LIMITS.free;
}
