/**
 * Shared email template for all CapturePilot emails.
 * Matches the website brand: dark stone-950 header with grid pattern,
 * light body with subtle emerald dots, dark stone-900 footer with legal info.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
const SITE_URL = "https://www.capturepilot.com";

// Logo URLs (hosted on the public website)
const LOGO_WHITE = `${SITE_URL}/cp-icon-white.png`;
const LOGO_WORDMARK = `${SITE_URL}/logo.png`;

// Brand palette (matches website exactly)
const COLORS = {
    black: "#0c0a09",      // stone-950
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
    emerald600: "#059669",
    emerald500: "#10b981",
    emerald400: "#34d399",
    emerald300: "#6ee7b7",
    emerald50: "#ecfdf5",
    emerald200: "#a7f3d0",
    sky500: "#0ea5e9",
};

const FONT_STACK =
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// SVG data URI for the subtle dot pattern (emerald at 4% opacity on white)
const DOTS_BG = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='1' fill='%23059669' fill-opacity='0.06'/></svg>")`;

// SVG data URI for grid pattern (white at 4% opacity on dark)
const GRID_BG = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><path d='M40 0H0V40' fill='none' stroke='%23ffffff' stroke-opacity='0.04'/></svg>")`;

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
     * Email category — controls footer preferences/unsubscribe text.
     * - "transactional": company updates, no unsubscribe link (Manage preferences only)
     * - "marketing": CAN-SPAM regulated, full unsubscribe link required
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
        ? `<div style="display:inline-block;background:${COLORS.emerald50};border:1px solid ${COLORS.emerald200};color:${COLORS.emerald600};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;padding:4px 12px;border-radius:999px;margin-bottom:16px;">${eyebrow}</div>`
        : "";

    const ctaHtml = cta
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px auto 0;">
            <tr><td align="center" style="border-radius:10px;background:${COLORS.emerald600};background:linear-gradient(135deg,${COLORS.emerald600} 0%,${COLORS.emerald500} 100%);box-shadow:0 8px 24px rgba(5,150,105,0.24);">
                <a href="${cta.url}" style="display:inline-block;padding:15px 36px;color:${COLORS.white};text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px;border-radius:10px;">${cta.label} &rarr;</a>
            </td></tr>
           </table>`
        : "";

    const secondaryCtaHtml = secondaryCta
        ? `<div style="text-align:center;margin:16px 0 0;">
            <a href="${secondaryCta.url}" style="color:${COLORS.emerald600};font-size:13px;font-weight:600;text-decoration:underline;">${secondaryCta.label}</a>
           </div>`
        : "";

    // Footer preference/unsubscribe — legal compliance
    // Transactional emails: "Manage email preferences" only (company updates)
    // Marketing emails: Full "Unsubscribe" link (CAN-SPAM requirement)
    const preferencesLink = category === "marketing"
        ? `<a href="${APP_URL}/settings/notifications?unsubscribe=1" style="color:${COLORS.stone400};text-decoration:underline;">Unsubscribe</a>`
        : `<a href="${APP_URL}/settings/notifications" style="color:${COLORS.stone400};text-decoration:underline;">Manage email preferences</a>`;

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
    .cp-pad { padding: 28px 20px !important; }
    .cp-header-pad { padding: 20px 20px !important; }
    .cp-footer-cols { display: block !important; width: 100% !important; }
    .cp-footer-col { display: block !important; width: 100% !important; padding: 0 0 20px !important; }
    h1.cp-heading { font-size: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.stone100};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.stone100};">
<tr><td align="center" style="padding:24px 12px;">

<table role="presentation" class="cp-container" width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background:${COLORS.white};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(12,10,9,0.06);">

<!-- Thin emerald gradient accent bar -->
<tr><td style="height:3px;background:linear-gradient(90deg,${COLORS.emerald600} 0%,${COLORS.emerald400} 50%,${COLORS.sky500} 100%);line-height:3px;font-size:0;">&nbsp;</td></tr>

<!-- Dark header with grid pattern -->
<tr>
<td class="cp-header-pad" style="background:${COLORS.black};background-image:${GRID_BG};background-repeat:repeat;padding:28px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="vertical-align:middle;">
    <img src="${LOGO_WHITE}" alt="CapturePilot" width="28" height="28" style="display:inline-block;vertical-align:middle;border:0;outline:none;" />
    <span style="display:inline-block;vertical-align:middle;margin-left:10px;color:${COLORS.white};font-size:17px;font-weight:800;letter-spacing:-0.3px;">CapturePilot</span>
</td>
<td align="right" style="vertical-align:middle;">
    <span style="color:${COLORS.stone400};font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Capture Intelligence</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- Body with subtle dots background -->
<tr>
<td class="cp-pad" style="background:${COLORS.white};background-image:${DOTS_BG};background-repeat:repeat;padding:44px 40px;">

${eyebrowHtml}

<h1 class="cp-heading" style="font-size:28px;font-weight:800;color:${COLORS.black};margin:0 0 24px;line-height:1.25;letter-spacing:-0.5px;">${heading}</h1>

${body}

${ctaHtml}
${secondaryCtaHtml}

</td>
</tr>

${footerNote ? `<tr><td style="background:${COLORS.stone50};padding:20px 40px;border-top:1px solid ${COLORS.stone200};"><p style="color:${COLORS.stone600};font-size:13px;margin:0;line-height:1.6;">${footerNote}</p></td></tr>` : ""}

<!-- Dark footer with grid pattern + legal info -->
<tr>
<td style="background:${COLORS.stone900};background-image:${GRID_BG};background-repeat:repeat;padding:36px 40px 28px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr class="cp-footer-cols">

<!-- Column 1: Brand -->
<td class="cp-footer-col" width="40%" style="vertical-align:top;padding-right:16px;">
    <img src="${LOGO_WHITE}" alt="CapturePilot" width="24" height="24" style="display:inline-block;vertical-align:middle;border:0;" />
    <span style="display:inline-block;vertical-align:middle;margin-left:8px;color:${COLORS.white};font-size:15px;font-weight:800;">CapturePilot</span>
    <p style="color:${COLORS.stone400};font-size:12px;line-height:1.6;margin:12px 0 0;">Strategic capture intelligence for federal contractors.</p>
    <p style="margin:14px 0 0;">
        <a href="https://www.linkedin.com/company/capturepilot" style="display:inline-block;color:${COLORS.stone400};font-size:11px;text-decoration:none;">
            <span style="display:inline-block;width:22px;height:22px;background:${COLORS.stone800};border-radius:4px;text-align:center;line-height:22px;color:${COLORS.stone300};font-weight:700;font-size:11px;">in</span>
        </a>
    </p>
</td>

<!-- Column 2: Product -->
<td class="cp-footer-col" width="30%" style="vertical-align:top;padding-right:16px;">
    <p style="color:${COLORS.stone300};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 10px;">Product</p>
    <p style="margin:0;line-height:1.9;">
        <a href="${SITE_URL}/pricing" style="color:${COLORS.stone400};font-size:12px;text-decoration:none;">Pricing</a><br>
        <a href="${SITE_URL}/check" style="color:${COLORS.stone400};font-size:12px;text-decoration:none;">Quick Check</a><br>
        <a href="${SITE_URL}/blog" style="color:${COLORS.stone400};font-size:12px;text-decoration:none;">Blog</a><br>
        <a href="${APP_URL}/dashboard" style="color:${COLORS.stone400};font-size:12px;text-decoration:none;">Dashboard</a>
    </p>
</td>

<!-- Column 3: Company -->
<td class="cp-footer-col" width="30%" style="vertical-align:top;">
    <p style="color:${COLORS.stone300};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 10px;">Company</p>
    <p style="margin:0;line-height:1.9;">
        <a href="${SITE_URL}/about" style="color:${COLORS.stone400};font-size:12px;text-decoration:none;">About</a><br>
        <a href="${SITE_URL}/contact" style="color:${COLORS.stone400};font-size:12px;text-decoration:none;">Contact</a><br>
        <a href="${SITE_URL}/privacy" style="color:${COLORS.stone400};font-size:12px;text-decoration:none;">Privacy</a><br>
        <a href="${SITE_URL}/terms" style="color:${COLORS.stone400};font-size:12px;text-decoration:none;">Terms</a>
    </p>
</td>

</tr>
</table>

<!-- Legal bottom strip -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.stone800};margin-top:28px;">
<tr><td style="padding-top:18px;">
    <p style="color:${COLORS.stone500};font-size:11px;margin:0 0 6px;line-height:1.6;">
        ${preferencesLink}
        &nbsp;&middot;&nbsp;
        <a href="${SITE_URL}" style="color:${COLORS.stone400};text-decoration:underline;">capturepilot.com</a>
        &nbsp;&middot;&nbsp;
        <span style="color:${COLORS.stone500};">A product by <a href="${SITE_URL}/about" style="color:${COLORS.stone400};text-decoration:underline;">Americurial LLC</a></span>
    </p>
    <p style="color:${COLORS.stone500};font-size:11px;margin:0 0 4px;line-height:1.6;">
        <a href="mailto:info@americurial.com" style="color:${COLORS.stone400};text-decoration:none;">info@americurial.com</a>
        &nbsp;&middot;&nbsp;
        <a href="tel:+18503769785" style="color:${COLORS.stone400};text-decoration:none;">+1 (850) 376-9785</a>
        &nbsp;&middot;&nbsp;
        <span style="color:${COLORS.stone500};">Phoenix, Arizona Headquarters</span>
    </p>
    <p style="color:${COLORS.stone600};font-size:10px;margin:0 0 4px;line-height:1.5;font-family:${FONT_STACK};">
        CAGE: 17T63 &nbsp;&middot;&nbsp; UEI: CVJ8CD2MFXD8
    </p>
    <p style="color:${COLORS.stone600};font-size:10px;margin:0;line-height:1.5;">
        &copy; 2026 Americurial LLC. All Rights Reserved.
    </p>
</td></tr>
</table>

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

export function contentCard(innerHtml: string): string {
    return `<div style="background:${COLORS.stone50};border-radius:14px;padding:22px;margin:20px 0;border:1px solid ${COLORS.stone200};">${innerHtml}</div>`;
}

export function featureBox(innerHtml: string): string {
    return `<div style="background:${COLORS.emerald50};border:1px solid ${COLORS.emerald200};border-radius:14px;padding:22px;margin:20px 0;">${innerHtml}</div>`;
}

export function alertBox(innerHtml: string): string {
    return `<div style="background:#fefce8;border:1px solid #fde68a;border-radius:14px;padding:22px;margin:20px 0;">${innerHtml}</div>`;
}

export function urgentBox(innerHtml: string): string {
    return `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:22px;margin:20px 0;">${innerHtml}</div>`;
}

export function infoBox(innerHtml: string): string {
    return `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:14px;padding:22px;margin:20px 0;">${innerHtml}</div>`;
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
    return `<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;background:${bg};color:${color};">${score}%</span>`;
}

/** Numbered section block — like the blog callouts */
export function numberedSection(num: number, title: string, body: string): string {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
        <tr>
            <td width="40" style="vertical-align:top;padding-right:14px;">
                <div style="width:32px;height:32px;background:${COLORS.emerald50};border:1px solid ${COLORS.emerald200};border-radius:8px;text-align:center;line-height:30px;color:${COLORS.emerald600};font-weight:800;font-size:14px;">${num}</div>
            </td>
            <td style="vertical-align:top;">
                <h3 style="font-size:16px;font-weight:700;color:${COLORS.black};margin:4px 0 6px;line-height:1.3;">${title}</h3>
                <p style="color:${COLORS.stone600};font-size:14px;line-height:1.6;margin:0;">${body}</p>
            </td>
        </tr>
    </table>`;
}

/** "Read the full guide" link card — for educational emails */
export function articleCta(title: string, url: string, readTime?: string): string {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
        <tr><td style="background:${COLORS.stone900};border-radius:14px;padding:22px;">
            <p style="color:${COLORS.emerald400};font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:0 0 8px;">Full Guide${readTime ? ` &middot; ${readTime}` : ""}</p>
            <p style="color:${COLORS.white};font-size:16px;font-weight:700;margin:0 0 14px;line-height:1.3;">${title}</p>
            <a href="${url}" style="display:inline-block;color:${COLORS.emerald400};font-size:13px;font-weight:700;text-decoration:none;">Read on capturepilot.com &rarr;</a>
        </td></tr>
    </table>`;
}

export { APP_URL, SITE_URL, COLORS, FONT_STACK };
