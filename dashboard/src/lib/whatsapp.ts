/**
 * WhatsApp Business Cloud API — partner alerts for new lead briefs.
 *
 * Uses Meta's hosted WABA stack (no Twilio middleman). Reuses the existing
 * META_SYSTEM_TOKEN if it has the `whatsapp_business_messaging` scope, or
 * falls back to a dedicated WHATSAPP_ACCESS_TOKEN if set separately.
 *
 * Required env vars:
 *   WHATSAPP_PHONE_NUMBER_ID — the Cloud API phone-number ID (NOT the actual
 *     phone number). Find via:
 *       https://developers.facebook.com/apps/<APP_ID>/whatsapp-business/wa-dev-console/
 *     or list with the Graph API: GET /{business_id}/owned_whatsapp_business_accounts.
 *   WHATSAPP_PARTNER_PHONE — recipient phone in E.164 format (e.g. +14155551234).
 *
 * Optional:
 *   WHATSAPP_ACCESS_TOKEN — when META_SYSTEM_TOKEN doesn't have WA scope.
 *
 * The 24-hour window rule: WhatsApp blocks free-form messages outside a
 * 24-hour customer-service window. For partner alerts the partner can keep
 * the window open by sending us any message daily — easier than maintaining
 * an approved template. If a send fails with code 131047 (re-engagement
 * required), we log it loud so you know to send a "👋" from the partner's
 * phone to refresh the window.
 */

interface WhatsAppSendResult {
    sent: boolean;
    messageId?: string;
    error?: string;
    needsReengagement?: boolean;
}

export async function sendWhatsAppPartnerAlert(text: string): Promise<WhatsAppSendResult> {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const partnerPhone = process.env.WHATSAPP_PARTNER_PHONE;
    const token = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_SYSTEM_TOKEN;

    if (!phoneNumberId || !partnerPhone || !token) {
        return {
            sent: false,
            error: `Missing env: ${[
                !phoneNumberId && "WHATSAPP_PHONE_NUMBER_ID",
                !partnerPhone && "WHATSAPP_PARTNER_PHONE",
                !token && "WHATSAPP_ACCESS_TOKEN (or META_SYSTEM_TOKEN with WA scope)",
            ].filter(Boolean).join(", ")}`,
        };
    }

    // E.164 with no "+" is what Meta accepts in the `to` field. Strip
    // everything that isn't a digit so configs with spaces or dashes work.
    const to = partnerPhone.replace(/[^0-9]/g, "");
    if (!to) return { sent: false, error: "WHATSAPP_PARTNER_PHONE has no digits" };

    try {
        const res = await fetch(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to,
                    type: "text",
                    text: {
                        // Preview-friendly: WhatsApp renders the first URL in
                        // the message as a link card by default. Disable when
                        // we want plain text (cleaner for short alerts).
                        preview_url: true,
                        body: text.slice(0, 4096), // WA max for text body
                    },
                }),
                signal: AbortSignal.timeout(10000),
            },
        );

        const body = await res.text();
        if (!res.ok) {
            // Code 131047: re-engagement window expired. The partner needs
            // to send any message to our WA number to reopen the 24-hr window.
            const needsReengagement = /131047|customer_service_window/i.test(body);
            return {
                sent: false,
                error: `wa ${res.status}: ${body.slice(0, 240)}`,
                needsReengagement,
            };
        }
        const parsed = JSON.parse(body) as { messages?: Array<{ id: string }> };
        return {
            sent: true,
            messageId: parsed.messages?.[0]?.id,
        };
    } catch (e) {
        return { sent: false, error: (e as Error).message };
    }
}

/**
 * Build a short, idiot-proof partner alert from a lead brief — name + score +
 * phone (with a tel: link) + 1-line context. WhatsApp will render the tel:
 * link as a Call button on mobile.
 */
export function formatPartnerAlertFromBrief(args: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    phone: string | null;
    email: string;
    fitScore: number;
    fitRationale: string;
    websiteSummary: string | null;
}): string {
    const { firstName, lastName, company, phone, email, fitScore, fitRationale, websiteSummary } = args;
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || "(name unknown)";
    const lines = [
        `🚨 *New Facebook lead · ${fitScore}/10*`,
        ``,
        `*${fullName}*${company ? ` — ${company}` : ""}`,
        phone ? `📞 ${phone}` : `(no phone captured)`,
        `✉️ ${email}`,
        ``,
        `_${fitRationale}_`,
    ];
    if (websiteSummary) {
        lines.push(``, `Site: ${websiteSummary.slice(0, 200)}`);
    }
    lines.push(``, `→ Call within 30 min if possible.`);
    return lines.join("\n");
}
