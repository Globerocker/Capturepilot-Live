/**
 * content.mjs — Flowing content section.
 *
 * UNIFIED PIPELINE: renders inline as <section class="doc-section
 * doc-section--content">. Chromium @page handles page breaks AND the
 * per-page running header (CP logo + document label) + footer
 * (CAPTUREPILOT · TITLE  N / N) for every printed page — see
 * render.mjs `displayHeaderFooter: true` + headerTemplate +
 * footerTemplate.
 *
 * DO NOT render an inline .doc-hdr / .hdr / .ftr inside this section —
 * doing so produces visible duplicate strips on top of Chromium's
 * running chrome. The `showLocalHeader` knob is removed; any caller
 * still passing it is silently ignored.
 *
 * The section is page-break-before:always (via .doc-section base style),
 * so every content block starts on a fresh page. Long content paginates
 * naturally under Chromium's print engine.
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

export function renderContent({
  html = "",
  // headerLabel / logoDark / logoLight / showLocalHeader accepted for
  // back-compat but unused — Chromium's @page header renders the brand
  // + label globally on every page.
  // eslint-disable-next-line no-unused-vars
  headerLabel = "FIELD GUIDE",
  // eslint-disable-next-line no-unused-vars
  logoDark = "https://www.capturepilot.com/cp-icon-black.png",
  // eslint-disable-next-line no-unused-vars
  logoLight = "https://www.capturepilot.com/cp-icon-white.png",
  // eslint-disable-next-line no-unused-vars
  showLocalHeader = false,
} = {}) {
  return `
<section class="doc-section doc-section--content">
  ${html}
</section>
`;
}
