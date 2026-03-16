import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });
}

export async function POST() {
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

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Load profile to check for existing stripe_customer_id
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, stripe_customer_id, company_name")
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

    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) {
        return NextResponse.json({ error: "STRIPE_PRO_PRICE_ID not configured" }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.NEXT_PUBLIC_SUPABASE_URL ? "https://captiorpilot-v3.vercel.app" : "http://localhost:3000"}/billing?success=true`,
        cancel_url: `${process.env.NEXT_PUBLIC_SUPABASE_URL ? "https://captiorpilot-v3.vercel.app" : "http://localhost:3000"}/billing?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
}
