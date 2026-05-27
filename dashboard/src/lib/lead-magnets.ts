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
import {
    emailTemplate,
    contentCard,
    featureBox,
    paragraph,
    sectionLabel,
    COLORS,
} from "@/lib/email-template";

/**
 * Form-field contract for a lead magnet. Drives both client-side validation
 * (LeadMagnetForm.tsx hides/shows + requires the right inputs) and the
 * server-side payload contract (/api/leads accepts these keys).
 *
 * Every new download MUST set this — that's how we document the per-magnet
 * form requirements in one place instead of scattering them across pages.
 *
 * Current default for all download magnets:
 *   - email (required, work email)
 *   - first_name (required)
 *   - last_name (required)
 *   - company (required) — needed for Apollo + HubSpot enrichment
 *   - phone (optional) — Apollo backfills when missing
 */
export interface LeadMagnetFormSpec {
    firstName: "required" | "optional" | "off";
    lastName: "required" | "optional" | "off";
    email: "required";
    company: "required" | "optional" | "off";
    phone: "required" | "optional" | "off";
}

export interface LeadMagnet {
    /** Stable key — referenced by API callers and stored on marketing_leads rows. */
    key: string;
    /** Human-readable label for logs/admin views. */
    label: string;
    /** Short product name used in subject + body (e.g. "Field Manual"). */
    productName: string;
    /** Public URL of the PDF (Supabase Storage / S3 / CDN). */
    pdfUrl: string;
    /** Subject line for the delivery email. */
    subject: string;
    /** Inbox preview line (hidden preheader). */
    preheader: string;
    /** One-paragraph context that personalizes the email body. */
    blurb: string;
    /** Bullet list shown in the email body — what's inside the PDF. */
    inside: string[];
    /** Form requirements — drives UI + API validation. */
    form: LeadMagnetFormSpec;
}

const DEFAULT_FORM: LeadMagnetFormSpec = {
    firstName: "required",
    lastName: "required",
    email: "required",
    company: "required",
    phone: "optional",
};

const FIELD_MANUAL_URL =
    process.env.LEAD_MAGNET_PDF_URL ||
    "https://ryxgjzehoijjvczqkhwr.supabase.co/storage/v1/object/public/Lead%20Magnets/CapturePilot-Win-Your-First-Government-Contract.pdf";

const FIELD_MANUAL_CONFIG = {
    productName: "Field Manual",
    pdfUrl: FIELD_MANUAL_URL,
    // Subject leads with the deliverable + a clear "ready to download" cue.
    // Stands out in the inbox against generic "Thanks for signing up" sends.
    subject: "Your Field Manual is ready — Win Your First Government Contract (PDF)",
    preheader: "Your download link is inside — Bid/No-Bid matrix, PWin calculator, RFP framework, pricing worksheet.",
    blurb:
        "Your PDF is ready. I put this field manual together so first-time bidders can skip the year of trial-and-error most folks burn before their first government contract.",
    inside: [
        "Bid / No-Bid Decision Matrix",
        "PWin (Probability of Win) Calculator",
        "RFP Response Framework",
        "Pricing-to-Win Worksheet",
    ],
    form: DEFAULT_FORM,
};

export const LEAD_MAGNETS: Record<string, LeadMagnet> = {
    "field-manual": {
        key: "field-manual",
        label: "Win Your First Government Contract — Field Manual",
        ...FIELD_MANUAL_CONFIG,
    },
    // Alias used by the Meta Lead Ads webhook so legacy rows already in
    // marketing_leads stay queryable. Points at the same delivery payload.
    "meta-lead-field-manual": {
        key: "meta-lead-field-manual",
        label: "Win Your First Government Contract — Field Manual (Meta Lead Ad)",
        ...FIELD_MANUAL_CONFIG,
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
    const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";
    const insideList = magnet.inside
        .map((item) => `<li style="margin:0 0 6px;color:#065f46;font-size:14px;line-height:1.6;">${escapeHtml(item)}</li>`)
        .join("");

    const companyLine = company
        ? paragraph(
              `I'll keep an eye out for opportunities that fit <strong>${escapeHtml(company)}</strong> — reply to this email if you want me to scan your NAICS for what's open right now.`,
          )
        : "";

    // Primary CTA rendered inline near the top of the body so it lands above
    // the fold the second the user opens the email — no scrolling to hunt for
    // the download. We keep the emailTemplate's trailing CTA slot unused
    // (cta:undefined) since a single high-contrast button beats two competing
    // ones for click-through.
    const inlineCta = `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px;">
            <tr><td style="border-radius:999px;background-color:${COLORS.emerald500};">
                <a href="${magnet.pdfUrl}" style="display:inline-block;padding:14px 32px;color:${COLORS.white};text-decoration:none;font-weight:700;font-size:15px;border-radius:999px;">
                    Download the ${escapeHtml(magnet.productName)} (PDF)
                </a>
            </td></tr>
        </table>
    `;

    const body = `
        ${paragraph(greeting)}
        ${paragraph(escapeHtml(magnet.blurb))}
        ${inlineCta}
        ${featureBox(`
            ${sectionLabel(`What's inside the ${escapeHtml(magnet.productName)}`)}
            <ul style="margin:8px 0 0;padding-left:20px;">${insideList}</ul>
        `)}
        ${companyLine}
        ${contentCard(`
            <p style="margin:0;color:${COLORS.stone700};font-size:14px;line-height:1.6;">
                Want me to walk through one of your live opportunities? Hit reply — happy to take a look.
            </p>
        `)}
        <p style="margin:24px 0 0;font-size:14px;color:${COLORS.black};font-weight:600;">— Andre, CapturePilot</p>
    `;

    return emailTemplate({
        category: "transactional",
        preheader: magnet.preheader,
        eyebrow: "Your Download Is Ready",
        heading: `Your ${magnet.productName} is ready to download`,
        body,
        // CTA intentionally omitted here — already rendered inline above the
        // "What's inside" block so it's visible without scrolling.
        footerNote: "You requested this download from www.capturepilot.com or www.americurial.com. Reply \"unsubscribe\" any time and I'll take you off the list.",
    });
}

/**
 * Deliver a magnet. Returns `{ sent: true, resendId }` on success, `{ sent: false }` if
 * Resend isn't configured (env unset). Caller decides whether that's fatal.
 *
 * The resendId is the Resend message id (re_...). Persist it on the lead row
 * so the /api/webhooks/resend handler can join delivered/opened/clicked events
 * back to the lead they came from.
 */
export async function sendLeadMagnetEmail(args: {
    magnet: LeadMagnet;
    to: string;
    firstName?: string;
    company?: string;
    fromEmail?: string;
}): Promise<{ sent: boolean; error?: string; resendId?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { sent: false, error: "missing_resend_key" };

    const resend = new Resend(apiKey);
    const from =
        args.fromEmail ||
        process.env.LEAD_MAGNET_FROM_EMAIL ||
        "CapturePilot Downloads <andre@capturepilot.com>";

    const { data, error } = await resend.emails.send({
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
    return { sent: true, resendId: data?.id };
}
