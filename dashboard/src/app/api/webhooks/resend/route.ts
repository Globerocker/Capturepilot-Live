/**
 * Resend webhook handler — receives delivery / open / click / bounce events
 * and persists them to email_events. The admin UI joins on resend_email_id
 * back to marketing_leads.{magnet_resend_id, brief_resend_id} to surface
 * per-lead engagement.
 *
 * Resend uses Svix for webhook signing. Verification recipe:
 *   - Headers: svix-id, svix-timestamp, svix-signature
 *   - Secret format: "whsec_<base64>" — base64-decode the bytes after the prefix
 *   - Payload to sign: `${svix-id}.${svix-timestamp}.${raw_body}`
 *   - Signature: HMAC-SHA256(decoded_secret, payload) → base64
 *   - svix-signature header is space-separated "v1,<sig> v1,<sig2>" — any match wins
 *   - Timestamps older than 5min are rejected (replay protection)
 *
 * Set RESEND_WEBHOOK_SECRET in Vercel env after creating the webhook in the
 * Resend dashboard at https://resend.com/webhooks.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 10;

const TOLERANCE_SECONDS = 300; // 5min, matches Svix default

// Maps Resend event names ("email.delivered", "email.opened", ...) to the
// short slugs we store in email_events.event_type. Anything not in this map
// gets persisted under "failed" so we don't drop visibility on new event types.
const EVENT_TYPE_MAP: Record<string, string> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delivery_delayed",
    "email.opened": "opened",
    "email.clicked": "clicked",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.failed": "failed",
};

function verifySvixSignature(args: {
    secret: string;
    id: string;
    timestamp: string;
    body: string;
    signatureHeader: string;
}): boolean {
    const { secret, id, timestamp, body, signatureHeader } = args;

    const tsNum = parseInt(timestamp, 10);
    if (!Number.isFinite(tsNum)) return false;
    const ageSec = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
    if (ageSec > TOLERANCE_SECONDS) return false;

    const secretBase64 = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
    let secretBytes: Buffer;
    try {
        secretBytes = Buffer.from(secretBase64, "base64");
    } catch {
        return false;
    }

    const payload = `${id}.${timestamp}.${body}`;
    const expected = crypto
        .createHmac("sha256", secretBytes)
        .update(payload, "utf8")
        .digest("base64");

    // Header is "v1,<sig> v1,<sig2>" — Resend rotates, so check all.
    const candidates = signatureHeader.split(" ")
        .map(p => p.trim())
        .filter(p => p.startsWith("v1,"))
        .map(p => p.slice("v1,".length));

    for (const sig of candidates) {
        if (sig.length !== expected.length) continue;
        try {
            if (crypto.timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"))) {
                return true;
            }
        } catch { /* length mismatch — try next */ }
    }
    return false;
}

export async function POST(req: NextRequest) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
        console.error("[resend-webhook] RESEND_WEBHOOK_SECRET not set — refusing request");
        return new NextResponse("Server misconfigured", { status: 500 });
    }

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
        return new NextResponse("Missing svix headers", { status: 400 });
    }

    const rawBody = await req.text();
    const ok = verifySvixSignature({
        secret,
        id: svixId,
        timestamp: svixTimestamp,
        body: rawBody,
        signatureHeader: svixSignature,
    });
    if (!ok) {
        return new NextResponse("Invalid signature", { status: 401 });
    }

    let payload: unknown;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return new NextResponse("Bad JSON", { status: 400 });
    }

    const evt = payload as {
        type?: string;
        created_at?: string;
        data?: {
            email_id?: string;
            to?: string[] | string;
            click?: { link?: string; ipAddress?: string; userAgent?: string };
            open?: { ipAddress?: string; userAgent?: string };
            bounce?: { message?: string };
            [k: string]: unknown;
        };
    };

    const resendEmailId = evt.data?.email_id;
    if (!resendEmailId) {
        // Some Resend events (e.g. summary digests) don't carry an email_id —
        // just 200 them so Resend doesn't retry.
        return NextResponse.json({ ok: true, skipped: "no_email_id" });
    }

    const eventType = EVENT_TYPE_MAP[evt.type || ""] || "failed";
    const recipient = Array.isArray(evt.data?.to) ? evt.data!.to[0] : (evt.data?.to as string | undefined);
    const click = evt.data?.click;
    const open = evt.data?.open;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const { error } = await sb.from("email_events").insert({
        resend_email_id: resendEmailId,
        event_type: eventType,
        recipient: recipient || null,
        link: click?.link || null,
        user_agent: click?.userAgent || open?.userAgent || null,
        ip: click?.ipAddress || open?.ipAddress || null,
        raw: evt as unknown as Record<string, unknown>,
        occurred_at: evt.created_at ? new Date(evt.created_at).toISOString() : new Date().toISOString(),
    });

    if (error) {
        console.error("[resend-webhook] insert failed", { error: error.message, resendEmailId, eventType });
        // 500 so Resend retries — drop-on-the-floor is worse than a retry.
        return new NextResponse("Insert failed", { status: 500 });
    }

    // ---- Mirror to backlink_outreach when the message_id matches an
    //      outreach we sent. Updates the per-row counters so the morning
    //      digest can render "sent 100, opened 32, clicked 8" without
    //      joining email_events at query time. ----
    const now = evt.created_at ? new Date(evt.created_at).toISOString() : new Date().toISOString();
    try {
        if (eventType === "opened") {
            await sb.from("backlink_outreach")
                .update({ opened_at: now, open_count: 1 })
                .eq("resend_message_id", resendEmailId)
                .is("opened_at", null);
        } else if (eventType === "clicked") {
            await sb.from("backlink_outreach")
                .update({ clicked_at: now, click_count: 1 })
                .eq("resend_message_id", resendEmailId)
                .is("clicked_at", null);
        } else if (eventType === "bounced" || eventType === "complained") {
            await sb.from("backlink_outreach")
                .update({ bounced_at: now, status: "bounced" })
                .eq("resend_message_id", resendEmailId);
        }
    } catch {
        // Non-fatal — the email_events insert above succeeded so we
        // still have the raw event. Backlink mirror is a convenience.
    }

    return NextResponse.json({ ok: true, type: eventType });
}
