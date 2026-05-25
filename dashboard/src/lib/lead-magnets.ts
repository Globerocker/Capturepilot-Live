/**
 * Single source of truth for lead-magnet deliveries.
 *
 * Anything that captures an email in exchange for a download — Meta Lead Ads,
 * /downloads/* pages on www.capturepilot.com, future Google Ads landing pages —
 * looks up the magnet here, then calls `sendLeadMagnetEmail()` to deliver the
 * PDF link. Keeping the config in one place means there's exactly one place
 * to update when a PDF URL changes or a new magnet ships.
 */

import { Resend } from "resend";

export interface LeadMagnet {
    /** Stable key — referenced by API callers and stored on marketing_leads rows. */
    key: string;
    /** Human-readable label for logs/admin views. */
    label: string;
    /** Public URL of the PDF (Supabase Storage / S3 / CDN). */
    pdfUrl: string;
    /** Subject line for the delivery email. */
    subject: string;
    /** One-paragraph context that personalizes the email body. */
    blurb: string;
    /** Bullet list shown in the email body — what's inside the PDF. */
    inside: string[];
}

const FIELD_MANUAL_URL =
    process.env.LEAD_MAGNET_PDF_URL ||
    "https://ryxgjzehoijjvczqkhwr.supabase.co/storage/v1/object/public/Lead%20Magnets/CapturePilot-Win-Your-First-Government-Contract.pdf";

export const LEAD_MAGNETS: Record<string, LeadMagnet> = {
    "field-manual": {
        key: "field-manual",
        label: "Win Your First Government Contract — Field Manual",
        pdfUrl: FIELD_MANUAL_URL,
        subject: "Your Field Manual: Win Your First Government Contract",
        blurb:
            "Thanks for grabbing the field manual — I pulled it together so first-time bidders can skip the year of trial-and-error most folks burn before their first contract.",
        inside: [
            "Bid / No-Bid Decision Matrix",
            "PWin (Probability of Win) Calculator",
            "RFP Response Framework",
            "Pricing-to-Win Worksheet",
        ],
    },
    // Alias used by the Meta Lead Ads webhook so legacy rows already in
    // marketing_leads stay queryable. Points at the same delivery payload.
    "meta-lead-field-manual": {
        key: "meta-lead-field-manual",
        label: "Win Your First Government Contract — Field Manual (Meta Lead Ad)",
        pdfUrl: FIELD_MANUAL_URL,
        subject: "Your Field Manual: Win Your First Government Contract",
        blurb:
            "Thanks for grabbing the field manual — I pulled it together so first-time bidders can skip the year of trial-and-error most folks burn before their first contract.",
        inside: [
            "Bid / No-Bid Decision Matrix",
            "PWin (Probability of Win) Calculator",
            "RFP Response Framework",
            "Pricing-to-Win Worksheet",
        ],
    },
};

export function getLeadMagnet(key: string | null | undefined): LeadMagnet | null {
    if (!key) return null;
    return LEAD_MAGNETS[key] || null;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function renderLeadMagnetEmailHtml(args: {
    magnet: LeadMagnet;
    firstName?: string;
    company?: string;
}): string {
    const { magnet, firstName, company } = args;
    const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
    const companyLine = company
        ? `<p style="margin:0 0 16px;font-size:15px;color:#44403c;">I&rsquo;ll keep an eye out for opportunities that fit ${escapeHtml(company)} — reply to this email if you want me to scan your NAICS for what&rsquo;s open right now.</p>`
        : "";

    const insideList = magnet.inside
        .map((item) => `<li style="margin:0 0 4px;">${escapeHtml(item)}</li>`)
        .join("");

    return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1917;line-height:1.55;">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:16px;padding:32px;">
  <p style="margin:0 0 16px;font-size:16px;">${greeting}</p>
  <p style="margin:0 0 16px;font-size:15px;color:#44403c;">${escapeHtml(magnet.blurb)}</p>
  <p style="margin:0 0 24px;font-size:15px;color:#44403c;">Here&rsquo;s the PDF:</p>
  <p style="margin:0 0 24px;">
    <a href="${magnet.pdfUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;font-size:15px;">
      Download the Field Manual
    </a>
  </p>
  <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#1c1917;">What&rsquo;s inside:</p>
  <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#44403c;">${insideList}</ul>
  ${companyLine}
  <p style="margin:0 0 8px;font-size:14px;color:#44403c;">
    If you want me to walk through one of your live opportunities, hit reply &mdash; happy to take a look.
  </p>
  <p style="margin:24px 0 0;font-size:14px;color:#1c1917;">&mdash; Andre, CapturePilot</p>
  <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e7e5e4;font-size:11px;color:#a8a29e;">
    You requested this download on www.capturepilot.com. Reply &ldquo;unsubscribe&rdquo; and I&rsquo;ll take you off the list.
  </p>
</div>
</body></html>`;
}

/**
 * Deliver a magnet. Returns `{ sent: true }` on success, `{ sent: false }` if
 * Resend isn't configured (env unset). Caller decides whether that's fatal.
 */
export async function sendLeadMagnetEmail(args: {
    magnet: LeadMagnet;
    to: string;
    firstName?: string;
    company?: string;
    fromEmail?: string;
}): Promise<{ sent: boolean; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { sent: false, error: "missing_resend_key" };

    const resend = new Resend(apiKey);
    const from = args.fromEmail || process.env.LEAD_MAGNET_FROM_EMAIL || "Andre @ CapturePilot <andre@capturepilot.com>";

    const { error } = await resend.emails.send({
        from,
        to: args.to,
        replyTo: "andre@capturepilot.com",
        subject: args.magnet.subject,
        html: renderLeadMagnetEmailHtml({
            magnet: args.magnet,
            firstName: args.firstName,
            company: args.company,
        }),
    });

    if (error) return { sent: false, error: error.message || String(error) };
    return { sent: true };
}
