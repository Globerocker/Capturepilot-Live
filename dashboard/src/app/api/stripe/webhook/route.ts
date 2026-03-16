import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });
}

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    );
}

export async function POST(request: Request) {
    const stripe = getStripe();
    const admin = getAdmin();
    const body = await request.text();
    const sig = request.headers.get("stripe-signature");

    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            if (session.customer && session.subscription) {
                await admin
                    .from("user_profiles")
                    .update({
                        subscription_status: "active",
                        stripe_subscription_id: session.subscription as string,
                    })
                    .eq("stripe_customer_id", session.customer as string);
            }
            break;
        }

        case "customer.subscription.updated": {
            const sub = event.data.object as Stripe.Subscription;
            const status = sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "canceled";
            await admin
                .from("user_profiles")
                .update({ subscription_status: status })
                .eq("stripe_customer_id", sub.customer as string);
            break;
        }

        case "customer.subscription.deleted": {
            const sub = event.data.object as Stripe.Subscription;
            await admin
                .from("user_profiles")
                .update({ subscription_status: "canceled" })
                .eq("stripe_customer_id", sub.customer as string);
            break;
        }

        case "invoice.payment_failed": {
            const invoice = event.data.object as Stripe.Invoice;
            if (invoice.customer) {
                await admin
                    .from("user_profiles")
                    .update({ subscription_status: "past_due" })
                    .eq("stripe_customer_id", invoice.customer as string);
            }
            break;
        }
    }

    return NextResponse.json({ received: true });
}
