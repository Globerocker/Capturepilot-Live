/**
 * dark-panel.mjs — Section divider (dark, solid forest green + grid).
 *
 * UNIFIED PIPELINE: renders inline as <section class="doc-section
 * doc-section--dark">. Chromium @page handles footer + page numbering.
 * NO local .page wrapper. NO local footer.
 */

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderHeadline(headline, accentWord) {
  if (!headline) return "";
  if (headline.includes("<strong>") || headline.includes("<em>")) return headline;
  if (!accentWord) return escapeHtml(headline);
  const re = new RegExp(`\\b(${accentWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "i");
  return escapeHtml(headline).replace(re, "<strong>$1</strong>");
}

export function renderDarkPanel({
  partLabel = "PART ONE · QUALIFY",
  headline = "",
  accentWord = "",
  paragraphs = [],
  headerLabel = "SECTION",
  logoDark = "https://www.capturepilot.com/cp-icon-black.png",
  logoLight = "https://www.capturepilot.com/cp-icon-white.png",
} = {}) {
  const paragraphsHtml = (paragraphs || []).map(
    (p) => `<p>${escapeHtml(p)}</p>`
  ).join("");

  return `
<section class="doc-section doc-section--dark">
  <div class="doc-hdr">
    <div class="doc-hdr__brand">
      <img class="doc-hdr__logo doc-hdr__logo--dark"  src="${escapeHtml(logoDark)}"  alt="CapturePilot" width="32" height="32">
      <img class="doc-hdr__logo doc-hdr__logo--light" src="${escapeHtml(logoLight)}" alt="CapturePilot" width="32" height="32">
      <span class="doc-hdr__wordmark">CapturePilot</span>
    </div>
    <span class="doc-hdr__label">${escapeHtml(headerLabel)}</span>
  </div>

  <div class="dark-panel">
    <div class="dark-panel__partlabel">${escapeHtml(partLabel)}</div>
    <h1 class="dark-panel__headline">${renderHeadline(headline, accentWord)}</h1>
    ${paragraphsHtml ? `<div class="dark-panel__body">${paragraphsHtml}</div>` : ""}
  </div>
</section>
`;
}
