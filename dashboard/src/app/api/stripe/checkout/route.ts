import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { isVeteranEligible } from "@/lib/veteran";

/**
 * Stripe checkout endpoint.
 *
 * Two flows depending on the caller's existing Stripe state:
 *
 *   1) NEW SIGNUP (no active sub yet, or no stripe_customer_id):
 *      → Create a Checkout Session (mode=subscription, trial=14d,
 *        payment_method_collection=always) and return its URL.
 *
 *   2) EXISTING SUBSCRIPTION (active or trialing already):
 *      → Stripe won't let us "create" another subscription via Checkout
 *        for the same customer. Instead we redirect to the Customer
 *        Portal with a flow=subscription_update so they can swap plans.
 *
 * Every error path returns JSON with an `error` field — the client surfaces
 * that text in the alert. Previously the route could throw HTML 500s which
 * tripped the client's catch block with a generic "network error" message,
 * masking the real cause (missing price IDs, key permission, existing sub).
 */

function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set on this deployment.");
    return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

export async function POST(request: Request) {
    try {
        const stripe = getStripe();
        const cookieStore = await cookies();
        const sb = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll() } }
        );

        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let interval: "monthly" | "yearly" = "monthly";
        let plan: "light" | "pro" = "pro";
        try {
            const body = await request.json();
            if (body.interval === "yearly") interval = "yearly";
            if (body.plan === "light") plan = "light";
        } catch { /* defaults above */ }

        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data: profile } = await admin
            .from("user_profiles")
            .select("id, stripe_customer_id, stripe_subscription_id, subscription_status, company_name, is_veteran_owned, veteran_cert_type, sba_certifications")
            .eq("auth_user_id", user.id)
            .single();

        if (!profile) {
            return NextResponse.json({ error: "No profile" }, { status: 404 });
        }

        const p = profile as unknown as Record<string, unknown>;
        let customerId = p.stripe_customer_id as string | null;

        // Price IDs first — bail loudly if the env vars aren't set so the
        // client sees a useful error instead of "Stripe call failed".
        let priceId: string | undefined;
        if (plan === "light") {
            priceId = interval === "yearly"
                ? process.env.STRIPE_PRICE_LIGHT_YEARLY
                : process.env.STRIPE_PRICE_LIGHT_MONTHLY;
        } else {
            priceId = interval === "yearly"
                ? (process.env.STRIPE_PRICE_PRO_YEARLY || process.env.STRIPE_PRICE_YEARLY)
                : (process.env.STRIPE_PRICE_PRO_MONTHLY || process.env.STRIPE_PRICE_MONTHLY);
        }
        if (!priceId) {
            return NextResponse.json({
                error: `Stripe price ID not configured for ${plan} ${interval} on this deployment. Missing env var: STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}.`,
                code: "STRIPE_PRICE_NOT_CONFIGURED",
            }, { status: 500 });
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";

        // ───────────────────────── EXISTING SUB ─────────────────────────
        // If the caller already has an active or trialing subscription,
        // Stripe will reject another subscription create. Route them to the
        // Customer Portal's subscription_update flow with the new price
        // pre-selected, so the swap happens in one click.
        const existingSubStatus = p.subscription_status as string | null;
        const existingSubId = p.stripe_subscription_id as string | null;
        const hasActiveSub = customerId && existingSubId &&
            (existingSubStatus === "active" || existingSubStatus === "trialing");

        if (hasActiveSub) {
            try {
                const portalSession = await stripe.billingPortal.sessions.create({
                    customer: customerId!,
                    return_url: `${baseUrl}/billing?switched=${plan}`,
                    flow_data: {
                        type: "subscription_update_confirm",
                        subscription_update_confirm: {
                            subscription: existingSubId!,
                            items: [{
                                id: await getSubscriptionItemId(stripe, existingSubId!),
                                price: priceId,
                                quantity: 1,
                            }],
                        },
                        after_completion: {
                            type: "redirect",
                            redirect: { return_url: `${baseUrl}/billing?switched=${plan}&done=1` },
                        },
                    },
                });
                return NextResponse.json({
                    url: portalSession.url,
                    flow: "portal_update",
                });
            } catch (err) {
                // Fall back to a bare portal session (no pre-selected flow) if
                // the configured portal doesn't support subscription_update —
                // user can still pick the plan manually inside the portal.
                console.error("[stripe/checkout] portal flow_data failed, falling back to bare portal:", err);
                const portalSession = await stripe.billingPortal.sessions.create({
                    customer: customerId!,
                    return_url: `${baseUrl}/billing?switched=${plan}`,
                });
                return NextResponse.json({
                    url: portalSession.url,
                    flow: "portal_basic",
                    fallback_reason: err instanceof Error ? err.message : String(err),
                });
            }
        }

        // ───────────────────────── NEW SIGNUP ─────────────────────────
        if (!customerId) {
            try {
                const customer = await stripe.customers.create({
                    email: user.email,
                    name: (p.company_name as string) || undefined,
                    metadata: { user_profile_id: p.id as string },
                });
                customerId = customer.id;
                await admin.from("user_profiles").update({ stripe_customer_id: customerId }).eq("id", p.id);
            } catch (err) {
                console.error("[stripe/checkout] customer.create failed:", err);
                return NextResponse.json({
                    error: `Failed to create Stripe customer: ${err instanceof Error ? err.message : "unknown"}`,
                    code: "STRIPE_CUSTOMER_CREATE_FAILED",
                }, { status: 500 });
            }
        }

        const veteranEligible = isVeteranEligible(p as Parameters<typeof isVeteranEligible>[0]);
        const veteranCouponId = process.env.STRIPE_VETERAN_COUPON_ID || "";
        const discounts =
            veteranEligible && veteranCouponId
                ? [{ coupon: veteranCouponId }]
                : undefined;
        if (veteranEligible && veteranCouponId) {
            await admin
                .from("user_profiles")
                .update({ veteran_discount_code: veteranCouponId })
                .eq("id", p.id);
        }

        try {
            // Stripe rejects passing BOTH `allow_promotion_codes` (even false)
            // AND `discounts` in the same Checkout Session — "You may only
            // specify one of these parameters." So we spread one OR the other,
            // never both. Veteran auto-discount path → discounts; everyone else
            // → allow_promotion_codes so they can paste a coupon at checkout.
            const promoOrDiscount = discounts
                ? { discounts }
                : { allow_promotion_codes: true };

            const session = await stripe.checkout.sessions.create({
                customer: customerId,
                mode: "subscription",
                line_items: [{ price: priceId, quantity: 1 }],
                subscription_data: {
                    trial_period_days: 14,
                    metadata: {
                        user_profile_id: p.id as string,
                        plan,
                        interval,
                        veteran_discount: veteranEligible ? "true" : "false",
                        veteran_cert_type: (p.veteran_cert_type as string) || "",
                    },
                },
                payment_method_collection: "always",
                success_url: `${baseUrl}/billing?success=true&plan=${plan}${veteranEligible ? "&veteran=1" : ""}`,
                cancel_url: `${baseUrl}/billing?canceled=true`,
                ...promoOrDiscount,
            });

            return NextResponse.json({
                url: session.url,
                flow: "checkout_new",
                veteran_discount_applied: veteranEligible && !!veteranCouponId,
            });
        } catch (err) {
            console.error("[stripe/checkout] checkout.sessions.create failed:", err);
            return NextResponse.json({
                error: `Stripe rejected the checkout session: ${err instanceof Error ? err.message : "unknown"}`,
                code: "STRIPE_CHECKOUT_CREATE_FAILED",
            }, { status: 500 });
        }
    } catch (err) {
        // Catch-all for anything we didn't anticipate — env var missing,
        // Supabase down, etc. Always return JSON so the client's catch
        // block has something better than "network failed."
        console.error("[stripe/checkout] uncaught:", err);
        return NextResponse.json({
            error: err instanceof Error ? err.message : "Unknown server error",
            code: "STRIPE_CHECKOUT_UNCAUGHT",
        }, { status: 500 });
    }
}

/**
 * Look up the first subscription item ID — Stripe's portal subscription_update
 * flow requires the item ID (not the subscription ID) for the swap. We always
 * have one item per sub on our plans.
 */
async function getSubscriptionItemId(stripe: Stripe, subscriptionId: string): Promise<string> {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const first = sub.items.data[0];
    if (!first) throw new Error(`Subscription ${subscriptionId} has no items`);
    return first.id;
}
