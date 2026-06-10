/**
 * Email template: Federal Launch Kit delivery
 *
 * Sent immediately after a successful Stripe checkout for the startup_pack
 * product. Gives the buyer their download link + ZIP link so a closed tab
 * never loses them their purchase.
 *
 * Usage:
 *   import { renderStartupPackDeliveryEmail } from "@/lib/email/templates/startup-pack-delivery";
 *   const { subject, html } = renderStartupPackDeliveryEmail({ ... });
 */

import {
    emailTemplate,
    featureBox,
    paragraph,
    sectionLabel,
    contentCard,
    COLORS,
} from "@/lib/email-template";

export interface StartupPackDeliveryParams {
    /** Buyer's company name — shown in greeting and subject. */
    companyName: string;
    /** Full URL to the token-gated download page. */
    downloadUrl: string;
    /** Full URL to the one-click ZIP download endpoint. */
    zipUrl: string;
    /** Amount paid in cents — shown in the receipt block. */
    amountPaidCents: number;
    /** Optional: Calendly link for the founder onboarding call. */
    onboardingCallUrl?: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";

/** The 10 content categories with descriptions shown in the email. */
const PACK_CONTENTS = [
    {
        label: "SAM.gov Registration Kit",
        desc: "Step-by-step walkthrough + pre-reg checklist + NAICS picker + annual renewal kit.",
    },
    {
        label: "Capability Statement Kit",
        desc: "Editable DOCX template, three branded design variants, and a written how-to guide.",
    },
    {
        label: "Solicitation-Type Playbooks",
        desc: "Dedicated playbook for every notice type — Sources Sought, Pre-Solicitation, RFP, RFQ, and IDIQ task orders.",
    },
    {
        label: "Bid / No-Bid Decision Toolkit",
        desc: "10-factor decision matrix, PWin calculator, and competitive bid analysis worksheet.",
    },
    {
        label: "Certification Eligibility Worksheets",
        desc: "Self-assessment packs for 8(a), HUBZone, WOSB/EDWOSB, and VOSB/SDVOSB — know in 10 minutes if you qualify.",
    },
    {
        label: "Past-Performance Reference Templates",
        desc: "Federal-grade 1-page reference template + guide for converting commercial work into credible past perf.",
    },
    {
        label: "Contracting Officer Outreach Library",
        desc: "10 CO email templates, COR/PM conversation scripts, LinkedIn DM sequences, and an Industry Day playbook.",
    },
    {
        label: "Price-to-Win Toolkit",
        desc: "Wrap rate worksheet, FY2026 GSA labor rate benchmarks, and an indirect rate calculator.",
    },
    {
        label: "Internal Best-Practice Library",
        desc: "Capture maturity audit, color-team review checklists, FAR clause decoder, teaming agreement, and compliance matrix.",
    },
    {
        label: "Bonus: 30-min Founder Onboarding Call",
        desc: "Book a live 1:1 with our capture lead — walk out with your first target opportunity scoped.",
    },
];

export function renderStartupPackDeliveryEmail(
    params: StartupPackDeliveryParams,
): { subject: string; html: string } {
    const {
        companyName,
        downloadUrl,
        zipUrl,
        amountPaidCents,
        onboardingCallUrl = "https://calendly.com/capturepilot/launch-kit-onboarding",
    } = params;

    const priceLabel = `$${(amountPaidCents / 100).toFixed(0)}`;
    const greeting = companyName && companyName !== "Founder"
        ? `Thanks for grabbing the Federal Launch Kit, ${companyName}.`
        : "Thanks for grabbing the Federal Launch Kit.";

    const contentRows = PACK_CONTENTS.map(
        (item) =>
            `<tr>
                <td style="padding:8px 0;vertical-align:top;border-bottom:1px solid ${COLORS.stone100};">
                    <span style="font-size:13px;font-weight:700;color:${COLORS.black};">${item.label}</span>
                    <span style="display:block;font-size:12px;color:${COLORS.stone600};line-height:1.5;margin-top:2px;">${item.desc}</span>
                </td>
            </tr>`,
    ).join("");

    const html = emailTemplate({
        category: "transactional",
        preheader: `Your Federal Launch Kit is ready — 38 files, 10 categories, instant download.`,
        eyebrow: "Order Confirmed",
        heading: "Your Federal Launch Kit is ready",
        body: `
            ${paragraph(greeting)}
            ${paragraph("Here's everything inside — 38 files across 10 categories. Click the button below to open your download library. Everything's available forever, no expiry.")}

            ${featureBox(`
                ${sectionLabel("What's inside the kit")}
                <table role="presentation" style="width:100%;border-collapse:collapse;">
                    <tbody>${contentRows}</tbody>
                </table>
            `)}

            ${paragraph(`<a href="${zipUrl}" style="color:${COLORS.emerald700};font-weight:600;text-decoration:none;">Download everything as a single ZIP →</a>`)}

            ${contentCard(`
                ${sectionLabel("Your order")}
                <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;color:${COLORS.stone700};">
                    <tbody>
                        <tr><td style="padding:4px 0;">Amount paid</td><td style="padding:4px 0;text-align:right;font-weight:700;">${priceLabel} USD</td></tr>
                        <tr><td style="padding:4px 0;">Access</td><td style="padding:4px 0;text-align:right;font-weight:700;">Lifetime, instant</td></tr>
                        <tr><td style="padding:4px 0;">Refund policy</td><td style="padding:4px 0;text-align:right;font-weight:700;">7-day, no questions</td></tr>
                    </tbody>
                </table>
            `)}

            ${paragraph(`Need help or have questions? Reply to this email or <a href="${onboardingCallUrl}" style="color:${COLORS.emerald700};">book your free 30-min onboarding call</a> — we'll walk through your first bid together.`)}
        `,
        cta: { label: "Open My Download Library", url: downloadUrl },
        secondaryCta: { label: "Download full ZIP", url: zipUrl },
        footerNote: "Federal Launch Kit · CapturePilot · capturepilot.com",
    });

    const subject = `Your Federal Launch Kit is ready${companyName && companyName !== "Founder" ? ` · ${companyName}` : ""}`;

    return { subject, html };
}
