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

    const { data: profile } = await admin
        .from("user_profiles")
        .select("stripe_customer_id")
        .eq("auth_user_id", user.id)
        .single();

    const customerId = (profile as unknown as Record<string, unknown>)?.stripe_customer_id as string | null;
    if (!customerId) {
        return NextResponse.json({ error: "No Stripe customer" }, { status: 404 });
    }

    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.NEXT_PUBLIC_SUPABASE_URL ? "https://captiorpilot-v3.vercel.app" : "http://localhost:3000"}/billing`,
    });

    return NextResponse.json({ url: session.url });
}
