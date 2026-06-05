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
  return `
<div style="
  width: 100%;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 9pt;
  padding: 0 14mm;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  color: #57534e;
  -webkit-print-color-adjust: exact;
">
  <div style="display:flex; align-items:center; gap:2.5mm;">
    <img src="${logoSrc}"
         alt="CapturePilot"
         width="22" height="22"
         style="display:block; width:5mm; height:5mm; border:0;">
    <span style="
      font-weight: 700;
      font-size: 9pt;
      letter-spacing: -0.01em;
      color: #57534e;
    ">CapturePilot</span>
  </div>
  <span style="
    font-family: 'IBM Plex Mono', 'JetBrains Mono', monospace;
    font-size: 7.5pt;
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
  // class="totalPages"> per print. ONE format for every page.
  return `
<div style="
  width: 100%;
  font-family: 'IBM Plex Mono', 'JetBrains Mono', monospace;
  font-size: 7.5pt;
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

  async function renderOnce(html) {
    const ctxBrowser = await browser.newContext({
      viewport: { width: 816, height: 1056 }, // Letter @ 96dpi
    });
    const page = await ctxBrowser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.emulateMedia({ media: "print" });

    return page.pdf({
      format: "Letter",
      printBackground: true,
      // Reserve room for the Chromium-managed header (top) + footer
      // (bottom). 0.85in matches the 8pt mono footer typography with
      // generous breathing room.
      margin: {
        top:    "0.85in",
        right:  "0",
        bottom: "0.85in",
        left:   "0",
      },
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: chromiumHeaderTemplate({
        documentLabel,
        logoSrc: assets.logoDark,
      }),
      footerTemplate: chromiumFooterTemplate({ footerLabel }),
    });
  }

  const browser = await chromium.launch();
  let pdfBytes;
  let pageCount = config.parts.length;
  try {
    // Pass 1 — render with the placeholder still in place so we can
    // count the actual produced page count.
    const firstPassBytes = await renderOnce(fullHtml);
    const counted = countPdfPages(firstPassBytes);
    if (counted != null) pageCount = counted;

    // Pass 2 — re-render with the placeholder replaced by the real total
    // so the cover "N PAGES" label matches the footer "x / N" counter.
    // Skip the second pass if the document doesn't contain the token
    // (e.g. configs that don't include a cover section).
    if (fullHtml.includes(TOTAL_PAGES_TOKEN)) {
      const finalHtml = fullHtml.split(TOTAL_PAGES_TOKEN).join(String(pageCount));
      pdfBytes = await renderOnce(finalHtml);
      const recounted = countPdfPages(pdfBytes);
      if (recounted != null) pageCount = recounted;
    } else {
      pdfBytes = firstPassBytes;
    }
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
