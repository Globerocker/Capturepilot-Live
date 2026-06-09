// Build: FLK_08_Indirect_Rate_Calculator.xlsx
// Excel + Google Sheets compatible. No LAMBDA / XLOOKUP / FILTER.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ExcelJS = require('/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js');

const OUT = '/Users/andreschuler/Caturepilot 2.0/assets/starter-pack/rebuilt/FLK_08_Indirect_Rate_Calculator.xlsx';

const EMERALD = 'FF10B981';
const EMERALD_DARK = 'FF065F46';
const SLATE_900 = 'FF0F172A';
const SLATE_700 = 'FF334155';
const SLATE_100 = 'FFF1F5F9';
const AMBER = 'FFF59E0B';
const RED = 'FFDC2626';
const BLUE = 'FF2563EB';
const WHITE = 'FFFFFFFF';

// ───────────────────────────────────────────────────────────────
// buildListsSheet
// ───────────────────────────────────────────────────────────────
/**
 * buildListsSheet
 * ---------------
 * Call once per workbook, right after `new ExcelJS.Workbook()`.
 * Returns a map { listName -> formulaString } to pass into dataValidation.formulae.
 *
 * @param {import('exceljs').Workbook} wb
 * @param {Array<{name: string, title: string, items: string[]}>} lists
 * @returns {Record<string, string>}
 */
function buildListsSheet(wb, lists) {
  let wsLists = wb.getWorksheet('Lists');
  if (!wsLists) {
    wsLists = wb.addWorksheet('Lists', { views: [{ showGridLines: false }] });
  }

  wsLists.columns = lists.map(() => ({ width: 28 }));

  const formulaMap = {};

  lists.forEach((list, colIdx) => {
    const colLetter = String.fromCharCode(65 + colIdx); // A, B, C …
    const titleCell = wsLists.getCell(`${colLetter}1`);
    titleCell.value = list.title;
    titleCell.font = { name: 'Calibri', size: 10, bold: true };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    list.items.forEach((item, itemIdx) => {
      const cell = wsLists.getCell(`${colLetter}${2 + itemIdx}`);
      cell.value = item;
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    });
    const lastRow = 1 + list.items.length;
    wb.definedNames.add(`Lists!$${colLetter}$2:$${colLetter}$${lastRow}`, list.name);
    formulaMap[list.name] = list.name;
  });

  wsLists.state = 'veryHidden';
  return formulaMap;
}

const wb = new ExcelJS.Workbook();

const lists = buildListsSheet(wb, [
  { name: 'ClearanceLevel', title: 'Clearance Level', items: ['None', 'Public Trust', 'Secret', 'TS', 'TS/SCI'] },
  { name: 'DirectIndirect',  title: 'Direct or Indirect', items: ['Direct', 'Indirect'] },
]);

wb.creator = 'CapturePilot — Federal Lead Kit';
wb.lastModifiedBy = 'CapturePilot';
wb.created = new Date();
wb.modified = new Date();
wb.company = 'CapturePilot';

const brandHeader = {
  oddHeader: '&L&B&"Calibri"&12CapturePilot — Federal Lead Kit&R&"Calibri"&10Indirect Rate Calculator',
  oddFooter: '&LFLK 08 — Price-to-Win Toolkit&CPage &P of &N&Rcapturepilot.com',
};

const pageSetup = {
  paperSize: 9, // Letter
  orientation: 'portrait',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
};

// ---------- helpers ----------
function fill(cell, color) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}
function setBorder(cell, color = 'FFCBD5E1') {
  cell.border = {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  };
}
function bandTitle(ws, row, text, bg = EMERALD_DARK, fg = WHITE) {
  const r = ws.getRow(row);
  r.height = 22;
  const c = ws.getCell(`A${row}`);
  c.value = text;
  c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: fg } };
  fill(c, bg);
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.mergeCells(`A${row}:I${row}`);
}
function inputCell(cell) {
  fill(cell, 'FFDBEAFE');
  cell.font = { name: 'Calibri', size: 11, color: { argb: BLUE }, bold: true };
  setBorder(cell, 'FF93C5FD');
}
function formulaCell(cell) {
  fill(cell, 'FFF8FAFC');
  cell.font = { name: 'Calibri', size: 11, color: { argb: SLATE_900 } };
  setBorder(cell);
}
function labelCell(cell) {
  cell.font = { name: 'Calibri', size: 11, color: { argb: SLATE_900 } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
}
function totalRow(cell) {
  fill(cell, EMERALD);
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
  setBorder(cell, EMERALD_DARK);
}

// =====================================================================
// SHEET 1 — INSTRUCTIONS
// =====================================================================
const wsInfo = wb.addWorksheet('Instructions', {
  pageSetup,
  headerFooter: brandHeader,
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
});
wsInfo.columns = [
  { width: 4 },
  { width: 36 },
  { width: 70 },
];

wsInfo.getRow(1).height = 30;
wsInfo.mergeCells('A1:C1');
const title = wsInfo.getCell('A1');
title.value = 'FEDERAL LEAD KIT — Indirect Rate Calculator';
title.font = { name: 'Calibri', size: 16, bold: true, color: { argb: WHITE } };
fill(title, EMERALD_DARK);
title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

wsInfo.mergeCells('A2:C2');
const sub = wsInfo.getCell('A2');
sub.value = 'Calculate your provisional fringe, overhead, and G&A rates from real cost data. Outputs the wrap rate and the bill rate you can drop into a proposal.';
sub.font = { name: 'Calibri', size: 11, italic: true, color: { argb: SLATE_700 } };
sub.alignment = { vertical: 'middle', wrapText: true };
wsInfo.getRow(2).height = 36;

let r = 4;
bandTitle(wsInfo, r, 'WHAT THIS WORKBOOK DOES');
r++;
const intro = [
  'You probably know your loaded labor cost is more than the base salary. The hard part is putting a real number on it.',
  "This sheet does that math. You enter actual payroll and overhead numbers. It gives you back a fringe rate, an overhead rate, a G&A rate, and a wrap rate you can defend if DCAA asks.",
  "Build it once, refresh it every quarter, and you'll have a defensible price for the next RFP without scrambling.",
];
intro.forEach(line => {
  wsInfo.mergeCells(`A${r}:C${r}`);
  const c = wsInfo.getCell(`A${r}`);
  c.value = line;
  c.font = { name: 'Calibri', size: 11, color: { argb: SLATE_900 } };
  c.alignment = { wrapText: true, vertical: 'top' };
  wsInfo.getRow(r).height = 32;
  r++;
});

r++;
bandTitle(wsInfo, r, 'HOW TO USE IT — IN ORDER');
r++;
const steps = [
  ['Step 1', 'Direct Labor tab', "List every employee who charges time to contracts. Annual salary and annual hours. That's your DL base."],
  ['Step 2', 'Cost Pools tab', 'Plug in fringe costs (taxes, health, retirement, PTO), overhead costs (rent, indirect labor, equipment), and G&A (executive salaries, accounting, BD).'],
  ['Step 3', 'Rate Summary tab', 'Read the three pool rates, your wrap rate, and your bill rates per labor category. Change the target fee at the top to see the impact.'],
  ['Step 4', 'Help tab', 'Read this before your first DCAA conversation. Definitions, typical ranges, and what auditors actually want to see.'],
];
steps.forEach(([k, label, body]) => {
  const c1 = wsInfo.getCell(`A${r}`); c1.value = k;
  c1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: EMERALD_DARK } };
  c1.alignment = { vertical: 'top' };
  const c2 = wsInfo.getCell(`B${r}`); c2.value = label;
  c2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: SLATE_900 } };
  c2.alignment = { vertical: 'top' };
  const c3 = wsInfo.getCell(`C${r}`); c3.value = body;
  c3.font = { name: 'Calibri', size: 11, color: { argb: SLATE_700 } };
  c3.alignment = { vertical: 'top', wrapText: true };
  wsInfo.getRow(r).height = 32;
  r++;
});

r++;
bandTitle(wsInfo, r, 'COLOR CODING');
r++;
const colors = [
  ['Input', 'DBEAFE', BLUE, "You enter this. These cells drive every calculation downstream."],
  ['Formula', 'F8FAFC', SLATE_900, "Auto-calculated. Leave it alone."],
  ['Total', '10B981', WHITE, 'Subtotal or section total. Always a formula.'],
  ['Warning', 'FECACA', RED, "Your rate is outside the typical range. Fix it or be ready to defend it."],
  ['Reference', 'D1FAE5', EMERALD_DARK, 'Benchmark numbers for comparison. Not your data.'],
];
colors.forEach(([k, bg, fg, body]) => {
  const c1 = wsInfo.getCell(`B${r}`); c1.value = k;
  c1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: fg } };
  fill(c1, 'FF' + bg);
  c1.alignment = { vertical: 'middle', horizontal: 'center' };
  setBorder(c1);
  const c2 = wsInfo.getCell(`C${r}`); c2.value = body;
  labelCell(c2);
  wsInfo.getRow(r).height = 22;
  r++;
});

r++;
bandTitle(wsInfo, r, 'WHEN TO REFRESH');
r++;
[
  ['Quarterly', 'Update direct labor and pool numbers from your books. Takes 30 minutes if your bookkeeper has clean categories.'],
  ['Before any cost proposal', 'Pull actuals year-to-date and project forward. Submit a Forward Pricing Rate Agreement (FPRA) to DCAA if you do more than $50M in cost-type work.'],
  ['When you hire indirect staff', "A new HR or finance hire moves your overhead pool. The wrap rate shifts immediately, sometimes 2 to 4 points."],
  ['When you change benefits', "Switched health plans, added 401(k) match, raised PTO. Fringe rate changes the next pay cycle."],
].forEach(([k, body]) => {
  const c1 = wsInfo.getCell(`B${r}`); c1.value = k;
  c1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: EMERALD_DARK } };
  const c2 = wsInfo.getCell(`C${r}`); c2.value = body;
  labelCell(c2);
  wsInfo.getRow(r).height = 30;
  r++;
});

// =====================================================================
// SHEET 2 — DIRECT LABOR POOL
// =====================================================================
const wsDL = wb.addWorksheet('Direct Labor', {
  pageSetup,
  headerFooter: brandHeader,
  views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
});
wsDL.columns = [
  { width: 30 }, // A Name/Position
  { width: 12 }, // B Clearance
  { width: 12 }, // C DL or Indirect
  { width: 16 }, // D Annual Salary
  { width: 12 }, // E Annual Hours
  { width: 16 }, // F Hourly DL Rate
  { width: 18 }, // G Fringe Estimate
  { width: 18 }, // H Annual DL Cost
  { width: 26 }, // I Notes
];

wsDL.mergeCells('A1:I1');
const dlTitle = wsDL.getCell('A1');
dlTitle.value = 'DIRECT LABOR POOL — Employee Salary & Hours';
dlTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: WHITE } };
fill(dlTitle, EMERALD_DARK);
dlTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
wsDL.getRow(1).height = 24;

wsDL.mergeCells('A2:I2');
const dlSub = wsDL.getCell('A2');
dlSub.value = 'Enter each direct-charge employee. Overhead, fringe, and wrap calculations pull from this sheet.';
dlSub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: SLATE_700 } };

// Header row 4
const dlHeaders = ['Employee Name / Position', 'Clearance', 'DL or Indirect?', 'Annual Salary ($)', 'Annual Hours', 'Hourly DL Rate ($)', 'Fringe Estimate ($)', 'Annual DL Cost ($)', 'Notes'];
dlHeaders.forEach((h, i) => {
  const c = wsDL.getCell(4, i + 1);
  c.value = h;
  c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
  fill(c, SLATE_900);
  c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  setBorder(c, SLATE_900);
});
wsDL.getRow(4).height = 32;

// Section header for direct
wsDL.mergeCells('A5:I5');
const dlSec = wsDL.getCell('A5');
dlSec.value = '  DIRECT EMPLOYEES (charge time to contracts)';
dlSec.font = { name: 'Calibri', size: 11, bold: true, color: { argb: EMERALD_DARK } };
fill(dlSec, 'FFD1FAE5');

// Sample employees with placeholder salaries / hours
const directEmployees = [
  ['  Program Manager', 'Secret', 'Direct', 145000, 1860],
  ['  Senior Systems Engineer', 'TS/SCI', 'Direct', 155000, 1860],
  ['  Systems Engineer (Mid)', 'Secret', 'Direct', 115000, 1860],
  ['  Software Developer (Senior)', 'Secret', 'Direct', 140000, 1860],
  ['  Software Developer (Mid)', 'None', 'Direct', 105000, 1860],
  ['  Data Analyst', 'Secret', 'Direct', 95000, 1860],
  ['  Technical Writer', 'None', 'Direct', 78000, 1860],
  ['  Quality Assurance Lead', 'Secret', 'Direct', 110000, 1860],
  ['  Project Coordinator', 'None', 'Direct', 72000, 1860],
  ['  Subject Matter Expert (PT)', 'TS/SCI', 'Direct', 90000, 960],
];

const directStart = 6;
directEmployees.forEach((emp, i) => {
  const row = directStart + i;
  const [name, clr, type, sal, hrs] = emp;
  wsDL.getCell(`A${row}`).value = name;
  labelCell(wsDL.getCell(`A${row}`));
  wsDL.getCell(`B${row}`).value = clr;
  wsDL.getCell(`B${row}`).alignment = { horizontal: 'center' };
  inputCell(wsDL.getCell(`B${row}`));
  wsDL.getCell(`C${row}`).value = type;
  wsDL.getCell(`C${row}`).alignment = { horizontal: 'center' };
  inputCell(wsDL.getCell(`C${row}`));
  wsDL.getCell(`D${row}`).value = sal;
  wsDL.getCell(`D${row}`).numFmt = '"$"#,##0';
  inputCell(wsDL.getCell(`D${row}`));
  wsDL.getCell(`E${row}`).value = hrs;
  wsDL.getCell(`E${row}`).numFmt = '#,##0';
  inputCell(wsDL.getCell(`E${row}`));
  // Hourly DL rate = Salary / Hours
  wsDL.getCell(`F${row}`).value = { formula: `IFERROR(D${row}/E${row},0)` };
  wsDL.getCell(`F${row}`).numFmt = '"$"#,##0.00';
  formulaCell(wsDL.getCell(`F${row}`));
  // Fringe estimate = Salary * fringe rate from summary (default 0.30 for display)
  wsDL.getCell(`G${row}`).value = { formula: `D${row}*'Rate Summary'!$D$10` };
  wsDL.getCell(`G${row}`).numFmt = '"$"#,##0';
  formulaCell(wsDL.getCell(`G${row}`));
  // Annual DL Cost = Salary + Fringe
  wsDL.getCell(`H${row}`).value = { formula: `D${row}+G${row}` };
  wsDL.getCell(`H${row}`).numFmt = '"$"#,##0';
  formulaCell(wsDL.getCell(`H${row}`));
  // Notes
  fill(wsDL.getCell(`I${row}`), 'FFF8FAFC');
  setBorder(wsDL.getCell(`I${row}`));
  // Data validation
  wsDL.getCell(`B${row}`).dataValidation = {
    type: 'list', allowBlank: true,
    formulae: [lists.ClearanceLevel],
  };
  wsDL.getCell(`C${row}`).dataValidation = {
    type: 'list', allowBlank: false,
    formulae: [lists.DirectIndirect],
  };
});

// Totals direct
const dlTotalRow = directStart + directEmployees.length;
wsDL.getCell(`A${dlTotalRow}`).value = '  DIRECT LABOR TOTAL';
totalRow(wsDL.getCell(`A${dlTotalRow}`));
['B','C'].forEach(col => { wsDL.getCell(`${col}${dlTotalRow}`).value = ''; totalRow(wsDL.getCell(`${col}${dlTotalRow}`)); });
wsDL.getCell(`D${dlTotalRow}`).value = { formula: `SUM(D${directStart}:D${dlTotalRow - 1})` };
wsDL.getCell(`D${dlTotalRow}`).numFmt = '"$"#,##0';
totalRow(wsDL.getCell(`D${dlTotalRow}`));
wsDL.getCell(`E${dlTotalRow}`).value = { formula: `SUM(E${directStart}:E${dlTotalRow - 1})` };
wsDL.getCell(`E${dlTotalRow}`).numFmt = '#,##0';
totalRow(wsDL.getCell(`E${dlTotalRow}`));
wsDL.getCell(`F${dlTotalRow}`).value = { formula: `IFERROR(D${dlTotalRow}/E${dlTotalRow},0)` };
wsDL.getCell(`F${dlTotalRow}`).numFmt = '"$"#,##0.00';
totalRow(wsDL.getCell(`F${dlTotalRow}`));
wsDL.getCell(`G${dlTotalRow}`).value = { formula: `SUM(G${directStart}:G${dlTotalRow - 1})` };
wsDL.getCell(`G${dlTotalRow}`).numFmt = '"$"#,##0';
totalRow(wsDL.getCell(`G${dlTotalRow}`));
wsDL.getCell(`H${dlTotalRow}`).value = { formula: `SUM(H${directStart}:H${dlTotalRow - 1})` };
wsDL.getCell(`H${dlTotalRow}`).numFmt = '"$"#,##0';
totalRow(wsDL.getCell(`H${dlTotalRow}`));
wsDL.getCell(`I${dlTotalRow}`).value = '← Direct labor base';
totalRow(wsDL.getCell(`I${dlTotalRow}`));

// Indirect section
const indSecRow = dlTotalRow + 2;
wsDL.mergeCells(`A${indSecRow}:I${indSecRow}`);
const indSec = wsDL.getCell(`A${indSecRow}`);
indSec.value = '  INDIRECT / OVERHEAD LABOR (flows to OH pool, not DL base)';
indSec.font = { name: 'Calibri', size: 11, bold: true, color: { argb: EMERALD_DARK } };
fill(indSec, 'FFD1FAE5');

const indirectEmployees = [
  ['  Project Controls / Scheduler', 'None', 'Indirect', 88000, 2080],
  ['  HR Manager', 'None', 'Indirect', 95000, 2080],
  ['  Controller / Finance Manager', 'None', 'Indirect', 125000, 2080],
  ['  IT Systems Administrator', 'None', 'Indirect', 92000, 2080],
  ['  Facilities / Office Manager', 'None', 'Indirect', 68000, 2080],
];

const indirectStart = indSecRow + 1;
indirectEmployees.forEach((emp, i) => {
  const row = indirectStart + i;
  const [name, clr, type, sal, hrs] = emp;
  wsDL.getCell(`A${row}`).value = name;
  labelCell(wsDL.getCell(`A${row}`));
  wsDL.getCell(`B${row}`).value = clr;
  wsDL.getCell(`B${row}`).alignment = { horizontal: 'center' };
  inputCell(wsDL.getCell(`B${row}`));
  wsDL.getCell(`C${row}`).value = type;
  wsDL.getCell(`C${row}`).alignment = { horizontal: 'center' };
  inputCell(wsDL.getCell(`C${row}`));
  wsDL.getCell(`D${row}`).value = sal;
  wsDL.getCell(`D${row}`).numFmt = '"$"#,##0';
  inputCell(wsDL.getCell(`D${row}`));
  wsDL.getCell(`E${row}`).value = hrs;
  wsDL.getCell(`E${row}`).numFmt = '#,##0';
  inputCell(wsDL.getCell(`E${row}`));
  wsDL.getCell(`F${row}`).value = { formula: `IFERROR(D${row}/E${row},0)` };
  wsDL.getCell(`F${row}`).numFmt = '"$"#,##0.00';
  formulaCell(wsDL.getCell(`F${row}`));
  wsDL.getCell(`G${row}`).value = { formula: `D${row}*'Rate Summary'!$D$10` };
  wsDL.getCell(`G${row}`).numFmt = '"$"#,##0';
  formulaCell(wsDL.getCell(`G${row}`));
  wsDL.getCell(`H${row}`).value = { formula: `D${row}+G${row}` };
  wsDL.getCell(`H${row}`).numFmt = '"$"#,##0';
  formulaCell(wsDL.getCell(`H${row}`));
  fill(wsDL.getCell(`I${row}`), 'FFF8FAFC');
  setBorder(wsDL.getCell(`I${row}`));
  wsDL.getCell(`B${row}`).dataValidation = {
    type: 'list', allowBlank: true,
    formulae: [lists.ClearanceLevel],
  };
  wsDL.getCell(`C${row}`).dataValidation = {
    type: 'list', allowBlank: false,
    formulae: [lists.DirectIndirect],
  };
});

const indTotalRow = indirectStart + indirectEmployees.length;
wsDL.getCell(`A${indTotalRow}`).value = '  INDIRECT LABOR TOTAL';
totalRow(wsDL.getCell(`A${indTotalRow}`));
['B','C'].forEach(col => { wsDL.getCell(`${col}${indTotalRow}`).value = ''; totalRow(wsDL.getCell(`${col}${indTotalRow}`)); });
wsDL.getCell(`D${indTotalRow}`).value = { formula: `SUM(D${indirectStart}:D${indTotalRow - 1})` };
wsDL.getCell(`D${indTotalRow}`).numFmt = '"$"#,##0';
totalRow(wsDL.getCell(`D${indTotalRow}`));
wsDL.getCell(`E${indTotalRow}`).value = { formula: `SUM(E${indirectStart}:E${indTotalRow - 1})` };
wsDL.getCell(`E${indTotalRow}`).numFmt = '#,##0';
totalRow(wsDL.getCell(`E${indTotalRow}`));
wsDL.getCell(`F${indTotalRow}`).value = '';
totalRow(wsDL.getCell(`F${indTotalRow}`));
wsDL.getCell(`G${indTotalRow}`).value = { formula: `SUM(G${indirectStart}:G${indTotalRow - 1})` };
wsDL.getCell(`G${indTotalRow}`).numFmt = '"$"#,##0';
totalRow(wsDL.getCell(`G${indTotalRow}`));
wsDL.getCell(`H${indTotalRow}`).value = { formula: `SUM(H${indirectStart}:H${indTotalRow - 1})` };
wsDL.getCell(`H${indTotalRow}`).numFmt = '"$"#,##0';
totalRow(wsDL.getCell(`H${indTotalRow}`));
wsDL.getCell(`I${indTotalRow}`).value = '→ Flows to OH pool';
totalRow(wsDL.getCell(`I${indTotalRow}`));

// Named ranges
wb.definedNames.add(`'Direct Labor'!$D$${dlTotalRow}`, 'DL_Base');
wb.definedNames.add(`'Direct Labor'!$D$${indTotalRow}`, 'Indirect_Labor_Total');

// =====================================================================
// SHEET 3 — COST POOLS
// =====================================================================
const wsCP = wb.addWorksheet('Cost Pools', {
  pageSetup,
  headerFooter: brandHeader,
  views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
});
wsCP.columns = [
  { width: 56 }, // A description
  { width: 18 }, // B amount
  { width: 36 }, // C notes
];

wsCP.mergeCells('A1:C1');
const cpTitle = wsCP.getCell('A1');
cpTitle.value = 'INDIRECT COST POOLS — Fringe, Overhead & G&A';
cpTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: WHITE } };
fill(cpTitle, EMERALD_DARK);
cpTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
wsCP.getRow(1).height = 24;

wsCP.mergeCells('A2:C2');
const cpSub = wsCP.getCell('A2');
cpSub.value = 'Enter actual or estimated annual costs for each pool. Rates auto-calculate on the Rate Summary tab.';
cpSub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: SLATE_700 } };

let row = 4;

// ---- FRINGE POOL ----
bandTitle(wsCP, row, 'FRINGE BENEFIT POOL — Base: Total Direct Labor Salaries');
row++;

const fringeItems = [
  ['  FICA — Social Security (6.2% of wages up to $168,600)', 75000],
  ['  FICA — Medicare (1.45% of all wages + 0.9% over $200K)', 18000],
  ['  FUTA — Federal Unemployment (6% on first $7K, net ~0.6%)', 600],
  ['  SUTA — State Unemployment (varies by state, 1–5%)', 8500],
  ['  Health Insurance — Employer Contribution', 95000],
  ['  Dental & Vision — Employer Contribution', 11000],
  ['  Retirement / 401(k) Match', 42000],
  ['  Paid Time Off (PTO) — accrual cost', 56000],
  ['  Paid Holidays', 38000],
  ['  Workers Compensation Insurance', 7500],
  ['  Life / Disability Insurance', 8500],
  ['  Other Fringe (commuter benefits, tuition, etc.)', 5000],
];
const fringeStart = row;
fringeItems.forEach(([label, amt]) => {
  wsCP.getCell(`A${row}`).value = label;
  labelCell(wsCP.getCell(`A${row}`));
  wsCP.getCell(`B${row}`).value = amt;
  wsCP.getCell(`B${row}`).numFmt = '"$"#,##0';
  inputCell(wsCP.getCell(`B${row}`));
  fill(wsCP.getCell(`C${row}`), WHITE);
  setBorder(wsCP.getCell(`C${row}`));
  row++;
});
const fringeTotalRow = row;
wsCP.getCell(`A${row}`).value = '  TOTAL FRINGE POOL';
totalRow(wsCP.getCell(`A${row}`));
wsCP.getCell(`B${row}`).value = { formula: `SUM(B${fringeStart}:B${row - 1})` };
wsCP.getCell(`B${row}`).numFmt = '"$"#,##0';
totalRow(wsCP.getCell(`B${row}`));
wsCP.getCell(`C${row}`).value = '→ Fringe Rate = this ÷ DL Base';
totalRow(wsCP.getCell(`C${row}`));
row += 2;

// ---- OVERHEAD POOL ----
bandTitle(wsCP, row, 'OVERHEAD COST POOL — Base: Direct Labor Salaries');
row++;
const ohItems = [
  ['  Indirect Labor (auto-pulled from Direct Labor tab)', null, 'AUTO'],
  ['  Fringe on Indirect Labor', null, 'AUTO'],
  ['  Facilities — Rent, Utilities, Janitorial (contract-supporting space)', 96000, ''],
  ['  Equipment — Computers, Software licenses for DL employees', 28000, ''],
  ['  Subcontractor Oversight (if not direct-charged)', 12000, ''],
  ['  Travel — Indirect (site visits, not billable to specific contracts)', 14000, ''],
  ['  Training — Technical (job-specific, not G&A)', 9500, ''],
  ['  Recruiting — Direct employee sourcing', 8000, ''],
  ['  Other Overhead', 6000, ''],
];
const ohStart = row;
ohItems.forEach(([label, amt, kind]) => {
  wsCP.getCell(`A${row}`).value = label;
  labelCell(wsCP.getCell(`A${row}`));
  if (kind === 'AUTO') {
    // pull indirect labor or fringe on indirect labor
    if (label.includes('Fringe on Indirect')) {
      wsCP.getCell(`B${row}`).value = { formula: `Indirect_Labor_Total*'Rate Summary'!$D$10` };
    } else {
      wsCP.getCell(`B${row}`).value = { formula: `Indirect_Labor_Total` };
    }
    wsCP.getCell(`B${row}`).numFmt = '"$"#,##0';
    formulaCell(wsCP.getCell(`B${row}`));
    wsCP.getCell(`C${row}`).value = 'Linked from Direct Labor tab';
    wsCP.getCell(`C${row}`).font = { italic: true, color: { argb: SLATE_700 }, size: 10 };
  } else {
    wsCP.getCell(`B${row}`).value = amt;
    wsCP.getCell(`B${row}`).numFmt = '"$"#,##0';
    inputCell(wsCP.getCell(`B${row}`));
    fill(wsCP.getCell(`C${row}`), WHITE);
    setBorder(wsCP.getCell(`C${row}`));
  }
  row++;
});
const ohTotalRow = row;
wsCP.getCell(`A${row}`).value = '  TOTAL OVERHEAD POOL';
totalRow(wsCP.getCell(`A${row}`));
wsCP.getCell(`B${row}`).value = { formula: `SUM(B${ohStart}:B${row - 1})` };
wsCP.getCell(`B${row}`).numFmt = '"$"#,##0';
totalRow(wsCP.getCell(`B${row}`));
wsCP.getCell(`C${row}`).value = '→ Overhead Rate = this ÷ DL Base';
totalRow(wsCP.getCell(`C${row}`));
row += 2;

// ---- G&A POOL ----
bandTitle(wsCP, row, 'G&A (GENERAL & ADMINISTRATIVE) COST POOL — Base: Total Cost Input');
row++;
const gaItems = [
  ['  Executive / Owner Salaries (non-billable portion)', 220000],
  ['  Fringe on G&A Labor', 66000],
  ['  Accounting & Finance', 38000],
  ['  Legal & Compliance', 22000],
  ['  Business Development & Proposal (non-overhead BD)', 45000],
  ['  General IT / Corporate Systems', 18000],
  ['  Corporate Facilities (not allocated to OH)', 24000],
  ['  Professional Memberships & Subscriptions', 9000],
  ['  Corporate Insurance (D&O, E&O, General Liability)', 28000],
  ['  Corporate Travel', 14000],
  ['  Bid & Proposal (B&P) Costs', 32000],
  ['  Other G&A', 6000],
];
const gaStart = row;
gaItems.forEach(([label, amt]) => {
  wsCP.getCell(`A${row}`).value = label;
  labelCell(wsCP.getCell(`A${row}`));
  wsCP.getCell(`B${row}`).value = amt;
  wsCP.getCell(`B${row}`).numFmt = '"$"#,##0';
  inputCell(wsCP.getCell(`B${row}`));
  fill(wsCP.getCell(`C${row}`), WHITE);
  setBorder(wsCP.getCell(`C${row}`));
  row++;
});
const gaTotalRow = row;
wsCP.getCell(`A${row}`).value = '  TOTAL G&A POOL';
totalRow(wsCP.getCell(`A${row}`));
wsCP.getCell(`B${row}`).value = { formula: `SUM(B${gaStart}:B${row - 1})` };
wsCP.getCell(`B${row}`).numFmt = '"$"#,##0';
totalRow(wsCP.getCell(`B${row}`));
wsCP.getCell(`C${row}`).value = '→ G&A Rate = this ÷ Total Cost Input';
totalRow(wsCP.getCell(`C${row}`));

// Named ranges
wb.definedNames.add(`'Cost Pools'!$B$${fringeTotalRow}`, 'Fringe_Pool');
wb.definedNames.add(`'Cost Pools'!$B$${ohTotalRow}`, 'OH_Pool');
wb.definedNames.add(`'Cost Pools'!$B$${gaTotalRow}`, 'GA_Pool');

// =====================================================================
// SHEET 4 — RATE SUMMARY
// =====================================================================
const wsSum = wb.addWorksheet('Rate Summary', {
  pageSetup,
  headerFooter: brandHeader,
  views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
});
wsSum.columns = [
  { width: 4 },  // A spacer
  { width: 36 }, // B label
  { width: 16 }, // C amount
  { width: 16 }, // D rate
  { width: 38 }, // E note
];

wsSum.mergeCells('A1:E1');
const sumTitle = wsSum.getCell('A1');
sumTitle.value = 'INDIRECT RATE SUMMARY & WRAP RATE CALCULATOR';
sumTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: WHITE } };
fill(sumTitle, EMERALD_DARK);
sumTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
wsSum.getRow(1).height = 24;

wsSum.mergeCells('A2:E2');
const sumSub = wsSum.getCell('A2');
sumSub.value = 'Pulls from Direct Labor and Cost Pools tabs. Change the fee, escalation, and fringe override below.';
sumSub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: SLATE_700 } };

// ---- INPUTS BLOCK (D8, D9, D10) ----
bandTitle(wsSum, 4, 'RATE INPUTS & ASSUMPTIONS');

// Row 6 — Target Fee
wsSum.getCell('B6').value = '  Target Fee / Profit Rate';
labelCell(wsSum.getCell('B6'));
wsSum.getCell('D6').value = 0.08;
wsSum.getCell('D6').numFmt = '0.0%';
inputCell(wsSum.getCell('D6'));
wsSum.getCell('E6').value = 'Used in bill rate and full wrap. CPFF typical 6–10%. FFP varies.';
wsSum.getCell('E6').font = { italic: true, color: { argb: SLATE_700 }, size: 10 };

// Row 7 — Escalation
wsSum.getCell('B7').value = '  Annual Escalation Rate (Year 2+)';
labelCell(wsSum.getCell('B7'));
wsSum.getCell('D7').value = 0.03;
wsSum.getCell('D7').numFmt = '0.0%';
inputCell(wsSum.getCell('D7'));
wsSum.getCell('E7').value = 'Salary escalation for option years. 2–4% is normal for GovCon.';
wsSum.getCell('E7').font = { italic: true, color: { argb: SLATE_700 }, size: 10 };

// Row 8 — Fringe override
wsSum.getCell('B8').value = '  Fringe Rate (override — optional)';
labelCell(wsSum.getCell('B8'));
wsSum.getCell('D8').value = '';
wsSum.getCell('D8').numFmt = '0.0%';
inputCell(wsSum.getCell('D8'));
wsSum.getCell('E8').value = 'Leave blank to auto-calculate from Cost Pools.';
wsSum.getCell('E8').font = { italic: true, color: { argb: SLATE_700 }, size: 10 };

// ---- CALCULATED RATES ----
bandTitle(wsSum, 9, 'CALCULATED INDIRECT RATES');

// Row 10 — DL Base
wsSum.getCell('B10').value = '  Direct Labor Base (annual salaries)';
labelCell(wsSum.getCell('B10'));
wsSum.getCell('C10').value = { formula: 'DL_Base' };
wsSum.getCell('C10').numFmt = '"$"#,##0';
formulaCell(wsSum.getCell('C10'));
// D10 = Fringe rate (override OR calc); used by Direct Labor sheet via $D$10
wsSum.getCell('D10').value = { formula: 'IF(ISNUMBER(D8),D8,IFERROR(Fringe_Pool/DL_Base,0))' };
wsSum.getCell('D10').numFmt = '0.0%';
formulaCell(wsSum.getCell('D10'));
wsSum.getCell('D10').font = { bold: true, color: { argb: EMERALD_DARK } };
wsSum.getCell('E10').value = 'Fringe Pool ÷ DL Base. Typical: 25–35%.';
wsSum.getCell('E10').font = { italic: true, color: { argb: SLATE_700 }, size: 10 };

// Row 11 — Overhead
wsSum.getCell('B11').value = '  Overhead Rate';
labelCell(wsSum.getCell('B11'));
wsSum.getCell('C11').value = { formula: 'OH_Pool' };
wsSum.getCell('C11').numFmt = '"$"#,##0';
formulaCell(wsSum.getCell('C11'));
wsSum.getCell('D11').value = { formula: 'IFERROR(OH_Pool/DL_Base,0)' };
wsSum.getCell('D11').numFmt = '0.0%';
formulaCell(wsSum.getCell('D11'));
wsSum.getCell('D11').font = { bold: true, color: { argb: EMERALD_DARK } };
wsSum.getCell('E11').value = 'Overhead Pool ÷ DL Base. Typical: 10–25%.';
wsSum.getCell('E11').font = { italic: true, color: { argb: SLATE_700 }, size: 10 };

// Row 12 — TCI
wsSum.getCell('B12').value = '  Total Cost Input (G&A base)';
labelCell(wsSum.getCell('B12'));
wsSum.getCell('C12').value = { formula: 'DL_Base*(1+D10+D11)' };
wsSum.getCell('C12').numFmt = '"$"#,##0';
formulaCell(wsSum.getCell('C12'));
wsSum.getCell('E12').value = 'DL × (1 + Fringe + OH). Base used for G&A.';
wsSum.getCell('E12').font = { italic: true, color: { argb: SLATE_700 }, size: 10 };

// Row 13 — G&A
wsSum.getCell('B13').value = '  G&A Rate';
labelCell(wsSum.getCell('B13'));
wsSum.getCell('C13').value = { formula: 'GA_Pool' };
wsSum.getCell('C13').numFmt = '"$"#,##0';
formulaCell(wsSum.getCell('C13'));
wsSum.getCell('D13').value = { formula: 'IFERROR(GA_Pool/C12,0)' };
wsSum.getCell('D13').numFmt = '0.0%';
formulaCell(wsSum.getCell('D13'));
wsSum.getCell('D13').font = { bold: true, color: { argb: EMERALD_DARK } };
wsSum.getCell('E13').value = 'G&A Pool ÷ Total Cost Input. Typical: 10–20%.';
wsSum.getCell('E13').font = { italic: true, color: { argb: SLATE_700 }, size: 10 };

// ---- WRAP & BILL ----
bandTitle(wsSum, 15, 'WRAP RATE & BILL RATE MULTIPLIERS');

wsSum.getCell('B16').value = '  Wrap Rate (excl. fee)';
labelCell(wsSum.getCell('B16'));
wsSum.getCell('D16').value = { formula: '(1+D10)*(1+D11)*(1+D13)' };
wsSum.getCell('D16').numFmt = '0.0000';
formulaCell(wsSum.getCell('D16'));
wsSum.getCell('D16').font = { bold: true, size: 12, color: { argb: EMERALD_DARK } };
wsSum.getCell('E16').value = 'Multiply by base DL hourly to get fully-loaded cost.';
wsSum.getCell('E16').font = { italic: true, color: { argb: SLATE_700 }, size: 10 };

wsSum.getCell('B17').value = '  Full Wrap Rate (incl. fee)';
labelCell(wsSum.getCell('B17'));
wsSum.getCell('D17').value = { formula: 'D16*(1+D6)' };
wsSum.getCell('D17').numFmt = '0.0000';
formulaCell(wsSum.getCell('D17'));
wsSum.getCell('D17').font = { bold: true, size: 12, color: { argb: EMERALD_DARK } };
wsSum.getCell('E17').value = 'Your bill multiplier. Multiply by hourly DL rate to get proposed price.';
wsSum.getCell('E17').font = { italic: true, color: { argb: SLATE_700 }, size: 10 };

// ---- BILL RATE TABLE ----
bandTitle(wsSum, 19, 'BILL RATE TABLE — By Labor Category');

const billHeaders = ['Labor Category', 'Base Salary ($)', 'Hourly DL Rate', 'Fringe-Loaded', 'OH-Loaded', 'G&A-Loaded', 'Bill Rate (incl. fee)'];
// We're on columns B-H (skip A spacer to fit page)
const billHeaderRow = 20;
billHeaders.forEach((h, i) => {
  // we'll use columns B..H (offset 2)
  const colIdx = i + 2; // B..H
  const c = wsSum.getCell(billHeaderRow, colIdx);
  c.value = h;
  c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
  fill(c, SLATE_900);
  c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  setBorder(c, SLATE_900);
});
wsSum.getRow(billHeaderRow).height = 30;
// Widen columns
wsSum.getColumn(2).width = 30; // Labor Category
wsSum.getColumn(3).width = 16;
wsSum.getColumn(4).width = 16;
wsSum.getColumn(5).width = 16;
wsSum.getColumn(6).width = 16;
wsSum.getColumn(7).width = 16;
wsSum.getColumn(8).width = 18;

const sampleCats = [
  ['  Program Manager', 145000, 1860],
  ['  Senior Systems Engineer', 155000, 1860],
  ['  Systems Engineer (Mid)', 115000, 1860],
  ['  Software Developer (Senior)', 140000, 1860],
  ['  Software Developer (Mid)', 105000, 1860],
  ['  Data Analyst', 95000, 1860],
  ['  Technical Writer', 78000, 1860],
  ['  QA Lead', 110000, 1860],
];

const billStart = billHeaderRow + 1;
sampleCats.forEach(([cat, sal, hrs], i) => {
  const r = billStart + i;
  // B Labor Category
  wsSum.getCell(r, 2).value = cat;
  labelCell(wsSum.getCell(r, 2));
  // C Base Salary (input)
  wsSum.getCell(r, 3).value = sal;
  wsSum.getCell(r, 3).numFmt = '"$"#,##0';
  inputCell(wsSum.getCell(r, 3));
  // D Hourly DL (= Sal / annual hours assumed 1860)
  wsSum.getCell(r, 4).value = { formula: `C${r}/${hrs}` };
  wsSum.getCell(r, 4).numFmt = '"$"#,##0.00';
  formulaCell(wsSum.getCell(r, 4));
  // E Fringe-loaded = D * (1 + Fringe)
  wsSum.getCell(r, 5).value = { formula: `D${r}*(1+$D$10)` };
  wsSum.getCell(r, 5).numFmt = '"$"#,##0.00';
  formulaCell(wsSum.getCell(r, 5));
  // F OH-loaded = E * (1 + OH)
  wsSum.getCell(r, 6).value = { formula: `E${r}*(1+$D$11)` };
  wsSum.getCell(r, 6).numFmt = '"$"#,##0.00';
  formulaCell(wsSum.getCell(r, 6));
  // G G&A-loaded = F * (1 + G&A)
  wsSum.getCell(r, 7).value = { formula: `F${r}*(1+$D$13)` };
  wsSum.getCell(r, 7).numFmt = '"$"#,##0.00';
  formulaCell(wsSum.getCell(r, 7));
  // H Bill Rate = G * (1 + Fee)
  wsSum.getCell(r, 8).value = { formula: `G${r}*(1+$D$6)` };
  wsSum.getCell(r, 8).numFmt = '"$"#,##0.00';
  formulaCell(wsSum.getCell(r, 8));
  wsSum.getCell(r, 8).font = { bold: true, color: { argb: EMERALD_DARK } };
});

// ---- HEALTH CHECKS ----
const healthRow = billStart + sampleCats.length + 2;
bandTitle(wsSum, healthRow, 'RATE HEALTH CHECKS');

const hcHeaderRow = healthRow + 1;
const hcHeaders = ['Rate', 'Your Value', 'Typical Low', 'Typical High', 'Status'];
hcHeaders.forEach((h, i) => {
  const c = wsSum.getCell(hcHeaderRow, i + 2);
  c.value = h;
  c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
  fill(c, SLATE_900);
  c.alignment = { vertical: 'middle', horizontal: 'center' };
  setBorder(c, SLATE_900);
});
wsSum.getRow(hcHeaderRow).height = 22;

const hcRows = [
  ['  Fringe Rate', 'D10', 0.25, 0.35],
  ['  Overhead Rate', 'D11', 0.10, 0.25],
  ['  G&A Rate', 'D13', 0.10, 0.20],
  ['  Total Wrap Rate (excl. fee)', 'D16', 1.50, 2.20],
];

hcRows.forEach(([label, srcCell, lo, hi], i) => {
  const r = hcHeaderRow + 1 + i;
  wsSum.getCell(r, 2).value = label;
  labelCell(wsSum.getCell(r, 2));
  wsSum.getCell(r, 3).value = { formula: srcCell };
  wsSum.getCell(r, 3).numFmt = srcCell === 'D16' ? '0.0000' : '0.0%';
  formulaCell(wsSum.getCell(r, 3));
  wsSum.getCell(r, 4).value = lo;
  wsSum.getCell(r, 4).numFmt = srcCell === 'D16' ? '0.00' : '0.0%';
  fill(wsSum.getCell(r, 4), 'FFD1FAE5');
  setBorder(wsSum.getCell(r, 4));
  wsSum.getCell(r, 5).value = hi;
  wsSum.getCell(r, 5).numFmt = srcCell === 'D16' ? '0.00' : '0.0%';
  fill(wsSum.getCell(r, 5), 'FFD1FAE5');
  setBorder(wsSum.getCell(r, 5));
  // F Status using IFS not allowed for older Excel — use nested IF
  wsSum.getCell(r, 6).value = { formula: `IF(C${r}<D${r},"BELOW typical — investigate",IF(C${r}>E${r},"ABOVE typical — review","WITHIN typical range"))` };
  formulaCell(wsSum.getCell(r, 6));
  wsSum.getCell(r, 6).alignment = { horizontal: 'center' };
});

// Conditional formatting on status column
const hcFirst = hcHeaderRow + 1;
const hcLast = hcHeaderRow + hcRows.length;
wsSum.addConditionalFormatting({
  ref: `F${hcFirst}:F${hcLast}`,
  rules: [
    { type: 'containsText', operator: 'containsText', text: 'WITHIN', priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD1FAE5' } }, font: { color: { argb: EMERALD_DARK }, bold: true } } },
    { type: 'containsText', operator: 'containsText', text: 'BELOW', priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEF3C7' } }, font: { color: { argb: 'FF92400E' }, bold: true } } },
    { type: 'containsText', operator: 'containsText', text: 'ABOVE', priority: 3, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFECACA' } }, font: { color: { argb: RED }, bold: true } } },
  ],
});

// Conditional formatting on calculated rates D10/D11/D13 (warn if out of range)
wsSum.addConditionalFormatting({
  ref: 'D10',
  rules: [
    { type: 'cellIs', operator: 'between', formulae: ['0.25', '0.35'], priority: 1, style: { font: { color: { argb: EMERALD_DARK }, bold: true } } },
    { type: 'cellIs', operator: 'notBetween', formulae: ['0.25', '0.35'], priority: 2, style: { font: { color: { argb: RED }, bold: true } } },
  ],
});
wsSum.addConditionalFormatting({
  ref: 'D11',
  rules: [
    { type: 'cellIs', operator: 'between', formulae: ['0.10', '0.25'], priority: 1, style: { font: { color: { argb: EMERALD_DARK }, bold: true } } },
    { type: 'cellIs', operator: 'notBetween', formulae: ['0.10', '0.25'], priority: 2, style: { font: { color: { argb: RED }, bold: true } } },
  ],
});
wsSum.addConditionalFormatting({
  ref: 'D13',
  rules: [
    { type: 'cellIs', operator: 'between', formulae: ['0.10', '0.20'], priority: 1, style: { font: { color: { argb: EMERALD_DARK }, bold: true } } },
    { type: 'cellIs', operator: 'notBetween', formulae: ['0.10', '0.20'], priority: 2, style: { font: { color: { argb: RED }, bold: true } } },
  ],
});

// DCAA Note
const noteRow = hcLast + 2;
wsSum.mergeCells(`A${noteRow}:H${noteRow + 2}`);
const note = wsSum.getCell(`A${noteRow}`);
note.value = 'DCAA NOTE: Rates outside the typical range aren\'t automatically a problem. They have to be supported. Write a one-page cost accounting policy that explains how you allocate each pool, keep the source data, and submit it with your cost proposal. That\'s what auditors actually ask for.';
note.font = { name: 'Calibri', size: 10, italic: true, color: { argb: SLATE_700 } };
note.alignment = { wrapText: true, vertical: 'top' };
fill(note, 'FFFFFBEB');
setBorder(note, AMBER);

// =====================================================================
// SHEET 5 — HELP
// =====================================================================
const wsHelp = wb.addWorksheet('Help', {
  pageSetup,
  headerFooter: brandHeader,
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
});
wsHelp.columns = [{ width: 4 }, { width: 32 }, { width: 78 }];

wsHelp.mergeCells('A1:C1');
const helpTitle = wsHelp.getCell('A1');
helpTitle.value = 'HELP — Definitions, Typical Ranges, DCAA Survival';
helpTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: WHITE } };
fill(helpTitle, EMERALD_DARK);
helpTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
wsHelp.getRow(1).height = 24;

let h = 3;
bandTitle(wsHelp, h, 'KEY DEFINITIONS');
h++;

const defs = [
  ['Direct Labor (DL) Base', 'Total wages paid to people performing direct contract work. Every indirect rate is calculated as a percentage of this base. Get this wrong and everything downstream is wrong.'],
  ['Fringe Rate', 'Fringe ÷ Total DL Salaries. Covers payroll taxes (FICA, FUTA, SUTA), health insurance, retirement, PTO, workers comp. Typical: 25–35%. Below 22% usually means you\'re missing PTO or 401(k) accruals.'],
  ['Overhead Rate', "Overhead Pool ÷ Direct Labor Base. Covers indirect labor (supervisors, QA, admin supporting contracts), facilities, indirect materials. Typical: 10–25%. Pure-services firms run lower; firms with facilities run higher."],
  ['G&A Rate', 'G&A Pool ÷ Total Cost Input. Covers executive salaries, accounting, BD, legal, corporate insurance. Typical: 10–20%. New firms can hit 25–30% in year one because the executive salary is spread over a tiny revenue base.'],
  ['Wrap Rate', '(1 + Fringe) × (1 + OH) × (1 + G&A). The multiplier you apply to base DL wages to get fully-loaded cost before fee. Typical: 1.50–2.20.'],
  ['Bill Rate', 'Wrap Rate × (1 + Fee) × (Base Salary ÷ Annual Hours). Your all-in cost-per-hour proposal rate for a labor category.'],
  ['Forward Pricing Rate', 'Your estimated indirect rates for a future period, submitted to DCAA. Used in Cost Accounting Standards (CAS) environments. Required once you hit $50M in cost-type work.'],
  ['Provisional Rate', "An interim rate you and the government agree on while actuals are still being accumulated. DCAA audits and trues up at year-end. If your provisionals are way off, you'll write a check or get one."],
];
defs.forEach(([k, v]) => {
  const c1 = wsHelp.getCell(`B${h}`); c1.value = k;
  c1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: EMERALD_DARK } };
  c1.alignment = { vertical: 'top' };
  const c2 = wsHelp.getCell(`C${h}`); c2.value = v;
  c2.font = { name: 'Calibri', size: 11, color: { argb: SLATE_900 } };
  c2.alignment = { vertical: 'top', wrapText: true };
  wsHelp.getRow(h).height = 50;
  h++;
});

h++;
bandTitle(wsHelp, h, 'TYPICAL RANGES BY COMPANY TYPE');
h++;
const ranges = [
  ['Small services firm (1-25 staff)', 'Fringe 28-32%, OH 15-22%, G&A 12-18%, Wrap 1.65-1.95'],
  ['Mid services firm (25-150 staff)', 'Fringe 28-35%, OH 18-28%, G&A 8-14%, Wrap 1.80-2.15'],
  ['Hardware / facilities-heavy', 'Fringe 25-32%, OH 30-50%, G&A 8-12%, Wrap 2.00-2.50'],
  ['Pure R&D / SBIR', 'Fringe 28-35%, OH 50-100%+, G&A 15-25%, Wrap 2.50-4.00'],
  ['Staff augmentation / time-and-materials', 'Fringe 25-30%, OH 8-15%, G&A 8-12%, Wrap 1.40-1.65'],
];
ranges.forEach(([k, v]) => {
  const c1 = wsHelp.getCell(`B${h}`); c1.value = k;
  c1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: SLATE_900 } };
  const c2 = wsHelp.getCell(`C${h}`); c2.value = v;
  c2.font = { name: 'Consolas', size: 10, color: { argb: SLATE_700 } };
  wsHelp.getRow(h).height = 22;
  h++;
});

h++;
bandTitle(wsHelp, h, 'DCAA SURVIVAL CHECKLIST');
h++;
const checks = [
  ['Written cost accounting policy', "One page. How you decide what's direct vs indirect, which pool a cost goes into, what allocation base each pool uses. Sign and date it."],
  ['Timekeeping that ties to charge codes', "Every employee, every day, every hour, against a specific charge code. Daily entry. Supervisor approval. DCAA will pull samples."],
  ['Job cost accounting in your books', 'Your accounting system (QuickBooks Enterprise, Unanet, Deltek, Procas) needs to roll up costs by contract and by indirect pool. Stock QuickBooks Online does not pass DCAA review.'],
  ['Indirect pool documentation', 'For every line in your overhead and G&A pools, you need an invoice or payroll record. No "estimated" costs.'],
  ['Quarterly true-up', "Compare provisional rates to actuals. If you're off by more than 10%, file a revised provisional rate proposal."],
  ['Year-end Incurred Cost Submission (ICS)', 'Due 6 months after fiscal year end. Required if you have any cost-type contracts. Forms ICE-format. DCAA audits these on a 3-5 year cycle.'],
];
checks.forEach(([k, v]) => {
  const c1 = wsHelp.getCell(`B${h}`); c1.value = k;
  c1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: EMERALD_DARK } };
  c1.alignment = { vertical: 'top' };
  const c2 = wsHelp.getCell(`C${h}`); c2.value = v;
  c2.font = { name: 'Calibri', size: 11, color: { argb: SLATE_900 } };
  c2.alignment = { vertical: 'top', wrapText: true };
  wsHelp.getRow(h).height = 42;
  h++;
});

h++;
bandTitle(wsHelp, h, 'COMMON MISTAKES THAT KILL PROPOSALS');
h++;
const mistakes = [
  ['Bill rate too low', "You forgot to escalate option years, or your fringe rate is missing PTO and 401(k). The contracting officer notices and your evaluator either rejects the price as unrealistic or flags it for cost realism review."],
  ['Bill rate too high', "Your wrap is 2.4 in a market where the average is 1.85. You lose to the cheaper proposal. Either trim your G&A pool (often bloated executive salary) or rethink whether this is the right market for you."],
  ['Mixing direct and indirect costs', "Charging the same person's time to both direct projects and overhead in the same week without a clear allocation methodology. DCAA disallows the cost and you eat it."],
  ['No timecards', "If you can't show daily time entries against charge codes, DCAA will disallow your direct labor and bill you back. Companies have lost everything over this."],
  ['Allocating BD to G&A', "Selling to the government is part of normal business. But BD chasing a specific contract isn't allowable — it's unallowable B&P that has to come out of fee, not get billed back through G&A."],
];
mistakes.forEach(([k, v]) => {
  const c1 = wsHelp.getCell(`B${h}`); c1.value = k;
  c1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: RED } };
  c1.alignment = { vertical: 'top' };
  const c2 = wsHelp.getCell(`C${h}`); c2.value = v;
  c2.font = { name: 'Calibri', size: 11, color: { argb: SLATE_900 } };
  c2.alignment = { vertical: 'top', wrapText: true };
  wsHelp.getRow(h).height = 50;
  h++;
});

// ---- Save ----
await wb.xlsx.writeFile(OUT);
console.log('WROTE:', OUT);
