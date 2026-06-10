// Build script — FLK_11 Contract Modification Request Template (.docx)
// Run: node contract-mod-request-template-docx.build.mjs
// Produces: FLK_11_Contract_Mod_Request_Template.docx alongside this script,
// then copies it to dashboard/public/starter-pack/11_Post_Award_Compliance/.
//
// SPEC (~2 pages):
//   - Header table: To / From / Date / Contract # / Mod Type
//   - Mod request summary (1 sentence)
//   - Reason (1 para — government convenience, contractor request, scope
//     clarification, no-cost extension, or REA — select one)
//   - Specific change requested (clause / line / quantity / period)
//   - Cost impact ($ or No Cost)
//   - Schedule impact (days)
//   - Justification (3 paragraphs)
//   - POC signature block
//   - Sidebar: 5 most common mod types with brief descriptions
//   - Cross-tool: Word + Pages + Google Docs (explicit columnWidths on every table)

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
import { writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, 'FLK_11_Contract_Mod_Request_Template.docx');
const DEPLOY = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/11_Post_Award_Compliance/FLK_11_Contract_Mod_Request_Template.docx';

// --- Brand ---------------------------------------------------------------
const EMERALD      = '10b981';
const EMERALD_DARK = '047857';
const INK          = '0f172a';
const SLATE        = '475569';
const SLATE_LIGHT  = '94a3b8';
const PAPER        = 'ffffff';
const ROW_ALT      = 'f8fafc';
const SIDEBAR_BG   = 'ecfdf5'; // very light emerald tint

const BODY_FONT = 'Calibri';
const MONO_FONT = 'Consolas';

// Letter 8.5×11, 0.75 in margins. Usable = 7 in = 10080 twips.
// Main column: 6600 twips (~4.58 in). Sidebar: 3480 twips (~2.42 in).
// Gap (table border): ~0. Total = 10080.
const USABLE = 10080;
const MAIN   = 6600;
const SIDE   = 3480;

// Font sizes (half-points)
const SZ_TINY  = 14;  // 7pt  — sidebar fine print
const SZ_MICRO = 16;  // 8pt  — labels, header kickers
const SZ_BODY  = 18;  // 9pt  — body text
const SZ_LEAD  = 20;  // 10pt — slightly larger body
const SZ_H3    = 22;  // 11pt — section labels
const SZ_H2    = 26;  // 13pt — section headings
const SZ_H1    = 36;  // 18pt — doc title

// --- Border helpers -------------------------------------------------------
const noBorder  = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = {
  top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
  insideHorizontal: noBorder, insideVertical: noBorder,
};
const hairline  = { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0' };
const hairlines = {
  top: hairline, bottom: hairline, left: hairline, right: hairline,
  insideHorizontal: hairline, insideVertical: hairline,
};
const thickBottom = {
  ...noBorders,
  bottom: { style: BorderStyle.SINGLE, size: 12, color: EMERALD },
};

// --- Text helpers ---------------------------------------------------------
function run(text, opts = {}) {
  return new TextRun({
    text,
    font:    opts.font    || BODY_FONT,
    size:    opts.size    || SZ_BODY,
    color:   opts.color   || INK,
    bold:    !!opts.bold,
    italics: !!opts.italics,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    alignment:  opts.align || AlignmentType.LEFT,
    spacing: {
      before: opts.before ?? 0,
      after:  opts.after  ?? 60,
      line:   opts.line   ?? 260,
    },
    indent:    opts.indent,
    keepNext:  opts.keepNext  ?? false,
    keepLines: opts.keepLines ?? true,
    children:  Array.isArray(children) ? children : [children],
  });
}

function cell({ children, width, shading, colspan, rowspan, valign = 'top', padding, borders }) {
  return new TableCell({
    width:         { size: width, type: WidthType.DXA },
    columnSpan:    colspan,
    rowSpan:       rowspan,
    shading:       shading
      ? { type: ShadingType.CLEAR, fill: shading, color: 'auto' }
      : undefined,
    verticalAlign: valign,
    margins:       padding || { top: 80, bottom: 80, left: 120, right: 120 },
    borders,
    children:      Array.isArray(children) ? children : [children],
  });
}

// Section heading inside the main column
function sectionHead(label) {
  return para(
    [run(label.toUpperCase(), { font: MONO_FONT, size: SZ_H3, bold: true, color: EMERALD_DARK })],
    { before: 120, after: 40, keepNext: true, line: 240 },
  );
}

// Standard key→value placeholder line
function kv(label, placeholder, opts = {}) {
  return para([
    run(`${label}:  `, { bold: true, size: SZ_LEAD, color: INK }),
    run(placeholder,  { size: SZ_LEAD, color: SLATE, italics: true }),
  ], { after: opts.after ?? 30, line: 240 });
}

// Body paragraph placeholder
function bodyPara(text, opts = {}) {
  return para(
    [run(text, { size: SZ_BODY, color: SLATE, italics: true })],
    { after: opts.after ?? 60, line: 260, indent: opts.indent },
  );
}

// Signature line (underline via a run of underscores)
function sigLine(label) {
  return para([
    run(`${label}:  `, { bold: true, size: SZ_BODY }),
    run('_'.repeat(48), { size: SZ_BODY, color: SLATE_LIGHT }),
  ], { after: 80, line: 240 });
}

// Checkbox option row
function checkOption(text, checked = false) {
  return para([
    run(checked ? '☑  ' : '☐  ', { size: SZ_LEAD, bold: true, color: EMERALD_DARK }),
    run(text, { size: SZ_BODY }),
  ], { after: 30, line: 220, indent: { left: 120, hanging: 120 } });
}

// --- Sidebar card: one mod-type entry ------------------------------------
function sidebarEntry(number, title, description, showDivider = true) {
  const rows = [
    para([
      run(`${number}. `, { size: SZ_MICRO, bold: true, color: EMERALD_DARK }),
      run(title, { size: SZ_MICRO, bold: true, color: INK }),
    ], { before: 0, after: 20, line: 220, keepNext: true }),
    para(
      [run(description, { size: SZ_TINY, color: SLATE })],
      { after: showDivider ? 80 : 20, line: 200 },
    ),
  ];
  if (showDivider) {
    rows.push(para([run('', { size: 4 })], {
      after: 0, line: 80,
    }));
  }
  return rows;
}

// --- Build the full two-column body (main + sidebar) ---------------------

function buildBody() {
  const children = [];

  // ========================================================
  // TITLE BAND (full width)
  // ========================================================
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [USABLE],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: USABLE,
            shading: INK,
            valign: 'center',
            padding: { top: 160, bottom: 160, left: 200, right: 200 },
            children: [
              para([
                run('CONTRACT MODIFICATION REQUEST', {
                  size: SZ_H1, bold: true, color: 'ffffff',
                }),
              ], { after: 24, line: 280, keepNext: true }),
              para([
                run('FAR 43.103 — Bilateral or Unilateral Mod  ·  Standard Form 30 (SF-30)', {
                  size: SZ_MICRO, color: EMERALD, italics: false,
                }),
              ], { after: 0, line: 200 }),
            ],
          }),
        ],
      }),
    ],
  }));

  // thin spacer
  children.push(para([run('', { size: 4 })], { after: 60, line: 80 }));

  // ========================================================
  // HEADER TABLE — To / From / Date / Contract # / Mod Type
  // ========================================================
  // 4 columns: label1 | value1 | label2 | value2
  const H_LBL = 1200;
  const H_VAL = 3840;  // (USABLE - 2*H_LBL) / 2
  // Total: 1200 + 3840 + 1200 + 3840 = 10080 ✓
  const hdrLblCell = (text) => cell({
    width: H_LBL,
    shading: EMERALD_DARK,
    valign: 'center',
    padding: { top: 80, bottom: 80, left: 100, right: 80 },
    borders: hairlines,
    children: [para(
      [run(text, { font: MONO_FONT, size: SZ_MICRO, bold: true, color: 'ffffff' })],
      { after: 0, line: 200 },
    )],
  });
  const hdrValCell = (placeholder) => cell({
    width: H_VAL,
    shading: PAPER,
    valign: 'center',
    padding: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: hairlines,
    children: [para(
      [run(placeholder, { size: SZ_BODY, color: SLATE, italics: true })],
      { after: 0, line: 220 },
    )],
  });

  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [H_LBL, H_VAL, H_LBL, H_VAL],
    borders: hairlines,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          hdrLblCell('TO'),
          hdrValCell('Contracting Officer name, title, agency'),
          hdrLblCell('FROM'),
          hdrValCell('Company name, POC name, phone'),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          hdrLblCell('DATE'),
          hdrValCell('MM/DD/YYYY'),
          hdrLblCell('CONTRACT #'),
          hdrValCell('[PIID / contract number]'),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          hdrLblCell('MOD TYPE'),
          cell({
            width: H_VAL + H_LBL + H_VAL,  // spans last 3 cols
            colspan: 3,
            shading: ROW_ALT,
            valign: 'center',
            padding: { top: 60, bottom: 60, left: 120, right: 120 },
            borders: hairlines,
            children: [para([
              run('☐  Bilateral (FAR 43.103(a))   ', { size: SZ_BODY }),
              run('☐  Unilateral (FAR 43.103(b))   ', { size: SZ_BODY }),
              run('☐  Administrative Change', { size: SZ_BODY }),
            ], { after: 0, line: 220 })],
          }),
        ],
      }),
    ],
  }));

  children.push(para([run('', { size: 4 })], { after: 60, line: 80 }));

  // ========================================================
  // TWO-COLUMN LAYOUT: main body (MAIN twips) + sidebar (SIDE twips)
  // ========================================================
  // We build the left (main) children array and right (sidebar) children array,
  // then wrap them in a single outer table row so they sit side-by-side.

  const mainChildren = [];
  const sideChildren = [];

  // ---------- MAIN: MOD REQUEST SUMMARY ----------------------------------
  mainChildren.push(sectionHead('1. Modification Request Summary'));
  mainChildren.push(bodyPara(
    'In one sentence, describe what you are asking the Contracting Officer to change — ' +
    'e.g., "Request a no-cost 30-day extension to the Period of Performance under CLIN 0001, ' +
    'from [current end date] to [new end date], due to government-caused delay in facility access." ' +
    '[Replace the entire sentence with your own.]',
    { after: 80 },
  ));

  // ---------- MAIN: REASON -----------------------------------------------
  mainChildren.push(sectionHead('2. Reason for Modification'));
  mainChildren.push(para([
    run('Select one reason and delete the others:', {
      size: SZ_MICRO, color: SLATE, italics: true, bold: false,
    }),
  ], { after: 30, line: 200 }));
  [
    'Government Convenience (FAR 52.249-2) — the agency directed the change; contractor is not at fault',
    'Contractor Request — company is requesting relief, funding change, or scope update',
    'Scope Clarification — existing PWS/SOW language is ambiguous and requires interpretive correction',
    'No-Cost Extension — additional time is needed to complete deliverables at no additional cost to the government',
    'Request for Equitable Adjustment (REA) — contractor incurred additional costs due to a government action or change order',
  ].forEach(text => mainChildren.push(checkOption(text)));
  mainChildren.push(para([run('', { size: 4 })], { after: 40, line: 80 }));
  mainChildren.push(bodyPara(
    '[After selecting the reason above, write one paragraph explaining the specific circumstances — ' +
    'what happened, when it happened, and how it connects to the reason selected. ' +
    'Reference contract sections, CDRLs, CLINs, or dates as applicable.]',
    { after: 80 },
  ));

  // ---------- MAIN: SPECIFIC CHANGE REQUESTED ----------------------------
  mainChildren.push(sectionHead('3. Specific Change Requested'));

  // 3-col mini table for the change details
  const CHG_LBL = 1400;
  const CHG_VAL = MAIN - 240 - CHG_LBL;  // subtract cell padding
  // use a 2-col layout: label | value
  const changeRow = (label, placeholder, alt) => new TableRow({
    cantSplit: true,
    children: [
      cell({
        width: CHG_LBL,
        shading: alt ? ROW_ALT : PAPER,
        valign: 'top',
        padding: { top: 60, bottom: 60, left: 100, right: 80 },
        borders: hairlines,
        children: [para(
          [run(label, { bold: true, size: SZ_BODY, color: INK })],
          { after: 0, line: 220 },
        )],
      }),
      cell({
        width: CHG_VAL,
        shading: alt ? ROW_ALT : PAPER,
        valign: 'top',
        padding: { top: 60, bottom: 60, left: 100, right: 100 },
        borders: hairlines,
        children: [para(
          [run(placeholder, { size: SZ_BODY, color: SLATE, italics: true })],
          { after: 0, line: 220 },
        )],
      }),
    ],
  });

  mainChildren.push(new Table({
    width: { size: MAIN - 240, type: WidthType.DXA },
    columnWidths: [CHG_LBL, CHG_VAL],
    borders: hairlines,
    rows: [
      changeRow('Clause / Section', '[FAR clause, PWS §, or CLIN reference — e.g., FAR 52.212-4(l)]', false),
      changeRow('Line Item (CLIN)', '[CLIN 0001, 0002-AA, etc. — or "N/A"]', true),
      changeRow('Quantity / Amount', '[Revised qty or dollar amount — or "No change"]', false),
      changeRow('Period of Performance', '[Current end date → proposed new end date — or "No change"]', true),
      changeRow('Deliverable / CDRL', '[DD-XXXX-XXXX or deliverable title — or "N/A"]', false),
    ],
  }));
  mainChildren.push(para([run('', { size: 4 })], { after: 60, line: 80 }));

  // ---------- MAIN: COST IMPACT ------------------------------------------
  mainChildren.push(sectionHead('4. Cost Impact'));
  const COST_A = 1600;
  const COST_B = MAIN - 240 - COST_A;
  mainChildren.push(new Table({
    width: { size: MAIN - 240, type: WidthType.DXA },
    columnWidths: [COST_A, COST_B],
    borders: hairlines,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: COST_A,
            shading: EMERALD,
            valign: 'center',
            padding: { top: 60, bottom: 60, left: 100, right: 80 },
            children: [para(
              [run('Cost Impact', { font: MONO_FONT, size: SZ_MICRO, bold: true, color: 'ffffff' })],
              { after: 0, line: 200 },
            )],
          }),
          cell({
            width: COST_B,
            shading: PAPER,
            valign: 'center',
            padding: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [para([
              run('☐  No Cost   ', { size: SZ_BODY }),
              run('☐  Additional Cost: $', { size: SZ_BODY }),
              run('_____________', { size: SZ_BODY, color: SLATE_LIGHT }),
              run('   ☐  Cost Reduction: $', { size: SZ_BODY }),
              run('_____________', { size: SZ_BODY, color: SLATE_LIGHT }),
            ], { after: 0, line: 220 })],
          }),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: COST_A,
            shading: EMERALD,
            valign: 'center',
            padding: { top: 60, bottom: 60, left: 100, right: 80 },
            children: [para(
              [run('Schedule Impact', { font: MONO_FONT, size: SZ_MICRO, bold: true, color: 'ffffff' })],
              { after: 0, line: 200 },
            )],
          }),
          cell({
            width: COST_B,
            shading: ROW_ALT,
            valign: 'center',
            padding: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [para([
              run('☐  No Change   ', { size: SZ_BODY }),
              run('☐  Extension of ', { size: SZ_BODY }),
              run('______', { size: SZ_BODY, color: SLATE_LIGHT }),
              run(' calendar days   ☐  Acceleration', { size: SZ_BODY }),
            ], { after: 0, line: 220 })],
          }),
        ],
      }),
    ],
  }));
  mainChildren.push(para([run('', { size: 4 })], { after: 60, line: 80 }));

  // ---------- MAIN: JUSTIFICATION ----------------------------------------
  mainChildren.push(sectionHead('5. Justification'));
  mainChildren.push(para([
    run('Provide three paragraphs. Keep each to 4–6 sentences.', {
      size: SZ_MICRO, color: SLATE, italics: true,
    }),
  ], { after: 30, line: 200 }));

  mainChildren.push(para([
    run('Paragraph 1 — ', { bold: true, size: SZ_BODY }),
    run('Background and contract history: ', { size: SZ_BODY, bold: true, color: SLATE }),
  ], { after: 10, line: 240, keepNext: true }));
  mainChildren.push(bodyPara(
    '[Describe the original scope, award date, period of performance, and any prior ' +
    'modifications. Cite the contract number and any relevant option periods. ' +
    'Keep it factual — CO doesn\'t need the sales pitch, just the history.]',
    { after: 60 },
  ));

  mainChildren.push(para([
    run('Paragraph 2 — ', { bold: true, size: SZ_BODY }),
    run('What changed and why:', { size: SZ_BODY, bold: true, color: SLATE }),
  ], { after: 10, line: 240, keepNext: true }));
  mainChildren.push(bodyPara(
    '[Explain the triggering event — a government-directed change under FAR 43.202, an ' +
    'unforeseen condition, a funding realignment, or a scope clarification. Be specific: ' +
    'name the date, the government representative who directed the change, and the ' +
    'corresponding email or meeting record (reference as Attachment A if applicable).]',
    { after: 60 },
  ));

  mainChildren.push(para([
    run('Paragraph 3 — ', { bold: true, size: SZ_BODY }),
    run('Why this mod is in the government\'s best interest:', { size: SZ_BODY, bold: true, color: SLATE }),
  ], { after: 10, line: 240, keepNext: true }));
  mainChildren.push(bodyPara(
    '[Explain how approving this modification protects mission continuity, avoids re-procurement ' +
    'costs, or preserves a key deliverable. Include any cost-avoidance math if relevant. ' +
    'Close with a sentence offering to provide a cost and pricing proposal, an independent ' +
    'government estimate reconciliation, or a schedule recovery plan at the CO\'s request.]',
    { after: 80 },
  ));

  // ---------- MAIN: POC / SIGNATURE BLOCK --------------------------------
  mainChildren.push(sectionHead('6. Point of Contact & Signature'));
  mainChildren.push(para([
    run('By signing below, the contractor certifies that the information in this request is ' +
      'accurate and complete, and that no work has begun on any proposed additional scope ' +
      'prior to CO authorization.',
      { size: SZ_BODY, color: SLATE }),
  ], { after: 80, line: 260 }));

  // Signature table: 2 cols
  const SIG_COL = (MAIN - 240) / 2;
  mainChildren.push(new Table({
    width: { size: MAIN - 240, type: WidthType.DXA },
    columnWidths: [SIG_COL, SIG_COL],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: SIG_COL,
            valign: 'top',
            padding: { top: 40, bottom: 40, left: 0, right: 60 },
            children: [
              sigLine('Authorized Signature'),
              sigLine('Printed Name'),
              sigLine('Title'),
            ],
          }),
          cell({
            width: SIG_COL,
            valign: 'top',
            padding: { top: 40, bottom: 40, left: 60, right: 0 },
            children: [
              sigLine('Date'),
              sigLine('Phone'),
              sigLine('Email'),
            ],
          }),
        ],
      }),
    ],
  }));
  mainChildren.push(para([run('', { size: 4 })], { after: 40, line: 80 }));
  mainChildren.push(para([
    run('Attachments referenced:  ', { bold: true, size: SZ_BODY }),
    run('☐  Email/memo directing the change   ☐  REQ cost proposal   ☐  Updated schedule   ☐  Other: ___________', {
      size: SZ_BODY, color: SLATE,
    }),
  ], { after: 0, line: 240 }));

  // ---------- SIDEBAR: 5 most common mod types ---------------------------
  sideChildren.push(para([
    run('5 MOD TYPES WORTH KNOWING', {
      font: MONO_FONT, size: SZ_MICRO, bold: true, color: EMERALD_DARK,
    }),
  ], { before: 0, after: 60, keepNext: true, line: 220 }));

  const modTypes = [
    [
      '1', 'Administrative Change',
      'Fixes clerical errors — wrong POC, address, DUNS/UEI update. Unilateral (FAR 43.101). ' +
      'No cost or scope change. CO issues it; no contractor signature needed.',
      true,
    ],
    [
      '2', 'No-Cost Extension',
      'Extends Period of Performance without adding money. Must show government caused the delay ' +
      'or that the work is still achievable. Bilateral — both parties sign.',
      true,
    ],
    [
      '3', 'Change Order / Equitable Adjustment',
      'Government directs a change under FAR 43.202; contractor submits a Request for Equitable ' +
      'Adjustment (REA) for additional cost + time. Track every hour from day the change is directed.',
      true,
    ],
    [
      '4', 'Supplemental Agreement',
      'Negotiated, mutually agreed modification — new CLIN, added scope, revised specs. ' +
      'Fully bilateral. Most common vehicle for exercising options out-of-sequence.',
      true,
    ],
    [
      '5', 'Termination Settlement Mod',
      'Settles costs after a partial or total termination (T4C or T4D). Use FAR 49.206 procedures. ' +
      'File the settlement proposal within 1 year of notice or risk losing cost recovery.',
      false,
    ],
  ];

  modTypes.forEach(([num, title, desc, divider]) => {
    sidebarEntry(num, title, desc, divider).forEach(p => sideChildren.push(p));
  });

  // Tip box at bottom of sidebar
  sideChildren.push(para([run('', { size: 4 })], { after: 60, line: 80 }));
  sideChildren.push(new Table({
    width: { size: SIDE - 240, type: WidthType.DXA },
    columnWidths: [SIDE - 240],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: SIDE - 240,
            shading: EMERALD,
            valign: 'top',
            padding: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [
              para([
                run('PRO TIP', { font: MONO_FONT, size: SZ_MICRO, bold: true, color: 'ffffff' }),
              ], { after: 30, line: 200, keepNext: true }),
              para([
                run(
                  'The CO can\'t start negotiating your REA until it\'s in writing. ' +
                  'Even an informal email from the COR counts as a mod trigger under FAR 43.103(b)(3) — ' +
                  'document it, date-stamp it, and attach it here as Exhibit A.',
                  { size: SZ_TINY, color: 'ffffff' },
                ),
              ], { after: 0, line: 200 }),
            ],
          }),
        ],
      }),
    ],
  }));

  // Ref line at bottom of sidebar
  sideChildren.push(para([
    run('Key FAR refs: 43.101, 43.102, 43.103, 43.201, 43.202, 43.301', {
      size: SZ_TINY, color: SLATE, italics: true,
    }),
  ], { before: 60, after: 0, line: 180 }));

  // ========================================================
  // ASSEMBLE OUTER TWO-COLUMN TABLE
  // ========================================================
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [MAIN, SIDE],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: false,
        children: [
          cell({
            width: MAIN,
            valign: 'top',
            padding: { top: 0, bottom: 0, left: 0, right: 120 },
            borders: {
              ...noBorders,
              right: hairline,
            },
            children: mainChildren,
          }),
          cell({
            width: SIDE,
            shading: SIDEBAR_BG,
            valign: 'top',
            padding: { top: 120, bottom: 120, left: 160, right: 120 },
            children: sideChildren,
          }),
        ],
      }),
    ],
  }));

  // ========================================================
  // FOOTER (full width)
  // ========================================================
  children.push(para([
    run('capturepilot.com', { font: MONO_FONT, size: SZ_MICRO, color: SLATE }),
    run('  ·  Federal Lead Kit · Contract Modification Request Template  ·  FAR Part 43', {
      size: SZ_MICRO, color: SLATE_LIGHT,
    }),
  ], { before: 80, after: 0, align: AlignmentType.CENTER, line: 200 }));

  return children;
}

// --- Build document ------------------------------------------------------

const doc = new Document({
  creator:     'CapturePilot',
  title:       'CapturePilot Contract Modification Request Template',
  description: 'Federal Lead Kit · FAR Part 43 contract mod request — editable Word/Pages/Google Docs template',
  styles: {
    default: {
      document: {
        run: { font: BODY_FONT, size: SZ_BODY, color: INK },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: {
            width:  convertInchesToTwip(8.5),
            height: convertInchesToTwip(11),
          },
          margin: {
            top:    convertInchesToTwip(0.75),
            right:  convertInchesToTwip(0.75),
            bottom: convertInchesToTwip(0.75),
            left:   convertInchesToTwip(0.75),
            header: convertInchesToTwip(0.3),
            footer: convertInchesToTwip(0.3),
          },
        },
      },
      children: buildBody(),
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(OUTPUT, buffer);
console.log('Wrote', OUTPUT, '— bytes:', buffer.length);

try {
  mkdirSync('/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/11_Post_Award_Compliance', { recursive: true });
  copyFileSync(OUTPUT, DEPLOY);
  console.log('Deployed ->', DEPLOY);
} catch (err) {
  console.error('Deploy copy failed:', err.message);
  process.exit(1);
}
