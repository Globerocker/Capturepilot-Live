/**
 * back-cover.mjs — Final CTA page (dark).
 *
 * UNIFIED PIPELINE: renders inline as <section class="doc-section
 * doc-section--back-cover">. Chromium @page handles BOTH the per-page
 * header (CP logo + document label) and footer (CAPTUREPILOT · TITLE
 * N / N) for every printed page automatically — see render.mjs
 * `displayHeaderFooter: true` + headerTemplate + footerTemplate.
 *
 * DO NOT render an inline .doc-hdr / .hdr / .ftr inside this section —
 * doing so produces visible duplicate strips on top of Chromium's
 * running chrome. Section templates ONLY render page-body content.
 */

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderHeadline(headline, accentWord) {
  if (!headline) return "";
  if (headline.includes("<strong>")) return headline;
  if (!accentWord) return escapeHtml(headline);
  const re = new RegExp(`\\b(${accentWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "i");
  return escapeHtml(headline).replace(re, "<strong>$1</strong>");
}

export function renderBackCover({
  headline = "Ready to put this to work?",
  accentWord = "work",
  body = "",
  ctaText = "Start your free trial",
  ctaUrl = "https://capturepilot.com/signup",
  eyebrow = "WHAT'S NEXT",
  // logoDark / logoLight accepted for back-compat but unused —
  // Chromium's @page header renders the brand globally on every page.
  // eslint-disable-next-line no-unused-vars
  logoDark = "https://www.capturepilot.com/cp-icon-black.png",
  // eslint-disable-next-line no-unused-vars
  logoLight = "https://www.capturepilot.com/cp-icon-white.png",
} = {}) {
  return `
<section class="doc-section doc-section--back-cover">
  <div class="back">
    <div class="back__eyebrow">${escapeHtml(eyebrow)}</div>
    <h1 class="back__headline">${renderHeadline(headline, accentWord)}</h1>
    ${body ? `<p class="back__body">${escapeHtml(body)}</p>` : ""}
    <div>
      <a class="back__cta-btn" href="${escapeHtml(ctaUrl)}">${escapeHtml(ctaText)}</a>
    </div>
    <div class="back__url">${escapeHtml(ctaUrl)}</div>
  </div>
</section>
`;
}
