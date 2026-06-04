import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });
}

// New code per docs/PRICING_STRATEGY.md — 25% off for 2 months on cancel intent.
// (Was previously 50% off / 3 mo — too generous; revisit if cancel-save rate
// drops below 30%.) Coupon ID is stable so retries are idempotent.
const RETENTION_COUPON_ID = "RETAIN25_2MO";

/**
 * Ensures the 25%-off-for-2-months retention coupon exists in Stripe.
 * Returns the coupon id. Throws on Stripe outage.
 */
async function ensureRetentionCoupon(stripe: Stripe): Promise<string> {
    try {
        const existing = await stripe.coupons.retrieve(RETENTION_COUPON_ID);
        if (existing && !existing.deleted) return existing.id;
    } catch {
        // Not found — create it
    }
    const coupon = await stripe.coupons.create({
        id: RETENTION_COUPON_ID,
        percent_off: 25,
        duration: "repeating",
        duration_in_months: 2,
        name: "CapturePilot Retention — 25% off for 2 months",
    });
    return coupon.id;
}

interface CancelBody {
    action: "accept_offer" | "cancel";
    reason?: string;
    free_text?: string | null;
}

export async function POST(request: NextRequest) {
    let body: CancelBody;
    try {
        body = (await request.json()) as CancelBody;
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );

    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, stripe_customer_id, stripe_subscription_id, subscription_status, plan_tier")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const p = profile as unknown as Record<string, unknown>;
    const profileId = p.id as string;
    const subscriptionId = (p.stripe_subscription_id as string | null) || null;

    if (!subscriptionId) {
        return NextResponse.json({ error: "No active subscription" }, { status: 400 });
    }

    const stripe = getStripe();

    if (body.action === "accept_offer") {
        // Apply 25%-off-2-months retention coupon to the subscription
        try {
            const couponId = await ensureRetentionCoupon(stripe);
            await stripe.subscriptions.update(subscriptionId, {
                discounts: [{ coupon: couponId }],
            });

            await admin.from("cancellation_feedback").insert({
                user_profile_id: profileId,
                stripe_subscription_id: subscriptionId,
                reason: "retained_via_offer",
                free_text: body.free_text || null,
                accepted_retention_offer: true,
                cancelled: false,
            });

            return NextResponse.json({
                success: true,
                retained: true,
                message: "25% off for 2 months applied to your next invoices.",
            });
        } catch (err) {
            console.error("Retention offer failed:", err);
            return NextResponse.json(
                { error: "Failed to apply retention offer" },
                { status: 500 }
            );
        }
    }

    if (body.action === "cancel") {
        if (!body.reason || !body.reason.trim()) {
            return NextResponse.json({ error: "Cancellation reason is required" }, { status: 400 });
        }
        try {
            const updated = await stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: true,
                cancellation_details: {
                    comment: body.free_text?.slice(0, 500) || undefined,
                    feedback: mapReasonToStripeFeedback(body.reason),
                },
            });

            await admin.from("cancellation_feedback").insert({
                user_profile_id: profileId,
                stripe_subscription_id: subscriptionId,
                reason: body.reason,
                free_text: body.free_text || null,
                accepted_retention_offer: false,
                cancelled: true,
            });

            const accessUntil = updated.items.data[0]?.current_period_end
                ? new Date(updated.items.data[0].current_period_end * 1000).toISOString()
                : null;

            return NextResponse.json({
                success: true,
                cancelled: true,
                access_until: accessUntil,
            });
        } catch (err) {
            console.error("Cancel failed:", err);
            return NextResponse.json({ error: "Failed to cancel subscription" }, { status: 500 });
        }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/**
 * Map our UI reasons to Stripe's cancellation_details.feedback enum.
 * Unknown reasons fall through as undefined.
 */
function mapReasonToStripeFeedback(
    reason: string
): Stripe.SubscriptionUpdateParams.CancellationDetails.Feedback | undefined {
    switch (reason) {
        case "too_expensive":
            return "too_expensive";
        case "not_enough_opportunities":
        case "missing_features":
            return "missing_features";
        case "not_ready":
            return "too_complex";
        case "other":
            return "other";
        default:
            return undefined;
    }
}
