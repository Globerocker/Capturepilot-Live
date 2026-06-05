/**
 * toc.mjs — Table of Contents (light, dot-grid bg).
 *
 * UNIFIED PIPELINE: renders inline as <section class="doc-section
 * doc-section--toc">. Chromium @page handles footer + page numbering.
 * NO local .page wrapper. NO local footer.
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
  logoDark = "https://www.capturepilot.com/cp-icon-black.png",
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
  <div class="doc-hdr">
    <div class="doc-hdr__brand">
      <img class="doc-hdr__logo doc-hdr__logo--dark"  src="${escapeHtml(logoDark)}"  alt="CapturePilot" width="32" height="32">
      <img class="doc-hdr__logo doc-hdr__logo--light" src="${escapeHtml(logoLight)}" alt="CapturePilot" width="32" height="32">
      <span class="doc-hdr__wordmark">CapturePilot</span>
    </div>
    <span class="doc-hdr__label">TABLE OF CONTENTS</span>
  </div>

  <div class="eyebrow" style="font-family:var(--mono); font-size:8pt; font-weight:500; letter-spacing:0.2em; text-transform:uppercase; color:var(--emerald-dark); margin:0 0 1.5mm 0;">/ INSIDE THIS GUIDE</div>
  <h1 class="toc__title headline headline--md">${titleHtml}</h1>
  <div class="${tocBlockClass}">${partsHtml}</div>
</section>
`;
}
