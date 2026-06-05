/**
 * toc.mjs — Table of Contents (light, dot-grid bg).
 *
 * UNIFIED PIPELINE: renders inline as <section class="doc-section
 * doc-section--toc">. Chromium @page handles BOTH the per-page header
 * (CP logo + document label) and footer (CAPTUREPILOT · TITLE  N / N)
 * for every printed page automatically — see render.mjs
 * `displayHeaderFooter: true` + headerTemplate + footerTemplate.
 *
 * DO NOT render an inline .doc-hdr / .hdr / .ftr inside this section —
 * doing so produces visible duplicate strips on top of Chromium's running
 * chrome. Section templates ONLY render page-body content.
 */

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderToc({
  title = "Inside this guide.",
  parts = [],
  // logoDark / logoLight intentionally accepted but unused — Chromium's
  // @page header renders the brand mark globally.
  // eslint-disable-next-line no-unused-vars
  logoDark = "https://www.capturepilot.com/cp-icon-black.png",
  // eslint-disable-next-line no-unused-vars
  logoLight = "https://www.capturepilot.com/cp-icon-white.png",
} = {}) {
  const titleHtml = title.includes("<strong>")
    ? title
    : escapeHtml(title);

  const totalRows = (parts || []).reduce(
    (n, p) => n + ((p.items && p.items.length) || 0),
    0,
  );
  const tocBlockClass = totalRows > 14 ? "toc__list toc--dense" : "toc__list";

  const partsHtml = parts.map((part) => {
    const itemsHtml = (part.items || []).map((it) => `
      <div class="toc__row">
        <div class="toc__code">${escapeHtml(it.code || "")}</div>
        <div>
          <h3 class="toc__item-title">${escapeHtml(it.title || "")}</h3>
          ${it.desc ? `<p class="toc__item-desc">${escapeHtml(it.desc)}</p>` : ""}
        </div>
        <div class="toc__page">p. ${String(it.page || "").padStart(2, "0")}</div>
      </div>
    `).join("");

    return `
      ${part.label ? `<div class="toc__part-label">${escapeHtml(part.label)}</div>` : ""}
      ${itemsHtml}
    `;
  }).join("");

  return `
<section class="doc-section doc-section--toc">
  <div class="eyebrow" style="font-family:var(--mono); font-size:8pt; font-weight:500; letter-spacing:0.2em; text-transform:uppercase; color:var(--emerald-dark); margin:0 0 1.5mm 0;">/ INSIDE THIS GUIDE</div>
  <h1 class="toc__title headline headline--md">${titleHtml}</h1>
  <div class="${tocBlockClass}">${partsHtml}</div>
</section>
`;
}
