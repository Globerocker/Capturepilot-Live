/**
 * cover.mjs — Cover page (dark, big headline with one green-accent word).
 *
 * UNIFIED PIPELINE: renders inline as <section class="doc-section
 * doc-section--cover">. The Chromium @page system handles page breaks
 * AND the per-page running header (CP logo + document label) + footer
 * (CAPTUREPILOT · TITLE  N / N) — see render.mjs
 * `displayHeaderFooter: true` + headerTemplate + footerTemplate.
 *
 * DO NOT render an inline .doc-hdr / .hdr / .ftr inside this section —
 * doing so produces visible duplicate strips on top of Chromium's
 * running chrome.
 *
 * NOTE: `.cover__top` (big wordmark + "N PAGES" badge) is part of the
 * cover BODY — it is the hero brand/pages callout, NOT a running
 * header — so it stays. Same for the toolstrip + checklist below.
 */

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12.5L10 17.5L19 7.5" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderTitleLine(line, accentWord) {
  if (!line) return "";
  if (line.includes("<strong>") || line.includes("<em>")) return line;
  if (!accentWord) return escapeHtml(line);
  const re = new RegExp(`\\b(${accentWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "i");
  return escapeHtml(line).replace(re, "<strong>$1</strong>");
}

export function renderCover({
  eyebrow = "FREE FIELD MANUAL · CAPTURE 101",
  titleLines = [],
  accentWord = "",
  pages = null,                     // ignored — see TOTAL_PAGES_PLACEHOLDER below
  toolStrip = [],
  logoDark = "https://www.capturepilot.com/cp-icon-black.png",
  logoLight = "https://www.capturepilot.com/cp-icon-white.png",
} = {}) {
  // Page-count emitted as a sentinel placeholder. render.mjs does a
  // two-pass print: first pass counts the actual PDF pages, second pass
  // re-renders the same HTML with this token replaced by the real total.
  // Any `pages` value from the config is intentionally ignored — the
  // cover label MUST match the footer counter, full stop.
  const pagesToken = "__CP_TOTAL_PAGES__";
  const titleHtml = titleLines
    .map((line) => `<div>${renderTitleLine(line, accentWord)}</div>`)
    .join("");

  const checklistItems = (toolStrip || [])
    .filter((t) => t && t.title)
    .map((t) => `
      <li>
        <span class="check-box">${CHECK_SVG}</span>
        <span>${escapeHtml(t.title)}${t.desc ? ` <span style="color:rgba(245,245,244,0.55); font-weight:500;">· ${escapeHtml(t.desc)}</span>` : ""}</span>
      </li>
    `).join("");

  const toolCols = (toolStrip || []).slice(0, 4).map((t, i) => `
    <div class="cover__tool">
      <span class="tool-num">${String(t.num || i + 1).padStart(2, "0")}</span>
      <div class="tool-title">${escapeHtml(t.title || "")}</div>
      <div class="tool-desc">${escapeHtml(t.desc || "")}</div>
    </div>
  `).join("");

  return `
<section class="doc-section doc-section--cover">
  <div class="cover">
    <div class="cover__top">
      <div class="doc-hdr__brand">
        <img class="doc-hdr__logo doc-hdr__logo--dark"  src="${escapeHtml(logoDark)}"  alt="CapturePilot" width="32" height="32">
        <img class="doc-hdr__logo doc-hdr__logo--light" src="${escapeHtml(logoLight)}" alt="CapturePilot" width="32" height="32">
        <span class="doc-hdr__wordmark">CapturePilot</span>
      </div>
      <div class="cover__pages">
        <span class="cover__pages-num">${pagesToken}</span>
        <span class="cover__pages-label">PAGES</span>
      </div>
    </div>

    <div class="cover__eyebrow">
      <span class="pill">${escapeHtml(eyebrow)}</span>
    </div>

    <h1 class="cover__title headline">${titleHtml}</h1>

    ${checklistItems ? `
      <div class="cover__inside-label">INSIDE THIS MANUAL ↓</div>
      <ul class="cover__checklist">${checklistItems}</ul>
    ` : ""}

    ${toolCols ? `
      <div class="cover__toolstrip">
        <div class="cover__toolstrip-hdr">
          <span>THE FOUR-TOOL SYSTEM</span>
          <span>FREE · LETTER PDF</span>
        </div>
        <div class="cover__tools">${toolCols}</div>
      </div>
    ` : ""}
  </div>
</section>
`;
}
