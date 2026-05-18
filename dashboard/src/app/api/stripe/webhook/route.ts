import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { sendPaymentFailedEmail, sendStartupPackDeliveryEmail, sendSubscriptionCanceledEmail } from "@/lib/email";
import {
    onTrialStarted,
    onSubscriptionActivated,
    onSubscriptionCanceled,
    onPaymentFailed,
} from "@/lib/hubspot";

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

            // ─── Startup Pack one-time purchase ──────────────────────────────
            // Identified by metadata.product = "startup_pack" (set in /api/startup-pack/checkout).
            if (session.metadata?.product === "startup_pack") {
                const analysisId = session.metadata.analysis_id || session.client_reference_id || null;
                const email = session.customer_email
                    || (session.customer_details?.email || "")
                    || "";
                const companyName = session.metadata.company_name
                    || session.customer_details?.name
                    || "";
                const amountPaid = session.amount_total ?? 0;

                // Insert the purchase record — its access_token will gate the download page
                const { data: purchase } = await admin
                    .from("startup_pack_purchases")
                    .insert({
                        analysis_id: analysisId,
                        email,
                        company_name: companyName,
                        amount_paid_cents: amountPaid,
                        currency: session.currency || "usd",
                        stripe_session_id: session.id,
                        stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null,
                        metadata: { offer_expired: session.metadata.offer_expired === "true" },
                    })
                    .select("id, access_token")
                    .single();

                // Mark the originating analysis row
                if (analysisId) {
                    await admin
                        .from("company_analyses")
                        .update({
                            startup_pack_unlocked_at: new Date().toISOString(),
                            startup_pack_stripe_session_id: session.id,
                        })
                        .eq("id", analysisId);
                }

                // Deliver the pack — instant Resend email with download link
                if (email && purchase?.access_token) {
                    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
                    const downloadUrl = `${baseUrl}/startup-pack/download/${purchase.access_token}`;
                    sendStartupPackDeliveryEmail(email, {
                        companyName: companyName || "Founder",
                        downloadUrl,
                        amountPaidCents: amountPaid,
                    }).catch(err => console.error("Startup pack delivery email failed:", err));
                }
                break;
            }

            // ─── Subscription checkout (existing pro/sub flow) ──────────────
            if (session.customer && session.subscription) {
                // Get subscription to check trial end
                const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
                const trialEnd = subscription.trial_end
                    ? new Date(subscription.trial_end * 1000).toISOString()
                    : null;

                await admin
                    .from("user_profiles")
                    .update({
                        subscription_status: "active",
                        stripe_subscription_id: session.subscription as string,
                        plan_tier: "pro",
                        trial_ends_at: trialEnd,
                        account_type: "self_service",
                    })
                    .eq("stripe_customer_id", session.customer as string);

                // Sync to HubSpot
                if (session.customer_email) {
                    if (trialEnd) {
                        // Trial started
                        onTrialStarted({ email: session.customer_email, stripeCustomerId: session.customer as string }).catch(console.error);
                    } else {
                        // Direct subscription (no trial)
                        onSubscriptionActivated({ email: session.customer_email }).catch(console.error);
                    }
                } else {
                    // Look up email from Supabase
                    const { data: user } = await admin
                        .from("user_profiles")
                        .select("email")
                        .eq("stripe_customer_id", session.customer as string)
                        .single();
                    if (user?.email) {
                        if (trialEnd) {
                            onTrialStarted({ email: user.email, stripeCustomerId: session.customer as string }).catch(console.error);
                        } else {
                            onSubscriptionActivated({ email: user.email }).catch(console.error);
                        }
                    }
                }
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

            // Sync to HubSpot if subscription went active
            if (sub.status === "active") {
                const { data: user } = await admin
                    .from("user_profiles")
                    .select("email")
                    .eq("stripe_customer_id", sub.customer as string)
                    .single();
                if (user?.email) {
                    onSubscriptionActivated({ email: user.email }).catch(console.error);
                }
            }
            break;
        }

        case "customer.subscription.deleted": {
            const sub = event.data.object as Stripe.Subscription;
            await admin
                .from("user_profiles")
                .update({ subscription_status: "canceled" })
                .eq("stripe_customer_id", sub.customer as string);

            // Send cancellation email + sync to HubSpot
            const { data: canceledUser } = await admin
                .from("user_profiles")
                .select("email, contact_name, company_name")
                .eq("stripe_customer_id", sub.customer as string)
                .single();
            if (canceledUser?.email) {
                sendSubscriptionCanceledEmail(
                    canceledUser.email,
                    canceledUser.contact_name || canceledUser.company_name || "there",
                ).catch(err => console.error("Canceled email failed:", err));
                // Move deal to Churned in HubSpot
                onSubscriptionCanceled(canceledUser.email).catch(console.error);
            }
            break;
        }

        case "invoice.payment_failed": {
            const invoice = event.data.object as Stripe.Invoice;
            if (invoice.customer) {
                await admin
                    .from("user_profiles")
                    .update({ subscription_status: "past_due" })
                    .eq("stripe_customer_id", invoice.customer as string);

                // Send payment failed email + sync to HubSpot
                const { data: failedUser } = await admin
                    .from("user_profiles")
                    .select("email, contact_name, company_name")
                    .eq("stripe_customer_id", invoice.customer as string)
                    .single();
                if (failedUser?.email) {
                    sendPaymentFailedEmail(
                        failedUser.email,
                        failedUser.contact_name || failedUser.company_name || "there",
                    ).catch(err => console.error("Payment failed email failed:", err));
                    // Update subscription_status to past_due in HubSpot
                    onPaymentFailed(failedUser.email).catch(console.error);
                }
            }
            break;
        }
    }

    return NextResponse.json({ received: true });
}
