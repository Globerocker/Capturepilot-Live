/**
 * build-pdf.mjs — Render 01-federal-contracting-starter-pack.md into a
 * polished, branded PDF.
 *
 * Reuses the playwright + markdown-it installs from `dashboard/node_modules`
 * so we don't duplicate the ~150MB Chromium binary. Run from repo root:
 *
 *   node assets/starter-pack/build-pdf.mjs
 *
 * Output: assets/starter-pack/01-federal-contracting-starter-pack.pdf
 *
 * The HTML wrapper inlines CapturePilot brand styles (Inter font + emerald
 * accents + stone-greys) and adds:
 *   - Cover page with big title + tagline
 *   - Print-friendly tables, headings, callouts
 *   - Page header (logo wordmark) + footer (page numbers + CTA)
 *   - Hyphenation + balanced text for cleaner long-form reading
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, "../..");
const NODE_MOD   = resolve(REPO_ROOT, "dashboard/node_modules");
const INPUT_MD   = resolve(__dirname, "01-federal-contracting-starter-pack.md");
const OUTPUT_PDF = resolve(__dirname, "01-federal-contracting-starter-pack.pdf");

const { chromium } = await import(resolve(NODE_MOD, "playwright/index.mjs"));
const { default: MarkdownIt } = await import(resolve(NODE_MOD, "markdown-it/index.mjs"));

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

const raw   = await readFile(INPUT_MD, "utf8");
const body  = md.render(raw);
const today = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>The Federal Contracting Starter Pack — CapturePilot</title>
<style>
  @page {
    size: Letter;
    margin: 22mm 18mm 24mm 18mm;
    @bottom-left   { content: "CapturePilot · capturepilot.com"; font-family: Inter, system-ui; font-size: 9pt; color: #78716c; }
    @bottom-right  { content: counter(page) " / " counter(pages);                     font-family: Inter, system-ui; font-size: 9pt; color: #78716c; }
  }

  :root {
    --emerald: #059669;
    --emerald-dark: #047857;
    --emerald-bg: #ecfdf5;
    --stone-50:  #fafaf9;
    --stone-100: #f5f5f4;
    --stone-200: #e7e5e4;
    --stone-400: #a8a29e;
    --stone-500: #78716c;
    --stone-700: #44403c;
    --stone-900: #1c1917;
    --amber-50:  #fffbeb;
    --amber-200: #fde68a;
    --amber-800: #92400e;
  }

  * { box-sizing: border-box; }
  html, body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--stone-900);
    font-size: 10.5pt;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    hyphens: auto;
    text-wrap: pretty;
  }

  /* ────────────── COVER PAGE ────────────── */
  .cover {
    page-break-after: always;
    height: calc(100vh - 50mm);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background: linear-gradient(180deg, var(--stone-50), white);
    padding: 12mm 6mm;
    border-radius: 6mm;
  }
  .cover-mark {
    font-size: 11pt;
    font-weight: 800;
    letter-spacing: 0.15em;
    color: var(--emerald-dark);
    text-transform: uppercase;
  }
  .cover-title {
    font-size: 38pt;
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: -0.025em;
    color: var(--stone-900);
    margin: 4mm 0 6mm 0;
  }
  .cover-title strong { color: var(--emerald); }
  .cover-lede {
    font-size: 14pt;
    font-weight: 500;
    color: var(--stone-700);
    line-height: 1.4;
    margin-bottom: 8mm;
    max-width: 90%;
  }
  .cover-meta {
    font-size: 9.5pt;
    color: var(--stone-500);
    border-top: 1pt solid var(--stone-200);
    padding-top: 4mm;
  }
  .cover-meta strong { color: var(--stone-900); }

  /* ────────────── HEADINGS ────────────── */
  h1, h2, h3 { letter-spacing: -0.015em; }
  h1 {
    font-size: 22pt;
    font-weight: 900;
    color: var(--stone-900);
    margin: 0 0 6mm 0;
    padding-bottom: 3mm;
    border-bottom: 2pt solid var(--emerald);
    page-break-before: always;
    page-break-after: avoid;
  }
  h1:first-of-type { page-break-before: avoid; }
  h2 {
    font-size: 14pt;
    font-weight: 800;
    color: var(--emerald-dark);
    margin: 8mm 0 3mm 0;
    page-break-after: avoid;
  }
  h3 {
    font-size: 11pt;
    font-weight: 700;
    color: var(--stone-900);
    margin: 5mm 0 2mm 0;
    page-break-after: avoid;
  }

  /* ────────────── PARAGRAPH / LIST ────────────── */
  p { margin: 0 0 3mm 0; }
  ul, ol { margin: 0 0 3mm 0; padding-left: 5mm; }
  li { margin: 0 0 1.5mm 0; }
  li > p { margin: 0 0 1mm 0; }
  strong { color: var(--stone-900); font-weight: 700; }
  a { color: var(--emerald-dark); text-decoration: underline; }

  /* ────────────── BLOCKQUOTE / CALLOUT ────────────── */
  blockquote {
    border-left: 3pt solid var(--emerald);
    background: var(--emerald-bg);
    padding: 3mm 5mm;
    margin: 4mm 0;
    color: var(--stone-700);
    font-style: italic;
  }
  blockquote p:last-child { margin-bottom: 0; }

  /* ────────────── TABLES ────────────── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 4mm 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  thead {
    background: var(--stone-100);
    border-bottom: 1.5pt solid var(--stone-200);
  }
  th {
    text-align: left;
    font-weight: 700;
    color: var(--stone-700);
    padding: 2mm 3mm;
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td {
    padding: 2mm 3mm;
    border-bottom: 0.5pt solid var(--stone-200);
    vertical-align: top;
  }
  tr:last-child td { border-bottom: none; }

  /* ────────────── HR ────────────── */
  hr {
    border: none;
    border-top: 1pt dashed var(--stone-200);
    margin: 6mm 0;
  }

  /* ────────────── CODE ────────────── */
  code {
    background: var(--stone-100);
    color: var(--stone-900);
    padding: 0.5mm 1.5mm;
    border-radius: 1mm;
    font-family: 'Courier Prime', 'SF Mono', Consolas, monospace;
    font-size: 9.5pt;
  }
  pre {
    background: var(--stone-100);
    color: var(--stone-900);
    padding: 3mm;
    border-radius: 2mm;
    overflow-x: auto;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }

  /* ────────────── EMOJI CHECKLIST ──────────────
     Markdown bullets that start with ✅ get a green accent. */
  ul li {
    list-style-type: square;
  }

  /* ────────────── BACK COVER ────────────── */
  .back-cover {
    margin-top: 12mm;
    border-top: 2pt solid var(--emerald);
    padding-top: 6mm;
    text-align: center;
    page-break-before: always;
  }
  .back-cta {
    background: var(--stone-900);
    color: white;
    padding: 8mm 6mm;
    border-radius: 4mm;
    margin: 6mm 0;
  }
  .back-cta h2 {
    color: white;
    border: none;
    margin: 0 0 2mm 0;
    font-size: 18pt;
  }
  .back-cta p {
    color: var(--stone-200);
    margin: 0 0 5mm 0;
  }
  .back-cta .pill {
    display: inline-block;
    background: var(--emerald);
    color: white;
    font-weight: 800;
    padding: 3mm 6mm;
    border-radius: 999px;
    font-size: 11pt;
  }
</style>
</head>
<body>

<!-- ────────────── COVER ────────────── -->
<section class="cover">
  <div>
    <div class="cover-mark">CapturePilot · ${today}</div>
    <div class="cover-title">The Federal<br>Contracting<br><strong>Starter Pack</strong>.</div>
    <div class="cover-lede">
      Everything you need to know before bidding on your first federal contract.
      A 15-page playbook written for first-time bidders.
    </div>
  </div>
  <div class="cover-meta">
    <p><strong>Inside:</strong> the 10-step pre-bid checklist · SAM.gov registration walkthrough · NAICS picker · the 1-page Capability Statement template · which certification to pursue · why Sources Sought is where you really start · first-bid checklist · 7 most common rejection reasons · 25-acronym glossary · free resources.</p>
    <p style="margin-top: 3mm;">© CapturePilot ${new Date().getFullYear()}. Free to share with anyone starting their federal contracting journey.</p>
  </div>
</section>

<!-- ────────────── BODY ────────────── -->
${body}

<!-- ────────────── BACK COVER ────────────── -->
<section class="back-cover">
  <div class="back-cta">
    <h2>Ready to compress your learning curve?</h2>
    <p>CapturePilot does the searching, scoring, and prep — so you can spend your time writing winning proposals.</p>
    <div class="pill">capturepilot.com/signup · 14-day free Pro trial</div>
  </div>
  <p style="color: var(--stone-500); font-size: 9pt;">Questions? Book a free 30-min audit call at <strong>capturepilot.com/book</strong> — we'll review your business and point out the 3 best contracts to chase first.</p>
</section>

</body>
</html>
`;

const browser = await chromium.launch();
const ctx     = await browser.newContext();
const page    = await ctx.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
const pdfBuffer = await page.pdf({
    format: "Letter",
    printBackground: true,
    margin: { top: "22mm", right: "18mm", bottom: "24mm", left: "18mm" },
    displayHeaderFooter: false,  // @page CSS handles header/footer
});
await writeFile(OUTPUT_PDF, pdfBuffer);
await browser.close();

const stat = await import("node:fs/promises").then(m => m.stat(OUTPUT_PDF));
console.log(`✓ Built ${OUTPUT_PDF}  (${(stat.size / 1024).toFixed(1)} KB)`);
