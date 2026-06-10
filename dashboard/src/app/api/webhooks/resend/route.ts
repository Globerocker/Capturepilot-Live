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

// Loud boot-time warning when RESEND_WEBHOOK_SECRET is missing in prod —
// audit 2026-06-10 #5 confirmed zero email_events were arriving, root cause
// was a silent misconfig. Surface it in Vercel logs the moment a cold start
// hits this route module.
if (process.env.NODE_ENV === "production" && !process.env.RESEND_WEBHOOK_SECRET) {
    console.warn(
        `[resend-webhook] WARNING ${new Date().toISOString()} — RESEND_WEBHOOK_SECRET is NOT set in production. ` +
        `All incoming Resend webhook events will be rejected with 500. ` +
        `Set the env var in Vercel and register the webhook URL in resend.com/webhooks.`,
    );
}

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
    const isProd = process.env.NODE_ENV === "production";

    // Fail-closed in prod, fail-open with a warning in dev/preview so engineers
    // can iterate without configuring Svix locally. Audit 2026-06-10 #5.
    if (!secret) {
        if (isProd) {
            console.error("[resend-webhook] RESEND_WEBHOOK_SECRET not set in production — refusing request");
            return new NextResponse("Server misconfigured", { status: 500 });
        }
        console.warn("[resend-webhook] RESEND_WEBHOOK_SECRET not set — skipping signature check (dev only)");
    }

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    if (secret && (!svixId || !svixTimestamp || !svixSignature)) {
        return new NextResponse("Missing svix headers", { status: 400 });
    }

    const rawBody = await req.text();

    if (secret) {
        const ok = verifySvixSignature({
            secret,
            id: svixId!,
            timestamp: svixTimestamp!,
            body: rawBody,
            signatureHeader: svixSignature!,
        });
        if (!ok) {
            return new NextResponse("Invalid signature", { status: 401 });
        }
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

    // Audit 2026-06-10 #5: confirm every accepted event is visible in Vercel logs,
    // so we can tell at a glance whether webhooks are reaching us at all.
    console.log(`[resend-webhook] accepted ${evt.type || "?"} (${eventType}) for ${recipient || "?"} id=${resendEmailId}`);

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

    // ---- Mirror to outreach_campaign_step_runs (R3-M2.2).
    //      The new R3 campaign engine writes outbound sends with the Resend
    //      message_id stored in outreach_campaign_step_runs.provider_message_id.
    //      Update the matching row so the campaign KPI rollups reflect the
    //      delivery + engagement lifecycle. Idempotent: opened/clicked rows
    //      only set the timestamp once (uses is null guard).
    try {
        const stepRunPatch: Record<string, unknown> = {};
        if (eventType === "delivered") {
            stepRunPatch.status = "delivered";
            stepRunPatch.delivered_at = now;
        } else if (eventType === "opened") {
            stepRunPatch.status = "opened";
            stepRunPatch.opened_at = now;
        } else if (eventType === "clicked") {
            stepRunPatch.status = "clicked";
            stepRunPatch.last_click_at = now;
        } else if (eventType === "bounced") {
            stepRunPatch.status = "bounced";
            stepRunPatch.bounced_at = now;
            stepRunPatch.error_message = (evt.data?.bounce?.message as string | undefined) || null;
        } else if (eventType === "complained") {
            stepRunPatch.status = "complained";
            stepRunPatch.complained_at = now;
        } else if (eventType === "failed") {
            stepRunPatch.status = "failed";
            stepRunPatch.error_message = (evt.data?.bounce?.message as string | undefined)
                || `resend:${evt.type || "failed"}`;
        }

        if (Object.keys(stepRunPatch).length > 0) {
            await sb.from("outreach_campaign_step_runs")
                .update(stepRunPatch)
                .eq("provider_message_id", resendEmailId);
        }

        // For opened, set first_click_at semantics are handled separately —
        // we use last_click_at above. Also set first_click_at if it's still
        // null on the first click event.
        if (eventType === "clicked") {
            await sb.from("outreach_campaign_step_runs")
                .update({ first_click_at: now })
                .eq("provider_message_id", resendEmailId)
                .is("first_click_at", null);
        }

        // On bounce/complaint, also flip the parent outreach_campaign_contacts
        // row so the scheduler stops sending to this contact.
        if ((eventType === "bounced" || eventType === "complained") && recipient) {
            const { data: stepRuns } = await sb.from("outreach_campaign_step_runs")
                .select("campaign_contact_id")
                .eq("provider_message_id", resendEmailId)
                .limit(1) as { data: { campaign_contact_id: string }[] | null };
            const ccId = stepRuns?.[0]?.campaign_contact_id;
            if (ccId) {
                await sb.from("outreach_campaign_contacts")
                    .update({
                        status: eventType === "bounced" ? "bounced" : "unsubscribed",
                        finished_at: now,
                    })
                    .eq("id", ccId);
            }
        }
    } catch (e) {
        // Non-fatal — email_events insert above already succeeded. Webhook
        // retries are safe (the partial unique index dedups). Surface the
        // error in logs so we can diagnose if KPIs look off.
        console.error("[resend-webhook] outreach_campaign_step_runs mirror failed", e);
    }

    // ---- Suppression list + HubSpot mirror (audit 2026-06-10 #6 + #21).
    //      Without these, the next outreach campaign or nurture drip will
    //      re-email a bounced/complained address — guaranteed reputation
    //      damage. Sales reps also keep mailing dead addresses because
    //      HubSpot still shows them as deliverable.
    if ((eventType === "bounced" || eventType === "complained") && recipient) {
        const recipientLower = recipient.toLowerCase();
        try {
            await sb
                .from("outreach_optouts")
                .upsert(
                    {
                        email: recipientLower,
                        reason: `resend:${eventType}`,
                        source: "resend_webhook",
                    },
                    { onConflict: "email" },
                );
        } catch (e) {
            console.error("[resend-webhook] outreach_optouts upsert failed", e);
        }

        try {
            const { updateContactByEmail } = await import("@/lib/hubspot");
            if (eventType === "bounced") {
                await updateContactByEmail(recipient, { hs_email_hard_bounced: "true" })
                    .catch(e => console.error("[resend-webhook] hubspot bounce mirror failed", e));
            } else {
                await updateContactByEmail(recipient, { unsubscribed_from_all_email: "true" })
                    .catch(e => console.error("[resend-webhook] hubspot complaint mirror failed", e));
            }
        } catch (e) {
            console.error("[resend-webhook] hubspot import failed", e);
        }
    }

    return NextResponse.json({ ok: true, type: eventType });
}
