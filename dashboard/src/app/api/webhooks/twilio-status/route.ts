/**
 * Twilio Programmable Messaging status webhook (R3-M2.2).
 *
 * Twilio POSTs an `application/x-www-form-urlencoded` body for each SMS
 * status change (queued/sending/sent/delivered/undelivered/failed). The body
 * carries MessageSid + MessageStatus + (on failure) ErrorCode + ErrorMessage.
 * Twilio also signs every request with HMAC-SHA1 in the `X-Twilio-Signature`
 * header; we verify via the SDK validator before touching the DB.
 *
 * Maps MessageSid → outreach_campaign_step_runs.provider_message_id and
 * updates the lifecycle columns. On `failed` with error code 30003
 * ("unreachable destination handset") we also mark the contact as bounced
 * so the scheduler stops re-trying that number on later steps.
 *
 * Configure in Twilio console: Phone Numbers → your CapturePilot number →
 * Messaging Configuration → "A message comes in" / "Status callback" URL
 * pointing at https://app.capturepilot.com/api/webhooks/twilio-status.
 *
 * Env:
 *   TWILIO_AUTH_TOKEN — required for signature validation (fail-closed in
 *     production). Already set per repo state.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

export const runtime = "nodejs";
export const maxDuration = 10;

if (process.env.NODE_ENV === "production" && !process.env.TWILIO_AUTH_TOKEN) {
    console.warn(
        `[twilio-status] WARNING ${new Date().toISOString()} — TWILIO_AUTH_TOKEN is NOT set in production. ` +
        `All incoming Twilio status callbacks will be rejected with 500. ` +
        `Set the env var in Vercel and configure the messaging status callback URL on the Twilio number.`,
    );
}

// Twilio status → step_run status column mapping. Anything not in this map
// gets logged but doesn't mutate the row — keeps us safe against new Twilio
// statuses (e.g. `read` for WhatsApp) that we may pipe through later.
const STATUS_MAP: Record<string, string> = {
    sent: "sent",
    delivered: "delivered",
    undelivered: "failed",
    failed: "failed",
};

// 30003 — unreachable destination handset. 30004 — message blocked.
// 30005 — unknown destination handset. 30006 — landline. 30007 — carrier
// violation (carrier filtered). All of these mean "stop sending to this
// number" — flip the contact to bounced so the scheduler skips it.
const PERMANENT_FAILURE_CODES = new Set(["30003", "30004", "30005", "30006", "30007"]);

function buildPublicUrl(req: NextRequest): string {
    // Twilio signs the full URL it POSTed to. Vercel terminates TLS and
    // populates x-forwarded-proto/host, so reconstruct from those instead of
    // trusting req.url (which can be the internal host on a Vercel runtime).
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const url = new URL(req.url);
    return `${proto}://${host}${url.pathname}${url.search}`;
}

export async function POST(req: NextRequest) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const isProd = process.env.NODE_ENV === "production";

    if (!authToken) {
        if (isProd) {
            console.error("[twilio-status] TWILIO_AUTH_TOKEN not set in production — refusing request");
            return new NextResponse("Server misconfigured", { status: 500 });
        }
        console.warn("[twilio-status] TWILIO_AUTH_TOKEN not set — skipping signature check (dev only)");
    }

    const signature = req.headers.get("x-twilio-signature") || "";
    const rawBody = await req.text();

    // Twilio's validator wants the form-encoded fields as a flat object, not
    // the raw body string. Parse with URLSearchParams so duplicates collapse
    // the same way Twilio's SDK reconstructs them.
    const params: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(rawBody).entries()) {
        params[k] = v;
    }

    if (authToken) {
        const url = buildPublicUrl(req);
        const ok = twilio.validateRequest(authToken, signature, url, params);
        if (!ok) {
            return new NextResponse("Invalid signature", { status: 401 });
        }
    }

    const messageSid = params.MessageSid || params.SmsSid;
    const messageStatus = (params.MessageStatus || params.SmsStatus || "").toLowerCase();
    const errorCode = params.ErrorCode || null;
    const errorMessage = params.ErrorMessage || null;
    const to = params.To || null;

    if (!messageSid) {
        // Twilio occasionally fires status callbacks without a SID for
        // delivery summaries — just 200 them so they don't retry.
        return NextResponse.json({ ok: true, skipped: "no_message_sid" });
    }

    console.log(`[twilio-status] accepted ${messageStatus || "?"} for sid=${messageSid} to=${to || "?"} err=${errorCode || ""}`);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const mapped = STATUS_MAP[messageStatus];
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (mapped) {
        patch.status = mapped;
        if (mapped === "delivered") patch.delivered_at = now;
        if (mapped === "failed") {
            patch.error_message = errorMessage
                ? `${errorCode ? `[${errorCode}] ` : ""}${errorMessage}`
                : errorCode
                    ? `twilio error ${errorCode}`
                    : "twilio failed";
        }
    }

    if (Object.keys(patch).length > 0) {
        const { error: upErr } = await sb.from("outreach_campaign_step_runs")
            .update(patch)
            .eq("provider_message_id", messageSid);
        if (upErr) {
            console.error("[twilio-status] step_run update failed", { error: upErr.message, messageSid });
            // 500 so Twilio retries — it backs off cleanly.
            return new NextResponse("Update failed", { status: 500 });
        }
    }

    // Permanent failure → mark contact as bounced + un-queue them from the
    // campaign. Without this, the next SMS step keeps hitting the dead number.
    if (mapped === "failed" && errorCode && PERMANENT_FAILURE_CODES.has(errorCode)) {
        try {
            const { data: stepRuns } = await sb.from("outreach_campaign_step_runs")
                .select("campaign_contact_id")
                .eq("provider_message_id", messageSid)
                .limit(1) as { data: { campaign_contact_id: string }[] | null };

            const ccId = stepRuns?.[0]?.campaign_contact_id;
            if (ccId) {
                const { data: cc } = await sb.from("outreach_campaign_contacts")
                    .select("contact_id")
                    .eq("id", ccId)
                    .maybeSingle() as { data: { contact_id: string } | null };

                await sb.from("outreach_campaign_contacts")
                    .update({ status: "bounced", finished_at: now })
                    .eq("id", ccId);

                if (cc?.contact_id) {
                    await sb.from("outreach_contacts")
                        .update({ last_bounced_at: now })
                        .eq("id", cc.contact_id);
                }
            }
        } catch (e) {
            console.error("[twilio-status] bounce mirror failed", e);
        }
    }

    return NextResponse.json({ ok: true, status: messageStatus });
}
