import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import {
    STARTUP_PACK_PRICE_CENTS,
    STARTUP_PACK_FULL_PRICE_CENTS,
    STARTUP_PACK_OFFER_DAYS,
} from "@/lib/startup-pack-assets";

function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });
}

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * POST /api/startup-pack/checkout
 * Body: { analysis_id?: string, email?: string }
 *
 * Creates a Stripe Checkout Session for the one-time $70 Federal Launch Kit purchase.
 * If `analysis_id` is supplied, we attach it as Stripe metadata + client_reference_id
 * so the webhook can write `startup_pack_unlocked_at` back to that company_analyses row.
 *
 * If the analysis is older than 7 days, the offer expired and we charge the full price.
 */
export async function POST(request: NextRequest) {
    try {
        const stripe = getStripe();
        const { analysis_id, email: bodyEmail } = await request.json();
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";

        let email: string | undefined = bodyEmail?.trim() || undefined;
        let companyName: string | undefined;
        let offerExpired = false;

        // Look up the analysis row when we have an ID — we want company name + email + age
        if (analysis_id) {
            const sb = getAdmin();
            const { data: analysis } = await sb
                .from("company_analyses")
                .select("id, company_name, lead_email, created_at, startup_pack_unlocked_at")
                .eq("id", analysis_id)
                .maybeSingle();

            if (analysis) {
                companyName = (analysis.company_name as string) || undefined;
                email = email || (analysis.lead_email as string) || undefined;

                // Already purchased — bounce them to download page
                if (analysis.startup_pack_unlocked_at) {
                    return NextResponse.json({
                        already_unlocked: true,
                        url: `${baseUrl}/startup-pack/success?aid=${analysis_id}`,
                    });
                }

                // Age check
                const createdAt = new Date(analysis.created_at as string).getTime();
                const cutoff = Date.now() - STARTUP_PACK_OFFER_DAYS * 86400_000;
                if (createdAt < cutoff) {
                    offerExpired = true;
                }
            }
        }

        const unitAmount = offerExpired ? STARTUP_PACK_FULL_PRICE_CENTS : STARTUP_PACK_PRICE_CENTS;

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: "usd",
                        unit_amount: unitAmount,
                        product_data: {
                            name: "CapturePilot — Federal Launch Kit",
                            description:
                                "SAM.gov registration walkthrough, capability statement templates, solicitation-type " +
                                "playbooks (Sources Sought / RFI / RFP / RFQ / IDIQ), certification worksheets, " +
                                "outreach scripts, pricing toolkit, internal best-practice library + 30-min founder call. " +
                                "Instant access. Lifetime use. 7-day refund.",
                        },
                    },
                },
            ],
            customer_email: email,
            client_reference_id: analysis_id || undefined,
            metadata: {
                product: "startup_pack",
                analysis_id: analysis_id || "",
                company_name: companyName || "",
                offer_expired: offerExpired ? "true" : "false",
            },
            payment_intent_data: {
                metadata: {
                    product: "startup_pack",
                    analysis_id: analysis_id || "",
                },
                description: "CapturePilot — Federal Launch Kit",
            },
            success_url: analysis_id
                ? `${baseUrl}/startup-pack/success?aid=${analysis_id}&session_id={CHECKOUT_SESSION_ID}`
                : `${baseUrl}/startup-pack/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: analysis_id
                ? `${baseUrl}/check/${analysis_id}?canceled=startup_pack`
                : `${baseUrl}/startup-pack?canceled=true`,
            allow_promotion_codes: false,
        });

        return NextResponse.json({
            url: session.url,
            session_id: session.id,
            amount_cents: unitAmount,
            offer_expired: offerExpired,
        });
    } catch (e) {
        console.error("Startup pack checkout error:", e);
        return NextResponse.json({ error: (e as Error).message || "Checkout failed" }, { status: 500 });
    }
}
