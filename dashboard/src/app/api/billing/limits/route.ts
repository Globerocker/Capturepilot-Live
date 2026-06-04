import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { loadPlanLimits } from "@/lib/plan-tier";

/**
 * GET /api/billing/limits
 *
 * Returns the authenticated user's effective plan limits + trial status.
 * Consumed by <FeatureGate>, billing UIs, and any client component that
 * needs to render conditionally based on tier.
 *
 * Response shape:
 *   {
 *     tier_code: "pro",
 *     tier_label: "Pro",
 *     limits: { ai_proposals: true, export_data: true, ... },
 *     trial_active: true,
 *     trial_ends_at: "2026-06-18T00:00:00Z"
 *   }
 *
 * Trial users: while their card is on file and trial_ends_at is in the
 * future, we treat their effective limits as the tier they're trialing
 * (already reflected in user_profiles.plan_tier — webhook sets it on
 * checkout.session.completed). So no special override needed here; we
 * just surface trial_active so the UI can show "X days left in trial".
 */
export async function GET() {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, plan_tier, trial_ends_at, subscription_status, account_type")
        .eq("auth_user_id", user.id)
        .maybeSingle();

    if (!profile) {
        return NextResponse.json({ error: "No profile" }, { status: 404 });
    }

    const p = profile as {
        id: string;
        plan_tier: string | null;
        trial_ends_at: string | null;
        subscription_status: string | null;
        account_type: string | null;
    };

    // Admins + consulting clients always see everything — no gates on internal
    // accounts (consulting users pay through a different channel).
    if (p.account_type === "admin" || p.account_type === "consulting") {
        const { limits } = await loadPlanLimits(p.id);
        const everyFlagOn = Object.fromEntries(
            Object.entries(limits).map(([k, v]) => [k, typeof v === "boolean" ? true : Math.max(Number(v) || 0, 9999)]),
        );
        return NextResponse.json({
            tier_code: p.account_type,
            tier_label: p.account_type === "admin" ? "Admin" : "Consulting",
            limits: everyFlagOn,
            trial_active: false,
            trial_ends_at: null,
        });
    }

    const { tierCode, tierLabel, limits } = await loadPlanLimits(p.id);

    // Trial is active if Stripe says "trialing" OR trial_ends_at is in the
    // future. We check both because the webhook may not have fired yet on
    // very-new accounts, in which case subscription_status is null but the
    // trial_ends_at was set by the checkout flow.
    const now = Date.now();
    const trialEndsMs = p.trial_ends_at ? new Date(p.trial_ends_at).getTime() : 0;
    const trialActive =
        p.subscription_status === "trialing" ||
        (trialEndsMs > now && (p.subscription_status === null || p.subscription_status === "trialing"));

    return NextResponse.json({
        tier_code: tierCode,
        tier_label: tierLabel,
        limits,
        trial_active: trialActive,
        trial_ends_at: p.trial_ends_at,
    });
}
