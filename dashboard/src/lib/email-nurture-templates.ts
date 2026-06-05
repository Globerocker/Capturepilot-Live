/**
 * 90-day Facebook-lead nurture sequence — 12 emails.
 *
 * Cadence: 70% value, 30% conversion. Sends on day 0, 3, 8, 15, 22, 30, 38,
 * 45, 55, 65, 75, 90 from the lead's marketing_leads.created_at. The cron
 * scheduler picks the right template based on day offset (wire-up is in
 * /api/cron/nurture_sequence — separate from this file).
 *
 * Each template here returns { subject, html } and serves as the DB fallback
 * when /api/admin/email-templates/:key is opened with no saved row yet. Once
 * the admin edits + saves, the DB row wins and these defaults stay frozen.
 *
 * Design: inline-CSS, 600px max, table-based (Outlook-safe). Hero SVGs are
 * inline so Gmail/Apple Mail/iOS render them; Outlook desktop strips SVG but
 * the rest of the email still works.
 *
 * Brand palette:
 *   ink    #0c0a09  (near-black, headlines + CP monogram)
 *   stone  #44403c  (body copy)
 *   muted  #78716c  (captions, footer)
 *   bg     #fafaf9  (page background)
 *   card   #ffffff  (content card)
 *   accent #059669  (emerald — primary CTA + positive)
 *   warn   #d97706  (amber — soft alert)
 */

const COLORS = {
    ink: "#0c0a09",
    stone: "#44403c",
    muted: "#78716c",
    bg: "#fafaf9",
    card: "#ffffff",
    accent: "#059669",
    accentDark: "#047857",
    warn: "#d97706",
    border: "#e7e5e4",
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/**
 * v2 base wrapper (Phase 24 redesign).
 *
 * Big behavior changes from v1:
 *   1. Forces light-mode rendering everywhere via color-scheme metas +
 *      explicit white backgrounds. Spark/Apple Mail/Gmail were auto-darkening
 *      v1 and turning the cream `#fafaf9` outer wash into murky brown
 *      ("looks totally shit on dark" — user feedback).
 *   2. Adds an optional `topAction` block — a coloured callout BETWEEN the
 *      hero and the headline so readers see something to do the moment they
 *      open the email (instead of needing to scroll to the bottom CTA).
 *   3. Signature block at the end with a stylised "CP" monogram + cursive
 *      "André" mark + role line. Until a real headshot lands in the website
 *      `/public` folder it's a vector signature; swap to <img> when ready.
 *
 * Still inline-everything. Tables for Outlook. SVG heroes are pre-baked by
 * each template above.
 */
function wrap(args: {
    preheader: string;
    heroSvg?: string;
    topAction?: { label: string; url: string; note?: string };  // early CTA box
    body: string;
    ctaText?: string;
    ctaUrl?: string;
    ctaSecondary?: string;
    ctaSecondaryUrl?: string;
    isMarketing: boolean;
}): string {
    const { preheader, heroSvg, topAction, body, ctaText, ctaUrl, ctaSecondary, ctaSecondaryUrl, isMarketing } = args;

    const topActionBlock = topAction ? `
      <tr><td style="padding:20px 28px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#ecfdf5;border-left:4px solid ${COLORS.accent};border-radius:6px;">
          <tr><td style="padding:14px 16px;font-size:14px;line-height:1.5;color:${COLORS.ink};">
            <span style="font-weight:700;color:${COLORS.accentDark};">👉 Today's action:</span>
            ${topAction.note ? `<span style="color:${COLORS.stone};"> ${topAction.note} </span>` : " "}
            <a href="${topAction.url}" style="color:${COLORS.accentDark};font-weight:700;text-decoration:underline;">${topAction.label} →</a>
          </td></tr>
        </table>
      </td></tr>
    ` : "";

    const cta = ctaText && ctaUrl ? `
        <tr><td align="center" style="padding:24px 0 8px;">
          <a href="${ctaUrl}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.01em;mso-padding-alt:0;">${ctaText}</a>
        </td></tr>
        ${ctaSecondary && ctaSecondaryUrl ? `<tr><td align="center" style="padding:0 0 16px;font-size:13px;"><a href="${ctaSecondaryUrl}" style="color:${COLORS.muted};text-decoration:underline;">${ctaSecondary}</a></td></tr>` : ""}
    ` : "";

    const footerUnsub = isMarketing
        ? `<a href="{{unsubscribe_url}}" style="color:${COLORS.muted};text-decoration:underline;">Unsubscribe</a> · `
        : "";

    // Signature block — real headshot (256×256 JPEG, ~12 KB, hosted at
    // www.capturepilot.com/team/andre-headshot.jpg) paired with the actual
    // ink-signature SVG (200px wide, scales crisp at any DPI). The ASCII
    // duplicate A.Schueler.svg is used instead of the umlaut filename to
    // avoid URL-encoding quirks in older email clients.
    const signature = `
      <tr><td style="padding:12px 28px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          <td style="vertical-align:middle;padding-right:14px;">
            <img src="https://www.capturepilot.com/team/andre-headshot.jpg" alt="André Schüler" width="56" height="56" style="display:block;border:0;border-radius:28px;object-fit:cover;">
          </td>
          <td style="vertical-align:middle;">
            <img src="https://www.capturepilot.com/A.Schueler.svg" alt="André Schüler" width="180" height="auto" style="display:block;border:0;max-width:180px;height:auto;">
            <div style="font-size:12px;color:${COLORS.muted};margin-top:2px;">Founder · CapturePilot</div>
          </td>
        </tr></table>
      </td></tr>
    `;

    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>CapturePilot</title>
<style>
  /* Force light mode in every client that respects it. Tells Gmail / Apple
     Mail / Outlook to skip the auto-dark transform that was turning the
     light card outline mud-brown. */
  :root { color-scheme: light only; supported-color-schemes: light only; }
  /* Override iOS auto-darkening of large solid blocks. */
  @media (prefers-color-scheme: dark) {
    body, .cp-bg { background:#ffffff !important; color:${COLORS.stone} !important; }
    .cp-card { background:#ffffff !important; }
  }
  /* Outlook-specific reset — gets ignored by everyone else. */
  table { border-collapse:collapse !important; }
  a { color: ${COLORS.accentDark}; }
</style>
</head><body class="cp-bg" style="margin:0;padding:0;background:#ffffff;font-family:${FONT};color:${COLORS.stone};-webkit-font-smoothing:antialiased;">
<!-- preheader hidden text -->
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#ffffff;">${preheader}</div>

<table class="cp-bg" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;padding:24px 12px;">
  <tr><td align="center">
    <table class="cp-card" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${COLORS.border};">

      <!-- header: real CapturePilot brand mark + wordmark -->
      <tr><td style="padding:18px 28px;border-bottom:1px solid ${COLORS.border};">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          <td style="vertical-align:middle;padding-right:10px;">
            <img src="https://www.capturepilot.com/cp-icon-black.png" alt="CapturePilot" width="36" height="36" style="display:block;border:0;border-radius:6px;">
          </td>
          <td style="vertical-align:middle;font-size:16px;font-weight:700;color:${COLORS.ink};letter-spacing:-0.01em;">CapturePilot</td>
        </tr></table>
      </td></tr>

      ${heroSvg ? `<tr><td style="padding:0;background:#f5f5f4;text-align:center;">${heroSvg}</td></tr>` : ""}

      ${topActionBlock}

      <!-- body -->
      <tr><td style="padding:24px 28px 8px;font-size:15px;line-height:1.6;color:${COLORS.stone};">
        ${body}
      </td></tr>

      <!-- CTA -->
      ${cta}

      <!-- signature -->
      ${signature}

      <!-- footer -->
      <tr><td style="padding:20px 28px;background:#ffffff;border-top:1px solid ${COLORS.border};font-size:12px;color:${COLORS.muted};text-align:center;line-height:1.6;">
        Federal-contracting intelligence for small businesses<br>
        <a href="https://www.capturepilot.com" style="color:${COLORS.muted};">capturepilot.com</a> · <a href="https://www.capturepilot.com/blog" style="color:${COLORS.muted};">Blog</a> · <a href="https://www.capturepilot.com/resources" style="color:${COLORS.muted};">Resources</a><br><br>
        ${footerUnsub}<a href="mailto:hello@capturepilot.com" style="color:${COLORS.muted};">Reply with feedback</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero SVGs — one per email, reused across the file.
// ─────────────────────────────────────────────────────────────────────────────

const HERO_WELCOME = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;">
  <defs><linearGradient id="g1" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#0c0a09"/><stop offset="1" stop-color="#44403c"/></linearGradient></defs>
  <rect width="600" height="180" fill="url(#g1)"/>
  <g fill="#059669" opacity="0.15"><circle cx="80" cy="40" r="60"/><circle cx="520" cy="140" r="80"/></g>
  <text x="300" y="80" text-anchor="middle" fill="#fff" font-family="-apple-system,sans-serif" font-size="32" font-weight="800" letter-spacing="-0.02em">Welcome aboard.</text>
  <text x="300" y="110" text-anchor="middle" fill="#a8a29e" font-family="-apple-system,sans-serif" font-size="14" font-weight="500">Federal contracting · without the maze</text>
  <g stroke="#059669" stroke-width="2" fill="none"><path d="M270 140 L290 155 L330 125"/></g>
</svg>`;

const HERO_OPP_ANATOMY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;background:#f5f5f4;">
  <rect x="40" y="20" width="520" height="140" fill="#fff" stroke="#e7e5e4" rx="6"/>
  <text x="60" y="48" fill="#0c0a09" font-family="-apple-system,sans-serif" font-size="13" font-weight="700">Janitorial Services — Andrews AFB</text>
  <rect x="60" y="58" width="80" height="16" fill="#059669"/><text x="100" y="70" text-anchor="middle" fill="#fff" font-size="10" font-weight="700">NAICS 561720</text>
  <rect x="148" y="58" width="60" height="16" fill="#d97706"/><text x="178" y="70" text-anchor="middle" fill="#fff" font-size="10" font-weight="700">SDVOSB</text>
  <text x="60" y="100" fill="#44403c" font-size="11">Sources Sought · Due Oct 15 · $1.4M est.</text>
  <line x1="280" y1="92" x2="510" y2="92" stroke="#dc2626" stroke-width="2"/>
  <circle cx="510" cy="92" r="3" fill="#dc2626"/>
  <text x="395" y="86" text-anchor="middle" fill="#dc2626" font-size="10" font-weight="700">DEADLINE</text>
  <g><circle cx="70" cy="130" r="6" fill="#059669"/><text x="84" y="134" fill="#44403c" font-size="11">Set-aside flag</text></g>
  <g><circle cx="220" cy="130" r="6" fill="#059669"/><text x="234" y="134" fill="#44403c" font-size="11">Notice type</text></g>
  <g><circle cx="360" cy="130" r="6" fill="#059669"/><text x="374" y="134" fill="#44403c" font-size="11">Dollar range</text></g>
</svg>`;

const HERO_NAICS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;background:#f5f5f4;">
  <g font-family="-apple-system,sans-serif">
    ${[
      { x: 100, y: 50, code: "561720", label: "Janitorial", hot: true },
      { x: 250, y: 50, code: "541330", label: "Engineering", hot: false },
      { x: 400, y: 50, code: "237310", label: "Highway Constr.", hot: true },
      { x: 100, y: 110, code: "562910", label: "Remediation", hot: true },
      { x: 250, y: 110, code: "541611", label: "Mgmt Consult.", hot: false },
      { x: 400, y: 110, code: "236220", label: "Commercial Bldg", hot: false },
    ].map(c => `
      <g>
        <rect x="${c.x-50}" y="${c.y-22}" width="120" height="44" rx="6" fill="${c.hot ? "#059669" : "#fff"}" stroke="#e7e5e4"/>
        <text x="${c.x+10}" y="${c.y-4}" text-anchor="middle" font-size="13" font-weight="800" fill="${c.hot ? "#fff" : "#0c0a09"}">${c.code}</text>
        <text x="${c.x+10}" y="${c.y+12}" text-anchor="middle" font-size="10" fill="${c.hot ? "#d1fae5" : "#78716c"}">${c.label}</text>
      </g>
    `).join("")}
  </g>
  <text x="300" y="170" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="10" fill="#78716c">Green = high small-business spend</text>
</svg>`;

// Past-performance compounding chart — 3 yearly groups, each with 4 bars
// and a centered label sitting ABOVE the tallest bar (NOT overlapping the
// next group's bars like v1 did). Layout: 600w × 180h SVG, three 160-px
// columns with 30px gap, baseline at y=140, labels at y=22.
const HERO_PAST_PERF = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;background:#f5f5f4;">
  <g font-family="-apple-system,sans-serif">
    <!-- baseline -->
    <line x1="40" y1="140" x2="560" y2="140" stroke="#d6d3d1" stroke-width="1"/>

    <!-- Year 1 group (x=60-180), light grey -->
    <text x="120" y="22" text-anchor="middle" font-size="12" font-weight="700" fill="#0c0a09">Year 1 · bootstrap</text>
    ${[18, 26, 32, 40].map((h, i) => `<rect x="${66 + i*22}" y="${140-h}" width="14" height="${h}" rx="2" fill="#a8a29e"/>`).join("")}

    <!-- Year 2 group (x=220-340), dark grey -->
    <text x="280" y="22" text-anchor="middle" font-size="12" font-weight="700" fill="#0c0a09">Year 2 · subs</text>
    ${[44, 56, 64, 72].map((h, i) => `<rect x="${226 + i*22}" y="${140-h}" width="14" height="${h}" rx="2" fill="#44403c"/>`).join("")}

    <!-- Year 3 group (x=380-500), emerald -->
    <text x="440" y="22" text-anchor="middle" font-size="12" font-weight="700" fill="#0c0a09">Year 3 · prime</text>
    ${[88, 100, 112, 120].map((h, i) => `<rect x="${386 + i*22}" y="${140-h}" width="14" height="${h}" rx="2" fill="#059669"/>`).join("")}

    <!-- caption -->
    <text x="300" y="165" text-anchor="middle" font-size="11" fill="#78716c">Past performance compounds — start small, win bigger</text>
  </g>
</svg>`;

const HERO_AUDIT_CALL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;background:#0c0a09;">
  <g font-family="-apple-system,sans-serif">
    <circle cx="120" cy="90" r="56" fill="none" stroke="#059669" stroke-width="2"/>
    <text x="120" y="86" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">FREE</text>
    <text x="120" y="105" text-anchor="middle" fill="#059669" font-size="20" font-weight="800">30 min</text>
    <g stroke="#059669" stroke-width="2" fill="none"><circle cx="120" cy="50" r="3"/><circle cx="120" cy="130" r="3"/><circle cx="60" cy="90" r="3"/><circle cx="180" cy="90" r="3"/></g>
    <text x="320" y="60" fill="#fff" font-size="20" font-weight="800" letter-spacing="-0.02em">B2G Audit Call</text>
    <text x="320" y="86" fill="#a8a29e" font-size="13">We review your NAICS, certs, and SAM</text>
    <text x="320" y="104" fill="#a8a29e" font-size="13">status. You leave with 3 live opps in</text>
    <text x="320" y="122" fill="#a8a29e" font-size="13">your inbox within 24 hours.</text>
  </g>
</svg>`;

const HERO_SOURCES_SOUGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;background:#f5f5f4;">
  <g font-family="-apple-system,sans-serif">
    <line x1="60" y1="100" x2="540" y2="100" stroke="#78716c" stroke-width="2"/>
    <g><circle cx="100" cy="100" r="14" fill="#059669"/><text x="100" y="78" text-anchor="middle" font-size="11" font-weight="700" fill="#059669">Sources Sought</text><text x="100" y="130" text-anchor="middle" font-size="10" fill="#78716c">Month -12</text></g>
    <g><circle cx="240" cy="100" r="10" fill="#a8a29e"/><text x="240" y="78" text-anchor="middle" font-size="11" font-weight="700" fill="#44403c">Pre-Solicit</text><text x="240" y="130" text-anchor="middle" font-size="10" fill="#78716c">Month -6</text></g>
    <g><circle cx="380" cy="100" r="10" fill="#a8a29e"/><text x="380" y="78" text-anchor="middle" font-size="11" font-weight="700" fill="#44403c">RFP/RFQ</text><text x="380" y="130" text-anchor="middle" font-size="10" fill="#78716c">Month -2</text></g>
    <g><circle cx="520" cy="100" r="10" fill="#a8a29e"/><text x="520" y="78" text-anchor="middle" font-size="11" font-weight="700" fill="#44403c">Award</text><text x="520" y="130" text-anchor="middle" font-size="10" fill="#78716c">Month 0</text></g>
    <text x="300" y="160" text-anchor="middle" font-size="11" fill="#059669" font-weight="700">Most contractors enter here ↑ — 6 to 12 months too late</text>
  </g>
</svg>`;

const HERO_CAP_STATEMENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="100%" style="display:block;max-width:600px;background:#f5f5f4;">
  <g font-family="-apple-system,sans-serif">
    <rect x="180" y="20" width="240" height="170" fill="#fff" stroke="#e7e5e4"/>
    <rect x="180" y="20" width="240" height="40" fill="#0c0a09"/>
    <text x="300" y="46" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">CAPABILITY STATEMENT</text>
    <text x="195" y="78" fill="#0c0a09" font-size="11" font-weight="700">COMPANY OVERVIEW</text>
    <line x1="195" y1="84" x2="405" y2="84" stroke="#e7e5e4"/>
    <text x="195" y="100" fill="#78716c" font-size="9">────────────────────────────────────</text>
    <text x="195" y="112" fill="#78716c" font-size="9">────────────────────────────────────</text>
    <text x="195" y="130" fill="#0c0a09" font-size="11" font-weight="700">CORE COMPETENCIES</text>
    <line x1="195" y1="136" x2="405" y2="136" stroke="#e7e5e4"/>
    <g fill="#059669">
      <rect x="195" y="146" width="50" height="14" rx="3"/><text x="220" y="156" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">561720</text>
      <rect x="252" y="146" width="50" height="14" rx="3"/><text x="277" y="156" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">562910</text>
      <rect x="309" y="146" width="50" height="14" rx="3"/><text x="334" y="156" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">541330</text>
    </g>
    <text x="195" y="180" fill="#78716c" font-size="9">UEI: ABC123 · CAGE: 1A2B3 · SAM ✓</text>
  </g>
</svg>`;

const HERO_KIT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;background:#fff7ed;">
  <g font-family="-apple-system,sans-serif">
    <rect x="60" y="40" width="180" height="120" fill="#d97706" rx="8"/>
    <text x="150" y="80" text-anchor="middle" fill="#fff" font-size="36" font-weight="800">$70</text>
    <text x="150" y="105" text-anchor="middle" fill="#fef3c7" font-size="11" font-weight="700">CAPTURE KIT</text>
    <text x="150" y="125" text-anchor="middle" fill="#fef3c7" font-size="10">One-time</text>
    <g><text x="280" y="60" fill="#0c0a09" font-size="14" font-weight="800">What's inside</text></g>
    <g fill="#44403c" font-size="12">
      <text x="280" y="84">✓ NAICS-targeted opp list (90 days)</text>
      <text x="280" y="104">✓ Capability statement template</text>
      <text x="280" y="124">✓ Past-performance bootstrap guide</text>
      <text x="280" y="144">✓ SAM.gov registration walkthrough</text>
    </g>
  </g>
</svg>`;

const HERO_FY_CLIFF = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;background:#f5f5f4;">
  <g font-family="-apple-system,sans-serif">
    <path d="M 40 140 L 240 140 L 280 60 L 540 60" stroke="#059669" stroke-width="3" fill="none"/>
    <path d="M 40 140 L 240 140 L 280 60 L 540 60 L 540 160 L 40 160 Z" fill="#059669" opacity="0.1"/>
    ${["Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"].map((m,i) => `<text x="${50 + i*40}" y="172" text-anchor="middle" font-size="10" fill="#78716c">${m}</text>`).join("")}
    <text x="290" y="50" text-anchor="middle" font-size="11" font-weight="700" fill="#059669">Aug 1 — Sept 30</text>
    <text x="290" y="40" text-anchor="middle" font-size="9" font-weight="700" fill="#059669">~30% of fed spend</text>
    <line x1="280" y1="60" x2="280" y2="140" stroke="#dc2626" stroke-width="1" stroke-dasharray="3,3"/>
  </g>
</svg>`;

const HERO_BID_LOSS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;background:#f5f5f4;">
  <g font-family="-apple-system,sans-serif">
    <text x="300" y="35" text-anchor="middle" font-size="14" font-weight="800" fill="#0c0a09">Why bids lose (federal small-biz)</text>
    ${[
      { label: "Price not justified", pct: 32 },
      { label: "Missing past performance", pct: 26 },
      { label: "Set-aside mismatch", pct: 18 },
      { label: "Incomplete compliance", pct: 14 },
      { label: "Other", pct: 10 },
    ].map((row, i) => `
      <text x="40" y="${75 + i*20}" font-size="11" fill="#44403c">${row.label}</text>
      <rect x="220" y="${66 + i*20}" width="${row.pct*7}" height="12" fill="#dc2626"/>
      <text x="${230 + row.pct*7}" y="${76 + i*20}" font-size="10" fill="#44403c" font-weight="700">${row.pct}%</text>
    `).join("")}
  </g>
</svg>`;

const HERO_PILOT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;background:#0c0a09;">
  <g font-family="-apple-system,sans-serif">
    <text x="300" y="50" text-anchor="middle" fill="#fff" font-size="22" font-weight="800" letter-spacing="-0.02em">Pilot Program</text>
    <text x="300" y="74" text-anchor="middle" fill="#a8a29e" font-size="12">90 days · done-for-you · 3 spots open</text>
    <g><circle cx="150" cy="120" r="22" fill="#059669"/><text x="150" y="125" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">1</text><text x="150" y="155" text-anchor="middle" fill="#a8a29e" font-size="10">SAM + NAICS</text></g>
    <g><circle cx="300" cy="120" r="22" fill="#059669"/><text x="300" y="125" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">2</text><text x="300" y="155" text-anchor="middle" fill="#a8a29e" font-size="10">Capture pipeline</text></g>
    <g><circle cx="450" cy="120" r="22" fill="#059669"/><text x="450" y="125" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">3</text><text x="450" y="155" text-anchor="middle" fill="#a8a29e" font-size="10">First bid submitted</text></g>
    <line x1="172" y1="120" x2="278" y2="120" stroke="#059669" stroke-width="1"/>
    <line x1="322" y1="120" x2="428" y2="120" stroke="#059669" stroke-width="1"/>
  </g>
</svg>`;

const HERO_GOODBYE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;background:#f5f5f4;">
  <g font-family="-apple-system,sans-serif">
    <text x="300" y="80" text-anchor="middle" fill="#0c0a09" font-size="22" font-weight="800" letter-spacing="-0.02em">Still curious?</text>
    <text x="300" y="110" text-anchor="middle" fill="#78716c" font-size="13">Three doors below. Pick one — or none.</text>
    <g stroke="#78716c" stroke-width="1" fill="none">
      <rect x="60" y="130" width="100" height="36" rx="6"/>
      <rect x="250" y="130" width="100" height="36" rx="6"/>
      <rect x="440" y="130" width="100" height="36" rx="6"/>
    </g>
  </g>
</svg>`;

// ─────────────────────────────────────────────────────────────────────────────
// The 12 templates.
// ─────────────────────────────────────────────────────────────────────────────

// (AUDIT_URL now defined above with the rest of the URL constants — was a
// stale /audit slug here)
// URL constants — verified against live website/app/pricing/page.tsx 2026-06-05.
// PRICING (source of truth: website/app/pricing/page.tsx, see "Sync source of
// truth" comment at the top of that file):
//   Free      $0       Quick Checker + 50 federal matches/day
//   Light     $39/mo   200 matches/day + competitors + alerts
//   Pro       $89/mo   Unlimited + SLED 48 states + AI proposals (14-day trial)
//   Consult   $2,500/mo done-for-you capture
//   Kit       $70 one-time at /startup-pack
// Nurture bodies should AVOID hard-coded $/mo prices to keep the system in
// sync with the website — link to /pricing instead. The Capture Kit price
// is OK to hard-code (concrete one-time product, rarely changes).
const KIT_URL = "https://www.capturepilot.com/startup-pack";
const PILOT_URL = "https://www.capturepilot.com/pilot";
const PRICING_URL = "https://www.capturepilot.com/pricing";
const BLOG_URL = "https://www.capturepilot.com/blog";
const AUDIT_URL = "https://meetings-na2.hubspot.com/americurial/intro-call";
const DASHBOARD_URL = "https://app.capturepilot.com/signup";
const QC_URL = "https://app.capturepilot.com/check";
const CAPSTMT_AUDIT_URL = "https://www.capturepilot.com/resources/capability-statement-website-audit";

export interface NurtureTemplate {
    subject: string;
    html: string;
}

export const NURTURE_TEMPLATES: Record<string, NurtureTemplate> = {

    // ─────────── 1-QC. Welcome (Day 0, Quick Checker variant) ───────────
    // Triggered from /api/lead-magnet/confirm when the Quick Checker form is
    // submitted. References their scan + readiness score (passed via merge
    // tags) instead of the Field Manual PDF the fb_nurture welcome assumes.
    nurture_01_qc_welcome: {
        subject: "Your Quick Check is in — claim your 50 free daily matches",
        html: wrap({
            preheader: "You scanned. Here's how to turn the result into actual contracts — starting today, free.",
            heroSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width="100%" style="display:block;max-width:600px;background:#f5f5f4;">
              <defs><linearGradient id="qcg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#0c0a09"/><stop offset="1" stop-color="#047857"/></linearGradient></defs>
              <rect width="600" height="180" fill="url(#qcg)"/>
              <g fill="#059669" opacity="0.18"><circle cx="100" cy="50" r="55"/><circle cx="500" cy="135" r="75"/></g>
              <text x="300" y="74" text-anchor="middle" fill="#ffffff" font-family="-apple-system,sans-serif" font-size="30" font-weight="800" letter-spacing="-0.02em">Scan complete.</text>
              <text x="300" y="104" text-anchor="middle" fill="#a8a29e" font-family="-apple-system,sans-serif" font-size="14" font-weight="500">Now the part most people skip.</text>
              <g stroke="#059669" stroke-width="2.5" fill="none"><path d="M260 138 L290 156 L340 118"/></g>
            </svg>`,
            topAction: {
                label: "Claim your free dashboard",
                url: DASHBOARD_URL,
                note: "Get 50 federal opportunity matches in your inbox every morning, free forever. No card.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:24px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">Hey {{first_name}} — your scan worked.</h1>
                <p style="margin:0 0 14px;">Quick Checker is a snapshot. The actual game is what you do in the next 7 days. Three things, ranked by impact:</p>
                <ol style="margin:0 0 16px 18px;padding:0;font-size:15px;">
                  <li style="margin-bottom:10px;"><strong>Get the daily match feed (free).</strong> The Quick Checker showed you 5 opps. The free dashboard sends you 50/day matched against your NAICS — every morning, no SAM.gov gymnastics. <a href="${DASHBOARD_URL}" style="color:${COLORS.accentDark};font-weight:700;">Activate the free feed →</a></li>
                  <li style="margin-bottom:10px;"><strong>Read the matches like a contracting officer would.</strong> Most owners scan the title and move on. The win is in the 5 fields the officer looks at — covered in the next email (Day 3).</li>
                  <li><strong>Pick ONE certification to chase this quarter.</strong> If 8(a) / WOSB / HUBZone / SDVOSB showed up in the scanner, that's a 10-100× increase in addressable spend. Pilot the paperwork; don't let perfect kill it. <a href="${BLOG_URL}/8a-sole-source-contracts" style="color:${COLORS.accentDark};">Read: 8(a) sole-source primer →</a></li>
                </ol>
                <p style="margin:0 0 14px;background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 14px;font-size:14px;color:${COLORS.ink};"><strong>Honest question — one sentence reply:</strong> after your Quick Check result, what's the <em>one</em> thing about federal contracting that's still confusing? I read every reply.</p>
                <p style="margin:0 0 12px;font-size:14px;color:${COLORS.muted};">P.S. Next email lands in 3 days — the 5 SAM.gov fields that actually matter (everything else is noise).</p>
            `,
            ctaText: "Get my free 50 daily matches",
            ctaUrl: DASHBOARD_URL,
            ctaSecondary: "Or read: which NAICS codes get the most federal spend",
            ctaSecondaryUrl: `${BLOG_URL}/best-naics-codes-small-business`,
            isMarketing: true,
        }),
    },

    // ─────────── 1. Welcome (Day 0) ───────────
    nurture_01_welcome: {
        subject: "Your Federal Field Manual + 50 free daily matches",
        html: wrap({
            preheader: "Here's the Field Manual you downloaded — plus a free upgrade you can claim in 60 seconds.",
            heroSvg: HERO_WELCOME,
            topAction: {
                label: "Activate your free dashboard",
                url: DASHBOARD_URL,
                note: "50 federal opportunity matches in your inbox every morning. No card. No SAM.gov gymnastics.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:24px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">Hey {{first_name}} — quick note from André.</h1>
                <p style="margin:0 0 14px;">Thanks for grabbing the <strong>Federal Field Manual</strong> (PDF should be in your inbox already — check spam if not, or reply "resend").</p>
                <p style="margin:0 0 14px;">Here's what I'd actually do with the next 60 minutes — in order of impact:</p>
                <ol style="margin:0 0 16px 18px;padding:0;font-size:15px;">
                  <li style="margin-bottom:10px;"><strong>Page 12 — pick 3 NAICS codes.</strong> Not 30. Just 3. The fewer, the sharper your matches. <a href="${BLOG_URL}/best-naics-codes-small-business" style="color:${COLORS.accentDark};">Reference: top NAICS by federal spend →</a></li>
                  <li style="margin-bottom:10px;"><strong>Page 18 — the 5-minute SAM.gov check.</strong> If you're not registered, this is the #1 thing blocking you from getting paid by the feds.</li>
                  <li><strong>Page 24 — the Sources Sought trick.</strong> Most contractors skip them. The ones who don't, win 6-12 months earlier. <a href="${BLOG_URL}/federal-contract-types-explained" style="color:${COLORS.accentDark};">Read: 8 federal contract types →</a></li>
                </ol>
                <p style="margin:0 0 14px;background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 14px;font-size:14px;color:${COLORS.ink};"><strong>One question — one sentence reply:</strong> what's the <em>one thing</em> about federal contracting that feels most confusing right now? I read every reply.</p>
                <p style="margin:0 0 12px;font-size:14px;color:${COLORS.muted};">P.S. Next email lands in 3 days — how to read a SAM.gov opportunity in 90 seconds.</p>
            `,
            ctaText: "Get my free 50 daily matches",
            ctaUrl: DASHBOARD_URL,
            ctaSecondary: "Or just keep reading — no signup needed",
            ctaSecondaryUrl: BLOG_URL,
            isMarketing: true,
        }),
    },

    // ─────────── 2. Opp anatomy (Day 3) ───────────
    nurture_02_opp_anatomy: {
        subject: "How to read a SAM opportunity in 90 seconds",
        html: wrap({
            preheader: "Opens look intimidating. They're not. Five fields tell you everything.",
            heroSvg: HERO_OPP_ANATOMY,
            topAction: {
                label: "Read: 8 federal contract types",
                url: `${BLOG_URL}/federal-contract-types-explained`,
                note: "Know which contract types fit you BEFORE you start reading opportunities — saves hours.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">SAM.gov opportunities look intimidating. They're not.</h1>
                <p style="margin:0 0 14px;">When I started, every notice felt like reading a legal brief in a foreign language. Here's the truth: there are 5 fields that matter. Everything else is noise.</p>
                <p style="margin:0 0 8px;font-weight:700;color:${COLORS.ink};">The 90-second scan:</p>
                <ol style="margin:0 0 16px 18px;padding:0;font-size:14px;">
                  <li style="margin-bottom:8px;"><strong>NAICS code</strong> — does it match yours? If no, close the tab. Save 20 minutes.</li>
                  <li style="margin-bottom:8px;"><strong>Set-aside</strong> — is it open to you? (8(a), WOSB, HUBZone, SDVOSB)</li>
                  <li style="margin-bottom:8px;"><strong>Notice type</strong> — Sources Sought = 6-18 months early, Solicitation = bid now or never. Both have value, but the strategy is opposite.</li>
                  <li style="margin-bottom:8px;"><strong>Deadline</strong> — if it's less than 5 business days out and you've never bid before, it's not for you. Move on.</li>
                  <li><strong>Dollar range</strong> — micro-purchases (under $10K) are easiest for first-time contractors. Pursue those before chasing $10M.</li>
                </ol>
                <p style="margin:0 0 14px;">If you've got 30 seconds: open <a href="https://sam.gov/opportunities" style="color:${COLORS.accent};">sam.gov/opportunities</a>, find one in your industry, and check those 5 fields. That's literally it.</p>
                <p style="margin:0;font-size:14px;color:${COLORS.muted};">— André</p>
            `,
            ctaText: "Read the 8 federal contract types",
            ctaUrl: `${BLOG_URL}/federal-contract-types-explained`,
            ctaSecondary: "Or run a Quick Check on your business",
            ctaSecondaryUrl: "https://app.capturepilot.com/check",
            isMarketing: true,
        }),
    },

    // ─────────── 3. NAICS picks (Day 8) ───────────
    nurture_03_naics_misses: {
        subject: "5 NAICS codes most contractors miss",
        html: wrap({
            preheader: "The codes you didn't pick are often the ones you'd win.",
            heroSvg: HERO_NAICS,
            topAction: {
                label: "Read: best NAICS codes for small business",
                url: `${BLOG_URL}/best-naics-codes-small-business`,
                note: "Full breakdown of the 12 highest-spend NAICS for SMBs — with annual federal $ totals per code.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">The NAICS you didn't pick.</h1>
                <p style="margin:0 0 14px;">When I help a new contractor pick NAICS codes, they almost always undersell themselves. They pick the obvious code for what they do — and miss the adjacent codes where buyers are actively spending.</p>
                <p style="margin:0 0 8px;font-weight:700;color:${COLORS.ink};">5 high-spend codes most small businesses miss:</p>
                <table cellspacing="0" cellpadding="0" border="0" style="width:100%;font-size:13px;margin:0 0 14px;">
                  <tr><td style="padding:8px;border-bottom:1px solid ${COLORS.border};"><strong>561720</strong> — Janitorial Services <span style="color:${COLORS.muted};">($2.7B+ federal sq ft)</span></td></tr>
                  <tr><td style="padding:8px;border-bottom:1px solid ${COLORS.border};"><strong>237310</strong> — Highway/Street Construction <span style="color:${COLORS.muted};">(huge state-level overlap)</span></td></tr>
                  <tr><td style="padding:8px;border-bottom:1px solid ${COLORS.border};"><strong>562910</strong> — Remediation Services <span style="color:${COLORS.muted};">(EPA, DoD, GSA all buy)</span></td></tr>
                  <tr><td style="padding:8px;border-bottom:1px solid ${COLORS.border};"><strong>541330</strong> — Engineering Services <span style="color:${COLORS.muted};">(crosses 12 agencies)</span></td></tr>
                  <tr><td style="padding:8px;"><strong>238220</strong> — Plumbing/HVAC Contractors <span style="color:${COLORS.muted};">(facility maint. backbone)</span></td></tr>
                </table>
                <p style="margin:0 0 14px;">If any of these are within striking distance of what you actually do, add them to your SAM.gov profile. It's free and takes 2 minutes per code.</p>
                <p style="margin:0 0 14px;background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 14px;font-size:14px;color:${COLORS.ink};">Quick favor: reply with what you actually do (one sentence), and I'll flag the 1-2 NAICS you're probably missing.</p>
            `,
            ctaText: "Read: best NAICS codes by spend",
            ctaUrl: `${BLOG_URL}/best-naics-codes-small-business`,
            ctaSecondary: "Or scan your business in 60 sec",
            ctaSecondaryUrl: "https://app.capturepilot.com/check",
            isMarketing: true,
        }),
    },

    // ─────────── 4. Past performance (Day 15) ───────────
    nurture_04_past_perf_bootstrap: {
        subject: "How to look good before you've won anything",
        html: wrap({
            preheader: "The past-performance catch-22, solved.",
            heroSvg: HERO_PAST_PERF,
            topAction: {
                label: "Get the capability statement template",
                url: KIT_URL,
                note: "Inside the $70 Capture Kit — same template we use for our consulting clients.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">"But I have no federal experience."</h1>
                <p style="margin:0 0 14px;">If I had a dollar for every time I heard this, I'd have funded my own SBIR.</p>
                <p style="margin:0 0 14px;">The catch-22 is real: you can't win federal contracts without past performance, but you can't build past performance without winning contracts. Here's how to break it:</p>
                <ol style="margin:0 0 16px 18px;padding:0;font-size:14px;">
                  <li style="margin-bottom:10px;"><strong>Commercial work counts.</strong> Your private-sector contracts ARE past performance. Cite them. Most evaluators just want proof you can deliver — they don't care if the customer was Walmart or the Navy.</li>
                  <li style="margin-bottom:10px;"><strong>Sub-contract first.</strong> Find a prime in your NAICS who's already won. Offer to sub a slice. You get the experience + a reference; they get a teaming partner. Win/win.</li>
                  <li style="margin-bottom:10px;"><strong>Chase micro-purchases.</strong> Under-$10K contracts have almost no past-performance requirements. Win 5 of these in a quarter and you have a track record.</li>
                  <li><strong>Document everything.</strong> Photos, before/afters, customer testimonials. Build a "performance file" you can drop into any proposal in 5 minutes.</li>
                </ol>
                <p style="margin:0 0 14px;">The first 12 months are about <strong>building proof</strong>, not winning prime contracts. After that, the compounding starts and it gets easier fast.</p>
            `,
            ctaText: "Read: capability statement guide",
            ctaUrl: `${BLOG_URL}/capability-statement-guide`,
            ctaSecondary: "Or grab the template inside the $70 Kit",
            ctaSecondaryUrl: KIT_URL,
            isMarketing: true,
        }),
    },

    // ─────────── 5. Audit call CTA (Day 22) — CONVERSION ───────────
    nurture_05_audit_call: {
        subject: "30 min on the calendar → 3 live opportunities tomorrow",
        html: wrap({
            preheader: "Free B2G Audit. We review your setup, you leave with matches in 24h.",
            heroSvg: HERO_AUDIT_CALL,
            topAction: {
                label: "Book the 30-min audit call",
                url: AUDIT_URL,
                note: "Free. 5 slots/week. Walk away with 3 live opportunities matched to your business within 24h.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">A specific offer.</h1>
                <p style="margin:0 0 14px;">You've gotten 4 emails from me. I figure if any of this is landing, you might want to talk.</p>
                <p style="margin:0 0 14px;"><strong>30-minute B2G Audit Call.</strong> Free. No deck, no pitch. Here's exactly what happens:</p>
                <ul style="margin:0 0 16px 18px;padding:0;font-size:14px;">
                  <li style="margin-bottom:8px;"><strong>Minutes 0-10</strong> — I ask about what you do, who your commercial customers are, what set-asides you might qualify for.</li>
                  <li style="margin-bottom:8px;"><strong>Minutes 10-20</strong> — I show you live opportunities in your NAICS, sorted by what you'd actually have a shot at.</li>
                  <li style="margin-bottom:8px;"><strong>Minutes 20-30</strong> — We talk about whether you want help (Pilot Program, $70 Kit, or just keep getting these emails — all are valid).</li>
                </ul>
                <p style="margin:0 0 14px;">Within 24 hours of the call, you get 3 opportunities tailored to your business in your inbox. That part happens whether or not you decide to work with us.</p>
                <p style="margin:0 0 14px;font-size:14px;color:${COLORS.muted};">Heads up: I only do 5 of these per week and slots fill 2-3 weeks out.</p>
                <p style="margin:0;font-size:14px;color:${COLORS.muted};">— André</p>
            `,
            ctaText: "Book the B2G Audit Call",
            ctaUrl: AUDIT_URL,
            ctaSecondary: "Or reply with 3 dates that work",
            ctaSecondaryUrl: "mailto:hello@capturepilot.com?subject=B2G%20Audit%20Call",
            isMarketing: true,
        }),
    },

    // ─────────── 6. Sources Sought (Day 30) ───────────
    nurture_06_sources_sought: {
        subject: "The procurement step 80% of contractors skip",
        html: wrap({
            preheader: "Sources Sought notices fire 6-18 months early. Here's how to use them.",
            heroSvg: HERO_SOURCES_SOUGHT,
            topAction: {
                label: "See Sources Sought matched to your business",
                url: "https://app.capturepilot.com/check",
                note: "Free 60-second scan flags every active Sources Sought in your NAICS — no SAM.gov account needed.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">Where most contractors enter — too late.</h1>
                <p style="margin:0 0 14px;">A federal procurement has 4 main steps: Sources Sought → Pre-Solicitation → RFP/RFQ → Award. Most small businesses see their first opportunity at step 3 (RFP), give themselves 30 days to bid, and lose to the contractor who's been working the deal since step 1.</p>
                <p style="margin:0 0 14px;"><strong>Sources Sought notices are step 1.</strong> They're the government saying "we're thinking about buying this in 6-18 months, who can do it?" They don't ask for a bid. They just ask for a capability statement.</p>
                <p style="margin:0 0 14px;">What you get when you respond:</p>
                <ul style="margin:0 0 16px 18px;padding:0;font-size:14px;">
                  <li style="margin-bottom:6px;">Your name in front of the contracting officer 6 months before competition starts.</li>
                  <li style="margin-bottom:6px;">A direct line to ask questions (most COs reply).</li>
                  <li>The chance to <strong>influence the requirements</strong> — if you say "this scope would be better as a set-aside," they sometimes listen.</li>
                </ul>
                <p style="margin:0 0 14px;">Cost: 30 minutes per response. Reward: you stop being a stranger when the real RFP drops.</p>
                <p style="margin:0 0 14px;font-size:14px;color:${COLORS.muted};">P.S. CapturePilot flags every Sources Sought in your NAICS. Open the dashboard and filter Notice Type = "Sources Sought".</p>
            `,
            ctaText: "See Sources Sought in your NAICS",
            ctaUrl: "https://app.capturepilot.com/check",
            ctaSecondary: "Or read the Sources Sought playbook",
            ctaSecondaryUrl: `${BLOG_URL}/capture-management-process`,
            isMarketing: true,
        }),
    },

    // ─────────── 7. Capability statement teardown (Day 38) ───────────
    nurture_07_cap_statement: {
        subject: "Capability statement teardown (and an offer)",
        html: wrap({
            preheader: "A real one I rewrote last month. Same company, 3x the response rate.",
            heroSvg: HERO_CAP_STATEMENT,
            topAction: {
                label: "Read: capability statement examples",
                url: `${BLOG_URL}/capability-statement-examples`,
                note: "Side-by-side rewrites of 6 real small-business capability statements — what worked, what didn't.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">The one-page document that gets ignored 90% of the time.</h1>
                <p style="margin:0 0 14px;">Your capability statement is the federal version of a one-pager. Contracting officers skim them in 8 seconds. If yours doesn't pass the skim test, it gets binned.</p>
                <p style="margin:0 0 14px;"><strong>What a good one has:</strong></p>
                <ul style="margin:0 0 16px 18px;padding:0;font-size:14px;">
                  <li style="margin-bottom:6px;"><strong>Logo + 2-line tagline</strong> at the top. Not your mission statement.</li>
                  <li style="margin-bottom:6px;"><strong>NAICS codes</strong> as bold chips. Not a paragraph.</li>
                  <li style="margin-bottom:6px;"><strong>3-5 core competencies</strong> — verbs, not adjectives. "We strip and seal flooring" not "experienced flooring solutions provider".</li>
                  <li style="margin-bottom:6px;"><strong>3 past performance bullets</strong> with dollar amount + agency + outcome.</li>
                  <li><strong>UEI, CAGE, set-asides, point of contact</strong> — at the bottom, clear, scannable.</li>
                </ul>
                <p style="margin:0 0 14px;background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 14px;font-size:14px;color:${COLORS.ink};">
                  <strong>Offer:</strong> reply with your current capability statement (PDF attachment). I'll send back a 5-line teardown — what's working, what to cut, what to add. Free, 10 minutes, no follow-up sales call unless you want one.
                </p>
            `,
            ctaText: "Send mine for a free teardown",
            ctaUrl: "mailto:hello@capturepilot.com?subject=Capability%20Statement%20Teardown",
            ctaSecondary: "Or read 6 example teardowns",
            ctaSecondaryUrl: `${BLOG_URL}/capability-statement-examples`,
            isMarketing: true,
        }),
    },

    // ─────────── 8. $70 Kit (Day 45) — CONVERSION ───────────
    nurture_08_kit: {
        subject: "The $70 Capture Kit (no upsell, just deliverables)",
        html: wrap({
            preheader: "If you don't want a call or a pilot, here's the $70 alternative.",
            heroSvg: HERO_KIT,
            topAction: {
                label: "Get the Capture Kit · $70",
                url: KIT_URL,
                note: "One-time. No subscription. Everything inside is what we send our consulting clients in week 1.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">A smaller option.</h1>
                <p style="margin:0 0 14px;">Not everyone wants a 30-minute call or a 90-day program. Some people just want the materials and to go figure it out themselves.</p>
                <p style="margin:0 0 14px;">For those people, I made the <strong>$70 Capture Kit</strong>. It's exactly what I'd send a friend starting out:</p>
                <ul style="margin:0 0 16px 18px;padding:0;font-size:14px;">
                  <li style="margin-bottom:6px;"><strong>NAICS-targeted opportunity list</strong> — 90 days of live matches, scored, deduplicated, in a Google Sheet.</li>
                  <li style="margin-bottom:6px;"><strong>Capability statement template</strong> — the actual InDesign + Word files we use for our consulting clients.</li>
                  <li style="margin-bottom:6px;"><strong>Past-performance bootstrap guide</strong> — how to build a credible track record from commercial work.</li>
                  <li><strong>SAM.gov walkthrough</strong> — screen-by-screen, no fluff, 18 minutes start to finish.</li>
                </ul>
                <p style="margin:0 0 14px;">It's a one-time purchase. No subscription, no upsell. If you decide later you want help, the Pilot Program is still there — but you don't have to commit.</p>
                <p style="margin:0 0 14px;font-size:14px;color:${COLORS.muted};">P.S. The kit has helped 70+ small businesses get their first federal contract. Average time-to-first-bid: 6 weeks.</p>
            `,
            ctaText: "Get the Capture Kit · $70",
            ctaUrl: KIT_URL,
            ctaSecondary: "Or compare with the Pilot Program",
            ctaSecondaryUrl: PILOT_URL,
            isMarketing: true,
        }),
    },

    // ─────────── 9. Fiscal Cliff (Day 55) ───────────
    nurture_09_fiscal_cliff: {
        subject: "What to chase in Aug-Sep (year-end fiscal cliff)",
        html: wrap({
            preheader: "30% of federal spend happens in the final 2 months of the fiscal year.",
            heroSvg: HERO_FY_CLIFF,
            topAction: {
                label: "Read: federal contracting action plan",
                url: `${BLOG_URL}/federal-contracting-action-plan`,
                note: "Full 30/60/90-day action plan for landing your first federal contract — read it before year-end.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">The year-end fiscal cliff.</h1>
                <p style="margin:0 0 14px;">Federal fiscal year ends September 30. Any money agencies haven't spent by then expires. So what happens? <strong>~30% of all federal spend gets crammed into August + September</strong>. It's the single most predictable budget pattern in the entire procurement system.</p>
                <p style="margin:0 0 14px;"><strong>What this means for small businesses:</strong></p>
                <ul style="margin:0 0 16px 18px;padding:0;font-size:14px;">
                  <li style="margin-bottom:6px;">Buyers are time-pressured → they prefer contractors they've already worked with OR can onboard fast.</li>
                  <li style="margin-bottom:6px;">Micro-purchases (under $10K) and simplified acquisitions (up to $250K) explode — perfect entry point if you've never bid.</li>
                  <li style="margin-bottom:6px;">Sole-source justifications get easier to write — buyers will accept "this is the only contractor who can deliver in 30 days".</li>
                  <li>Set-aside spending often surges to hit annual goals (8(a), WOSB, HUBZone all have agency targets).</li>
                </ul>
                <p style="margin:0 0 14px;"><strong>What to do in June-July:</strong> identify your top 5 agencies (the ones already buying what you sell). Email their small business specialist. Introduce yourself. Say "I'm available for year-end work — micro-purchases and SAP contracts under $250K." That single email puts you on a list most contractors never get on.</p>
            `,
            ctaText: "Read: federal contracting action plan",
            ctaUrl: `${BLOG_URL}/federal-contracting-action-plan`,
            ctaSecondary: "Or find the buying agencies in your dashboard (free)",
            ctaSecondaryUrl: DASHBOARD_URL,
            isMarketing: true,
        }),
    },

    // ─────────── 10. Why bids lose (Day 65) ───────────
    nurture_10_why_bids_lose: {
        subject: "Why your last bid lost (without seeing it)",
        html: wrap({
            preheader: "The 5 reasons account for 90% of small-business losses.",
            heroSvg: HERO_BID_LOSS,
            topAction: {
                label: "Grab the free bid-loss checklist",
                url: "https://www.capturepilot.com/resources/bid-checklist",
                note: "12-point self-audit. Run it before every submission — catches the 5 issues below in <10 min.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">I can guess why your last bid lost — even if I haven't seen it.</h1>
                <p style="margin:0 0 14px;">I've reviewed ~200 small-business federal bid losses in the last 3 years. Here's the pattern, in descending order:</p>
                <ol style="margin:0 0 16px 18px;padding:0;font-size:14px;">
                  <li style="margin-bottom:10px;"><strong>Price not justified.</strong> You said "$87,500" but didn't break down labor + materials + overhead + fee. Evaluators bin proposals where they can't audit your math.</li>
                  <li style="margin-bottom:10px;"><strong>Past performance missing or weak.</strong> You listed projects but didn't include CPARS ratings, references, or outcome metrics ($, hours, sq ft, etc).</li>
                  <li style="margin-bottom:10px;"><strong>Set-aside mismatch.</strong> Solicitation was 8(a) and you're WOSB — auto-bin. Or you're 8(a) but the work is outside your approved NAICS.</li>
                  <li style="margin-bottom:10px;"><strong>Incomplete compliance section.</strong> You missed an FAR reference, a representation, or a flow-down clause. These are mechanical — the evaluator doesn't read your technical proposal if compliance fails.</li>
                  <li><strong>Other</strong> — wrong format, wrong page count, late submission, etc.</li>
                </ol>
                <p style="margin:0 0 14px;">The first 4 are <strong>fixable</strong> before you bid again. The 5th means you need a checklist.</p>
                <p style="margin:0 0 14px;background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 14px;font-size:14px;color:${COLORS.ink};">Want a free 1-page bid post-mortem? Reply with the solicitation number + a 2-sentence description of what happened. I'll tell you which bucket it falls in and what to change next time.</p>
            `,
            ctaText: "Get the bid-loss checklist",
            ctaUrl: "https://www.capturepilot.com/resources/bid-checklist",
            ctaSecondary: "Or read: capture management process",
            ctaSecondaryUrl: `${BLOG_URL}/capture-management-process`,
            isMarketing: true,
        }),
    },

    // ─────────── 11. Pilot Program (Day 75) — CONVERSION ───────────
    nurture_11_pilot: {
        subject: "Pilot Program — 3 spots open this quarter",
        html: wrap({
            preheader: "Done-for-you capture. 90 days. From SAM to first bid submitted.",
            heroSvg: HERO_PILOT,
            topAction: {
                label: "See the Pilot Program scope + pricing",
                url: PILOT_URL,
                note: "3 spots open this quarter. 90-day fixed scope, fixed deliverables. See exactly what's included before you apply.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">When the kit isn't enough.</h1>
                <p style="margin:0 0 14px;">The Capture Kit works for people who'll grind through SAM registration on their own. The Pilot Program is for people who'd rather pay someone to handle the whole damn process so they can stay in their day job.</p>
                <p style="margin:0 0 14px;"><strong>What we do in 90 days:</strong></p>
                <ul style="margin:0 0 16px 18px;padding:0;font-size:14px;">
                  <li style="margin-bottom:8px;"><strong>Week 1-2:</strong> SAM.gov registration, NAICS optimization, set-aside applications.</li>
                  <li style="margin-bottom:8px;"><strong>Week 3-4:</strong> Capability statement (final, branded, contracting-officer ready).</li>
                  <li style="margin-bottom:8px;"><strong>Week 5-8:</strong> Active capture pipeline — 5-10 live opportunities tracked, Sources Sought responses sent.</li>
                  <li><strong>Week 9-12:</strong> First bid submitted. We co-draft. You approve. We file.</li>
                </ul>
                <p style="margin:0 0 14px;"><strong>What you do:</strong> 2 weekly check-ins (30 min each). Sign things when we send them. Answer questions about your business.</p>
                <p style="margin:0 0 14px;"><strong>Pricing + scope:</strong> Fixed-fee for the 90-day program, plus a success fee on contracts won. <a href="${PILOT_URL}" style="color:${COLORS.accentDark};font-weight:700;">See current pricing here →</a></p>
                <p style="margin:0 0 14px;background:#fffbeb;border-left:3px solid ${COLORS.warn};padding:12px 14px;font-size:14px;color:${COLORS.ink};">3 spots open this quarter. We take 6 clients at a time max — anything more and the personal attention slips.</p>
            `,
            ctaText: "See Pilot Program scope + pricing",
            ctaUrl: PILOT_URL,
            ctaSecondary: "Or book a 15-min fit-check call",
            ctaSecondaryUrl: AUDIT_URL,
            isMarketing: true,
        }),
    },

    // ─────────── 12. Re-engagement / Sunset (Day 90) ───────────
    nurture_12_goodbye: {
        subject: "Three doors — or none",
        html: wrap({
            preheader: "It's been 90 days. Here's what's next — or how to leave gracefully.",
            heroSvg: HERO_GOODBYE,
            topAction: {
                label: "Reply with one word: keep / slow / stop",
                url: "mailto:hello@capturepilot.com?subject=Email%20cadence",
                note: "I take inbox space seriously. Tell me how you want this to continue — or to end. I respect all three.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">90 days. Final check-in.</h1>
                <p style="margin:0 0 14px;">You downloaded the Field Manual three months ago. You've gotten 11 emails from me since. I've taken up some of your inbox real estate — I owe you a final clean ask.</p>
                <p style="margin:0 0 14px;"><strong>Three doors:</strong></p>
                <table cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 16px;">
                  <tr>
                    <td style="padding:12px;border:1px solid ${COLORS.border};border-radius:8px;font-size:13px;width:33%;vertical-align:top;">
                      <div style="font-weight:700;color:${COLORS.ink};margin-bottom:6px;">📞 Audit Call</div>
                      <div style="color:${COLORS.muted};margin-bottom:8px;">Free 30 min. 3 opps after.</div>
                      <a href="${AUDIT_URL}" style="color:${COLORS.accentDark};font-weight:700;text-decoration:none;font-size:12px;">Book →</a>
                    </td>
                    <td style="padding:0 6px;"></td>
                    <td style="padding:12px;border:1px solid ${COLORS.border};border-radius:8px;font-size:13px;width:33%;vertical-align:top;">
                      <div style="font-weight:700;color:${COLORS.ink};margin-bottom:6px;">📦 Capture Kit</div>
                      <div style="color:${COLORS.muted};margin-bottom:8px;">$70 one-time. Self-serve.</div>
                      <a href="${KIT_URL}" style="color:${COLORS.accentDark};font-weight:700;text-decoration:none;font-size:12px;">Get it →</a>
                    </td>
                    <td style="padding:0 6px;"></td>
                    <td style="padding:12px;border:1px solid ${COLORS.border};border-radius:8px;font-size:13px;width:33%;vertical-align:top;">
                      <div style="font-weight:700;color:${COLORS.ink};margin-bottom:6px;">🚀 Pilot Program</div>
                      <div style="color:${COLORS.muted};margin-bottom:8px;">Done-for-you. 90 days.</div>
                      <a href="${PILOT_URL}" style="color:${COLORS.accentDark};font-weight:700;text-decoration:none;font-size:12px;">See pricing →</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 14px;">If none of these fit — that's totally fine. I'd rather have your inbox space available for when something I do <em>actually</em> matters to you.</p>
                <p style="margin:0 0 14px;"><strong>Reply with one of:</strong></p>
                <ul style="margin:0 0 14px 18px;padding:0;font-size:14px;">
                  <li><strong>"Keep emailing"</strong> — I'll keep sending one valuable thing per month.</li>
                  <li><strong>"Slow down"</strong> — quarterly only.</li>
                  <li><strong>"Stop"</strong> — I'll unsubscribe you immediately and we're square.</li>
                </ul>
                <p style="margin:0;font-size:14px;color:${COLORS.muted};">Either way, thanks for the 90 days.<br>— André</p>
            `,
            isMarketing: true,
        }),
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Re-engagement one-off templates (NOT part of either drip sequence).
    // Sent manually via scripts/reengage-*.ts to specific cohorts who never
    // got the nurture wired (the backlog of pre-cron leads).
    //
    //   reengage_biz_fb     — past FB lead-ad downloaders with biz email
    //   reengage_freemail_fb — past FB lead-ad downloaders with gmail/yahoo
    //   reengage_qc         — past Quick Checker submissions
    //
    // All three reference the new /resources/capability-statement-website-audit
    // landing page as the value anchor. After a recipient engages (replies /
    // clicks / signs up) we enroll them in the appropriate drip sequence
    // starting from Day 3 (skip the Day-0 welcome that assumes a fresh action).
    // ─────────────────────────────────────────────────────────────────────────

    reengage_biz_fb: {
        subject: "The #1 gap from our calls (free fix inside)",
        html: wrap({
            preheader: "You grabbed the Field Manual a while back. Here's a new free asset based on what we've been seeing in calls.",
            topAction: {
                label: "Read the free 10-point audit",
                url: CAPSTMT_AUDIT_URL,
                note: "Capability Statement + Website — the single thing that decides whether the contracting officer reads your bid.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:24px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">Hey {{first_name}} — quick update.</h1>
                <p style="margin:0 0 14px;">You grabbed the <strong>Federal Field Manual</strong> from us a while back. I owe you a real update.</p>
                <p style="margin:0 0 14px;">Since then, I've done ~50 capture calls with small businesses chasing federal work. One pattern keeps showing up — bigger than pricing, bigger than past performance, bigger than NAICS picks:</p>
                <p style="margin:0 0 16px;background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 14px;font-size:15px;color:${COLORS.ink};font-weight:600;">The capability statement reads like a commercial brochure and the website looks like it hasn't been touched in two years.</p>
                <p style="margin:0 0 14px;">Contracting officers skim capability statements in 8 seconds. If yours doesn't pass the skim test, your technical proposal never gets read — your bid is binned before evaluation. Same with the website: COs check it before shortlisting and dock credibility quietly.</p>
                <p style="margin:0 0 14px;">I just wrote up everything we learned: <a href="${CAPSTMT_AUDIT_URL}" style="color:${COLORS.accentDark};font-weight:700;">the 10-point Capability Statement + Website audit</a>. Free, no signup. Pull yours up, mark each row, and you'll have a punch-list of fixes by tonight.</p>
                <p style="margin:0 0 14px;background:#ecfdf5;border-left:3px solid ${COLORS.accent};padding:12px 14px;font-size:14px;color:${COLORS.ink};"><strong>Honest offer:</strong> reply to this email with your current capability statement (PDF attachment). I'll send back a 5-line teardown — what's working, what to cut, what to add. Free, takes me 10 minutes, no follow-up sales pitch unless you ask.</p>
                <p style="margin:0 0 12px;font-size:14px;color:${COLORS.muted};">P.S. If the Field Manual got lost in your inbox three months ago, reply "resend" and I'll send a fresh copy.</p>
            `,
            ctaText: "Read the free 10-point audit",
            ctaUrl: CAPSTMT_AUDIT_URL,
            ctaSecondary: "Or send your capability statement for a free teardown",
            ctaSecondaryUrl: "mailto:hello@capturepilot.com?subject=Capability%20Statement%20Teardown",
            isMarketing: true,
        }),
    },

    reengage_freemail_fb: {
        subject: "Quick favor about the email you used",
        html: wrap({
            preheader: "Future free assets go to work email only. Easy fix — three options below.",
            topAction: {
                label: "Run the Quick Checker (60 sec, auto-validates)",
                url: QC_URL,
                note: "The simplest path: scan your business website. We auto-link the result to your real biz email and you're set.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:24px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">Hey {{first_name}} — quick favor.</h1>
                <p style="margin:0 0 14px;">You downloaded our <strong>Federal Field Manual</strong> a while back using <strong>{{email_used}}</strong>. Thanks for that.</p>
                <p style="margin:0 0 14px;">Heads up — future free assets are going to <strong>work-email-only</strong>. Two reasons: (1) it lets me actually verify you're a real business (not a bot or someone collecting freebies), and (2) my Resend deliverability tanks when I blast personal Gmail addresses, which hurts the people who DO want this.</p>
                <p style="margin:0 0 14px;"><strong>Three doors</strong> — all equally fine:</p>
                <ol style="margin:0 0 16px 18px;padding:0;font-size:15px;">
                  <li style="margin-bottom:10px;"><strong>Run the 60-second Quick Checker</strong> on your business website. We pick up your real work email automatically, and you walk away with NAICS, SAM status, certification fit, and your top 5 matching federal opportunities. <a href="${QC_URL}" style="color:${COLORS.accentDark};font-weight:700;">Start here →</a></li>
                  <li style="margin-bottom:10px;"><strong>Reply with your work email.</strong> One sentence — "use this one: <em>jane@acme.com</em>" — and you're back on the list.</li>
                  <li><strong>Personal email is fine.</strong> If you genuinely want federal content at your Gmail address (some folks do — small operations, side hustles, just exploring), reply with "personal is fine" and I'll keep you on a once-a-month low-volume list.</li>
                </ol>
                <p style="margin:0 0 14px;">If none of those land — no hard feelings. This'll be the last one and we're square.</p>
                <p style="margin:0 0 12px;font-size:14px;color:${COLORS.muted};">P.S. The capability-statement + website audit I just published is the #1 gap we see in our calls. <a href="${CAPSTMT_AUDIT_URL}" style="color:${COLORS.muted};text-decoration:underline;">Worth a read either way.</a></p>
            `,
            ctaText: "Run the 60-second Quick Checker",
            ctaUrl: QC_URL,
            ctaSecondary: "Or reply with your work email",
            ctaSecondaryUrl: "mailto:hello@capturepilot.com?subject=Use%20this%20email%20instead",
            isMarketing: true,
        }),
    },

    reengage_qc: {
        subject: "Your scan + the #1 thing missing from most small-biz bids",
        html: wrap({
            preheader: "You ran the Quick Checker. Here's the next asset — the capability statement audit we just published.",
            topAction: {
                label: "Read the 10-point capability statement audit",
                url: CAPSTMT_AUDIT_URL,
                note: "The single biggest gap we see in calls — bigger than pricing, past performance, or NAICS choice. Free audit.",
            },
            body: `
                <h1 style="margin:0 0 14px;font-size:24px;font-weight:800;color:${COLORS.ink};letter-spacing:-0.02em;">Hey {{first_name}} — André here.</h1>
                <p style="margin:0 0 14px;">You ran the <strong>Quick Checker</strong> on your business a while back. Whatever score came back, the part the form can't tell you is what's actually blocking most small businesses from winning federal contracts. It's not pricing. It's not past performance. It's not NAICS picks.</p>
                <p style="margin:0 0 16px;background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 14px;font-size:15px;color:${COLORS.ink};font-weight:600;">It's the capability statement and the website. Contracting officers skim them in 8 seconds. If yours doesn't pass the skim test, the bid is binned before evaluation.</p>
                <p style="margin:0 0 14px;">I just published <a href="${CAPSTMT_AUDIT_URL}" style="color:${COLORS.accentDark};font-weight:700;">the 10-point Capability Statement + Website audit</a> based on patterns from ~50 capture calls. Free, no signup. Pull yours up, mark each row, and you'll have a punch-list of fixes by tonight.</p>
                <p style="margin:0 0 14px;background:#ecfdf5;border-left:3px solid ${COLORS.accent};padding:12px 14px;font-size:14px;color:${COLORS.ink};"><strong>Free teardown offer:</strong> reply with your current capability statement (PDF attachment). I'll send back a 5-line teardown — what's working, what to cut, what to add. Takes me 10 minutes. No follow-up sales pitch unless you ask.</p>
                <p style="margin:0 0 12px;font-size:14px;color:${COLORS.muted};">P.S. If you want fresh matches against your business, the dashboard is free with 50 daily federal opportunity matches — <a href="${DASHBOARD_URL}" style="color:${COLORS.muted};text-decoration:underline;">claim it here</a>. No card.</p>
            `,
            ctaText: "Read the free capability statement audit",
            ctaUrl: CAPSTMT_AUDIT_URL,
            ctaSecondary: "Or send yours for a free teardown",
            ctaSecondaryUrl: "mailto:hello@capturepilot.com?subject=Capability%20Statement%20Teardown",
            isMarketing: true,
        }),
    },
};

/**
 * Sequence metadata — used by the (future) cron scheduler to pick the right
 * template based on the lead's day-from-signup. Kept here so it lives next to
 * the template definitions for easy auditing.
 */
/**
 * Two parallel 12-email sequences that share emails 2-12 but differ at day 0:
 *   - fb_nurture (default NURTURE_SEQUENCE)   → starts with nurture_01_welcome
 *                                                ("you downloaded the Field Manual")
 *   - qc_nurture (NURTURE_SEQUENCE_QC below)  → starts with nurture_01_qc_welcome
 *                                                ("you ran the Quick Checker")
 * Same cadence + same downstream content. The split exists because referencing
 * a "PDF download" in the first email to a Quick-Checker user is broken
 * context — they did something completely different to land in the funnel.
 */
export const NURTURE_SEQUENCE: Array<{ key: string; day_offset: number; type: "welcome" | "value" | "conversion" | "hybrid" | "sunset"; label: string }> = [
    { key: "nurture_01_welcome",         day_offset:  0, type: "welcome",    label: "Day 0 · Welcome (FB download)" },
    { key: "nurture_02_opp_anatomy",     day_offset:  3, type: "value",      label: "Day 3 · Opportunity anatomy" },
    { key: "nurture_03_naics_misses",    day_offset:  8, type: "value",      label: "Day 8 · NAICS picks" },
    { key: "nurture_04_past_perf_bootstrap", day_offset: 15, type: "value",  label: "Day 15 · Past performance bootstrap" },
    { key: "nurture_05_audit_call",      day_offset: 22, type: "conversion", label: "Day 22 · Audit call CTA" },
    { key: "nurture_06_sources_sought",  day_offset: 30, type: "value",      label: "Day 30 · Sources Sought" },
    { key: "nurture_07_cap_statement",   day_offset: 38, type: "hybrid",     label: "Day 38 · Capability statement teardown" },
    { key: "nurture_08_kit",             day_offset: 45, type: "conversion", label: "Day 45 · $70 Kit" },
    { key: "nurture_09_fiscal_cliff",    day_offset: 55, type: "value",      label: "Day 55 · Year-end fiscal cliff" },
    { key: "nurture_10_why_bids_lose",   day_offset: 65, type: "value",      label: "Day 65 · Why bids lose" },
    { key: "nurture_11_pilot",           day_offset: 75, type: "conversion", label: "Day 75 · Pilot Program" },
    { key: "nurture_12_goodbye",         day_offset: 90, type: "sunset",     label: "Day 90 · Three doors" },
];

/**
 * Quick-Checker variant — replaces nurture_01_welcome (which references the
 * Field Manual PDF) with nurture_01_qc_welcome (which references their scan
 * + readiness score). Days 3-90 are identical to NURTURE_SEQUENCE above.
 */
export const NURTURE_SEQUENCE_QC: Array<{ key: string; day_offset: number; type: "welcome" | "value" | "conversion" | "hybrid" | "sunset"; label: string }> = [
    { key: "nurture_01_qc_welcome",      day_offset:  0, type: "welcome",    label: "Day 0 · Welcome (Quick Checker)" },
    ...NURTURE_SEQUENCE.slice(1),
];
