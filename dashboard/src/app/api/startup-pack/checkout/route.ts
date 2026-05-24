import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { STARTUP_PACK_PRICE_CENTS } from "@/lib/startup-pack-assets";

function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });
}

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

// Cold-traffic LP at www.capturepilot.com/startup-pack POSTs here cross-domain.
const ALLOWED_ORIGINS = new Set([
    "https://www.capturepilot.com",
    "https://capturepilot.com",
    "https://app.capturepilot.com",
    "http://localhost:3000",
    "http://localhost:3001",
]);

function corsHeaders(origin: string | null): Record<string, string> {
    const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.capturepilot.com";
    return {
        "Access-Control-Allow-Origin": allow,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin",
    };
}

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

/**
 * POST /api/startup-pack/checkout
 * Body: { analysis_id?: string, email?: string }
 *
 * Creates a Stripe Checkout Session for the one-time $70 Federal Launch Kit purchase.
 * If `analysis_id` is supplied, we attach it as Stripe metadata + client_reference_id
 * so the webhook can write `startup_pack_unlocked_at` back to that company_analyses row.
 *
 * Price is always $70 — we removed the time-based fallback to full price after
 * the 7-day window so the UI promise is never broken.
 */
export async function POST(request: NextRequest) {
    const cors = corsHeaders(request.headers.get("origin"));
    try {
        const stripe = getStripe();
        const { analysis_id, email: bodyEmail } = await request.json();
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";

        let email: string | undefined = bodyEmail?.trim() || undefined;
        let companyName: string | undefined;

        // Look up the analysis row when we have an ID — we want company name + email
        if (analysis_id) {
            const sb = getAdmin();
            const { data: analysis } = await sb
                .from("company_analyses")
                .select("id, company_name, lead_email, startup_pack_unlocked_at")
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
                    }, { headers: cors });
                }
            }
        }

        const unitAmount = STARTUP_PACK_PRICE_CENTS;

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
        }, { headers: cors });
    } catch (e) {
        console.error("Startup pack checkout error:", e);
        return NextResponse.json({ error: (e as Error).message || "Checkout failed" }, { status: 500, headers: cors });
    }
}
