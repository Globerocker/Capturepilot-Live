/**
 * Shared email template for all CapturePilot emails.
 * Branded layout: logo header, emerald CTAs, unsubscribe footer, preheader support.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
const LOGO_URL = "https://www.capturepilot.com/logo.png";

// Brand colors
const COLORS = {
    black: "#0c0a09",
    white: "#ffffff",
    emerald600: "#059669",
    emerald700: "#047857",
    stone50: "#fafaf9",
    stone100: "#f5f5f4",
    stone200: "#e7e5e3",
    stone400: "#a8a29e",
    stone500: "#78716c",
    stone700: "#44403c",
    stone800: "#292524",
};

const FONT_STACK =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

interface EmailTemplateOptions {
    /** Hidden preheader text shown in inbox preview */
    preheader?: string;
    /** Main heading */
    heading: string;
    /** HTML body content (cards, text, tables, etc.) */
    body: string;
    /** CTA button — omit to skip */
    cta?: { label: string; url: string };
    /** Secondary CTA — smaller, below primary */
    secondaryCta?: { label: string; url: string };
    /** Footer note above the standard footer (e.g. "Questions? Reply to this email.") */
    footerNote?: string;
    /** If true, suppress the unsubscribe link (for purely transactional emails) */
    transactional?: boolean;
}

/**
 * Wraps email content in the branded CapturePilot layout.
 * Returns an HTML string ready for Resend's `html` field.
 */
export function emailTemplate(options: EmailTemplateOptions): string {
    const { preheader, heading, body, cta, secondaryCta, footerNote, transactional } = options;

    const preheaderHtml = preheader
        ? `<div style="display:none;font-size:1px;color:#fafaf9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}${"&zwnj;&nbsp;".repeat(40)}</div>`
        : "";

    const ctaHtml = cta
        ? `<div style="text-align:center;margin:32px 0;">
            <a href="${cta.url}" style="display:inline-block;background:${COLORS.emerald600};color:${COLORS.white};padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;mso-padding-alt:0;text-align:center;">
                <!--[if mso]><i style="mso-font-width:150%;mso-text-raise:22pt">&nbsp;</i><![endif]-->
                <span style="mso-text-raise:11pt;">${cta.label}</span>
                <!--[if mso]><i style="mso-font-width:150%">&nbsp;</i><![endif]-->
            </a>
           </div>`
        : "";

    const secondaryCtaHtml = secondaryCta
        ? `<div style="text-align:center;margin:0 0 32px;">
            <a href="${secondaryCta.url}" style="color:${COLORS.emerald600};font-size:13px;font-weight:600;text-decoration:underline;">${secondaryCta.label}</a>
           </div>`
        : "";

    const unsubscribeHtml = transactional
        ? ""
        : `<a href="${APP_URL}/settings/notifications" style="color:${COLORS.stone400};text-decoration:underline;">Unsubscribe</a> &nbsp;|&nbsp;`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${heading}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:${COLORS.stone100};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.stone100};">
<tr><td align="center" style="padding:32px 16px;">

<!-- Container -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

<!-- Header bar -->
<tr>
<td style="background:${COLORS.black};padding:20px 32px;border-radius:12px 12px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td>
    <img src="${LOGO_URL}" alt="CapturePilot" width="140" height="28" style="display:block;border:0;outline:none;max-width:140px;height:auto;" />
</td>
<td align="right" style="vertical-align:middle;">
    <span style="color:${COLORS.stone400};font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Strategic Capture Intelligence</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- Body -->
<tr>
<td style="background:${COLORS.white};padding:40px 32px;">

<h1 style="font-size:22px;font-weight:800;color:${COLORS.black};margin:0 0 20px;line-height:1.3;">${heading}</h1>

${body}

${ctaHtml}
${secondaryCtaHtml}

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background:${COLORS.stone50};padding:24px 32px;border-radius:0 0 12px 12px;border-top:1px solid ${COLORS.stone200};">
${footerNote ? `<p style="color:${COLORS.stone500};font-size:13px;margin:0 0 12px;line-height:1.5;">${footerNote}</p>` : ""}
<p style="color:${COLORS.stone400};font-size:11px;margin:0;line-height:1.6;">
    ${unsubscribeHtml}
    <a href="https://www.capturepilot.com" style="color:${COLORS.stone400};text-decoration:underline;">capturepilot.com</a>
</p>
<p style="color:${COLORS.stone400};font-size:11px;margin:8px 0 0;line-height:1.4;">
    Americurial LLC, Jacksonville, FL
</p>
</td>
</tr>

</table>
<!-- /Container -->

</td></tr>
</table>
</body>
</html>`;
}

// ─── Reusable content helpers ────────────────────────────────────────

/** A rounded content card with stone-50 background */
export function contentCard(innerHtml: string): string {
    return `<div style="background:${COLORS.stone50};border-radius:12px;padding:20px;margin:20px 0;border:1px solid ${COLORS.stone200};">${innerHtml}</div>`;
}

/** A highlighted box (emerald tint) for positive/feature content */
export function featureBox(innerHtml: string): string {
    return `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:20px;margin:20px 0;">${innerHtml}</div>`;
}

/** A warning/alert box (amber tint) */
export function alertBox(innerHtml: string): string {
    return `<div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:20px;margin:20px 0;">${innerHtml}</div>`;
}

/** An urgent/error box (red tint) */
export function urgentBox(innerHtml: string): string {
    return `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:20px 0;">${innerHtml}</div>`;
}

/** Body text paragraph */
export function paragraph(text: string): string {
    return `<p style="color:${COLORS.stone700};line-height:1.6;font-size:15px;margin:0 0 16px;">${text}</p>`;
}

/** Section label (small caps) */
export function sectionLabel(text: string): string {
    return `<p style="font-size:11px;color:${COLORS.stone500};margin:0 0 8px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">${text}</p>`;
}

/** Score badge (green/yellow/blue based on value) */
export function scoreBadge(score: number): string {
    const bg = score >= 70 ? "#dcfce7" : score >= 50 ? "#fef9c3" : "#dbeafe";
    const color = score >= 70 ? "#166534" : score >= 50 ? "#854d0e" : "#1e40af";
    return `<span style="display:inline-block;padding:2px 10px;border-radius:6px;font-size:12px;font-weight:700;background:${bg};color:${color};">${score}%</span>`;
}

export { APP_URL, COLORS, FONT_STACK };
