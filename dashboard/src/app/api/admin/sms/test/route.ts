/**
 * POST /api/admin/sms/test
 *   { text?: "custom message", to?: "+14155551234" }
 *
 * Sends a Twilio SMS to the configured partner number (or to a one-off
 * override). Verifies env wiring + auth + recipient deliverability.
 *
 * Dual auth: admin session OR Bearer CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth-admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendSmsPartnerAlert } from "@/lib/sms";

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

    let savedEnv: string | undefined;
    if (overridePhone) {
        savedEnv = process.env.SMS_PARTNER_PHONE;
        process.env.SMS_PARTNER_PHONE = overridePhone;
    }

    const defaultText = [
        "CapturePilot SMS test.",
        "If you see this, Twilio is wired correctly.",
        "Future lead alerts arrive here within a minute of the form submission.",
    ].join(" ");

    const result = await sendSmsPartnerAlert(customText || defaultText);

    if (overridePhone) {
        if (savedEnv === undefined) delete process.env.SMS_PARTNER_PHONE;
        else process.env.SMS_PARTNER_PHONE = savedEnv;
    }

    if (result.sent) {
        return NextResponse.json({
            ok: true,
            sid: result.sid,
            sent_to: overridePhone || process.env.SMS_PARTNER_PHONE || process.env.WHATSAPP_PARTNER_PHONE,
        });
    }
    return NextResponse.json({
        ok: false,
        error: result.error,
        code: result.code,
        needs_verification: !!result.needsVerification,
        hint: result.needsVerification
            ? "Twilio trial accounts can only send to verified numbers. Verify the recipient at https://console.twilio.com/us1/develop/phone-numbers/manage/verified or upgrade your account."
            : "Check TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_PHONE_NUMBER are all set.",
    }, { status: 502 });
}
