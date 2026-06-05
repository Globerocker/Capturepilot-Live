/**
 * content.mjs — Flowing content section.
 *
 * UNIFIED PIPELINE: renders inline as <section class="doc-section
 * doc-section--content">. Chromium @page handles page breaks + footer
 * + page numbering. NO local .page wrapper. NO local footer.
 *
 * The section is page-break-before:always (via .doc-section base style),
 * so every content block starts on a fresh page. Long content paginates
 * naturally under Chromium's print engine. Header/footer for every
 * physical page are injected via Chromium's headerTemplate +
 * footerTemplate (set in render.mjs).
 *
 * NOTE on checkboxes: markdown `- [ ]` task items render as static
 * emerald-bordered <input type="checkbox"> boxes (styled in styles.css).
 * These are INTENTIONAL static print-ready chrome, NOT interactive PDF
 * AcroForm widgets — Chromium's printToPDF strips form fields, and a
 * pdf-lib post-process overlay was tried and proved unreliable due to
 * Chromium's header/footer margin reservation mangling the coordinate
 * math. Interactive AcroForm checkboxes remain on the backlog for a
 * future pdf-lib pass once the overlay coordinate model is rebuilt.
 */

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderContent({
  html = "",
  headerLabel = "FIELD GUIDE",
  logoDark = "https://www.capturepilot.com/cp-icon-black.png",
  logoLight = "https://www.capturepilot.com/cp-icon-white.png",
  showLocalHeader = false,
} = {}) {
  // Section-local header is OPT-IN. The Chromium @page header already
  // brands every printed page, so we don't duplicate by default.
  const localHdr = showLocalHeader ? `
  <div class="doc-hdr">
    <div class="doc-hdr__brand">
      <img class="doc-hdr__logo doc-hdr__logo--dark"  src="${escapeHtml(logoDark)}"  alt="CapturePilot" width="32" height="32">
      <img class="doc-hdr__logo doc-hdr__logo--light" src="${escapeHtml(logoLight)}" alt="CapturePilot" width="32" height="32">
      <span class="doc-hdr__wordmark">CapturePilot</span>
    </div>
    <span class="doc-hdr__label">${escapeHtml(headerLabel)}</span>
  </div>
  ` : "";

  return `
<section class="doc-section doc-section--content">
  ${localHdr}
  ${html}
</section>
`;
}
