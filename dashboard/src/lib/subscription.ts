import { createClient } from "@supabase/supabase-js";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";

export interface SubscriptionInfo {
    status: SubscriptionStatus;
    isActive: boolean;
    trialEndsAt: string | null;
    daysLeft: number | null;
}

export async function getSubscriptionInfo(authUserId: string): Promise<SubscriptionInfo> {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    );

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("subscription_status, trial_ends_at")
        .eq("auth_user_id", authUserId)
        .single();

    if (!profile) {
        return { status: "trialing", isActive: true, trialEndsAt: null, daysLeft: null };
    }

    const p = profile as unknown as Record<string, unknown>;
    const status = (p.subscription_status as SubscriptionStatus) || "trialing";
    const trialEndsAt = (p.trial_ends_at as string) || null;

    let daysLeft: number | null = null;
    if (trialEndsAt) {
        daysLeft = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }

    const isTrialing = status === "trialing";
    const trialExpired = isTrialing && daysLeft !== null && daysLeft <= 0;

    const isActive = status === "active" || (isTrialing && !trialExpired);

    return { status: trialExpired ? "expired" : status, isActive, trialEndsAt, daysLeft };
}
