/**
 * render.mjs — UNIFIED-PIPELINE PDF renderer
 *
 *   import { renderPdf } from "./render.mjs";
 *   await renderPdf({ config, outputPath });
 *
 * ARCHITECTURE
 * ────────────
 * One HTML document. One Chromium print pass. One page counter.
 * One footer format. One header format. Every page — cover, TOC,
 * founder, dark divider, content, back cover — is a sibling
 * <section class="doc-section doc-section--X"> that breaks to a fresh
 * page via CSS `page-break-before: always`.
 *
 * The page chrome (footer with "FEDERAL LAUNCH KIT · 3 / 11", header
 * with brand label) is rendered by Chromium via the
 * `displayHeaderFooter` + `headerTemplate` + `footerTemplate` API. Those
 * templates run on EVERY printed page automatically. No more manual
 * footers in templates, no per-section page-number assignment, no
 * counter resets.
 *
 * Asset inlining
 * ──────────────
 * The print sandbox routinely fails network image requests, so the
 * brand logo PNGs AND the founder signature SVG are fetched ONCE at
 * render startup, base64-encoded, and injected as data URIs into the
 * relevant templates. No remote URL on the print path = no race.
 *
 * Checkboxes
 * ──────────
 * Chromium's printToPDF does NOT preserve <input type="checkbox"> as
 * PDF AcroForm widgets. After trying pdf-lib post-process overlay on
 * the previous architecture, the per-page coordinate math turned out
 * unreliable when combined with Chromium's header/footer margin
 * reservation. We accept that limitation and ship INTENTIONAL static
 * green-bordered checkboxes that read unambiguously as "check by hand."
 * Consistent across every PDF. CSS lives in styles.css.
 */

import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import { renderCover }     from "./templates/cover.mjs";
import { renderToc }       from "./templates/toc.mjs";
import { renderFounder }   from "./templates/founder.mjs";
import { renderDarkPanel } from "./templates/dark-panel.mjs";
import { renderContent }   from "./templates/content.mjs";
import { renderBackCover } from "./templates/back-cover.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const NODE_MOD  = resolve(REPO_ROOT, "dashboard/node_modules");
const STYLES    = resolve(__dirname, "styles.css");

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ─────────────────────────────────────────────────────────────────────
   Markdown task-list plugin — renders `- [ ] item` / `- [x] item`
   as <li class="task-item"><input type="checkbox" name="..."><span>item</span></li>
   The unique `name` attribute is preserved so future post-processors
   can match by name without rerendering.
   ───────────────────────────────────────────────────────────────────── */
function installTaskListPlugin(md) {
  let counter = 0;

  function slugify(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "item";
  }

  md.core.ruler.after("inline", "task-lists", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type !== "inline") continue;

      const children = tok.children || [];
      if (children.length === 0) continue;
      const first = children[0];
      if (first.type !== "text") continue;

      const m = /^\[( |x|X)\]\s+(.*)$/.exec(first.content);
      if (!m) continue;

      let liIdx = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (tokens[j].type === "list_item_open") { liIdx = j; break; }
        if (tokens[j].type === "list_item_close") break;
      }
      if (liIdx === -1) continue;

      const checked = m[1] === "x" || m[1] === "X";
      const restText = m[2];

      counter += 1;
      const name = `cp-check-${counter}-${slugify(restText)}`;

      const liTok = tokens[liIdx];
      liTok.attrJoin("class", "task-item");

      first.content = restText;
      const checkboxHtml =
        `<input type="checkbox" name="${name}"${checked ? " checked" : ""} /><span>`;
      const openTok = new state.Token("html_inline", "", 0);
      openTok.content = checkboxHtml;
      const closeTok = new state.Token("html_inline", "", 0);
      closeTok.content = "</span>";

      children.unshift(openTok);
      children.push(closeTok);
    }
    return true;
  });
}

async function loadDeps() {
  const playwright = await import(resolve(NODE_MOD, "playwright/index.mjs"));
  const mdPkg      = await import(resolve(NODE_MOD, "markdown-it/index.mjs"));
  const MarkdownIt = mdPkg.default || mdPkg;
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: false });
  installTaskListPlugin(md);
  return { chromium: playwright.chromium, md };
}

/* Fetch + base64-inline brand logos AND the founder signature SVG once,
   at render startup, so the print sandbox doesn't have to fetch them
   (which it usually can't). */
async function loadAssets() {
  const sources = {
    logoDark:     "https://www.capturepilot.com/cp-icon-black.png",
    logoLight:    "https://www.capturepilot.com/cp-icon-white.png",
    signatureSvg: "https://www.capturepilot.com/A.Schueler.svg",
  };
  const out = {};
  for (const [k, url] of Object.entries(sources)) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = url.endsWith(".svg")
        ? "image/svg+xml"
        : "image/png";
      out[k] = `data:${mime};base64,${buf.toString("base64")}`;
    } catch (err) {
      // Fall back to the live URL; the template's onerror handler will
      // hide the broken image if Chromium can't reach the host.
      out[k] = url;
    }
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────
   Header/footer templates injected on EVERY printed page by Chromium.
   These run in a sandboxed iframe with no external CSS / no scripts —
   keep everything inline.
   ───────────────────────────────────────────────────────────────────── */

function chromiumHeaderTemplate({ documentLabel, logoSrc }) {
  // CRITICAL: Chromium PDF header/footer runs in an isolated iframe with
  // NO @font-face support. Web fonts (Inter, IBM Plex Mono) silently fall
  // back to whatever system serif the renderer ships with — that's what
  // produced the awkward header typography pre-2026-06-09. Use system
  // font stacks that resolve to native vector glyphs on macOS/Windows/
  // Linux without round-tripping through a font load.
  return `
<div style="
  width: 100%;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 8pt;
  padding: 0 14mm;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  color: #57534e;
  -webkit-print-color-adjust: exact;
">
  <div style="display:flex; align-items:center; gap:2mm;">
    <img src="${logoSrc}"
         alt="CapturePilot"
         width="16" height="16"
         style="display:block; width:3.6mm; height:3.6mm; border:0;">
    <span style="
      font-weight: 600;
      font-size: 8pt;
      letter-spacing: -0.01em;
      color: #44403c;
    ">CapturePilot</span>
  </div>
  <span style="
    font-family: ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace;
    font-size: 6.5pt;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #78716c;
  ">${escapeHtml(documentLabel)}</span>
</div>
`;
}

function chromiumFooterTemplate({ footerLabel }) {
  // Chromium auto-substitutes <span class="pageNumber"> + <span
  // class="totalPages"> per print. ONE format for every page. Same font
  // story as the header — only system monospace stacks render cleanly
  // in the sandboxed footer iframe.
  return `
<div style="
  width: 100%;
  font-family: ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace;
  font-size: 6.5pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #78716c;
  padding: 0 14mm;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  -webkit-print-color-adjust: exact;
">
  <span>${escapeHtml(footerLabel)}</span>
  <span>
    <span class="pageNumber"></span> / <span class="totalPages"></span>
  </span>
</div>
`;
}

/* ─────────────────────────────────────────────────────────────────────
   Part dispatch
   ───────────────────────────────────────────────────────────────────── */

function renderPart(part, md, assets) {
  const common = {
    logoDark:  assets.logoDark,
    logoLight: assets.logoLight,
  };
  switch (part.type) {
    case "cover":
      return renderCover({ ...part, ...common });
    case "toc":
      return renderToc({ ...part, ...common });
    case "founder":
      return renderFounder({
        ...part,
        ...common,
        signatureDataUri: assets.signatureSvg.startsWith("data:")
          ? assets.signatureSvg
          : "",
        signatureUrl: assets.signatureSvg,
      });
    case "dark":
    case "dark-panel":
      return renderDarkPanel({ ...part, ...common });
    case "content": {
      const html = part.html
        || (part.markdown ? md.render(part.markdown) : "");
      return renderContent({ ...part, html, ...common });
    }
    case "back-cover":
    case "back":
      return renderBackCover({ ...part, ...common });
    default:
      throw new Error(`[pdf-builder] Unknown part type: ${part.type}`);
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Public API
   ───────────────────────────────────────────────────────────────────── */

export async function renderPdf({ config, outputPath }) {
  if (!config) throw new Error("[pdf-builder] config required");
  if (!outputPath) throw new Error("[pdf-builder] outputPath required");

  const resolvedOut = isAbsolute(outputPath)
    ? outputPath
    : resolve(process.cwd(), outputPath);
  await mkdir(dirname(resolvedOut), { recursive: true });

  const { chromium, md } = await loadDeps();
  const css = await readFile(STYLES, "utf8");
  const assets = await loadAssets();

  // Build ONE big HTML document with every section as a sibling.
  const sectionHtml = config.parts
    .map((part) => renderPart(part, md, assets))
    .join("\n");

  const documentLabel = (
    config.documentLabel
    || config.headerLabel
    || config.title
    || "FEDERAL LAUNCH KIT"
  ).toUpperCase();

  const footerLabel = config.footerLabel
    || `CAPTUREPILOT · ${(config.title || "FIELD MANUAL").toUpperCase()}`;

  const fullHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(config.title || "CapturePilot Federal Launch Kit")}</title>
  <style>${css}</style>
</head>
<body>
${sectionHtml}
</body>
</html>
`;

  const TOTAL_PAGES_TOKEN = "__CP_TOTAL_PAGES__";

  function countPdfPages(bytes) {
    try {
      const text = Buffer.from(bytes).toString("binary");
      const m = text.match(/\/Type\s*\/Page[^s]/g);
      if (m && m.length > 0) return m.length;
    } catch { /* fallthrough */ }
    return null;
  }

  // Cover + back-cover + dark-panel all render with NO Chromium header/footer
  // (chapter dividers + hero pages don't need page chrome — it disrupts the
  // visual rhythm). The CSS override during the dedicated render pass keeps
  // the original 14mm side padding (avoiding the "content hugs the edges"
  // look) while extending the section to 11in min-height so the dark grid
  // bg extends edge-to-edge vertically. Vertical padding matches the new
  // tighter body margin (0.6in).
  const NO_CHROME_SECTION_TYPES = ["cover", "back-cover", "back", "dark", "dark-panel"];
  const COVER_FULL_BLEED_CSS = `<style>
body.cp-cover-only{margin:0}
body.cp-cover-only .doc-section--cover,
body.cp-cover-only .doc-section--back-cover,
body.cp-cover-only .doc-section--dark{
  min-height:11in;
  padding:0.6in 14mm;
}
</style>`;
  const NO_CHROME_MARGIN = { top: "0", right: "0", bottom: "0", left: "0" };

  async function renderOnce(html, opts = {}) {
    const {
      withChrome = true,        // false → suppress Chromium header/footer
      pageRanges = "",          // "" = all pages; "1" = first only; "2-" = body
      coverFullBleed = false,   // inject cover-only fullbleed CSS + body class
      // Tightened from 0.85in → 0.6in on 2026-06-09: header/footer
      // typography is smaller now (8pt instead of 9pt label, 6.5pt instead
      // of 7.5pt mono caps) so the reserved band can shrink ~30%.
      margin = { top: "0.6in", right: "0", bottom: "0.6in", left: "0" },
    } = opts;

    const ctxBrowser = await browser.newContext({
      viewport: { width: 816, height: 1056 }, // Letter @ 96dpi
    });
    const page = await ctxBrowser.newPage();

    let finalHtml = html;
    if (coverFullBleed) {
      finalHtml = finalHtml
        .replace("</head>", `${COVER_FULL_BLEED_CSS}</head>`)
        .replace("<body>", `<body class="cp-cover-only">`);
    }

    await page.setContent(finalHtml, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.emulateMedia({ media: "print" });

    const pdfOpts = {
      format: "Letter",
      printBackground: true,
      margin,
      preferCSSPageSize: false,
      displayHeaderFooter: withChrome,
    };
    if (withChrome) {
      pdfOpts.headerTemplate = chromiumHeaderTemplate({
        documentLabel,
        logoSrc: assets.logoDark,
      });
      pdfOpts.footerTemplate = chromiumFooterTemplate({ footerLabel });
    }
    if (pageRanges) pdfOpts.pageRanges = pageRanges;

    return page.pdf(pdfOpts);
  }

  async function mergePdfs(...byteArrays) {
    // Lazy-load pdf-lib from dashboard/node_modules so we don't duplicate
    // the install (matches the existing pattern in build-pdf.mjs).
    const { PDFDocument } = await import(
      resolve(REPO_ROOT, "dashboard/node_modules/pdf-lib/cjs/index.js")
    );
    const out = await PDFDocument.create();
    for (const bytes of byteArrays) {
      if (!bytes) continue;
      const doc = await PDFDocument.load(bytes);
      const pages = await out.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    return Buffer.from(await out.save());
  }

  const parts = Array.isArray(config.parts) ? config.parts : [];
  const sectionHtmls = parts.map((part) => renderPart(part, md, assets));
  const hasNoChromeSection = parts.some((p) => NO_CHROME_SECTION_TYPES.includes(p.type));

  // Render an individual section in isolation — used to measure how many
  // pages each section produces so we can build the chrome vs. no-chrome
  // page-range plan.
  //
  // CRITICAL: must use the SAME top/bottom margins as the full chrome render
  // (0.6in each) so per-section page counts match the chrome PDF's page
  // layout. Previously we used NO_CHROME_MARGIN (all zeros) which gave
  // content sections more vertical space per page and caused systematic
  // under-counting (measured < actual), producing cursor drift for all
  // subsequent section swaps. Using chrome margins here keeps measuredTotal
  // === pageCount and makes cursor-based page-index lookups exact.
  const CHROME_MARGIN = { top: "0.6in", right: "0", bottom: "0.6in", left: "0" };
  async function measureSectionPages(html) {
    const miniHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`;
    const bytes = await renderOnce(miniHtml, { withChrome: false, margin: CHROME_MARGIN });
    return countPdfPages(bytes) || 1;
  }

  // Helper declared up front so it's available to both branches below.
  // Takes a Set<number> of page numbers that should have no chrome, builds
  // contiguous chrome / no-chrome ranges, renders each range from the FULL
  // tokenized HTML (so Chromium's natural pageNumber matches the merged-doc
  // position — keeping footer "x / N" correct), then merges in order.
  let pdfBytes;
  let pageCount = config.parts.length;
  let tokenizedHtml = fullHtml;

  // Render ONE section in isolation as a mini-HTML document — used to
  // produce a no-chrome / full-bleed replacement for a page in the full
  // chrome PDF. Reliable because it doesn't depend on Chromium's
  // pageRanges feature against a re-paginated full doc.
  async function renderSectionAlone(sectionIdx) {
    let html = sectionHtmls[sectionIdx];
    if (html.includes(TOTAL_PAGES_TOKEN)) {
      html = html.split(TOTAL_PAGES_TOKEN).join(String(pageCount));
    }
    const mini = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>section</title><style>${css}</style></head><body>${html}</body></html>`;
    return renderOnce(mini, {
      withChrome: false,
      coverFullBleed: true,
      margin: NO_CHROME_MARGIN,
    });
  }

  // Replace specific page indices in a base PDF with the contents of
  // other PDFs (each replacement may be 1+ pages — they all insert at
  // that index, replacing the original 1 page). Non-replaced pages
  // copy through. Preserves chrome PDF's page numbering for non-swapped
  // pages.
  async function replacePagesInPdf(basePdfBytes, replacements) {
    const { PDFDocument } = await import(
      resolve(REPO_ROOT, "dashboard/node_modules/pdf-lib/cjs/index.js")
    );
    const base = await PDFDocument.load(basePdfBytes);
    const result = await PDFDocument.create();
    const baseCount = base.getPageCount();
    for (let i = 0; i < baseCount; i++) {
      if (replacements.has(i)) {
        const replDoc = await PDFDocument.load(replacements.get(i));
        const replPages = await result.copyPages(replDoc, replDoc.getPageIndices());
        replPages.forEach((p) => result.addPage(p));
      } else {
        const [p] = await result.copyPages(base, [i]);
        result.addPage(p);
      }
    }
    return Buffer.from(await result.save());
  }

  const browser = await chromium.launch();
  try {
    // Pass 1 — render full doc with chrome ON to count total pages (the
    // cover's "N PAGES" label + footer "x / N" both need this).
    const firstPassBytes = await renderOnce(fullHtml, { withChrome: true });
    const counted = countPdfPages(firstPassBytes);
    if (counted != null) pageCount = counted;

    // Substitute the real page count once for the rest of the work.
    tokenizedHtml = fullHtml.includes(TOTAL_PAGES_TOKEN)
      ? fullHtml.split(TOTAL_PAGES_TOKEN).join(String(pageCount))
      : fullHtml;

    if (hasNoChromeSection && pageCount > 1) {
      // Measure each section's page count in isolation so we can compute
      // each section's page index in the chrome PDF. Parallel for speed.
      const sectionPageCounts = await Promise.all(sectionHtmls.map(measureSectionPages));
      const measuredTotal = sectionPageCounts.reduce((a, b) => a + b, 0);

      // Walk parts, build a list of {sectionIdx, firstPageIdx0} for every
      // no-chrome section we want to swap out.
      //
      // Drift strategy: measurement drift (measuredTotal !== pageCount) is
      // caused by long multi-page content sections rendering differently in
      // isolation (no top/bottom margins) vs. in the full chrome doc (0.6in
      // top + 0.6in bottom margins). Single-page sections like dark dividers,
      // cover, and back-cover are immune — they always produce exactly 1 page
      // regardless of margin context, so we can always trust `cursor0` for
      // them even when total drift exists from the longer content sections.
      //
      // Rule: swap any no-chrome section whose isolated measurement is 1 page.
      // Only skip a middle no-chrome section if it measured multi-page AND
      // there is overall drift (cursor position may be wrong in that case).
      const swaps = [];
      let cursor0 = 0; // 0-based page index into chrome PDF
      for (let i = 0; i < parts.length; i++) {
        if (NO_CHROME_SECTION_TYPES.includes(parts[i].type)) {
          const isCover = (i === 0);
          const isBack  = (i === parts.length - 1);
          const isSinglePageSection = sectionPageCounts[i] === 1;
          // Always swap: cover (fixed at page 0), back-cover (fixed at last),
          // any single-page no-chrome section (cursor position is reliable
          // because a 1-page section measured without margins is always 1 page
          // in the full doc too — dark panels never wrap), or any section when
          // there is no drift at all.
          const shouldSwap = isCover || isBack || isSinglePageSection || measuredTotal === pageCount;
          if (shouldSwap) {
            const pageIdx0 = isBack ? pageCount - 1 : cursor0;
            swaps.push({ sectionIdx: i, pageIdx0 });
          } else {
            console.warn(`[pdf-builder] skipping chrome-swap for section ${i} (${parts[i].type}) — measured ${sectionPageCounts[i]} pages with drift, cursor position unreliable.`);
          }
        }
        cursor0 += sectionPageCounts[i];
      }

      if (measuredTotal !== pageCount) {
        console.warn(`[pdf-builder] page-count drift (measured ${measuredTotal}, rendered ${pageCount}) — single-page dark/cover sections still suppressed via per-section measurement.`);
      }

      // Render each no-chrome section alone (parallel) → mini-PDFs.
      const swapBytes = await Promise.all(
        swaps.map(async (s) => ({ ...s, bytes: await renderSectionAlone(s.sectionIdx) })),
      );

      // Build the replacement map: pageIdx0 → bytes.
      const replacementMap = new Map(swapBytes.map((s) => [s.pageIdx0, s.bytes]));

      // Replace those pages in pass 1's chrome PDF.
      pdfBytes = await replacePagesInPdf(firstPassBytes, replacementMap);
    } else if (fullHtml.includes(TOTAL_PAGES_TOKEN)) {
      // Single-page doc — substitute + render once.
      pdfBytes = await renderOnce(tokenizedHtml, { withChrome: true });
    } else {
      pdfBytes = firstPassBytes;
    }

    const recounted = countPdfPages(pdfBytes);
    if (recounted != null) pageCount = recounted;
  } finally {
    await browser.close();
  }

  await writeFile(resolvedOut, pdfBytes);

  const s = await stat(resolvedOut);
  return {
    path: resolvedOut,
    pageCount,
    sizeKB: Math.round(s.size / 1024),
  };
}
