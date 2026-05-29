/**
 * POST /api/admin/whatsapp/test
 *   { text?: "custom message", to?: "+14155551234" }
 *
 * Sends a WhatsApp text message to the configured partner number (or to a
 * one-off `to` override) using Meta's WhatsApp Business Cloud API. Verifies:
 *   - env vars are wired correctly
 *   - the access token has whatsapp_business_messaging scope
 *   - the 24-hr customer-service window is open (otherwise Meta returns 131047)
 *
 * Required env (see lib/whatsapp.ts header for details):
 *   WHATSAPP_PHONE_NUMBER_ID
 *   WHATSAPP_PARTNER_PHONE
 *   META_SYSTEM_TOKEN (or WHATSAPP_ACCESS_TOKEN if scoped differently)
 *
 * Dual auth: admin session OR Bearer CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth-admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendWhatsAppPartnerAlert } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const isCron = isAuthorizedCron(req.headers.get("authorization"));
    if (!isCron) {
        const unauth = await assertAdmin();
        if (unauth) return unauth;
    }

    const body = await req.json().catch(() => ({}));
    const customText: string | undefined = body.text;
    const overridePhone: string | undefined = body.to;

    // If caller passed a `to`, temporarily override the env var so we use
    // it for this single send. Lets us probe a phone before configuring
    // WHATSAPP_PARTNER_PHONE permanently.
    let savedEnv: string | undefined;
    if (overridePhone) {
        savedEnv = process.env.WHATSAPP_PARTNER_PHONE;
        process.env.WHATSAPP_PARTNER_PHONE = overridePhone;
    }

    const defaultText = [
        "🧪 *CapturePilot WhatsApp test*",
        "",
        "If you see this, the WhatsApp Business API is wired correctly.",
        "Future new-lead alerts will arrive here within a minute of the form submission.",
        "",
        `Sent at ${new Date().toISOString()}`,
    ].join("\n");

    const result = await sendWhatsAppPartnerAlert(customText || defaultText);

    if (overridePhone) {
        if (savedEnv === undefined) delete process.env.WHATSAPP_PARTNER_PHONE;
        else process.env.WHATSAPP_PARTNER_PHONE = savedEnv;
    }

    if (result.sent) {
        return NextResponse.json({
            ok: true,
            messageId: result.messageId,
            sent_to: overridePhone || process.env.WHATSAPP_PARTNER_PHONE,
            phone_number_id_set: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
        });
    }
    return NextResponse.json({
        ok: false,
        error: result.error,
        needs_reengagement: !!result.needsReengagement,
        hint: result.needsReengagement
            ? "WhatsApp 24-hour customer-service window expired. Send any message from the partner's WhatsApp to your WA Business number to reopen it, then re-run."
            : "Check that WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_PARTNER_PHONE, and META_SYSTEM_TOKEN (with whatsapp_business_messaging scope) are all set in Vercel env.",
    }, { status: 502 });
}
