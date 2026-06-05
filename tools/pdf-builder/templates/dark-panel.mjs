/**
 * dark-panel.mjs — Section divider (dark, solid forest green + grid).
 *
 * UNIFIED PIPELINE: renders inline as <section class="doc-section
 * doc-section--dark">. Chromium @page handles BOTH the per-page header
 * (CP logo + document label) and footer (CAPTUREPILOT · TITLE  N / N)
 * for every printed page automatically — see render.mjs
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
  // headerLabel / logoDark / logoLight accepted for back-compat but
  // unused — Chromium's @page header renders the brand + label globally.
  // eslint-disable-next-line no-unused-vars
  headerLabel = "SECTION",
  // eslint-disable-next-line no-unused-vars
  logoDark = "https://www.capturepilot.com/cp-icon-black.png",
  // eslint-disable-next-line no-unused-vars
  logoLight = "https://www.capturepilot.com/cp-icon-white.png",
} = {}) {
  const paragraphsHtml = (paragraphs || []).map(
    (p) => `<p>${escapeHtml(p)}</p>`
  ).join("");

  return `
<section class="doc-section doc-section--dark">
  <div class="dark-panel">
    <div class="dark-panel__partlabel">${escapeHtml(partLabel)}</div>
    <h1 class="dark-panel__headline">${renderHeadline(headline, accentWord)}</h1>
    ${paragraphsHtml ? `<div class="dark-panel__body">${paragraphsHtml}</div>` : ""}
  </div>
</section>
`;
}
