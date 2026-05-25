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
}

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

    const body = `
        ${paragraph(greeting)}
        ${paragraph(escapeHtml(magnet.blurb))}
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
        cta: { label: `Download the ${magnet.productName} (PDF)`, url: magnet.pdfUrl },
        footerNote: "You requested this download from www.capturepilot.com. Reply \"unsubscribe\" any time and I'll take you off the list.",
    });
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
    // From-name is the first thing visible in the inbox row. "CapturePilot
    // Downloads" makes the purpose unambiguous (it's the file the user asked
    // for) and reads cleaner than a personal alias in cold-traffic delivery.
    const from =
        args.fromEmail ||
        process.env.LEAD_MAGNET_FROM_EMAIL ||
        "CapturePilot Downloads <andre@capturepilot.com>";

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
