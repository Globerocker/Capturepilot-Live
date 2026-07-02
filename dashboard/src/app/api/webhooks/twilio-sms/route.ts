/**
 * Twilio inbound-SMS webhook — STOP/START consent sync.
 *
 * Twilio auto-handles STOP at the carrier level (the number stops delivering to
 * that person and returns error 21610 on future sends). This webhook mirrors
 * that into our own sms_consents table so revoked opt-ins are visible in the
 * cockpit (the Send SMS button + the send-sms hard gate both read it) and so a
 * later opt-in flow can't silently re-enable someone who said STOP.
 *
 * Twilio POSTs application/x-www-form-urlencoded { From, To, Body, MessageSid }
 * and signs every request with HMAC-SHA1 in X-Twilio-Signature. We verify via
 * the Twilio SDK validator before touching the DB (fail-closed in production).
 *
 * Configure in Twilio: Phone Numbers → the number → Messaging → "A message
 * comes in" → https://app.capturepilot.com/api/webhooks/twilio-sms
 * (this session wires it via the API).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

export const runtime = "nodejs";
export const maxDuration = 10;

// Twilio's standard opt-out / opt-in keywords (first word, case-insensitive).
const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"]);
const START_WORDS = new Set(["start", "unstop", "yes", "optin"]);

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = () => new NextResponse(EMPTY_TWIML, { status: 200, headers: { "Content-Type": "text/xml" } });

function buildPublicUrl(req: NextRequest): string {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const url = new URL(req.url);
    return `${proto}://${host}${url.pathname}${url.search}`;
}

export async function POST(req: NextRequest) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const isProd = process.env.NODE_ENV === "production";
    if (!authToken && isProd) {
        console.error("[twilio-sms] TWILIO_AUTH_TOKEN not set in production — refusing request");
        return new NextResponse("Server misconfigured", { status: 500 });
    }

    const signature = req.headers.get("x-twilio-signature") || "";
    const rawBody = await req.text();
    const params: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(rawBody).entries()) params[k] = v;

    if (authToken) {
        const ok = twilio.validateRequest(authToken, signature, buildPublicUrl(req), params);
        if (!ok) return new NextResponse("Invalid signature", { status: 401 });
    }

    const from = (params.From || "").trim();          // Twilio sends E.164
    const firstWord = (params.Body || "").trim().toLowerCase().split(/\s+/)[0] || "";
    if (!from) return twiml();

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
    const now = new Date().toISOString();

    if (STOP_WORDS.has(firstWord)) {
        // Upsert a revoked row (even for a number we've never seen, so a STOP is
        // permanently remembered).
        await sb.from("sms_consents").upsert(
            { phone: from, consented: false, revoked_at: now, source: "reply", updated_at: now },
            { onConflict: "phone" },
        );
        console.log(`[twilio-sms] STOP from ${from} — consent revoked`);
    } else if (START_WORDS.has(firstWord)) {
        await sb.from("sms_consents").upsert(
            { phone: from, consented: true, revoked_at: null, source: "reply", consented_at: now, updated_at: now },
            { onConflict: "phone" },
        );
        console.log(`[twilio-sms] START from ${from} — consent restored`);
    }
    // Any other inbound message: no-op (we don't run a conversational bot here).

    return twiml();
}
