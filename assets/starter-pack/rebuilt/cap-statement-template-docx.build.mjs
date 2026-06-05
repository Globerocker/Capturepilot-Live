// Build script for FLK_02 Capability Statement — Editable Word Template (.docx)
// Run: node cap-statement-template-docx.build.mjs
// Produces: FLK_02_Capability_Statement_Template.docx alongside this script,
// then copies it into dashboard/public/starter-pack/.
//
// SPEC (single-page template):
//   - Hard one-page cap on Letter (8.5 x 11), 0.5 in margins.
//   - 2-column table layout grouping sections (Logo+Tagline, NAICS, Set-Asides,
//     Competencies, Past Performance, UEI+CAGE+POC).
//   - Body 9-10pt, H2 14pt, H1 18pt.
//   - Explicit twips widths on every cell, cantSplit + keepNext to stop
//     awkward mid-row breaks.
//   - Cross-tool: opens cleanly in Word + Google Docs + LibreOffice (tables
//     only, no multi-column section flow).

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  HeightRule,
  convertInchesToTwip,
} from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/docx/dist/index.mjs';
import { writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, 'FLK_02_Capability_Statement_Template.docx');
const DEPLOY = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/FLK_02_Capability_Statement_Template.docx';

// --- Brand ----------------------------------------------------------------
const EMERALD = '10b981';
const EMERALD_DARK = '047857';
const INK = '0f172a';
const SLATE = '475569';
const SLATE_LIGHT = '94a3b8';
const PAPER = 'ffffff';
const ROW_ALT = 'f8fafc';

// Word can't pull Google Fonts — Calibri is the safe cross-platform default
// (Word, LibreOffice, Google Docs all render it identically).
const BODY_FONT = 'Calibri';
const MONO_FONT = 'Consolas';

// Letter: 8.5 x 11 in. Margins 0.5 in. Usable width = 7.5 in = 10800 twips.
const USABLE_TWIPS = 10800;
const COL_LEFT = 5400;
const COL_RIGHT = 5400;

// Font sizes are in half-points in docx-land.
// 9pt -> 18; 10pt -> 20; 11pt -> 22; 14pt -> 28; 18pt -> 36.
const SIZE_TINY = 16;   // 8pt — micro labels, footer
const SIZE_BODY = 18;   // 9pt — body
const SIZE_LEAD = 20;   // 10pt — slightly bigger body
const SIZE_H3 = 22;     // 11pt — kicker
const SIZE_H2 = 28;     // 14pt — section heading
const SIZE_H1 = 36;     // 18pt — page title

// --- Border helpers -------------------------------------------------------

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = {
  top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
  insideHorizontal: noBorder, insideVertical: noBorder,
};
const hairlineBorder = { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0' };
const hairlineBorders = {
  top: hairlineBorder, bottom: hairlineBorder, left: hairlineBorder, right: hairlineBorder,
  insideHorizontal: hairlineBorder, insideVertical: hairlineBorder,
};

// --- Text helpers ---------------------------------------------------------

function run(str, opts = {}) {
  return new TextRun({
    text: str,
    font: opts.font || BODY_FONT,
    size: opts.size || SIZE_BODY,
    color: opts.color || INK,
    bold: !!opts.bold,
    italics: !!opts.italics,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    alignment: opts.alignment || AlignmentType.LEFT,
    spacing: {
      before: opts.before ?? 0,
      after: opts.after ?? 40,
      line: opts.line ?? 240, // 1.0 line spacing — tight on a one-pager
    },
    indent: opts.indent,
    keepNext: opts.keepNext ?? false,
    keepLines: opts.keepLines ?? true, // never split a paragraph across pages
    children: Array.isArray(children) ? children : [children],
  });
}

// --- Cell builder ---------------------------------------------------------

function cell({ children, width, shading, colspan, valign = 'top', padding, borders }) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: colspan,
    shading: shading ? { type: ShadingType.CLEAR, fill: shading, color: 'auto' } : undefined,
    verticalAlign: valign,
    margins: padding || { top: 80, bottom: 80, left: 100, right: 100 },
    borders,
    children: Array.isArray(children) ? children : [children],
  });
}

// Build a section "card" (heading + body) suitable for sitting inside one half
// of the 2-column outer table. Returns an array of Paragraphs/Tables.
function sectionCard(label, bodyParas, accent = EMERALD_DARK) {
  const heading = para(
    [run(label.toUpperCase(), {
      font: MONO_FONT, size: SIZE_H3, bold: true, color: accent,
    })],
    { before: 0, after: 60, keepNext: true, line: 240 },
  );
  return [heading, ...bodyParas];
}

// Inline key/value line: bold label + slate placeholder.
function kv(label, placeholder) {
  return para([
    run(`${label}: `, { size: SIZE_BODY, bold: true, color: INK }),
    run(placeholder, { size: SIZE_BODY, color: SLATE }),
  ], { after: 30, line: 220 });
}

// Bullet line for competencies / differentiators.
function bullet(text) {
  return para([
    run('•  ', { size: SIZE_BODY, bold: true, color: EMERALD_DARK }),
    run(text, { size: SIZE_BODY, color: INK }),
  ], { after: 30, line: 220, indent: { left: 180, hanging: 180 } });
}

// Checkbox line for cert chips.
function chip(label, checked = false) {
  return para([
    run(checked ? '☑  ' : '☐  ', { size: SIZE_LEAD, bold: true, color: EMERALD_DARK }),
    run(label, { size: SIZE_BODY, color: INK }),
  ], { after: 30, line: 220 });
}

// --- Past performance table (sits inside one cell of the outer table) -----

function ppHeaderCell(label, width) {
  return cell({
    width,
    shading: EMERALD,
    valign: 'center',
    padding: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [para(
      [run(label, { size: SIZE_TINY, bold: true, color: 'ffffff' })],
      { after: 0, line: 200 },
    )],
  });
}

function ppDataCell(value, width, alt) {
  return cell({
    width,
    shading: alt ? ROW_ALT : PAPER,
    valign: 'top',
    padding: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [para(
      [run(value, { size: SIZE_TINY, color: INK })],
      { after: 0, line: 200 },
    )],
  });
}

function pastPerformanceTable() {
  // Inner table widths sum to the right column's content area (~5200 twips
  // after cell padding). Use the full 5400 since we're inside a borderless cell.
  const cols = [1400, 1200, 1000, 1800]; // Client | $ | Period | POC

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      ppHeaderCell('Client / Agency', cols[0]),
      ppHeaderCell('Value', cols[1]),
      ppHeaderCell('Period', cols[2]),
      ppHeaderCell('POC (Name · Phone)', cols[3]),
    ],
  });

  const rows = [
    ['[Agency / Client]', '[$XXX,XXX]', '[MM/YY–MM/YY]', '[Name · Phone]'],
    ['[Agency / Client]', '[$XXX,XXX]', '[MM/YY–MM/YY]', '[Name · Phone]'],
    ['[Commercial OK]',  '[$XXX,XXX]', '[MM/YY–MM/YY]', '[Name · Phone]'],
  ].map((r, i) => new TableRow({
    cantSplit: true,
    children: r.map((v, j) => ppDataCell(v, cols[j], i % 2 === 1)),
  }));

  return new Table({
    width: { size: cols.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: hairlineBorders,
    rows: [headerRow, ...rows],
  });
}

// --- The single-page outer layout ----------------------------------------

function buildPage() {
  const children = [];

  // ---- Title strip (full width) -----------------------------------------
  children.push(new Table({
    width: { size: USABLE_TWIPS, type: WidthType.DXA },
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: USABLE_TWIPS,
            shading: INK,
            valign: 'center',
            padding: { top: 160, bottom: 160, left: 200, right: 200 },
            children: [
              para([
                run('CAPABILITY STATEMENT', {
                  size: SIZE_H1, bold: true, color: 'ffffff',
                }),
              ], { after: 20, line: 280, keepNext: true }),
              para([
                run('{{COMPANY_NAME}}', { size: SIZE_H3, bold: true, color: EMERALD }),
                run('   ·   ', { size: SIZE_H3, color: SLATE_LIGHT }),
                run('{{TAGLINE — one sentence: what you do, for whom}}', {
                  size: SIZE_BODY, color: 'ffffff', italics: true,
                }),
              ], { after: 0, line: 220 }),
            ],
          }),
        ],
      }),
    ],
  }));

  // small spacer
  children.push(para([run('', { size: 4 })], { after: 60, line: 80 }));

  // ---- Row 1: Logo + Identifier strip (full width, 3 cells) -------------
  children.push(new Table({
    width: { size: USABLE_TWIPS, type: WidthType.DXA },
    borders: hairlineBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: 3600,
            shading: PAPER,
            valign: 'center',
            padding: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              para([run('LOGO', {
                font: MONO_FONT, size: SIZE_TINY, bold: true, color: EMERALD_DARK,
              })], { after: 20, line: 200 }),
              para([run('Insert > Pictures', {
                size: SIZE_TINY, color: SLATE, italics: true,
              })], { after: 0, line: 200 }),
            ],
          }),
          cell({
            width: 3600,
            shading: ROW_ALT,
            valign: 'center',
            padding: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              para([run('UEI', { font: MONO_FONT, size: SIZE_TINY, bold: true, color: EMERALD_DARK })], { after: 10, line: 180 }),
              para([run('{{UEI}}', { size: SIZE_BODY, color: INK })], { after: 30, line: 200 }),
              para([run('CAGE', { font: MONO_FONT, size: SIZE_TINY, bold: true, color: EMERALD_DARK })], { after: 10, line: 180 }),
              para([run('{{CAGE}}', { size: SIZE_BODY, color: INK })], { after: 0, line: 200 }),
            ],
          }),
          cell({
            width: 3600,
            shading: PAPER,
            valign: 'center',
            padding: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              para([run('WEBSITE', { font: MONO_FONT, size: SIZE_TINY, bold: true, color: EMERALD_DARK })], { after: 10, line: 180 }),
              para([run('{{WEBSITE}}', { size: SIZE_BODY, color: INK })], { after: 30, line: 200 }),
              para([run('EMAIL', { font: MONO_FONT, size: SIZE_TINY, bold: true, color: EMERALD_DARK })], { after: 10, line: 180 }),
              para([run('{{POC_EMAIL}}', { size: SIZE_BODY, color: INK })], { after: 0, line: 200 }),
            ],
          }),
        ],
      }),
    ],
  }));

  // spacer
  children.push(para([run('', { size: 4 })], { after: 60, line: 80 }));

  // ---- Row 2: NAICS / PSC | Set-Asides (2-column) -----------------------
  children.push(new Table({
    width: { size: USABLE_TWIPS, type: WidthType.DXA },
    borders: hairlineBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: COL_LEFT,
            shading: PAPER,
            valign: 'top',
            padding: { top: 100, bottom: 100, left: 140, right: 140 },
            children: sectionCard('NAICS · PSC Codes', [
              kv('Primary NAICS', '{{NAICS_PRIMARY}} — [Description]'),
              kv('Secondary NAICS', '{{NAICS_SECONDARY}} (comma-sep)'),
              kv('PSC Codes', '{{PSC_CODES}} — [Description]'),
            ]),
          }),
          cell({
            width: COL_RIGHT,
            shading: ROW_ALT,
            valign: 'top',
            padding: { top: 100, bottom: 100, left: 140, right: 140 },
            children: sectionCard('Set-Asides · Certifications', [
              // Use two columns of chips inside this cell via a borderless table
              new Table({
                width: { size: COL_RIGHT - 280, type: WidthType.DXA },
                borders: noBorders,
                rows: [
                  new TableRow({
                    cantSplit: true,
                    children: [
                      cell({
                        width: (COL_RIGHT - 280) / 2,
                        valign: 'top',
                        padding: { top: 0, bottom: 0, left: 0, right: 60 },
                        borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
                        children: [
                          chip('Small Business'),
                          chip('SDVOSB / VOSB'),
                          chip('8(a) BD'),
                          chip('HUBZone'),
                        ],
                      }),
                      cell({
                        width: (COL_RIGHT - 280) / 2,
                        valign: 'top',
                        padding: { top: 0, bottom: 0, left: 60, right: 0 },
                        borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
                        children: [
                          chip('WOSB / EDWOSB'),
                          chip('SDB'),
                          chip('ISO 9001:2015'),
                          chip('CMMC L[1/2/3]'),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ]),
          }),
        ],
      }),
    ],
  }));

  // spacer
  children.push(para([run('', { size: 4 })], { after: 60, line: 80 }));

  // ---- Row 3: Core Competencies | Differentiators (2-column) ------------
  children.push(new Table({
    width: { size: USABLE_TWIPS, type: WidthType.DXA },
    borders: hairlineBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: COL_LEFT,
            shading: PAPER,
            valign: 'top',
            padding: { top: 100, bottom: 100, left: 140, right: 140 },
            children: sectionCard('Core Competencies', [
              bullet('[Specific capability with measurable detail]'),
              bullet('[Specific capability — e.g. CMMC L2 assessments, 14-day turnaround]'),
              bullet('[Specific capability — quantify scope or volume]'),
              bullet('[Specific capability]'),
              bullet('[Specific capability — delete if only 4]'),
            ]),
          }),
          cell({
            width: COL_RIGHT,
            shading: ROW_ALT,
            valign: 'top',
            padding: { top: 100, bottom: 100, left: 140, right: 140 },
            children: sectionCard('Differentiators', [
              bullet('[Why you over the other 47 firms — clearance, certification, or proprietary process]'),
              bullet('[Federal track record proof — named agency, specific outcome]'),
              bullet('[Quantified result — numbers, dates, mission impact]'),
            ]),
          }),
        ],
      }),
    ],
  }));

  // spacer
  children.push(para([run('', { size: 4 })], { after: 60, line: 80 }));

  // ---- Row 4: Past Performance (full width, contains inner table) -------
  children.push(new Table({
    width: { size: USABLE_TWIPS, type: WidthType.DXA },
    borders: hairlineBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: USABLE_TWIPS,
            shading: PAPER,
            valign: 'top',
            padding: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              ...sectionCard('Past Performance', []),
              pastPerformanceTable(),
            ],
          }),
        ],
      }),
    ],
  }));

  // spacer
  children.push(para([run('', { size: 4 })], { after: 60, line: 80 }));

  // ---- Row 5: POC block (full width) ------------------------------------
  children.push(new Table({
    width: { size: USABLE_TWIPS, type: WidthType.DXA },
    borders: hairlineBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: USABLE_TWIPS,
            shading: EMERALD,
            valign: 'center',
            padding: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              para([
                run('POINT OF CONTACT  ·  ', { font: MONO_FONT, size: SIZE_TINY, bold: true, color: 'ffffff' }),
                run('{{POC_NAME}}', { size: SIZE_BODY, bold: true, color: 'ffffff' }),
                run('  ·  ', { size: SIZE_BODY, color: 'ffffff' }),
                run('{{POC_TITLE}}', { size: SIZE_BODY, color: 'ffffff' }),
                run('  ·  ', { size: SIZE_BODY, color: 'ffffff' }),
                run('{{POC_PHONE}}', { size: SIZE_BODY, color: 'ffffff' }),
                run('  ·  ', { size: SIZE_BODY, color: 'ffffff' }),
                run('{{POC_EMAIL}}', { size: SIZE_BODY, bold: true, color: 'ffffff' }),
              ], { after: 0, line: 220 }),
            ],
          }),
        ],
      }),
    ],
  }));

  // Tiny footer line — not in a Footer section so it stays anchored to content
  children.push(para([
    run('capturepilot.com', { font: MONO_FONT, size: SIZE_TINY, color: SLATE }),
    run('  ·  Federal Lead Kit · Capability Statement Template', {
      size: SIZE_TINY, color: SLATE_LIGHT,
    }),
  ], { before: 80, after: 0, alignment: AlignmentType.CENTER, line: 200 }));

  return children;
}

// --- Build ---------------------------------------------------------------

const doc = new Document({
  creator: 'CapturePilot',
  title: 'Capability Statement — Editable Template',
  description: 'Federal Lead Kit · Capability Statement editable Word template (one-page)',
  styles: {
    default: {
      document: {
        run: { font: BODY_FONT, size: SIZE_BODY, color: INK },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
          margin: {
            top: convertInchesToTwip(0.5),
            right: convertInchesToTwip(0.5),
            bottom: convertInchesToTwip(0.5),
            left: convertInchesToTwip(0.5),
            header: convertInchesToTwip(0.25),
            footer: convertInchesToTwip(0.25),
          },
        },
      },
      children: buildPage(),
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(OUTPUT, buffer);
console.log('Wrote', OUTPUT, 'bytes:', buffer.length);

// Copy into dashboard/public/starter-pack so the download endpoint serves the
// freshly rebuilt file (overwrite, no new variant).
try {
  copyFileSync(OUTPUT, DEPLOY);
  console.log('Deployed ->', DEPLOY);
} catch (err) {
  console.error('Deploy copy failed:', err.message);
  process.exit(1);
}
