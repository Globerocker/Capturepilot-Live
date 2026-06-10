// Build script: FLK_04_Bid_Decision_Memo_Template.docx
// Run: node assets/starter-pack/rebuilt/bid-decision-memo-template-docx.build.mjs
// Produces the file directly at the production DEPLOY path.

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
  convertInchesToTwip,
} from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/docx/dist/index.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

// --- Paths ----------------------------------------------------------------
const DEPLOY = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/04_Bid_No_Bid_Decision_Toolkit/FLK_04_Bid_Decision_Memo_Template.docx';

// --- Brand ----------------------------------------------------------------
const EMERALD      = '10b981';
const EMERALD_DARK = '047857';
const INK          = '0f172a';
const SLATE        = '475569';
const SLATE_LIGHT  = '94a3b8';
const PAPER        = 'ffffff';
const ROW_ALT      = 'f8fafc';
const ROW_WARN     = 'fef3c7'; // amber tint for Risk rows

const BODY_FONT = 'Calibri';
const MONO_FONT = 'Consolas';

// Letter, 1 in margins, usable width = 6.5 in = 9360 twips
const USABLE = 9360;

// Half-point sizes
const SZ_TINY = 16; // 8pt
const SZ_BODY = 20; // 10pt
const SZ_SM   = 18; // 9pt
const SZ_H3   = 22; // 11pt
const SZ_H2   = 28; // 14pt
const SZ_H1   = 36; // 18pt

// --- Border helpers -------------------------------------------------------
const NO  = { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' };
const H   = { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0' };  // hairline gray
const EM  = { style: BorderStyle.SINGLE, size: 8, color: EMERALD };   // emerald accent
const noBorders = { top: NO, bottom: NO, left: NO, right: NO, insideHorizontal: NO, insideVertical: NO };
const hairBorders = { top: H,  bottom: H,  left: H,  right: H,  insideHorizontal: H,  insideVertical: H };
const leftAccent = { top: H, bottom: H, left: EM, right: H, insideHorizontal: H, insideVertical: H };

// --- Text & paragraph helpers ---------------------------------------------
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
    alignment: opts.align || AlignmentType.LEFT,
    spacing: {
      before: opts.before ?? 0,
      after:  opts.after  ?? 60,
      line:   opts.line   ?? 276, // ~1.15
    },
    indent: opts.indent,
    keepNext:  opts.keepNext  ?? false,
    keepLines: opts.keepLines ?? true,
    children: Array.isArray(children) ? children : [children],
  });
}

function spacer(pts = 4) {
  return para([run('', { size: pts * 2 })], { after: 40, line: 80 });
}

// --- Cell builder ---------------------------------------------------------
function cell({ children, width, shading, colspan, rowspan, valign = 'top', pad, borders }) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: colspan,
    rowSpan: rowspan,
    shading: shading ? { type: ShadingType.CLEAR, fill: shading, color: 'auto' } : undefined,
    verticalAlign: valign,
    margins: pad || { top: 80, bottom: 80, left: 120, right: 120 },
    borders,
    children: Array.isArray(children) ? children : [children],
  });
}

// --- Section label (MONO, emerald, uppercase) ------------------------------
function sectionLabel(text) {
  return para(
    [run(text.toUpperCase(), { font: MONO_FONT, size: SZ_SM, bold: true, color: EMERALD_DARK })],
    { after: 40, keepNext: true, line: 240 },
  );
}

// --- Body text helpers ----------------------------------------------------
function bodyPara(text, opts = {}) {
  return para([run(text, { size: SZ_BODY, color: opts.color || INK, italics: opts.italics })], {
    after: opts.after ?? 60,
    line: 276,
  });
}

function kv(label, placeholder, labelWidth) {
  // Used inside table cells where a bold label precedes the placeholder
  return para([
    run(label + '  ', { size: SZ_BODY, bold: true, color: INK }),
    run(placeholder, { size: SZ_BODY, color: SLATE }),
  ], { after: 50, line: 240 });
}

function bullet(text, color = INK) {
  return para([
    run('•  ', { size: SZ_BODY, bold: true, color: EMERALD_DARK }),
    run(text, { size: SZ_BODY, color }),
  ], { after: 50, line: 240, indent: { left: 200, hanging: 200 } });
}

// --- Opportunity Snapshot table -------------------------------------------
// 2 columns: left = label, right = value. 6 rows.
function snapshotTable() {
  const L = 2200; // label col
  const R = USABLE - L; // value col

  function snapRow(label, placeholder, alt) {
    return new TableRow({
      cantSplit: true,
      children: [
        cell({
          width: L,
          shading: alt ? ROW_ALT : PAPER,
          valign: 'center',
          pad: { top: 60, bottom: 60, left: 120, right: 80 },
          borders: hairBorders,
          children: [para([run(label, { size: SZ_SM, bold: true, color: SLATE })], { after: 0, line: 220 })],
        }),
        cell({
          width: R,
          shading: alt ? ROW_ALT : PAPER,
          valign: 'center',
          pad: { top: 60, bottom: 60, left: 120, right: 120 },
          borders: hairBorders,
          children: [para([run(placeholder, { size: SZ_BODY, color: INK })], { after: 0, line: 220 })],
        }),
      ],
    });
  }

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      cell({
        width: L,
        shading: INK,
        valign: 'center',
        pad: { top: 60, bottom: 60, left: 120, right: 80 },
        borders: hairBorders,
        children: [para([run('FIELD', { font: MONO_FONT, size: SZ_TINY, bold: true, color: 'ffffff' })], { after: 0, line: 200 })],
      }),
      cell({
        width: R,
        shading: INK,
        valign: 'center',
        pad: { top: 60, bottom: 60, left: 120, right: 120 },
        borders: hairBorders,
        children: [para([run('VALUE', { font: MONO_FONT, size: SZ_TINY, bold: true, color: 'ffffff' })], { after: 0, line: 200 })],
      }),
    ],
  });

  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [L, R],
    borders: hairBorders,
    rows: [
      headerRow,
      snapRow('Opportunity Title', '{{OPP_TITLE}}', false),
      snapRow('Issuing Agency / Office', '{{AGENCY}} — {{OFFICE}}', true),
      snapRow('NAICS Code', '{{NAICS}} — {{NAICS_TITLE}}', false),
      snapRow('Estimated Value', '${{VALUE_LOW}} – ${{VALUE_HIGH}}  ({{CONTRACT_TYPE}})', true),
      snapRow('Set-Aside / Socioeconomic', '{{SET_ASIDE}}  (e.g., SDVOSB, 8(a), Full & Open)', false),
      snapRow('Proposal Due Date', '{{DUE_DATE}} at {{DUE_TIME}} {{TIME_ZONE}} — {{DAYS_REMAINING}} days out', true),
      snapRow('Solicitation Number', '{{SOL_NUMBER}}', false),
    ],
  });
}

// --- PWin summary table (score + 3 strengths + 3 risks) -------------------
function pwinTable() {
  // 3 cols: Score panel (left, narrow) + Strengths (mid) + Risks (right)
  const LC = 1600;
  const MC = Math.floor((USABLE - LC) / 2);
  const RC = USABLE - LC - MC;

  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [LC, MC, RC],
    borders: hairBorders,
    rows: [
      // Header row
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          cell({
            width: LC,
            shading: EMERALD_DARK,
            valign: 'center',
            pad: { top: 60, bottom: 60, left: 100, right: 80 },
            borders: hairBorders,
            children: [para([run('PWIN SCORE', { font: MONO_FONT, size: SZ_TINY, bold: true, color: 'ffffff' })], { after: 0, line: 200 })],
          }),
          cell({
            width: MC,
            shading: EMERALD,
            valign: 'center',
            pad: { top: 60, bottom: 60, left: 100, right: 80 },
            borders: hairBorders,
            children: [para([run('TOP STRENGTHS', { font: MONO_FONT, size: SZ_TINY, bold: true, color: 'ffffff' })], { after: 0, line: 200 })],
          }),
          cell({
            width: RC,
            shading: '92400e',
            valign: 'center',
            pad: { top: 60, bottom: 60, left: 100, right: 80 },
            borders: hairBorders,
            children: [para([run('KEY RISKS', { font: MONO_FONT, size: SZ_TINY, bold: true, color: 'ffffff' })], { after: 0, line: 200 })],
          }),
        ],
      }),
      // Data row
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: LC,
            shading: PAPER,
            valign: 'center',
            pad: { top: 100, bottom: 100, left: 100, right: 80 },
            borders: hairBorders,
            children: [
              para([run('{{PWIN_SCORE}}', { size: 48, bold: true, color: EMERALD_DARK })], { after: 20, align: AlignmentType.CENTER, line: 240 }),
              para([run('/ 100', { size: SZ_SM, color: SLATE })], { after: 0, align: AlignmentType.CENTER, line: 220 }),
            ],
          }),
          cell({
            width: MC,
            shading: PAPER,
            valign: 'top',
            pad: { top: 100, bottom: 100, left: 120, right: 100 },
            borders: hairBorders,
            children: [
              bullet('{{STRENGTH_1 — e.g. Existing CPARS from USAF, avg 4.4/5 across 3 contracts}}'),
              bullet('{{STRENGTH_2 — e.g. Incumbent subcontractor with 18 months of site knowledge}}'),
              bullet('{{STRENGTH_3 — e.g. Price-to-win modeled at $2.1M; our loaded rate is $1.87M}}'),
            ],
          }),
          cell({
            width: RC,
            shading: ROW_WARN,
            valign: 'top',
            pad: { top: 100, bottom: 100, left: 120, right: 100 },
            borders: hairBorders,
            children: [
              bullet('{{RISK_1 — e.g. No TS/SCI facility; requirement likely needs cleared staff onsite}}', SLATE),
              bullet('{{RISK_2 — e.g. Incumbent (DXC) confirmed rebidding with same key personnel}}', SLATE),
              bullet('{{RISK_3 — e.g. NAICS 541512 size standard $34M — we are at $31M TTM}}', SLATE),
            ],
          }),
        ],
      }),
    ],
  });
}

// --- Resources Required table ---------------------------------------------
function resourcesTable() {
  const cols = [2600, 1680, 1680, 3400]; // Role | Hours | Est. Cost | Notes

  function resHeaderCell(label, w) {
    return cell({
      width: w,
      shading: INK,
      valign: 'center',
      pad: { top: 60, bottom: 60, left: 100, right: 80 },
      borders: hairBorders,
      children: [para([run(label, { font: MONO_FONT, size: SZ_TINY, bold: true, color: 'ffffff' })], { after: 0, line: 200 })],
    });
  }

  function resRow(role, hours, cost, notes, alt) {
    return new TableRow({
      cantSplit: true,
      children: [
        cell({ width: cols[0], shading: alt ? ROW_ALT : PAPER, valign: 'center', pad: { top: 60, bottom: 60, left: 100, right: 80 }, borders: hairBorders, children: [para([run(role,  { size: SZ_SM, bold: true,  color: INK   })], { after: 0, line: 220 })] }),
        cell({ width: cols[1], shading: alt ? ROW_ALT : PAPER, valign: 'center', pad: { top: 60, bottom: 60, left: 100, right: 80 }, borders: hairBorders, children: [para([run(hours, { size: SZ_SM,             color: INK   })], { after: 0, line: 220 })] }),
        cell({ width: cols[2], shading: alt ? ROW_ALT : PAPER, valign: 'center', pad: { top: 60, bottom: 60, left: 100, right: 80 }, borders: hairBorders, children: [para([run(cost,  { size: SZ_SM,             color: INK   })], { after: 0, line: 220 })] }),
        cell({ width: cols[3], shading: alt ? ROW_ALT : PAPER, valign: 'center', pad: { top: 60, bottom: 60, left: 100, right: 80 }, borders: hairBorders, children: [para([run(notes, { size: SZ_TINY,           color: SLATE  })], { after: 0, line: 200 })] }),
      ],
    });
  }

  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: cols,
    borders: hairBorders,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: cols.map((w, i) => resHeaderCell(['RESOURCE / ROLE', 'HOURS', 'EST. COST', 'NOTES'][i], w)) }),
      resRow('BD / Capture Manager',   '{{BD_HRS}}',       '${{BD_COST}}',       '{{e.g. Teaming calls, customer intel, black hat review}}', false),
      resRow('Proposal Manager',        '{{PROP_MGR_HRS}}', '${{PROP_MGR_COST}}', '{{e.g. PWS compliance matrix, section leads, color reviews}}', true),
      resRow('Technical Writer(s)',     '{{TECH_HRS}}',     '${{TECH_COST}}',     '{{e.g. Technical approach, management approach, past perf}}', false),
      resRow('SME / Technical Staff',   '{{SME_HRS}}',      '${{SME_COST}}',      '{{e.g. Solution design, resumes, staffing plan}}', true),
      resRow('Pricing / Cost Analyst',  '{{PRICE_HRS}}',    '${{PRICE_COST}}',    '{{e.g. LCAT mapping, wrap rates, travel cost model}}', false),
      resRow('Subcontractor Support',   '{{SUB_HRS}}',      '${{SUB_COST}}',      '{{e.g. Teaming partner bid & proposal contribution}}', true),
      resRow('TOTAL',                   '{{TOTAL_HRS}}',    '${{TOTAL_COST}}',    'Sum above — compare to win probability before committing', false),
    ],
  });
}

// --- Decision radio table (Bid / Conditional Bid / No-Bid) ----------------
function decisionTable() {
  const W3 = Math.floor(USABLE / 3);
  const W3r = USABLE - W3 * 2;

  function decCell(label, color, hint, w) {
    return cell({
      width: w,
      shading: PAPER,
      valign: 'top',
      pad: { top: 100, bottom: 100, left: 120, right: 120 },
      borders: { top: { style: BorderStyle.SINGLE, size: 12, color }, bottom: H, left: H, right: H },
      children: [
        para([
          run('☐  ', { size: SZ_H2, bold: true, color }),
          run(label, { size: SZ_H3, bold: true, color: INK }),
        ], { after: 40, line: 240 }),
        bodyPara(hint, { color: SLATE, italics: true, after: 0 }),
      ],
    });
  }

  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [W3, W3, W3r],
    borders: hairBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          decCell('BID',              EMERALD_DARK, 'Full resource commit. Assign PM and kick off capture plan within 48 hours.', W3),
          decCell('CONDITIONAL BID',  'ca8a04',     'Bid contingent on resolving open items listed in Next Steps before {{GATE_DATE}}.', W3),
          decCell('NO-BID',           'b91c1c',     'Document reasoning below. Flag for recompete watch list if incumbent contract ends within 24 months.', W3r),
        ],
      }),
    ],
  });
}

// --- Next Steps table -----------------------------------------------------
function nextStepsTable() {
  const cols = [3800, 2800, 2760]; // Action | Owner | Due Date

  function nsHeaderCell(label, w) {
    return cell({
      width: w,
      shading: EMERALD_DARK,
      valign: 'center',
      pad: { top: 60, bottom: 60, left: 100, right: 80 },
      borders: hairBorders,
      children: [para([run(label, { font: MONO_FONT, size: SZ_TINY, bold: true, color: 'ffffff' })], { after: 0, line: 200 })],
    });
  }

  function nsRow(action, owner, due, alt) {
    return new TableRow({
      cantSplit: true,
      children: [
        cell({ width: cols[0], shading: alt ? ROW_ALT : PAPER, valign: 'top', pad: { top: 60, bottom: 60, left: 100, right: 80 }, borders: hairBorders, children: [para([run(action, { size: SZ_SM, color: INK })], { after: 0, line: 220 })] }),
        cell({ width: cols[1], shading: alt ? ROW_ALT : PAPER, valign: 'center', pad: { top: 60, bottom: 60, left: 100, right: 80 }, borders: hairBorders, children: [para([run(owner, { size: SZ_SM, bold: true, color: INK })], { after: 0, line: 220 })] }),
        cell({ width: cols[2], shading: alt ? ROW_ALT : PAPER, valign: 'center', pad: { top: 60, bottom: 60, left: 100, right: 80 }, borders: hairBorders, children: [para([run(due, { size: SZ_SM, color: INK })], { after: 0, line: 220 })] }),
      ],
    });
  }

  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: cols,
    borders: hairBorders,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: ['ACTION ITEM', 'OWNER', 'DUE DATE'].map((l, i) => nsHeaderCell(l, cols[i])) }),
      nsRow('{{e.g. Schedule debrief call with CO at AFMC to gauge incumbent relationship}}', '{{OWNER_1}}', '{{DUE_1}}', false),
      nsRow('{{e.g. Execute teaming NDA with [PARTNER_NAME] and confirm workshare split}}',   '{{OWNER_2}}', '{{DUE_2}}', true),
      nsRow('{{e.g. Finalize price-to-win model — loaded rates + G&A confirmed by CFO}}',     '{{OWNER_3}}', '{{DUE_3}}', false),
      nsRow('{{e.g. Complete and submit proposal sections to PM by internal deadline}}',       '{{OWNER_4}}', '{{DUE_4}}', true),
      nsRow('{{Add row — delete unused rows before filing}}',                                  '',            '',          false),
    ],
  });
}

// --- Full document build --------------------------------------------------
function buildDoc() {
  const children = [];

  // ---- Cover strip -------------------------------------------------------
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
            pad: { top: 200, bottom: 200, left: 200, right: 200 },
            borders: noBorders,
            children: [
              para([run('BID / NO-BID DECISION MEMO', { size: SZ_H1, bold: true, color: 'ffffff' })],
                { after: 30, line: 280, keepNext: true }),
              para([
                run('{{COMPANY_NAME}}', { size: SZ_H3, bold: true, color: EMERALD }),
                run('   ·   ', { size: SZ_H3, color: SLATE_LIGHT }),
                run('Prepared by {{PREPARER_NAME}}, {{PREPARER_TITLE}}', { size: SZ_BODY, color: 'c1fae5', italics: true }),
                run('   ·   Date: {{MEMO_DATE}}', { size: SZ_BODY, color: SLATE_LIGHT }),
              ], { after: 0, line: 240 }),
            ],
          }),
        ],
      }),
    ],
  }));

  children.push(spacer(6));

  // ---- Guidance note (light italic) -------------------------------------
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
            shading: ROW_ALT,
            valign: 'top',
            pad: { top: 80, bottom: 80, left: 160, right: 160 },
            borders: leftAccent,
            children: [
              para([
                run('How to use: ', { size: SZ_SM, bold: true, color: EMERALD_DARK }),
                run('Fill every {{PLACEHOLDER}} before presenting to leadership. This memo travels with the Bid/No-Bid matrix (FLK_04_Bid_No_Bid_Scoring_Matrix.xlsx). File the signed copy in your pursuit folder. FAR 15.306 pre-award discussions and DFARS 215.306 source selection records may reference it — write facts, not wishes.', { size: SZ_SM, color: SLATE, italics: true }),
              ], { after: 0, line: 240 }),
            ],
          }),
        ],
      }),
    ],
  }));

  children.push(spacer(8));

  // ================================================================
  // SECTION 1: OPPORTUNITY SNAPSHOT
  // ================================================================
  children.push(sectionLabel('Section 1 — Opportunity Snapshot'));
  children.push(snapshotTable());

  children.push(spacer(10));

  // ================================================================
  // SECTION 2: PWIN SUMMARY
  // ================================================================
  children.push(sectionLabel('Section 2 — PWin Summary'));
  children.push(pwinTable());
  children.push(spacer(4));
  children.push(bodyPara('Source of PWin score: {{e.g. CapturePilot automated score + BD team override — see attached matrix FLK_04_Bid_No_Bid_Scoring_Matrix.xlsx}}', { color: SLATE, italics: true, after: 0 }));

  children.push(spacer(10));

  // ================================================================
  // SECTION 3: RESOURCES REQUIRED
  // ================================================================
  children.push(sectionLabel('Section 3 — Resources Required'));
  children.push(resourcesTable());
  children.push(spacer(4));
  children.push(bodyPara('B&P cost benchmark: federal BD professionals typically allocate 0.5–2% of contract value in proposal costs for competitive full-and-open solicitations; 0.25–0.75% for set-asides. Does this investment clear your internal hurdle rate?', { color: SLATE, italics: true, after: 0 }));

  children.push(spacer(10));

  // ================================================================
  // SECTION 4: STRATEGIC FIT
  // ================================================================
  children.push(sectionLabel('Section 4 — Strategic Fit'));
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
            shading: PAPER,
            valign: 'top',
            pad: { top: 80, bottom: 80, left: 160, right: 160 },
            borders: leftAccent,
            children: [
              para([run('Address all three bullets. One to three sentences each. Be concrete — cite an agency, dollar figure, or FAR vehicle where possible.', { size: SZ_TINY, color: SLATE, italics: true })], { after: 60, line: 220 }),
              bullet('{{STRATEGIC_FIT_1 — How does this contract advance your agency relationship or NAICS expansion plan? E.g. "Winning this DoD SBIR follow-on under FAR 6.302-5 sole-source authority positions us as the sole vendor for Phase III work estimated at $4.8M."}}'),
              bullet('{{STRATEGIC_FIT_2 — What past performance citation does this produce? E.g. "A completed CPARS here fills the gap in our DoT reference list, making us competitive on the FY27 GSA OASIS+ unrestricted pools."}}'),
              bullet('{{STRATEGIC_FIT_3 — Revenue or pipeline impact. E.g. "Base period revenue of $1.2M fills 60% of Q3 capacity gap and supports the two FTE hires planned for July."}}'),
            ],
          }),
        ],
      }),
    ],
  }));

  children.push(spacer(10));

  // ================================================================
  // SECTION 5: DECISION
  // ================================================================
  children.push(sectionLabel('Section 5 — Decision'));
  children.push(decisionTable());

  children.push(spacer(6));

  // Decision reasoning block
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [USABLE],
    borders: hairBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: USABLE,
            shading: ROW_ALT,
            valign: 'top',
            pad: { top: 100, bottom: 120, left: 160, right: 160 },
            borders: hairBorders,
            children: [
              para([run('Decision Rationale', { size: SZ_H3, bold: true, color: INK })], { after: 40, keepNext: true, line: 240 }),
              bodyPara('{{DECISION_RATIONALE — 2–4 sentences. State the decisive factors. If Conditional Bid: list the specific conditions that must be met. If No-Bid: note whether to re-evaluate at next recompete cycle. E.g. "We are bidding. PWin of 72 is driven by an existing GSA Schedule 70 vehicle the CO confirmed is the preferred acquisition path, an SDVOSB set-aside that eliminates 80% of the competitive field, and an 18-month incumbent sub relationship. The primary risk is our proposed PM does not yet hold the required TS/SCI clearance — capture plan includes a timeline to resolve this before proposal submission."}}', { after: 0 }),
            ],
          }),
        ],
      }),
    ],
  }));

  children.push(spacer(6));

  // Signature strip
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [Math.floor(USABLE / 3), Math.floor(USABLE / 3), USABLE - Math.floor(USABLE / 3) * 2],
    borders: hairBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: Math.floor(USABLE / 3),
            shading: PAPER,
            valign: 'top',
            pad: { top: 80, bottom: 100, left: 120, right: 80 },
            borders: hairBorders,
            children: [
              para([run('CEO / Decision Authority', { size: SZ_SM, bold: true, color: INK })], { after: 100, line: 240, keepNext: true }),
              para([run('Signature: ___________________________', { size: SZ_SM, color: SLATE })], { after: 30, line: 240 }),
              para([run('Date: __________________', { size: SZ_SM, color: SLATE })], { after: 0, line: 240 }),
            ],
          }),
          cell({
            width: Math.floor(USABLE / 3),
            shading: ROW_ALT,
            valign: 'top',
            pad: { top: 80, bottom: 100, left: 120, right: 80 },
            borders: hairBorders,
            children: [
              para([run('Capture / BD Lead', { size: SZ_SM, bold: true, color: INK })], { after: 100, line: 240, keepNext: true }),
              para([run('Signature: ___________________________', { size: SZ_SM, color: SLATE })], { after: 30, line: 240 }),
              para([run('Date: __________________', { size: SZ_SM, color: SLATE })], { after: 0, line: 240 }),
            ],
          }),
          cell({
            width: USABLE - Math.floor(USABLE / 3) * 2,
            shading: PAPER,
            valign: 'top',
            pad: { top: 80, bottom: 100, left: 120, right: 80 },
            borders: hairBorders,
            children: [
              para([run('CFO / Finance Review', { size: SZ_SM, bold: true, color: INK })], { after: 100, line: 240, keepNext: true }),
              para([run('Signature: ___________________________', { size: SZ_SM, color: SLATE })], { after: 30, line: 240 }),
              para([run('Date: __________________', { size: SZ_SM, color: SLATE })], { after: 0, line: 240 }),
            ],
          }),
        ],
      }),
    ],
  }));

  children.push(spacer(10));

  // ================================================================
  // SECTION 6: NEXT STEPS
  // ================================================================
  children.push(sectionLabel('Section 6 — Next Steps'));
  children.push(nextStepsTable());

  children.push(spacer(8));

  // ---- Footer strip --------------------------------------------------------
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
            pad: { top: 80, bottom: 80, left: 160, right: 160 },
            borders: noBorders,
            children: [
              para([
                run('CapturePilot Federal Lead Kit  ·  FLK v1.5  ·  ', { font: MONO_FONT, size: SZ_TINY, bold: true, color: EMERALD }),
                run('capturepilot.com', { font: MONO_FONT, size: SZ_TINY, color: SLATE_LIGHT }),
                run('   ·   Bid/No-Bid Decision Memo Template', { size: SZ_TINY, color: SLATE_LIGHT }),
              ], { after: 0, align: AlignmentType.CENTER, line: 200 }),
            ],
          }),
        ],
      }),
    ],
  }));

  return children;
}

// --- Assemble & write -----------------------------------------------------
const doc = new Document({
  creator: 'CapturePilot',
  title: 'Bid / No-Bid Decision Memo',
  description: 'Federal Lead Kit v1.5 — Bid/No-Bid Decision Memo Template (FLK_04)',
  styles: {
    default: {
      document: { run: { font: BODY_FONT, size: SZ_BODY, color: INK } },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
          margin: {
            top:    convertInchesToTwip(1),
            right:  convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left:   convertInchesToTwip(1),
            header: convertInchesToTwip(0.4),
            footer: convertInchesToTwip(0.4),
          },
        },
      },
      children: buildDoc(),
    },
  ],
});

const buffer = await Packer.toBuffer(doc);

// Ensure deploy directory exists
const deployDir = dirname(DEPLOY);
if (!existsSync(deployDir)) mkdirSync(deployDir, { recursive: true });

writeFileSync(DEPLOY, buffer);
console.log(`Wrote ${buffer.length} bytes → ${DEPLOY}`);
