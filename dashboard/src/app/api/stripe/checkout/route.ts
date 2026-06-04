import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { isVeteranEligible } from "@/lib/veteran";

function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });
}

export async function POST(request: Request) {
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

    // Get billing interval + tier from request body
    let interval: "monthly" | "yearly" = "monthly";
    let plan: "light" | "pro" = "pro";  // default to pro — most users will land here from the trial CTA
    try {
        const body = await request.json();
        if (body.interval === "yearly") interval = "yearly";
        if (body.plan === "light") plan = "light";
    } catch { /* defaults above */ }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Load profile — include veteran fields to decide on discount
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, stripe_customer_id, company_name, is_veteran_owned, veteran_cert_type, sba_certifications")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) {
        return NextResponse.json({ error: "No profile" }, { status: 404 });
    }

    const p = profile as unknown as Record<string, unknown>;
    let customerId = p.stripe_customer_id as string | null;

    // Create Stripe customer if needed
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            name: (p.company_name as string) || undefined,
            metadata: { user_profile_id: p.id as string },
        });
        customerId = customer.id;
        await admin.from("user_profiles").update({ stripe_customer_id: customerId }).eq("id", p.id);
    }

    // Select price by tier × interval. The four STRIPE_PRICE_* env vars are
    // set by tools/41_create_stripe_products.mjs after the products are
    // provisioned in Stripe. Falls back to the legacy generic env vars for
    // backwards compat during the tier rewrite.
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
        return NextResponse.json({ error: `Stripe price not configured for ${plan} ${interval}` }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";

    // ---------- Veteran discount ----------
    // Auto-apply the 20%-off Stripe coupon when the user is veteran-verified.
    // Coupon id/promotion-code is configured via STRIPE_VETERAN_COUPON_ID.
    // If unset, checkout still works — we just skip the discount line.
    const veteranEligible = isVeteranEligible(p as Parameters<typeof isVeteranEligible>[0]);
    const veteranCouponId = process.env.STRIPE_VETERAN_COUPON_ID || "";
    const discounts =
        veteranEligible && veteranCouponId
            ? [{ coupon: veteranCouponId }]
            : undefined;

    // Log application so we can audit
    if (veteranEligible && veteranCouponId) {
        await admin
            .from("user_profiles")
            .update({ veteran_discount_code: veteranCouponId })
            .eq("id", p.id);
    }

    // Only allow manual promo codes when the user does NOT already get the veteran auto-discount,
    // otherwise Stripe would reject multiple discounts on the same session.
    const allowPromoCodes = !discounts;

    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
            // 14 days per docs/PRICING_STRATEGY.md. Was 30d before the
            // Light + Pro tier rewrite; shorter window protects against
            // "trial-and-bail" data-scrape (combined with export gate).
            trial_period_days: 14,
            metadata: {
                user_profile_id: p.id as string,
                plan,
                interval,
                veteran_discount: veteranEligible ? "true" : "false",
                veteran_cert_type: (p.veteran_cert_type as string) || "",
            },
        },
        // Card REQUIRED upfront. Without this Stripe lets users start a trial
        // without a payment method, then ghost — defeats the auto-convert.
        payment_method_collection: "always",
        success_url: `${baseUrl}/billing?success=true&plan=${plan}${veteranEligible ? "&veteran=1" : ""}`,
        cancel_url: `${baseUrl}/billing?canceled=true`,
        allow_promotion_codes: allowPromoCodes,
        ...(discounts ? { discounts } : {}),
    });

    return NextResponse.json({
        url: session.url,
        veteran_discount_applied: veteranEligible && !!veteranCouponId,
    });
}
