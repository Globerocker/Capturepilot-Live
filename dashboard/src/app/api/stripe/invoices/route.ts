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

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: profile } = await admin.from("user_profiles").select("stripe_customer_id").eq("auth_user_id", user.id).single();
    const customerId = (profile as any)?.stripe_customer_id;
    if (!customerId) return NextResponse.json({ invoices: [] });

    const invoices = await stripe.invoices.list({ customer: customerId, limit: 24 });

    return NextResponse.json({
        invoices: invoices.data.map(inv => ({
            id: inv.id,
            number: inv.number,
            status: inv.status,
            amount: inv.amount_due / 100,
            currency: inv.currency,
            created: inv.created,
            period_start: inv.period_start,
            period_end: inv.period_end,
            pdf_url: inv.invoice_pdf,
            hosted_url: inv.hosted_invoice_url,
        }))
    });
}
