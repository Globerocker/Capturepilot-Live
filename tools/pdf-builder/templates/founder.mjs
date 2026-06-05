/**
 * founder.mjs — Founder note page (light, two-column with photo + bio chips).
 *
 * UNIFIED PIPELINE: renders inline as <section class="doc-section
 * doc-section--founder">. Chromium @page handles footer + page numbering.
 *
 * SIGNATURE: the SVG asset is fetched ONCE at render startup and
 * base64-inlined as `data:image/svg+xml;base64,...` so the print iframe
 * never has to make a network round-trip (which was racing on most
 * documents and silently falling back to cursive text). The caller
 * passes `signatureDataUri`; if absent we fall back to the remote URL
 * with an onerror hook that unhides the cursive text equivalent.
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

const DEFAULT_CHIPS = [
  "Boarding Team", "Op. Atalanta", "Teacher",
  "Head of Marketing", "HubSpot Partner", "MS Dynamics 365",
];

const DEFAULT_SIGNATURE_URL = "https://www.capturepilot.com/A.Schueler.svg";

export function renderFounder({
  headline = "",
  accentWord = "",
  paragraphs = [],
  ctaText = "Book a B2G Audit call with me",
  ctaUrl = "https://meetings-na2.hubspot.com/americurial/intro-call",
  ctaButtonLabel = "Book the call →",
  ctaEyebrow = "30 MIN · NO PITCH",
  name = "André Schuler",
  role = "Co-Founder · CapturePilot · Software & Digitalization",
  location = "GERMANY / U.S.",
  signatureUrl = DEFAULT_SIGNATURE_URL,
  signatureDataUri = "",  // injected by render.mjs at startup (preferred)
  chipRowLabel = "+ GERMAN NAVY · MARINEINFANTERIST\nBOARDING TEAM · OP. ATALANTA",
  chips = DEFAULT_CHIPS,
  photoUrl = "https://www.capturepilot.com/team/andre-headshot.jpg",
  logoDark = "https://www.capturepilot.com/cp-icon-black.png",
  logoLight = "https://www.capturepilot.com/cp-icon-white.png",
} = {}) {
  const paragraphHtml = (paragraphs || []).map(
    (p) => `<p>${escapeHtml(p)}</p>`
  ).join("");

  const chipsHtml = (chips || []).map(
    (c) => `<span class="chip">${escapeHtml(c)}</span>`
  ).join("");

  const chipRowHtml = (chipRowLabel || "")
    .split("\n")
    .map((l) => escapeHtml(l))
    .join("<br>");

  // Prefer the inlined data URI; remote URL only as a fallback.
  const sigSrc = signatureDataUri || signatureUrl;
  const sigOnError = signatureDataUri
    ? ""  // inlined source — if it fails the SVG itself is broken
    : `onerror="this.style.display='none'; var t=this.parentNode.querySelector('.founder__signature--text'); if(t) t.style.display='inline-block';"`;

  return `
<section class="doc-section doc-section--founder">
  <div class="doc-hdr">
    <div class="doc-hdr__brand">
      <img class="doc-hdr__logo doc-hdr__logo--dark"  src="${escapeHtml(logoDark)}"  alt="CapturePilot" width="32" height="32">
      <img class="doc-hdr__logo doc-hdr__logo--light" src="${escapeHtml(logoLight)}" alt="CapturePilot" width="32" height="32">
      <span class="doc-hdr__wordmark">CapturePilot</span>
    </div>
    <span class="doc-hdr__label">FOUNDER'S NOTE</span>
  </div>

  <div class="founder">
    <div>
      <div class="founder__photo">
        <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name)}" onerror="this.style.display='none'; this.parentNode.style.background='#1c1917';">
      </div>
      <h2 class="founder__name">${escapeHtml(name)}</h2>
      <p class="founder__role">${escapeHtml(role)}</p>
      <p class="founder__location">${escapeHtml(location)}</p>
      ${chipRowHtml ? `<div class="founder__chip-row">${chipRowHtml}</div>` : ""}
      <div class="founder__chips">${chipsHtml}</div>
    </div>

    <div>
      <div class="founder__eyebrow">A LETTER TO THE OPERATOR</div>
      <h1 class="founder__headline">${renderHeadline(headline, accentWord)}</h1>
      <div class="founder__body">${paragraphHtml}</div>

      <div class="founder__signature">
        <img src="${sigSrc}" alt="${escapeHtml(name)} signature"
             style="display:block;max-width:60mm;height:auto;margin-top:4mm;background:transparent;border:0;"
             ${sigOnError}>
        <span class="founder__signature--text">${escapeHtml(name)}</span>
      </div>

      ${ctaText ? `
        <div class="founder__cta">
          <div class="founder__cta-text">
            <div class="founder__cta-eyebrow">${escapeHtml(ctaEyebrow)}</div>
            <div class="founder__cta-title">${escapeHtml(ctaText)}</div>
            <div class="founder__cta-url">${escapeHtml(ctaUrl)}</div>
          </div>
          <a class="cta-btn" href="${escapeHtml(ctaUrl)}">${escapeHtml(ctaButtonLabel)}</a>
        </div>
      ` : ""}
    </div>
  </div>
</section>
`;
}
