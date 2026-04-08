import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });
}

export async function GET() {
    const stripe = getStripe();
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
        .select("stripe_subscription_id, stripe_customer_id, subscription_status, plan_tier, trial_ends_at, account_type, created_at")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const p = profile as any;
    const subscriptionId = p.stripe_subscription_id as string | null;

    // If no subscription, return basic info from profile
    if (!subscriptionId) {
        return NextResponse.json({
            subscription: null,
            profile: {
                plan_tier: p.plan_tier || "free",
                subscription_status: p.subscription_status || "free",
                account_type: p.account_type || "self_service",
                trial_ends_at: p.trial_ends_at || null,
                created_at: p.created_at || null,
            },
        });
    }

    try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ["default_payment_method", "items.data.price.product"],
        });

        // Extract payment method details
        let paymentMethod: {
            brand: string | null;
            last4: string | null;
            exp_month: number | null;
            exp_year: number | null;
        } | null = null;

        if (subscription.default_payment_method && typeof subscription.default_payment_method === "object") {
            const pm = subscription.default_payment_method as Stripe.PaymentMethod;
            if (pm.card) {
                paymentMethod = {
                    brand: pm.card.brand,
                    last4: pm.card.last4,
                    exp_month: pm.card.exp_month,
                    exp_year: pm.card.exp_year,
                };
            }
        }

        // Extract plan name from product
        let planName = "Pro";
        const item = subscription.items.data[0];
        if (item?.price?.product && typeof item.price.product === "object") {
            const product = item.price.product as Stripe.Product;
            planName = product.name || "Pro";
        }

        // Determine interval
        const interval = item?.price?.recurring?.interval || "month";
        const intervalCount = item?.price?.recurring?.interval_count || 1;
        const unitAmount = (item?.price?.unit_amount || 0) / 100;

        return NextResponse.json({
            subscription: {
                id: subscription.id,
                status: subscription.status,
                plan_name: planName,
                interval: interval,
                interval_count: intervalCount,
                unit_amount: unitAmount,
                currency: item?.price?.currency || "usd",
                current_period_start: item?.current_period_start ?? subscription.created,
                current_period_end: item?.current_period_end ?? subscription.created,
                cancel_at_period_end: subscription.cancel_at_period_end,
                cancel_at: subscription.cancel_at,
                canceled_at: subscription.canceled_at,
                trial_start: subscription.trial_start,
                trial_end: subscription.trial_end,
                payment_method: paymentMethod,
                created: subscription.created,
            },
            profile: {
                plan_tier: p.plan_tier || "free",
                subscription_status: p.subscription_status || "free",
                account_type: p.account_type || "self_service",
                trial_ends_at: p.trial_ends_at || null,
                created_at: p.created_at || null,
            },
        });
    } catch (err) {
        console.error("Failed to retrieve subscription:", err);
        return NextResponse.json({
            subscription: null,
            profile: {
                plan_tier: p.plan_tier || "free",
                subscription_status: p.subscription_status || "free",
                account_type: p.account_type || "self_service",
                trial_ends_at: p.trial_ends_at || null,
                created_at: p.created_at || null,
            },
        });
    }
}
