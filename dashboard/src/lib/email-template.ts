/**
 * Shared email template for all CapturePilot emails.
 *
 * Minimal, business-print style matching the website's clean feel:
 * - Light / white background (no dark sections — better for all clients, dark mode, print)
 * - Thin emerald accent bar at top
 * - Text-only wordmark header (no external images)
 * - Emerald-500 solid pill CTA matching website buttons
 * - Minimal footer: legal info + one preferences link (low spam-trigger surface)
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
const SITE_URL = "https://www.capturepilot.com";

// Brand palette (matches website exactly)
const COLORS = {
    black: "#0c0a09",
    stone900: "#1c1917",
    stone800: "#292524",
    stone700: "#44403c",
    stone600: "#57534e",
    stone500: "#78716c",
    stone400: "#a8a29e",
    stone300: "#d6d3d1",
    stone200: "#e7e5e4",
    stone100: "#f5f5f4",
    stone50: "#fafaf9",
    white: "#ffffff",
    emerald700: "#047857",
    emerald600: "#059669",
    emerald500: "#10b981",
    emerald400: "#34d399",
    emerald50: "#ecfdf5",
    emerald200: "#a7f3d0",
};

const FONT_STACK =
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

interface EmailTemplateOptions {
    /** Hidden preheader text shown in inbox preview */
    preheader?: string;
    /** Main heading */
    heading: string;
    /** Optional small eyebrow badge above heading (e.g. "Federal Readiness") */
    eyebrow?: string;
    /** HTML body content */
    body: string;
    /** Primary CTA button */
    cta?: { label: string; url: string };
    /** Secondary CTA — smaller link below primary */
    secondaryCta?: { label: string; url: string };
    /** Footer note above the standard footer */
    footerNote?: string;
    /**
     * Email category — drives footer preferences/unsubscribe text.
     * - "transactional": company updates, "Manage email preferences" only
     * - "marketing": commercial, CAN-SPAM unsubscribe link
     */
    category?: "transactional" | "marketing";
}

export function emailTemplate(options: EmailTemplateOptions): string {
    const {
        preheader,
        heading,
        eyebrow,
        body,
        cta,
        secondaryCta,
        footerNote,
        category = "transactional",
    } = options;

    const preheaderHtml = preheader
        ? `<div style="display:none;font-size:1px;color:${COLORS.stone50};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}${"&zwnj;&nbsp;".repeat(40)}</div>`
        : "";

    const eyebrowHtml = eyebrow
        ? `<p style="margin:0 0 14px;color:${COLORS.emerald600};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">${eyebrow}</p>`
        : "";

    const ctaHtml = cta
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 0;">
            <tr><td style="border-radius:999px;background-color:${COLORS.emerald500};">
                <a href="${cta.url}" style="display:inline-block;padding:14px 32px;color:${COLORS.white};text-decoration:none;font-weight:700;font-size:15px;border-radius:999px;">${cta.label}</a>
            </td></tr>
           </table>`
        : "";

    const secondaryCtaHtml = secondaryCta
        ? `<p style="margin:14px 0 0;"><a href="${secondaryCta.url}" style="color:${COLORS.stone500};font-size:13px;text-decoration:underline;">${secondaryCta.label}</a></p>`
        : "";

    const preferencesLink = category === "marketing"
        ? `<a href="${APP_URL}/settings/notifications?unsubscribe=1" style="color:${COLORS.stone500};text-decoration:underline;">Unsubscribe</a>`
        : `<a href="${APP_URL}/settings/notifications" style="color:${COLORS.stone500};text-decoration:underline;">Manage email preferences</a>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${heading}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  @media only screen and (max-width: 620px) {
    .cp-container { width: 100% !important; }
    .cp-pad { padding: 32px 24px !important; }
    h1.cp-heading { font-size: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.stone50};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.stone50};">
<tr><td align="center" style="padding:32px 12px;">

<table role="presentation" class="cp-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${COLORS.white};border-radius:12px;overflow:hidden;border:1px solid ${COLORS.stone200};">

<!-- Thin emerald accent bar -->
<tr><td style="height:3px;background-color:${COLORS.emerald500};line-height:3px;font-size:0;">&nbsp;</td></tr>

<!-- Light header with logo -->
<tr>
<td class="cp-pad" style="background-color:${COLORS.white};padding:28px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="vertical-align:middle;">
    <a href="${SITE_URL}" style="text-decoration:none;color:${COLORS.black};">
        <img src="${SITE_URL}/logo.png" alt="CapturePilot" height="32" style="display:inline-block;vertical-align:middle;border:0;outline:none;max-height:32px;width:auto;" />
    </a>
</td>
<td align="right" style="vertical-align:middle;">
    <span style="color:${COLORS.stone400};font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Capture Intelligence</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- Body -->
<tr>
<td class="cp-pad" style="background-color:${COLORS.white};padding:32px 40px 40px;">

${eyebrowHtml}

<h1 class="cp-heading" style="font-size:26px;font-weight:800;color:${COLORS.black};margin:0 0 20px;line-height:1.3;letter-spacing:-0.5px;">${heading}</h1>

${body}

${ctaHtml}
${secondaryCtaHtml}

</td>
</tr>

${footerNote ? `<tr><td style="background-color:${COLORS.stone50};padding:18px 40px;border-top:1px solid ${COLORS.stone200};"><p style="color:${COLORS.stone600};font-size:13px;margin:0;line-height:1.6;">${footerNote}</p></td></tr>` : ""}

<!-- Minimal centered footer -->
<tr>
<td align="center" style="background-color:${COLORS.white};padding:24px 40px 28px;border-top:1px solid ${COLORS.stone100};text-align:center;">
    <p style="color:${COLORS.stone600};font-size:12px;margin:0 0 4px;line-height:1.5;font-weight:700;text-align:center;">
        CapturePilot &middot; A product by Americurial LLC
    </p>
    <p style="color:${COLORS.stone500};font-size:11px;margin:0 0 8px;line-height:1.6;text-align:center;">
        Phoenix, Arizona &middot; info@americurial.com &middot; +1 (850) 376-9785
    </p>
    <p style="color:${COLORS.stone400};font-size:11px;margin:0;line-height:1.6;text-align:center;">
        &copy; 2026 Americurial LLC &middot; ${preferencesLink}
    </p>
</td>
</tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

// ─── Reusable content helpers ────────────────────────────────────────

export function contentCard(innerHtml: string): string {
    return `<div style="background-color:${COLORS.stone50};border-radius:10px;padding:20px;margin:18px 0;border:1px solid ${COLORS.stone200};">${innerHtml}</div>`;
}

export function featureBox(innerHtml: string): string {
    return `<div style="background-color:${COLORS.emerald50};border:1px solid ${COLORS.emerald200};border-radius:10px;padding:20px;margin:18px 0;">${innerHtml}</div>`;
}

export function alertBox(innerHtml: string): string {
    return `<div style="background-color:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:20px;margin:18px 0;">${innerHtml}</div>`;
}

export function urgentBox(innerHtml: string): string {
    return `<div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;margin:18px 0;">${innerHtml}</div>`;
}

export function infoBox(innerHtml: string): string {
    return `<div style="background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:20px;margin:18px 0;">${innerHtml}</div>`;
}

export function paragraph(text: string): string {
    return `<p style="color:${COLORS.stone700};line-height:1.7;font-size:15px;margin:0 0 16px;">${text}</p>`;
}

export function sectionLabel(text: string): string {
    return `<p style="font-size:11px;color:${COLORS.emerald600};margin:0 0 10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">${text}</p>`;
}

export function scoreBadge(score: number): string {
    const bg = score >= 70 ? "#dcfce7" : score >= 50 ? "#fef9c3" : "#dbeafe";
    const color = score >= 70 ? "#166534" : score >= 50 ? "#854d0e" : "#1e40af";
    return `<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;background-color:${bg};color:${color};">${score}%</span>`;
}

/** Numbered section block — for educational "how-to" emails */
export function numberedSection(num: number, title: string, body: string): string {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
        <tr>
            <td width="36" style="vertical-align:top;padding-right:14px;">
                <div style="width:28px;height:28px;background-color:${COLORS.emerald50};border:1px solid ${COLORS.emerald200};border-radius:6px;text-align:center;line-height:26px;color:${COLORS.emerald600};font-weight:800;font-size:13px;">${num}</div>
            </td>
            <td style="vertical-align:top;">
                <h3 style="font-size:15px;font-weight:700;color:${COLORS.black};margin:4px 0 4px;line-height:1.3;">${title}</h3>
                <p style="color:${COLORS.stone600};font-size:14px;line-height:1.6;margin:0;">${body}</p>
            </td>
        </tr>
    </table>`;
}

/** Minimal inline article link — replaces the heavy dark "articleCta" card */
export function articleCta(title: string, url: string, readTime?: string): string {
    return `<p style="margin:24px 0 0;padding:14px 0 0;border-top:1px solid ${COLORS.stone200};">
        <span style="display:block;color:${COLORS.stone400};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:4px;">Read the full guide${readTime ? ` &middot; ${readTime}` : ""}</span>
        <a href="${url}" style="color:${COLORS.emerald600};font-size:14px;font-weight:700;text-decoration:none;">${title} &rarr;</a>
    </p>`;
}

export { APP_URL, SITE_URL, COLORS, FONT_STACK };
