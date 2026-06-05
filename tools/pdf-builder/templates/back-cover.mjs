/**
 * back-cover.mjs — Final CTA page (dark).
 *
 * UNIFIED PIPELINE: renders inline as <section class="doc-section
 * doc-section--back-cover">. Chromium @page handles footer + page
 * numbering. NO local .page wrapper. NO local footer.
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
  logoDark = "https://www.capturepilot.com/cp-icon-black.png",
  logoLight = "https://www.capturepilot.com/cp-icon-white.png",
} = {}) {
  return `
<section class="doc-section doc-section--back-cover">
  <div class="doc-hdr">
    <div class="doc-hdr__brand">
      <img class="doc-hdr__logo doc-hdr__logo--dark"  src="${escapeHtml(logoDark)}"  alt="CapturePilot" width="32" height="32">
      <img class="doc-hdr__logo doc-hdr__logo--light" src="${escapeHtml(logoLight)}" alt="CapturePilot" width="32" height="32">
      <span class="doc-hdr__wordmark">CapturePilot</span>
    </div>
    <span class="doc-hdr__label">BACK COVER</span>
  </div>

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
