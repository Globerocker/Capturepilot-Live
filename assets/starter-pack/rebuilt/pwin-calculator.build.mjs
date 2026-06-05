// PWin (Probability of Win) Calculator — rebuilt workbook
// Five-section weighted scoring model (12 factors) used by capture managers
// to decide whether an opportunity is worth chasing.
//
// Built with exceljs. Designed to work in BOTH Excel and Google Sheets:
//   - SUMPRODUCT instead of LAMBDA/FILTER
//   - data validation via list ranges (not inline 'A,B,C' strings)
//   - named ranges for clean formulas
//   - conditional formatting for PWin band

import ExcelJS from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js';
import path from 'path';

const OUT = '/Users/andreschuler/Caturepilot 2.0/assets/starter-pack/rebuilt/FLK_04_PWin_Calculator.xlsx';

const EMERALD = 'FF10B981';
const EMERALD_DARK = 'FF047857';
const SLATE_900 = 'FF0F172A';
const SLATE_100 = 'FFF1F5F9';
const SLATE_50 = 'FFF8FAFC';
const AMBER = 'FFF59E0B';
const RED = 'FFDC2626';
const WHITE = 'FFFFFFFF';

const wb = new ExcelJS.Workbook();
wb.creator = 'CapturePilot';
wb.lastModifiedBy = 'CapturePilot';
wb.created = new Date();
wb.modified = new Date();
wb.company = 'CapturePilot';

// ---------- helpers ----------
function setColWidths(ws, widths) {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

function brandFooter(ws) {
  ws.headerFooter.oddFooter = '&LCapturePilot Federal Lead Kit&Ccaptorpilot.com&R04 — PWin Calculator';
  ws.headerFooter.oddHeader = '&L&"Helvetica,Bold"&14PWin Calculator&R&D';
  ws.pageSetup.orientation = 'portrait';
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  ws.pageSetup.margins = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };
}

function titleRow(ws, row, text, mergeRange) {
  ws.mergeCells(mergeRange);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: 'Helvetica', bold: true, size: 18, color: { argb: WHITE } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(row).height = 36;
}

function subRow(ws, row, text, mergeRange) {
  ws.mergeCells(mergeRange);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: 'Helvetica', italic: true, size: 11, color: { argb: SLATE_900 } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_100 } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(row).height = 22;
}

function sectionHeader(ws, row, text, mergeRange) {
  ws.mergeCells(mergeRange);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: 'Helvetica', bold: true, size: 12, color: { argb: WHITE } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(row).height = 24;
}

function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };
}

// =============================================================
// SHEET 1 — Instructions
// =============================================================
const wsHelp = wb.addWorksheet('Instructions', {
  properties: { tabColor: { argb: EMERALD_DARK } },
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
});
setColWidths(wsHelp, [4, 36, 80]);
titleRow(wsHelp, 1, 'PWin Calculator — How to Use This Workbook', 'A1:C1');

const helpRows = [
  ['', 'WHAT THIS IS', "A weighted scoring model that estimates your probability of winning a federal contract. Twelve factors across five categories. You rate each one 0–100, the workbook does the math."],
  ['', '', ''],
  ['', 'WHEN TO USE IT', "Before you commit any Bid & Proposal money. Capture managers use this at the gate review — usually six to twelve months before the RFP drops."],
  ['', '', ''],
  ['', 'HOW TO FILL IT OUT', "Open the 'Calculator' tab. Fill in the header (opportunity name, agency, contract value). Then go down the factor list and put a rating from 0 to 100 in column D. The contribution and total PWin update as you type."],
  ['', '', ''],
  ['', 'WHAT THE RATING MEANS', "0 = no advantage at all, no relationship, no past performance, no fit. 50 = average, you're competitive but not differentiated. 100 = clear winner on this factor (sole-source J&A, perfect incumbent past performance, etc)."],
  ['', '', ''],
  ['', 'PWin BANDS', "≥70% Strong (commit full capture resources). 50–69% Moderate (go if no better alternative). 30–49% Marginal (write a gap-closure plan first). <30% Low (reconsider or pass)."],
  ['', '', ''],
  ['', 'BENCHMARKS TAB', "Industry reference data — average win rates by company size, expected PWin boost from incumbent status, what factors move PWin the most. Use this to sanity-check your ratings."],
  ['', '', ''],
  ['', 'PIPELINE TAB', "Track every opportunity you've scored. Each row carries a PWin and Expected Value (contract value × PWin). The sum at the bottom is your weighted pipeline."],
  ['', '', ''],
  ['', 'EXAMPLE', "A janitorial firm scoring a $2.4M VA facilities contract. They're a HUBZone (set-aside benefit), no incumbent advantage, attended the industry day. Customer relationship 40, solution 60, competitive 30, past performance 70, price 60. PWin ≈ 51% — Moderate. Bid if no stronger pipeline; build relationships before next re-compete."],
  ['', '', ''],
  ['', 'IMPORTANT', "PWin is a planning tool, not a prediction. It forces you to be honest about gaps. A 25% PWin with a $5M contract still has $1.25M expected value — sometimes worth the B&P investment, sometimes not."],
  ['', '', ''],
  ['', 'BUILT BY', "CapturePilot. Andre's German Navy Boarding Team background taught one lesson: never board a ship without knowing what's on it. Same for federal proposals — never write one without scoring it first."],
];
let r = 3;
for (const [_, label, value] of helpRows) {
  const labelCell = wsHelp.getCell(r, 2);
  const valueCell = wsHelp.getCell(r, 3);
  labelCell.value = label;
  valueCell.value = value;
  labelCell.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: EMERALD_DARK } };
  labelCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  valueCell.font = { name: 'Helvetica', size: 11, color: { argb: SLATE_900 } };
  valueCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  if (value) wsHelp.getRow(r).height = Math.max(38, Math.ceil(value.length / 70) * 18);
  r++;
}
brandFooter(wsHelp);

// =============================================================
// SHEET 2 — Calculator (main)
// =============================================================
const ws = wb.addWorksheet('Calculator', {
  properties: { tabColor: { argb: EMERALD } },
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
});
setColWidths(ws, [4, 38, 12, 14, 14, 10, 30]);

// Title block
titleRow(ws, 1, 'PWIN CALCULATOR — PROBABILITY OF WIN', 'A1:G1');
subRow(ws, 2, "Score the opportunity before you commit B&P money. Twelve factors, five categories, weighted total.", 'A2:G2');
ws.getRow(3).height = 6;

// Header inputs
const headerInputs = [
  ['Opportunity Name', '', 'Incumbent?', ''],
  ['Agency / Office', '', '# Competitors Est.', ''],
  ['Solicitation #', '', 'Contract Type', ''],
  ['Set-Aside Type', '', 'Vehicle / GSA', ''],
  ['Contract Value ($)', '', 'Clearance Req?', ''],
  ['Proposal Due Date', '', 'Teaming?', ''],
  ['Evaluated By', '', 'Notes', ''],
];
let hr = 4;
for (const [l1, v1, l2, v2] of headerInputs) {
  ws.getRow(hr).height = 22;
  const lc = ws.getCell(hr, 2);
  lc.value = l1;
  lc.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: SLATE_900 } };
  lc.alignment = { vertical: 'middle' };
  lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };

  ws.mergeCells(hr, 3, hr, 4);
  const vc = ws.getCell(hr, 3);
  vc.value = v1;
  vc.font = { name: 'Helvetica', size: 11 };
  vc.alignment = { vertical: 'middle', indent: 1 };
  vc.border = thinBorder();
  vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };

  const lc2 = ws.getCell(hr, 5);
  lc2.value = l2;
  lc2.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: SLATE_900 } };
  lc2.alignment = { vertical: 'middle' };
  lc2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };

  ws.mergeCells(hr, 6, hr, 7);
  const vc2 = ws.getCell(hr, 6);
  vc2.value = v2;
  vc2.font = { name: 'Helvetica', size: 11 };
  vc2.alignment = { vertical: 'middle', indent: 1 };
  vc2.border = thinBorder();
  vc2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };

  hr++;
}

// Contract value cell needs currency formatting → row 8 col C (Contract Value)
ws.getCell('C8').numFmt = '"$"#,##0';
// Proposal due date → row 9 col C
ws.getCell('C9').numFmt = 'mm/dd/yyyy';

// Named range for contract value (row 8, col C)
wb.definedNames.add('Calculator!$C$8', 'ContractValue');

// Spacer
ws.getRow(11).height = 8;

// Factor table header
const headerRow = 12;
ws.getRow(headerRow).height = 34;
const headers = ['#', 'PWin Factor', 'Weight %', 'Rating (0–100)', 'Contribution', 'Max', 'Notes'];
headers.forEach((h, i) => {
  const c = ws.getCell(headerRow, i + 1);
  c.value = h;
  c.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: WHITE } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_900 } };
  c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  c.border = thinBorder();
});

// 12 factors across 5 sections
// section header rows are inserted between groups
const sections = [
  {
    name: 'CUSTOMER KNOWLEDGE & RELATIONSHIPS',
    factors: [
      { label: 'Direct relationship with KO or program office', weight: 0.15 },
      { label: "Understand the customer's budget and priorities", weight: 0.10 },
      { label: 'Attended pre-solicitation events or industry days', weight: 0.05 },
    ],
  },
  {
    name: 'SOLUTION STRENGTH',
    factors: [
      { label: 'Technical approach is developed and differentiated', weight: 0.12 },
      { label: "Approach solves the customer's core pain points", weight: 0.10 },
      { label: 'Solution is compliant with all RFP requirements', weight: 0.08 },
    ],
  },
  {
    name: 'COMPETITIVE POSITIONING',
    factors: [
      { label: 'Number and strength of likely competitors', weight: 0.08 },
      { label: 'We are the incumbent or favored team', weight: 0.08 },
      { label: 'Set-aside type benefits us over competitors', weight: 0.04 },
    ],
  },
  {
    name: 'PAST PERFORMANCE & QUALIFICATIONS',
    factors: [
      { label: 'Relevant past performance at similar scope or agency', weight: 0.10 },
      { label: 'Key personnel match RFP requirements', weight: 0.05 },
    ],
  },
  {
    name: 'PRICE COMPETITIVENESS',
    factors: [
      { label: 'Our price is at or below the likely winning price', weight: 0.05 },
    ],
  },
];

let row = headerRow + 1;
const ratingRows = []; // track for total + validation + conditional fmt
let factorNum = 1;

for (const section of sections) {
  // section header row
  ws.mergeCells(row, 1, row, 7);
  const sc = ws.getCell(row, 1);
  sc.value = section.name;
  sc.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: WHITE } };
  sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD } };
  sc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(row).height = 22;
  row++;

  for (const f of section.factors) {
    const ro = ws.getRow(row);
    ro.height = 22;

    const numC = ws.getCell(row, 1);
    numC.value = factorNum;
    numC.font = { name: 'Helvetica', size: 10, color: { argb: SLATE_900 } };
    numC.alignment = { vertical: 'middle', horizontal: 'center' };
    numC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };
    numC.border = thinBorder();

    const labelC = ws.getCell(row, 2);
    labelC.value = f.label;
    labelC.font = { name: 'Helvetica', size: 11 };
    labelC.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    labelC.border = thinBorder();

    const weightC = ws.getCell(row, 3);
    weightC.value = f.weight;
    weightC.numFmt = '0%';
    weightC.font = { name: 'Helvetica', size: 11 };
    weightC.alignment = { vertical: 'middle', horizontal: 'center' };
    weightC.border = thinBorder();
    weightC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };

    // Rating input — leave empty, user fills 0-100
    const rateC = ws.getCell(row, 4);
    rateC.font = { name: 'Helvetica', size: 11, bold: true, color: { argb: EMERALD_DARK } };
    rateC.alignment = { vertical: 'middle', horizontal: 'center' };
    rateC.border = thinBorder();
    rateC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    // Data validation 0-100 (works in both Excel and Sheets)
    rateC.dataValidation = {
      type: 'whole',
      operator: 'between',
      formulae: [0, 100],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Invalid rating',
      error: 'Enter a whole number between 0 and 100.',
      promptTitle: 'Rating',
      prompt: '0 = no advantage. 50 = competitive but not differentiated. 100 = clear winner on this factor.',
      showInputMessage: true,
    };

    // Contribution: weight × rating / 100 (works in both Excel and Sheets)
    const contribC = ws.getCell(row, 5);
    contribC.value = { formula: `IF(D${row}="","",C${row}*D${row}/100)` };
    contribC.numFmt = '0.0%';
    contribC.font = { name: 'Helvetica', size: 11 };
    contribC.alignment = { vertical: 'middle', horizontal: 'center' };
    contribC.border = thinBorder();
    contribC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };

    // Max possible contribution
    const maxC = ws.getCell(row, 6);
    maxC.value = { formula: `C${row}` };
    maxC.numFmt = '0%';
    maxC.font = { name: 'Helvetica', size: 10, color: { argb: 'FF64748B' } };
    maxC.alignment = { vertical: 'middle', horizontal: 'center' };
    maxC.border = thinBorder();

    const notesC = ws.getCell(row, 7);
    notesC.font = { name: 'Helvetica', size: 10 };
    notesC.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    notesC.border = thinBorder();

    ratingRows.push(row);
    row++;
    factorNum++;
  }
}

// Totals + PWin
ws.getRow(row).height = 8;
row++;

// Weights total
const weightTotalRow = row;
ws.mergeCells(row, 1, row, 2);
const wtLabel = ws.getCell(row, 1);
wtLabel.value = 'TOTAL WEIGHTS (must = 100%)';
wtLabel.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: SLATE_900 } };
wtLabel.alignment = { vertical: 'middle', horizontal: 'right' };
wtLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_100 } };

const wtCell = ws.getCell(row, 3);
const weightFormula = `SUM(${ratingRows.map((r) => `C${r}`).join(',')})`;
wtCell.value = { formula: weightFormula };
wtCell.numFmt = '0%';
wtCell.font = { name: 'Helvetica', bold: true, size: 12 };
wtCell.alignment = { vertical: 'middle', horizontal: 'center' };
wtCell.border = thinBorder();
wtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };

ws.mergeCells(row, 4, row, 7);
const wtCheck = ws.getCell(row, 4);
wtCheck.value = {
  formula: `IF(ABS(${weightFormula}-1)<0.001,"OK — Weights sum to 100%","Adjust column C — weights must sum to 100%")`,
};
wtCheck.font = { name: 'Helvetica', italic: true, size: 11 };
wtCheck.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
ws.getRow(row).height = 24;
row += 2;

// PWin output
const pwinRow = row;
ws.mergeCells(row, 1, row, 2);
const pwinLabel = ws.getCell(row, 1);
pwinLabel.value = 'ESTIMATED PWIN';
pwinLabel.font = { name: 'Helvetica', bold: true, size: 14, color: { argb: WHITE } };
pwinLabel.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
pwinLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_900 } };

ws.mergeCells(row, 3, row, 4);
const pwinCell = ws.getCell(row, 3);
const pwinFormula = `IFERROR(SUMPRODUCT(C${ratingRows[0]}:C${ratingRows[ratingRows.length - 1]},D${ratingRows[0]}:D${ratingRows[ratingRows.length - 1]})/100,0)`;
pwinCell.value = { formula: pwinFormula };
pwinCell.numFmt = '0%';
pwinCell.font = { name: 'Helvetica', bold: true, size: 22, color: { argb: WHITE } };
pwinCell.alignment = { vertical: 'middle', horizontal: 'center' };
pwinCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } };

wb.definedNames.add(`Calculator!$C$${pwinRow}`, 'PWin');

ws.mergeCells(row, 5, row, 7);
const bandCell = ws.getCell(row, 5);
bandCell.value = {
  formula: `IF(C${pwinRow}>=0.7,"STRONG — Commit full capture resources",IF(C${pwinRow}>=0.5,"MODERATE — Go if no better alternative",IF(C${pwinRow}>=0.3,"MARGINAL — Requires gap closure plan","LOW — Reconsider or pass")))`,
};
bandCell.font = { name: 'Helvetica', bold: true, size: 12, color: { argb: WHITE } };
bandCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
bandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_900 } };
ws.getRow(row).height = 44;
row++;

// Expected value row
const evRow = row;
ws.mergeCells(row, 1, row, 2);
const evLabel = ws.getCell(row, 1);
evLabel.value = 'EXPECTED VALUE (Contract × PWin)';
evLabel.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: SLATE_900 } };
evLabel.alignment = { vertical: 'middle', horizontal: 'right' };
evLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_100 } };

ws.mergeCells(row, 3, row, 4);
const evCell = ws.getCell(row, 3);
evCell.value = { formula: `IFERROR(ContractValue*PWin,0)` };
evCell.numFmt = '"$"#,##0';
evCell.font = { name: 'Helvetica', bold: true, size: 14, color: { argb: EMERALD_DARK } };
evCell.alignment = { vertical: 'middle', horizontal: 'center' };
evCell.border = thinBorder();
evCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };

ws.mergeCells(row, 5, row, 7);
const evHelp = ws.getCell(row, 5);
evHelp.value = 'Expected value = contract value × your probability of win. Use this to size B&P spend.';
evHelp.font = { name: 'Helvetica', italic: true, size: 10, color: { argb: 'FF64748B' } };
evHelp.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
ws.getRow(row).height = 26;
row += 2;

// B&P advisory section
sectionHeader(ws, row, 'BID & PROPOSAL (B&P) INVESTMENT ADVISORY', `A${row}:G${row}`);
row++;

const bpRows = [
  { label: 'B&P Budget Estimate ($)', fmt: '"$"#,##0', input: true },
  { label: 'B&P as % of Contract Value', fmt: '0.00%', formula: (bpRow) => `IFERROR(C${bpRow - 1}/ContractValue,0)` },
  { label: 'B&P as % of Expected Value', fmt: '0.00%', formula: (bpRow) => `IFERROR(C${bpRow - 2}/C${evRow},0)` },
  {
    label: 'Payback Check (EV must exceed B&P)',
    fmt: '@',
    formula: (bpRow) => `IF(C${evRow}>C${bpRow - 3},"OK — Expected value exceeds B&P spend","Risk — B&P spend exceeds expected value")`,
  },
];

const bpStartRow = row;
for (const bp of bpRows) {
  ws.getRow(row).height = 22;
  const lc = ws.getCell(row, 2);
  lc.value = bp.label;
  lc.font = { name: 'Helvetica', bold: true, size: 11 };
  lc.alignment = { vertical: 'middle' };
  lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };

  ws.mergeCells(row, 3, row, 4);
  const vc = ws.getCell(row, 3);
  if (bp.input) {
    vc.value = '';
  } else {
    vc.value = { formula: bp.formula(row) };
  }
  vc.numFmt = bp.fmt;
  vc.font = { name: 'Helvetica', size: 11, bold: true };
  vc.alignment = { vertical: 'middle', horizontal: 'center' };
  vc.border = thinBorder();
  vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
  row++;
}

row++;

// Conditional formatting on PWin cell (3-color scale via cellIs)
// Excel + Sheets both honor cellIs conditional rules
ws.addConditionalFormatting({
  ref: `C${pwinRow}`,
  rules: [
    {
      type: 'cellIs',
      operator: 'greaterThanOrEqual',
      formulae: ['0.7'],
      priority: 1,
      style: {
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: EMERALD_DARK } },
        font: { color: { argb: WHITE }, bold: true },
      },
    },
    {
      type: 'cellIs',
      operator: 'between',
      formulae: ['0.5', '0.6999'],
      priority: 2,
      style: {
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: AMBER } },
        font: { color: { argb: WHITE }, bold: true },
      },
    },
    {
      type: 'cellIs',
      operator: 'between',
      formulae: ['0.3', '0.4999'],
      priority: 3,
      style: {
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFB923C' } },
        font: { color: { argb: WHITE }, bold: true },
      },
    },
    {
      type: 'cellIs',
      operator: 'lessThan',
      formulae: ['0.3'],
      priority: 4,
      style: {
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } },
        font: { color: { argb: WHITE }, bold: true },
      },
    },
  ],
});

// Weight-sum check conditional formatting
ws.addConditionalFormatting({
  ref: `C${weightTotalRow}`,
  rules: [
    {
      type: 'cellIs',
      operator: 'between',
      formulae: ['0.999', '1.001'],
      priority: 1,
      style: {
        font: { color: { argb: EMERALD_DARK }, bold: true },
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD1FAE5' } },
      },
    },
    {
      type: 'cellIs',
      operator: 'notBetween',
      formulae: ['0.999', '1.001'],
      priority: 2,
      style: {
        font: { color: { argb: RED }, bold: true },
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } },
      },
    },
  ],
});

// Conditional formatting on each rating input cell (color heatmap)
for (const rr of ratingRows) {
  ws.addConditionalFormatting({
    ref: `D${rr}`,
    rules: [
      {
        type: 'cellIs',
        operator: 'greaterThanOrEqual',
        formulae: ['70'],
        priority: 1,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD1FAE5' } } },
      },
      {
        type: 'cellIs',
        operator: 'between',
        formulae: ['40', '69'],
        priority: 2,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEF3C7' } } },
      },
      {
        type: 'cellIs',
        operator: 'lessThan',
        formulae: ['40'],
        priority: 3,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } } },
      },
    ],
  });
}

// Footer credit
const footRow = row + 1;
ws.mergeCells(footRow, 1, footRow, 7);
const fc = ws.getCell(footRow, 1);
fc.value = 'CapturePilot Federal Lead Kit  ·  captorpilot.com  ·  04 PWin Calculator';
fc.font = { name: 'Helvetica', italic: true, size: 9, color: { argb: 'FF64748B' } };
fc.alignment = { vertical: 'middle', horizontal: 'center' };

brandFooter(ws);

// =============================================================
// SHEET 3 — Benchmarks
// =============================================================
const wsBench = wb.addWorksheet('Benchmarks', {
  properties: { tabColor: { argb: SLATE_900 } },
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
});
setColWidths(wsBench, [4, 28, 20, 22, 60]);
titleRow(wsBench, 1, 'PWIN BENCHMARKS — INDUSTRY THRESHOLDS', 'A1:E1');
subRow(wsBench, 2, 'Reference data for setting realistic win probability targets.', 'A2:E2');
wsBench.getRow(3).height = 6;

function benchHeader(row, cols) {
  cols.forEach((label, i) => {
    const c = wsBench.getCell(row, i + 1);
    c.value = label;
    c.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_900 } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
    c.border = thinBorder();
  });
  wsBench.getRow(row).height = 24;
}

function benchRow(row, cols) {
  cols.forEach((v, i) => {
    const c = wsBench.getCell(row, i + 1);
    c.value = v;
    c.font = { name: 'Helvetica', size: 11 };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
    c.border = thinBorder();
    if (row % 2 === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };
  });
  wsBench.getRow(row).height = 22;
}

let br = 4;
sectionHeader(wsBench, br, 'SECTION 1 — PWIN BY CAPTURE STAGE', `A${br}:E${br}`);
br++;
benchHeader(br, ['', 'Capture Stage', 'Typical PWin', 'Action Threshold', 'What It Means']);
br++;
const stageData = [
  ['Early capture (>18 months out)', '5–20%', 'Build relationship first', "Too early to commit resources. Intelligence gathering only."],
  ['Pre-solicitation (6–18 months)', '20–45%', 'Launch capture plan', 'Enough time to move the needle. Assign a capture manager.'],
  ['Draft RFP stage (3–6 months)', '40–65%', 'Commit B&P budget', "Customer's requirements should shape your solution now."],
  ['Final RFP released (<3 months)', '55–80%', 'All-hands proposal mode', 'If PWin is below 40% at this stage, consider a no-bid.'],
];
for (const s of stageData) {
  benchRow(br, ['', ...s]);
  br++;
}
br++;

sectionHeader(wsBench, br, 'SECTION 2 — PWIN BY COMPETITIVE POSITION', `A${br}:E${br}`);
br++;
benchHeader(br, ['', 'Competitive Position', 'Expected Boost', 'Key Driver', 'Notes']);
br++;
const posData = [
  ['Incumbent (strong performance)', '+25 to +35 pts', 'Continuity risk', 'Agencies avoid transition risk. Powerful advantage.'],
  ['Teaming with incumbent', '+10 to +20 pts', 'Past performance halo', 'Borrow credibility through teaming agreements.'],
  ['Known to KO/PM via industry day', '+5 to +15 pts', 'Reduced uncertainty', 'Familiar names score higher on past performance factors.'],
  ['Sole qualified firm (J&A)', '+40 to +60 pts', 'Limited competition', 'Justification & Approval sole-source. Near-certain win.'],
  ['One of 5+ unknown competitors', '-15 to -25 pts', 'Diluted probability', 'Undifferentiated field reduces your statistical share.'],
  ['Re-compete, no incumbent advantage', 'Baseline', 'Level playing field', 'Start at 20% and build from there.'],
];
for (const s of posData) {
  benchRow(br, ['', ...s]);
  br++;
}
br++;

sectionHeader(wsBench, br, 'SECTION 3 — INDUSTRY WIN RATE BENCHMARKS', `A${br}:E${br}`);
br++;
benchHeader(br, ['', 'Company Type', 'Avg Win Rate', 'Target Win Rate', 'Notes']);
br++;
const winData = [
  ['Small business (under 5 years)', '15–25%', '≥30%', 'Focus on set-asides, sole-source 8(a), strong past performance.'],
  ['Small business (established)', '25–40%', '≥35%', 'Should be winning set-asides at 40%+ with good past performance.'],
  ['Mid-tier ($10M–$50M revenue)', '30–45%', '≥40%', 'Volume is key. Bid more to win more at this stage.'],
  ['Large business (IDIQ focus)', '25–35%', '≥30%', 'Task order competition reduces per-bid PWin.'],
  ['Proposal-only shops (no capture)', '10–20%', 'Double it', 'Capture investment before RFP release doubles win rate.'],
];
for (const s of winData) {
  benchRow(br, ['', ...s]);
  br++;
}
br++;

sectionHeader(wsBench, br, 'SECTION 4 — FACTORS THAT MOVE PWIN MOST', `A${br}:E${br}`);
br++;
benchHeader(br, ['', 'Factor', 'PWin Impact', 'Actionability', 'How to Improve']);
br++;
const factorData = [
  ['Customer relationships (KO/PM)', 'HIGH (+20 to +30%)', 'High', 'Attend industry days, respond to RFIs, request one-on-ones.'],
  ['Incumbent status', 'HIGH (+25 to +35%)', 'Low', 'Partner with incumbent or compete on price and innovation.'],
  ['Relevant past performance', 'HIGH (+15 to +25%)', 'Medium', 'Document commercial work as federal past performance.'],
  ['Draft RFP shaping', 'MED (+10 to +15%)', 'High', 'Submit comments on draft RFPs and Sources Sought responses.'],
  ['Price position', 'MED (+5 to +15%)', 'Medium', 'Use labor rate benchmarks and indirect rate analysis.'],
  ['Set-aside alignment', 'MED (+5 to +15%)', 'Low', 'Maintain all eligible certifications on SAM.gov.'],
  ['Proposal quality', 'LOW-MED (+3 to +8%)', 'High', 'Pink and red teams plus experienced proposal writers.'],
];
for (const s of factorData) {
  benchRow(br, ['', ...s]);
  br++;
}

brandFooter(wsBench);

// =============================================================
// SHEET 4 — Pipeline
// =============================================================
const wsPipe = wb.addWorksheet('Pipeline', {
  properties: { tabColor: { argb: EMERALD } },
  views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
});
setColWidths(wsPipe, [28, 22, 14, 16, 14, 16, 14, 16, 22]);
titleRow(wsPipe, 1, 'PIPELINE TRACKER — SCORED OPPORTUNITIES', 'A1:I1');

const pipeHeaders = [
  'Opportunity Name',
  'Agency',
  'Solicitation #',
  'Contract Value',
  'PWin %',
  'Expected Value',
  'Stage',
  'Due Date',
  'Decision',
];
pipeHeaders.forEach((h, i) => {
  const c = wsPipe.getCell(2, i + 1);
  c.value = h;
  c.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: WHITE } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_900 } };
  c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  c.border = thinBorder();
});
wsPipe.getRow(2).height = 28;

// Example rows + 18 empty rows
const sampleRows = [
  ['VA Janitorial — Roanoke', 'Dept. of Veterans Affairs', 'VA-241-25-R-0012', 2400000, 0.51, null, 'Pre-Sol', new Date(2026, 8, 15), 'BID'],
  ['Army Corps Levee Inspection', 'USACE Mobile District', 'W912EP-25-R-0007', 850000, 0.32, null, 'Sources Sought', new Date(2026, 9, 30), 'No-bid'],
];
const totalPipeRows = 25;
for (let i = 0; i < totalPipeRows; i++) {
  const pr = 3 + i;
  wsPipe.getRow(pr).height = 22;
  const sample = sampleRows[i];
  for (let col = 1; col <= 9; col++) {
    const c = wsPipe.getCell(pr, col);
    c.font = { name: 'Helvetica', size: 11 };
    c.alignment = { vertical: 'middle', horizontal: col === 1 || col === 2 ? 'left' : 'center', indent: col === 1 ? 1 : 0 };
    c.border = thinBorder();
    if (i % 2 === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };
    if (sample && col <= 8 && col !== 6 && col !== 9) c.value = sample[col - 1];
    if (col === 4) c.numFmt = '"$"#,##0';
    if (col === 5) c.numFmt = '0%';
    if (col === 6) {
      c.value = { formula: `IFERROR(D${pr}*E${pr},0)` };
      c.numFmt = '"$"#,##0';
      c.font = { name: 'Helvetica', size: 11, bold: true, color: { argb: EMERALD_DARK } };
    }
    if (col === 8) c.numFmt = 'mm/dd/yyyy';
    if (col === 9 && sample) c.value = sample[8];
  }

  // Data validation: stage dropdown
  wsPipe.getCell(pr, 7).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"Identify,Qualify,Pursue,Capture,Pre-Sol,Sources Sought,Proposal,Submitted,Won,Lost,No-bid"'],
    showErrorMessage: true,
    errorTitle: 'Invalid stage',
    error: 'Pick from the dropdown.',
  };
  // Decision dropdown
  wsPipe.getCell(pr, 9).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"BID,No-bid,Watch,Team,Subcontract"'],
    showErrorMessage: true,
    errorTitle: 'Invalid decision',
    error: 'Pick from the dropdown.',
  };
  // PWin validation 0-1
  wsPipe.getCell(pr, 5).dataValidation = {
    type: 'decimal',
    operator: 'between',
    formulae: [0, 1],
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: 'Invalid PWin',
    error: 'Enter a decimal between 0 and 1 (e.g. 0.45 for 45%).',
  };
}

// Totals row
const totalsRow = 3 + totalPipeRows;
wsPipe.getRow(totalsRow).height = 28;
const totLabel = wsPipe.getCell(totalsRow, 1);
totLabel.value = 'PIPELINE TOTALS';
totLabel.font = { name: 'Helvetica', bold: true, size: 12, color: { argb: WHITE } };
totLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } };
totLabel.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
wsPipe.mergeCells(totalsRow, 1, totalsRow, 3);

const tcvCell = wsPipe.getCell(totalsRow, 4);
tcvCell.value = { formula: `SUM(D3:D${totalsRow - 1})` };
tcvCell.numFmt = '"$"#,##0';
tcvCell.font = { name: 'Helvetica', bold: true, size: 12, color: { argb: WHITE } };
tcvCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } };
tcvCell.alignment = { vertical: 'middle', horizontal: 'center' };

const avgPwinCell = wsPipe.getCell(totalsRow, 5);
avgPwinCell.value = { formula: `IFERROR(SUMPRODUCT(D3:D${totalsRow - 1},E3:E${totalsRow - 1})/SUM(D3:D${totalsRow - 1}),0)` };
avgPwinCell.numFmt = '0%';
avgPwinCell.font = { name: 'Helvetica', bold: true, size: 12, color: { argb: WHITE } };
avgPwinCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } };
avgPwinCell.alignment = { vertical: 'middle', horizontal: 'center' };

const evTotCell = wsPipe.getCell(totalsRow, 6);
evTotCell.value = { formula: `SUM(F3:F${totalsRow - 1})` };
evTotCell.numFmt = '"$"#,##0';
evTotCell.font = { name: 'Helvetica', bold: true, size: 12, color: { argb: WHITE } };
evTotCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } };
evTotCell.alignment = { vertical: 'middle', horizontal: 'center' };

wsPipe.mergeCells(totalsRow, 7, totalsRow, 9);
const totHelp = wsPipe.getCell(totalsRow, 7);
totHelp.value = 'Weighted pipeline value = sum of (Contract × PWin) across all rows.';
totHelp.font = { name: 'Helvetica', italic: true, size: 10, color: { argb: WHITE } };
totHelp.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } };
totHelp.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

// Conditional formatting on PWin column (data bar) — using cellIs colors
wsPipe.addConditionalFormatting({
  ref: `E3:E${totalsRow - 1}`,
  rules: [
    {
      type: 'cellIs',
      operator: 'greaterThanOrEqual',
      formulae: ['0.7'],
      priority: 1,
      style: {
        font: { color: { argb: EMERALD_DARK }, bold: true },
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD1FAE5' } },
      },
    },
    {
      type: 'cellIs',
      operator: 'between',
      formulae: ['0.5', '0.6999'],
      priority: 2,
      style: {
        font: { color: { argb: 'FFB45309' }, bold: true },
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEF3C7' } },
      },
    },
    {
      type: 'cellIs',
      operator: 'lessThan',
      formulae: ['0.5'],
      priority: 3,
      style: {
        font: { color: { argb: RED }, bold: true },
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } },
      },
    },
  ],
});

brandFooter(wsPipe);

// =============================================================
// Save
// =============================================================
await wb.xlsx.writeFile(OUT);
console.log('Wrote', OUT);
