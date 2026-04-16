// Seat limits per subscription tier. Keep in sync with pricing page.
// Owner (the user in user_profiles.auth_user_id) counts toward the total.

export const SEAT_LIMITS: Record<string, number> = {
    free: 1,
    free_beta: 3,       // generous during beta so teams can invite before paying
    starter: 3,
    pro: 10,
    consulting: 10,
    enterprise: 999,
};

export function seatsFor(planTier: string | null | undefined): number {
    if (!planTier) return SEAT_LIMITS.free;
    return SEAT_LIMITS[planTier] ?? SEAT_LIMITS.free;
}
