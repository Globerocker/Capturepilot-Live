// HUBZone Eligibility Worksheet — XLSX builder
// Output: FLK_05_HUBZone_Eligibility_Worksheet.xlsx
// Compatible: Microsoft Excel + Google Sheets (no LAMBDA/XLOOKUP/FILTER)

import ExcelJS from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_PATH = join(__dirname, 'FLK_05_HUBZone_Eligibility_Worksheet.xlsx');

const EMERALD = 'FF10B981';
const EMERALD_DARK = 'FF047857';
const EMERALD_LIGHT = 'FFD1FAE5';
const SLATE_900 = 'FF0F172A';
const SLATE_700 = 'FF334155';
const SLATE_500 = 'FF64748B';
const SLATE_200 = 'FFE2E8F0';
const SLATE_100 = 'FFF1F5F9';
const SLATE_50  = 'FFF8FAFC';
const AMBER = 'FFF59E0B';
const RED = 'FFDC2626';
const WHITE = 'FFFFFFFF';

const wb = new ExcelJS.Workbook();
wb.creator = 'CapturePilot Federal Lead Kit';
wb.lastModifiedBy = 'CapturePilot';
wb.created = new Date();
wb.modified = new Date();

// Shared helpers
function setCol(ws, widths) {
  ws.columns = widths.map((w) => ({ width: w }));
}

function header(cell, value, opts = {}) {
  cell.value = value;
  cell.font = { name: 'Calibri', size: opts.size || 11, bold: true, color: { argb: opts.color || WHITE } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg || EMERALD_DARK } };
  cell.alignment = { vertical: 'middle', horizontal: opts.align || 'left', wrapText: true };
  cell.border = thinBorder();
}

function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: SLATE_200 } },
    left: { style: 'thin', color: { argb: SLATE_200 } },
    bottom: { style: 'thin', color: { argb: SLATE_200 } },
    right: { style: 'thin', color: { argb: SLATE_200 } },
  };
}

function label(cell, value, opts = {}) {
  cell.value = value;
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: SLATE_900 } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg || SLATE_100 } };
  cell.alignment = { vertical: 'middle', horizontal: opts.align || 'left', wrapText: true };
  cell.border = thinBorder();
}

function inputCell(cell, opts = {}) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
  cell.font = { name: 'Calibri', size: 10, color: { argb: SLATE_900 } };
  cell.alignment = { vertical: 'middle', horizontal: opts.align || 'left', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: SLATE_200 } },
    left: { style: 'thin', color: { argb: SLATE_200 } },
    bottom: { style: 'thin', color: { argb: SLATE_200 } },
    right: { style: 'thin', color: { argb: SLATE_200 } },
  };
  if (opts.format) cell.numFmt = opts.format;
}

function bodyText(cell, value, opts = {}) {
  cell.value = value;
  cell.font = { name: 'Calibri', size: 10, color: { argb: opts.color || SLATE_700 } };
  cell.alignment = { vertical: 'middle', horizontal: opts.align || 'left', wrapText: true };
  if (opts.bold) cell.font.bold = true;
  if (opts.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
}

function titleBanner(ws, range, text, sub) {
  ws.mergeCells(range);
  const cell = ws.getCell(range.split(':')[0]);
  cell.value = { richText: [
    { text: text + '\n', font: { name: 'Calibri', size: 18, bold: true, color: { argb: WHITE } } },
    { text: sub || '', font: { name: 'Calibri', size: 10, color: { argb: EMERALD_LIGHT } } },
  ]};
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_900 } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
  // Set row height for banner
  const startRow = parseInt(range.match(/\d+/)[0]);
  ws.getRow(startRow).height = 56;
}

// ============================================================
// SHEET 1: INSTRUCTIONS
// ============================================================
const wsInst = wb.addWorksheet('Instructions', {
  pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } },
  headerFooter: { oddHeader: '&L&B CapturePilot &R HUBZone Eligibility Worksheet', oddFooter: '&L Federal Lead Kit · 05-B &C Page &P of &N &R captorpilot.com' },
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
});
setCol(wsInst, [3, 80, 3]);

titleBanner(wsInst, 'A1:C1', 'HUBZone Eligibility Worksheet', 'How to use this workbook — read once, then start with the Inputs tab.');

let r = 3;
const instructions = [
  { type: 'h2', text: 'What this workbook does' },
  { type: 'p', text: "Five tabs to self-screen your business against the SBA HUBZone program before you spend hours on certify.sba.gov. The math is on you for the principal-office and 35% residency tests; this workbook does the bookkeeping so you can see where you stand at a glance." },
  { type: 'p', text: "Heads up: this is a screening tool, not a legal opinion. The SBA HUBZone office is the only source of truth. Verify every address at maps.certify.sba.gov before you file." },

  { type: 'h2', text: 'How to work the tabs (in order)' },
  { type: 'step', n: '1', text: "Inputs — fill in your business name, principal office address, and a few yes/no questions about ownership and structure. Takes about ten minutes if you have your SAM.gov profile open in another tab." },
  { type: 'step', n: '2', text: "Employee Tracker — list every employee, their home ZIP, and average hours per month. The sheet calculates your HUBZone residency percentage automatically. Part-time staff (under 40 hrs/month) count proportionally." },
  { type: 'step', n: '3', text: "Eligibility Checklist — 21 yes/no/unsure questions covering ownership, principal office, 35% rule, employee definition, certification, and special HUBZone types. Mark each Y, N, or ? and add notes." },
  { type: 'step', n: '4', text: "Summary — pulls everything together. Shows your residency percentage, count of open items, and a preliminary verdict (eligible / gaps found / hard stop)." },
  { type: 'step', n: '5', text: "Help & Examples — three short scenarios (eligible, marginal, ineligible) so you can sanity-check your own answers." },

  { type: 'h2', text: 'The two requirements that actually matter' },
  { type: 'p', text: "Most HUBZone applications fail on one of two things:" },
  { type: 'bullet', text: "Principal office isn't in a HUBZone. Check maps.certify.sba.gov with your exact street address. A P.O. box doesn't count. A home address where nobody works doesn't count." },
  { type: 'bullet', text: "35% of employees don't reside in a HUBZone. The math: count every employee who works 40+ hours per month as 1. Anyone under that counts as (hours / 160). Then count how many of those live at a HUBZone address. Divide. You need 0.35 or higher." },

  { type: 'h2', text: 'What you have to maintain after certification' },
  { type: 'p', text: "Certification isn't the finish line. SBA can examine your file at any time, and the 35% residency test applies at the moment of every contract award — not just on the day you got certified. If you hire three non-HUBZone employees and your percentage drops to 28%, you can lose compliance mid-contract." },
  { type: 'p', text: "Plan for annual recertification, keep employee home-address records (W-2s, I-9s, utility bills), and re-run the Employee Tracker tab every quarter." },

  { type: 'h2', text: 'Color cues used in this workbook' },
  { type: 'bullet', text: "Emerald header rows — section titles." },
  { type: 'bullet', text: "White cells with borders — you fill these in." },
  { type: 'bullet', text: "Light slate cells — labels (don't edit)." },
  { type: 'bullet', text: "Green / amber / red on the Summary — preliminary verdict." },

  { type: 'h2', text: 'When to stop and call SBA' },
  { type: 'p', text: "If the Summary tab shows 'Hard stop' on any high-risk item (not a small business, no employees, principal office not in HUBZone), don't apply yet. Fix the underlying issue first. The HUBZone program has a strict review process and a denied application stays on your record." },
  { type: 'p', text: "Phone: SBA HUBZone Help Desk · hubzone@sba.gov" },
];

instructions.forEach((item) => {
  if (item.type === 'h2') {
    ws_row(wsInst, r, item.text, { bold: true, size: 12, color: EMERALD_DARK });
    wsInst.getRow(r).height = 22;
    r++;
  } else if (item.type === 'p') {
    ws_row(wsInst, r, item.text, { size: 10, color: SLATE_700 });
    wsInst.getRow(r).height = Math.max(18, Math.ceil(item.text.length / 90) * 14);
    r++;
  } else if (item.type === 'step') {
    ws_row(wsInst, r, `Step ${item.n}.  ${item.text}`, { size: 10, color: SLATE_900 });
    wsInst.getRow(r).height = Math.max(20, Math.ceil(item.text.length / 90) * 14);
    r++;
  } else if (item.type === 'bullet') {
    ws_row(wsInst, r, `  •  ${item.text}`, { size: 10, color: SLATE_700 });
    wsInst.getRow(r).height = Math.max(18, Math.ceil(item.text.length / 90) * 14);
    r++;
  }
  r++; // spacer
});

function ws_row(ws, row, text, opts = {}) {
  ws.mergeCells(`B${row}:B${row}`);
  const cell = ws.getCell(`B${row}`);
  cell.value = text;
  cell.font = { name: 'Calibri', size: opts.size || 10, bold: !!opts.bold, color: { argb: opts.color || SLATE_700 } };
  cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
}

// ============================================================
// SHEET 2: INPUTS
// ============================================================
const wsIn = wb.addWorksheet('Inputs', {
  pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  headerFooter: { oddHeader: '&L&B CapturePilot &R HUBZone Eligibility · Inputs', oddFooter: '&L Federal Lead Kit · 05-B &C Page &P of &N &R captorpilot.com' },
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
});
setCol(wsIn, [3, 38, 30, 30, 3]);

titleBanner(wsIn, 'A1:E1', 'Inputs', 'Fill the white cells. The Summary tab updates automatically.');

let ir = 3;

// Section: Business profile
wsIn.mergeCells(`B${ir}:D${ir}`);
header(wsIn.getCell(`B${ir}`), 'BUSINESS PROFILE');
wsIn.getRow(ir).height = 22;
ir++;

const profileRows = [
  { label: 'Business legal name', name: 'BizName' },
  { label: 'DBA (if any)', name: 'BizDBA' },
  { label: 'UEI / SAM.gov ID', name: 'BizUEI' },
  { label: 'Primary NAICS code', name: 'BizNAICS' },
  { label: 'Evaluation date', name: 'EvalDate', format: 'yyyy-mm-dd' },
  { label: 'Evaluator name', name: 'EvalName' },
];
profileRows.forEach((row) => {
  label(wsIn.getCell(`B${ir}`), row.label);
  wsIn.mergeCells(`C${ir}:D${ir}`);
  inputCell(wsIn.getCell(`C${ir}`), { format: row.format });
  wb.definedNames.add(`Inputs!$C$${ir}`, row.name);
  wsIn.getRow(ir).height = 22;
  ir++;
});

ir++;

// Section: Principal office
wsIn.mergeCells(`B${ir}:D${ir}`);
header(wsIn.getCell(`B${ir}`), 'PRINCIPAL OFFICE');
wsIn.getRow(ir).height = 22;
ir++;

const officeRows = [
  { label: 'Street address (no P.O. boxes)', name: 'OfficeStreet' },
  { label: 'City', name: 'OfficeCity' },
  { label: 'State', name: 'OfficeState' },
  { label: 'ZIP code', name: 'OfficeZip' },
  { label: 'Is this a real physical office where work happens?', name: 'OfficeIsReal', validation: 'YN' },
  { label: 'Confirmed at maps.certify.sba.gov?', name: 'OfficeMapConfirmed', validation: 'YN' },
  { label: 'HUBZone designation type', name: 'OfficeHubType', validation: 'HubType' },
  { label: 'If redesignated/disaster area — expiration date', name: 'OfficeHubExpiry', format: 'yyyy-mm-dd' },
];
officeRows.forEach((row) => {
  label(wsIn.getCell(`B${ir}`), row.label);
  wsIn.mergeCells(`C${ir}:D${ir}`);
  inputCell(wsIn.getCell(`C${ir}`), { format: row.format });
  if (row.validation === 'YN') {
    wsIn.getCell(`C${ir}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Y,N,?"'], showErrorMessage: true,
      errorTitle: 'Pick one', error: 'Y for yes, N for no, ? for unsure.',
    };
  }
  if (row.validation === 'HubType') {
    wsIn.getCell(`C${ir}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: ['"Qualified Census Tract,Qualified Non-Metro County,Indian Reservation,Redesignated Area,Qualified Disaster Area,Base Closure Area,Governor-Designated Covered Area,Not in HUBZone"'],
      showErrorMessage: true,
      errorTitle: 'Pick a type', error: 'Choose the HUBZone designation that covers your principal office.',
    };
  }
  wb.definedNames.add(`Inputs!$C$${ir}`, row.name);
  wsIn.getRow(ir).height = 22;
  ir++;
});

ir++;

// Section: Ownership
wsIn.mergeCells(`B${ir}:D${ir}`);
header(wsIn.getCell(`B${ir}`), 'OWNERSHIP & STRUCTURE');
wsIn.getRow(ir).height = 22;
ir++;

const ownerRows = [
  { label: 'Ownership type', name: 'OwnerType', validation: 'OwnType' },
  { label: '% owned by U.S. citizens (or qualifying entity)', name: 'OwnerPct', format: '0%' },
  { label: 'Is the business publicly traded?', name: 'PublicTraded', validation: 'YN' },
  { label: 'Meets SBA small business size standard for primary NAICS?', name: 'SizeStandard', validation: 'YN' },
  { label: 'Active SAM.gov registration?', name: 'SamActive', validation: 'YN' },
  { label: 'Currently debarred, suspended, or proposed for debarment?', name: 'Debarred', validation: 'YN' },
];
ownerRows.forEach((row) => {
  label(wsIn.getCell(`B${ir}`), row.label);
  wsIn.mergeCells(`C${ir}:D${ir}`);
  inputCell(wsIn.getCell(`C${ir}`), { format: row.format });
  if (row.validation === 'YN') {
    wsIn.getCell(`C${ir}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Y,N,?"'], showErrorMessage: true,
    };
  }
  if (row.validation === 'OwnType') {
    wsIn.getCell(`C${ir}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: ['"U.S. Citizens (individuals),Community Development Corp,Agricultural Cooperative,Alaska Native Corporation,Indian Tribe,Native Hawaiian Organization,Other"'],
      showErrorMessage: true,
    };
  }
  wb.definedNames.add(`Inputs!$C$${ir}`, row.name);
  wsIn.getRow(ir).height = 22;
  ir++;
});

// ============================================================
// SHEET 3: EMPLOYEE TRACKER
// ============================================================
const wsEmp = wb.addWorksheet('Employee Tracker', {
  pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  headerFooter: { oddHeader: '&L&B CapturePilot &R HUBZone Employee Tracker', oddFooter: '&L Federal Lead Kit · 05-B &C Page &P of &N &R captorpilot.com' },
  views: [{ state: 'frozen', ySplit: 6, showGridLines: false }],
});
setCol(wsEmp, [3, 24, 14, 24, 8, 10, 18, 12, 14, 24]);

titleBanner(wsEmp, 'A1:J1', 'Employee Tracker', 'List every employee. Hours per month drive the headcount math; ZIP + HUBZone Y/N drive the 35% test.');

let er = 3;
// Live counters above the table
label(wsEmp.getCell('B3'), 'Total headcount (FTE-weighted)');
wsEmp.getCell('C3').value = { formula: 'ROUND(SUMPRODUCT((E7:E206>0)*(IF(E7:E206>=40,1,E7:E206/160))),2)' };
wsEmp.getCell('C3').font = { name: 'Calibri', size: 11, bold: true, color: { argb: SLATE_900 } };
wsEmp.getCell('C3').alignment = { vertical: 'middle', horizontal: 'center' };
wsEmp.getCell('C3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };
wsEmp.getCell('C3').border = thinBorder();

label(wsEmp.getCell('D3'), 'HUBZone-resident headcount');
wsEmp.getCell('E3').value = { formula: 'ROUND(SUMPRODUCT((E7:E206>0)*(UPPER(G7:G206)="Y")*(IF(E7:E206>=40,1,E7:E206/160))),2)' };
wsEmp.getCell('E3').font = { name: 'Calibri', size: 11, bold: true, color: { argb: SLATE_900 } };
wsEmp.getCell('E3').alignment = { vertical: 'middle', horizontal: 'center' };
wsEmp.getCell('E3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };
wsEmp.getCell('E3').border = thinBorder();

label(wsEmp.getCell('F3'), 'HUBZone residency %');
wsEmp.getCell('G3').value = { formula: 'IFERROR(E3/C3,0)' };
wsEmp.getCell('G3').numFmt = '0.0%';
wsEmp.getCell('G3').font = { name: 'Calibri', size: 14, bold: true, color: { argb: WHITE } };
wsEmp.getCell('G3').alignment = { vertical: 'middle', horizontal: 'center' };
wsEmp.getCell('G3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } };
wsEmp.getCell('G3').border = thinBorder();
wb.definedNames.add(`'Employee Tracker'!$G$3`, 'HubResidencyPct');
wb.definedNames.add(`'Employee Tracker'!$C$3`, 'HubFTECount');
wb.definedNames.add(`'Employee Tracker'!$E$3`, 'HubResidentFTE');

label(wsEmp.getCell('H3'), 'Status vs. 35%');
wsEmp.getCell('I3').value = { formula: 'IF(G3>=0.35,"PASS",IF(G3>=0.30,"CLOSE","FAIL"))' };
wsEmp.getCell('I3').font = { name: 'Calibri', size: 12, bold: true, color: { argb: WHITE } };
wsEmp.getCell('I3').alignment = { vertical: 'middle', horizontal: 'center' };
wsEmp.getCell('I3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_700 } };
wsEmp.getCell('I3').border = thinBorder();

wsEmp.getRow(3).height = 28;

// Conditional formatting on G3 + I3
wsEmp.addConditionalFormatting({
  ref: 'G3',
  rules: [
    { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: ['0.35'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: EMERALD } } } },
    { type: 'cellIs', operator: 'between', formulae: ['0.30', '0.3499'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: AMBER } } } },
    { type: 'cellIs', operator: 'lessThan', formulae: ['0.30'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } } } },
  ],
});
wsEmp.addConditionalFormatting({
  ref: 'I3',
  rules: [
    { type: 'containsText', operator: 'containsText', text: 'PASS', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: EMERALD } } } },
    { type: 'containsText', operator: 'containsText', text: 'CLOSE', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: AMBER } } } },
    { type: 'containsText', operator: 'containsText', text: 'FAIL', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } } } },
  ],
});

er = 6;
const empHeaders = ['#', 'Employee name', 'Role / title', 'Home ZIP', 'Hrs / month', 'FTE weight', 'Resides in HUBZone? (Y/N/?)', 'Verified?', 'Verification date', 'Notes'];
empHeaders.forEach((h, i) => {
  header(wsEmp.getCell(er, i + 1), h, { align: 'center' });
});
wsEmp.getRow(er).height = 30;

// 200 employee rows
const FIRST_EMP_ROW = 7;
const LAST_EMP_ROW = 206;
for (let i = FIRST_EMP_ROW; i <= LAST_EMP_ROW; i++) {
  const num = i - FIRST_EMP_ROW + 1;
  // # column
  wsEmp.getCell(i, 1).value = num;
  wsEmp.getCell(i, 1).font = { name: 'Calibri', size: 9, color: { argb: SLATE_500 } };
  wsEmp.getCell(i, 1).alignment = { vertical: 'middle', horizontal: 'center' };
  wsEmp.getCell(i, 1).border = thinBorder();
  if (num % 2 === 0) {
    wsEmp.getCell(i, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };
  }

  // Employee name (B)
  inputCell(wsEmp.getCell(i, 2));
  // Role (C)
  inputCell(wsEmp.getCell(i, 3));
  // Home ZIP (D)
  inputCell(wsEmp.getCell(i, 4), { align: 'center' });
  wsEmp.getCell(i, 4).numFmt = '@';
  // Hours/month (E)
  inputCell(wsEmp.getCell(i, 5), { align: 'center', format: '0' });
  // FTE weight (F) — formula
  wsEmp.getCell(i, 6).value = { formula: `IF(E${i}="","",IF(E${i}>=40,1,ROUND(E${i}/160,2)))` };
  wsEmp.getCell(i, 6).font = { name: 'Calibri', size: 10, color: { argb: SLATE_700 } };
  wsEmp.getCell(i, 6).alignment = { vertical: 'middle', horizontal: 'center' };
  wsEmp.getCell(i, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };
  wsEmp.getCell(i, 6).border = thinBorder();
  wsEmp.getCell(i, 6).numFmt = '0.00';
  // HUBZone (G)
  inputCell(wsEmp.getCell(i, 7), { align: 'center' });
  wsEmp.getCell(i, 7).dataValidation = {
    type: 'list', allowBlank: true, formulae: ['"Y,N,?"'], showErrorMessage: true,
  };
  // Verified (H)
  inputCell(wsEmp.getCell(i, 8), { align: 'center' });
  wsEmp.getCell(i, 8).dataValidation = {
    type: 'list', allowBlank: true, formulae: ['"Y,N"'], showErrorMessage: true,
  };
  // Verification date (I)
  inputCell(wsEmp.getCell(i, 9), { align: 'center', format: 'yyyy-mm-dd' });
  // Notes (J)
  inputCell(wsEmp.getCell(i, 10));

  // Conditional row coloring by HUBZone Y/N
  wsEmp.getRow(i).height = 18;
}

// Conditional formatting: green band when HUBZone = Y
wsEmp.addConditionalFormatting({
  ref: `G${FIRST_EMP_ROW}:G${LAST_EMP_ROW}`,
  rules: [
    { type: 'containsText', operator: 'containsText', text: 'Y', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: EMERALD_LIGHT } }, font: { color: { argb: EMERALD_DARK }, bold: true } } },
    { type: 'containsText', operator: 'containsText', text: 'N', style: { font: { color: { argb: SLATE_500 } } } },
  ],
});

// ============================================================
// SHEET 4: ELIGIBILITY CHECKLIST
// ============================================================
const wsChk = wb.addWorksheet('Eligibility Checklist', {
  pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  headerFooter: { oddHeader: '&L&B CapturePilot &R HUBZone Eligibility Checklist', oddFooter: '&L Federal Lead Kit · 05-B &C Page &P of &N &R captorpilot.com' },
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
});
setCol(wsChk, [3, 5, 58, 10, 10, 26, 3]);

titleBanner(wsChk, 'A1:F1', 'Eligibility Checklist', '21 questions. Mark each Y, N, or ? and add notes. The Summary tab tallies open items.');

let cr = 3;
const checkHeaders = ['#', 'Requirement', 'Met? (Y/N/?)', 'Risk', 'Notes / action needed'];
const checkCols = [2, 3, 4, 5, 6];
checkHeaders.forEach((h, idx) => {
  header(wsChk.getCell(cr, checkCols[idx]), h, { align: idx === 1 || idx === 4 ? 'left' : 'center' });
});
wsChk.getRow(cr).height = 28;
cr++;

const sections = [
  { title: 'BUSINESS TYPE & OWNERSHIP', items: [
    { q: 'Business is a U.S. small business (meets SBA size standards for its primary NAICS).', risk: 'HIGH', prefill: 'SizeStandard' },
    { q: "At least 51% owned and controlled by U.S. citizens, a CDC, ag cooperative, Alaska Native Corp, Indian Tribe, or Native Hawaiian organization.", risk: 'HIGH' },
    { q: 'Business is NOT publicly traded.', risk: 'HIGH' },
  ]},
  { title: 'PRINCIPAL OFFICE LOCATION', items: [
    { q: 'Principal office of the business is located in a designated HUBZone.', risk: 'HIGH' },
    { q: 'Principal office was confirmed using the SBA HUBZone Map at maps.certify.sba.gov.', risk: 'HIGH', prefill: 'OfficeMapConfirmed' },
    { q: 'Address is a real, physical office — not a P.O. box, virtual office, or home of a non-employee.', risk: 'HIGH', prefill: 'OfficeIsReal' },
    { q: 'Business has actually conducted business at the principal office (not just registered there).', risk: 'HIGH' },
  ]},
  { title: 'EMPLOYEE RESIDENCY — 35% RULE', items: [
    { q: "At least 35% of the business's employees reside in a HUBZone (see Employee Tracker tab).", risk: 'HIGH' },
    { q: 'Employee residency addresses have been verified against the HUBZone map.', risk: 'HIGH' },
    { q: "'Employees' include all individuals paid regularly for work — including part-time staff (counted proportionally).", risk: 'MEDIUM' },
    { q: 'Documentation exists for employee home addresses (W-2s, I-9s, utility bills).', risk: 'HIGH' },
  ]},
  { title: 'EMPLOYEE COUNT & DEFINITION', items: [
    { q: 'Business has at least 1 employee (sole proprietors with no employees do not qualify).', risk: 'HIGH' },
    { q: 'Employee count is calculated correctly — 40+ hrs/mo counts as 1; under 40 hrs/mo counts proportionally.', risk: 'MEDIUM' },
    { q: "Independent contractors are NOT counted as employees (they can be HUBZone residents but don't count toward the 35%).", risk: 'MEDIUM' },
  ]},
  { title: 'CERTIFICATION & MAINTENANCE', items: [
    { q: 'Business is registered and active on SAM.gov.', risk: 'HIGH', prefill: 'SamActive' },
    { q: 'Business understands HUBZone certification requires annual recertification and program examination.', risk: 'MEDIUM' },
    { q: 'Business understands it must maintain 35% HUBZone residency throughout all contracts, not just at certification.', risk: 'HIGH' },
    { q: 'Business has not been debarred, suspended, or proposed for debarment.', risk: 'HIGH' },
  ]},
  { title: 'SPECIAL CASES — HUBZONE TYPES', items: [
    { q: "If relying on a 'qualified disaster area' HUBZone: verify designation has not expired (these change frequently).", risk: 'MEDIUM' },
    { q: 'If relying on Indian Reservation HUBZone: verify status with BIA or relevant tribal authority.', risk: 'MEDIUM' },
    { q: 'If principal office is a redesignated HUBZone: verify redesignation is still active (3-year redesignations expire).', risk: 'MEDIUM' },
  ]},
];

let itemNum = 0;
const firstItemRow = cr;
sections.forEach((sec) => {
  // Section divider
  wsChk.mergeCells(`B${cr}:F${cr}`);
  const sCell = wsChk.getCell(`B${cr}`);
  sCell.value = sec.title;
  sCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
  sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD } };
  sCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sCell.border = thinBorder();
  wsChk.getRow(cr).height = 22;
  cr++;

  sec.items.forEach((item) => {
    itemNum++;
    // #
    wsChk.getCell(`B${cr}`).value = itemNum;
    wsChk.getCell(`B${cr}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: SLATE_500 } };
    wsChk.getCell(`B${cr}`).alignment = { vertical: 'middle', horizontal: 'center' };
    wsChk.getCell(`B${cr}`).border = thinBorder();
    wsChk.getCell(`B${cr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: itemNum % 2 === 0 ? SLATE_50 : WHITE } };
    // Requirement
    bodyText(wsChk.getCell(`C${cr}`), item.q, { color: SLATE_900, bg: itemNum % 2 === 0 ? SLATE_50 : WHITE });
    wsChk.getCell(`C${cr}`).border = thinBorder();
    wsChk.getCell(`C${cr}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    // Met?
    if (item.prefill) {
      wsChk.getCell(`D${cr}`).value = { formula: `IF(${item.prefill}="","",${item.prefill})` };
    }
    wsChk.getCell(`D${cr}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: SLATE_900 } };
    wsChk.getCell(`D${cr}`).alignment = { vertical: 'middle', horizontal: 'center' };
    wsChk.getCell(`D${cr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    wsChk.getCell(`D${cr}`).border = thinBorder();
    wsChk.getCell(`D${cr}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Y,N,?"'], showErrorMessage: true,
      errorTitle: 'Pick one', error: 'Y, N, or ? please.',
    };
    // Risk
    wsChk.getCell(`E${cr}`).value = item.risk;
    wsChk.getCell(`E${cr}`).font = { name: 'Calibri', size: 9, bold: true, color: { argb: WHITE } };
    wsChk.getCell(`E${cr}`).alignment = { vertical: 'middle', horizontal: 'center' };
    wsChk.getCell(`E${cr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.risk === 'HIGH' ? RED : AMBER } };
    wsChk.getCell(`E${cr}`).border = thinBorder();
    // Notes
    inputCell(wsChk.getCell(`F${cr}`));

    wsChk.getRow(cr).height = 36;
    cr++;
  });
});

const lastItemRow = cr - 1;

// Conditional formatting on D column (Met?)
wsChk.addConditionalFormatting({
  ref: `D${firstItemRow}:D${lastItemRow}`,
  rules: [
    { type: 'containsText', operator: 'containsText', text: 'Y', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: EMERALD_LIGHT } }, font: { color: { argb: EMERALD_DARK }, bold: true } } },
    { type: 'containsText', operator: 'containsText', text: 'N', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } }, font: { color: { argb: RED }, bold: true } } },
    { type: 'containsText', operator: 'containsText', text: '?', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEF3C7' } }, font: { color: { argb: 'FF92400E' }, bold: true } } },
  ],
});

cr++;
// Footer totals on checklist sheet
label(wsChk.getCell(`B${cr}`), 'Met (Y)');
wsChk.mergeCells(`C${cr}:C${cr}`);
wsChk.getCell(`D${cr}`).value = { formula: `COUNTIF(D${firstItemRow}:D${lastItemRow},"Y")` };
wsChk.getCell(`D${cr}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: EMERALD_DARK } };
wsChk.getCell(`D${cr}`).alignment = { vertical: 'middle', horizontal: 'center' };
wsChk.getCell(`D${cr}`).border = thinBorder();
bodyText(wsChk.getCell(`E${cr}`), `of ${itemNum}`, { align: 'center', color: SLATE_500 });
wb.definedNames.add(`'Eligibility Checklist'!$D$${cr}`, 'ChecklistMet');
cr++;

label(wsChk.getCell(`B${cr}`), 'Open (N or ?)');
wsChk.getCell(`D${cr}`).value = { formula: `COUNTIF(D${firstItemRow}:D${lastItemRow},"N")+COUNTIF(D${firstItemRow}:D${lastItemRow},"?")` };
wsChk.getCell(`D${cr}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: RED } };
wsChk.getCell(`D${cr}`).alignment = { vertical: 'middle', horizontal: 'center' };
wsChk.getCell(`D${cr}`).border = thinBorder();
bodyText(wsChk.getCell(`E${cr}`), `of ${itemNum}`, { align: 'center', color: SLATE_500 });
wb.definedNames.add(`'Eligibility Checklist'!$D$${cr}`, 'ChecklistOpen');
cr++;

label(wsChk.getCell(`B${cr}`), 'High-risk open');
wsChk.getCell(`D${cr}`).value = { formula: `SUMPRODUCT((D${firstItemRow}:D${lastItemRow}<>"Y")*(D${firstItemRow}:D${lastItemRow}<>"")*(E${firstItemRow}:E${lastItemRow}="HIGH"))+SUMPRODUCT((D${firstItemRow}:D${lastItemRow}="")*(E${firstItemRow}:E${lastItemRow}="HIGH"))` };
wsChk.getCell(`D${cr}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: RED } };
wsChk.getCell(`D${cr}`).alignment = { vertical: 'middle', horizontal: 'center' };
wsChk.getCell(`D${cr}`).border = thinBorder();
bodyText(wsChk.getCell(`E${cr}`), 'items', { align: 'center', color: SLATE_500 });
wb.definedNames.add(`'Eligibility Checklist'!$D$${cr}`, 'HighRiskOpen');

// ============================================================
// SHEET 5: SUMMARY
// ============================================================
const wsSum = wb.addWorksheet('Summary', {
  pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  headerFooter: { oddHeader: '&L&B CapturePilot &R HUBZone Eligibility Summary', oddFooter: '&L Federal Lead Kit · 05-B &C Page &P of &N &R captorpilot.com' },
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
});
setCol(wsSum, [3, 30, 20, 20, 20, 3]);

titleBanner(wsSum, 'A1:E1', 'Summary', 'Live read-out from Inputs, Employee Tracker, and Checklist. No editing needed here.');

let sr = 3;

// Business identity block
label(wsSum.getCell(`B${sr}`), 'Business');
wsSum.mergeCells(`C${sr}:E${sr}`);
wsSum.getCell(`C${sr}`).value = { formula: 'IF(BizName="","(enter on Inputs tab)",BizName)' };
wsSum.getCell(`C${sr}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: SLATE_900 } };
wsSum.getCell(`C${sr}`).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
wsSum.getCell(`C${sr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
wsSum.getCell(`C${sr}`).border = thinBorder();
wsSum.getRow(sr).height = 26;
sr++;

label(wsSum.getCell(`B${sr}`), 'Evaluation date');
wsSum.mergeCells(`C${sr}:E${sr}`);
wsSum.getCell(`C${sr}`).value = { formula: 'IF(EvalDate="","(enter on Inputs tab)",TEXT(EvalDate,"yyyy-mm-dd"))' };
wsSum.getCell(`C${sr}`).font = { name: 'Calibri', size: 10, color: { argb: SLATE_700 } };
wsSum.getCell(`C${sr}`).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
wsSum.getCell(`C${sr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
wsSum.getCell(`C${sr}`).border = thinBorder();
sr++;

label(wsSum.getCell(`B${sr}`), 'Principal office');
wsSum.mergeCells(`C${sr}:E${sr}`);
wsSum.getCell(`C${sr}`).value = { formula: 'IF(OfficeStreet="","(enter on Inputs tab)",OfficeStreet&", "&OfficeCity&", "&OfficeState&" "&OfficeZip)' };
wsSum.getCell(`C${sr}`).font = { name: 'Calibri', size: 10, color: { argb: SLATE_700 } };
wsSum.getCell(`C${sr}`).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
wsSum.getCell(`C${sr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
wsSum.getCell(`C${sr}`).border = thinBorder();
sr++;

sr++;

// KPI band — three big cards
const kpiRow = sr;
wsSum.getRow(kpiRow).height = 32;
wsSum.getRow(kpiRow + 1).height = 50;
wsSum.getRow(kpiRow + 2).height = 22;

const kpis = [
  { col: 'C', title: 'Residency %', formula: 'IFERROR(HubResidencyPct,0)', format: '0.0%', target: 'Target ≥ 35%' },
  { col: 'D', title: 'Headcount (FTE)', formula: 'IFERROR(HubFTECount,0)', format: '0.00', target: 'Minimum 1' },
  { col: 'E', title: 'HUBZone-resident FTE', formula: 'IFERROR(HubResidentFTE,0)', format: '0.00', target: '35% of total' },
];
kpis.forEach((k) => {
  // Title row
  const c = wsSum.getCell(`${k.col}${kpiRow}`);
  c.value = k.title;
  c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_900 } };
  c.alignment = { vertical: 'middle', horizontal: 'center' };
  c.border = thinBorder();
  // Value row
  const v = wsSum.getCell(`${k.col}${kpiRow + 1}`);
  v.value = { formula: k.formula };
  v.numFmt = k.format;
  v.font = { name: 'Calibri', size: 28, bold: true, color: { argb: SLATE_900 } };
  v.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };
  v.alignment = { vertical: 'middle', horizontal: 'center' };
  v.border = thinBorder();
  // Target row
  const t = wsSum.getCell(`${k.col}${kpiRow + 2}`);
  t.value = k.target;
  t.font = { name: 'Calibri', size: 9, color: { argb: SLATE_500 } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  t.border = thinBorder();
});

// CF on residency % big card
wsSum.addConditionalFormatting({
  ref: `C${kpiRow + 1}`,
  rules: [
    { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: ['0.35'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: EMERALD_LIGHT } }, font: { color: { argb: EMERALD_DARK }, bold: true, size: 28 } } },
    { type: 'cellIs', operator: 'between', formulae: ['0.30', '0.3499'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEF3C7' } }, font: { color: { argb: 'FF92400E' }, bold: true, size: 28 } } },
    { type: 'cellIs', operator: 'lessThan', formulae: ['0.30'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } }, font: { color: { argb: RED }, bold: true, size: 28 } } },
  ],
});

sr = kpiRow + 4;

// Checklist tally
label(wsSum.getCell(`B${sr}`), 'Checklist — items met');
wsSum.getCell(`C${sr}`).value = { formula: 'ChecklistMet' };
wsSum.getCell(`C${sr}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: EMERALD_DARK } };
wsSum.getCell(`C${sr}`).alignment = { vertical: 'middle', horizontal: 'center' };
wsSum.getCell(`C${sr}`).border = thinBorder();
wsSum.getCell(`C${sr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
bodyText(wsSum.getCell(`D${sr}`), 'out of ' + itemNum, { color: SLATE_500, align: 'left' });
sr++;

label(wsSum.getCell(`B${sr}`), 'Checklist — open items');
wsSum.getCell(`C${sr}`).value = { formula: 'ChecklistOpen+(' + itemNum + '-ChecklistMet-ChecklistOpen)' };
wsSum.getCell(`C${sr}`).value = { formula: itemNum + '-ChecklistMet' };
wsSum.getCell(`C${sr}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: RED } };
wsSum.getCell(`C${sr}`).alignment = { vertical: 'middle', horizontal: 'center' };
wsSum.getCell(`C${sr}`).border = thinBorder();
wsSum.getCell(`C${sr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
bodyText(wsSum.getCell(`D${sr}`), 'still to resolve', { color: SLATE_500, align: 'left' });
sr++;

label(wsSum.getCell(`B${sr}`), 'High-risk open items');
wsSum.getCell(`C${sr}`).value = { formula: 'HighRiskOpen' };
wsSum.getCell(`C${sr}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: RED } };
wsSum.getCell(`C${sr}`).alignment = { vertical: 'middle', horizontal: 'center' };
wsSum.getCell(`C${sr}`).border = thinBorder();
wsSum.getCell(`C${sr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
bodyText(wsSum.getCell(`D${sr}`), 'fix before applying', { color: SLATE_500, align: 'left' });
sr++;

sr++;

// Final verdict
wsSum.mergeCells(`B${sr}:E${sr}`);
header(wsSum.getCell(`B${sr}`), 'PRELIMINARY VERDICT', { align: 'center', size: 11 });
wsSum.getRow(sr).height = 24;
sr++;

wsSum.mergeCells(`B${sr}:E${sr}`);
const verdictCell = wsSum.getCell(`B${sr}`);
verdictCell.value = { formula:
  'IF(HighRiskOpen>0,"HARD STOP — High-risk items still open. Resolve these on the Eligibility Checklist before you apply.",' +
  'IF(IFERROR(HubResidencyPct,0)<0.35,"NOT READY — 35% employee residency test failing. See Employee Tracker.",' +
  'IF(ChecklistOpen>0,"GAPS FOUND — Close the remaining items, then re-run.",' +
  '"LIKELY ELIGIBLE — Confirm principal office at maps.certify.sba.gov and apply at certify.sba.gov.")))'
};
verdictCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: WHITE } };
verdictCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
verdictCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_700 } };
verdictCell.border = thinBorder();
wsSum.getRow(sr).height = 54;

wsSum.addConditionalFormatting({
  ref: `B${sr}`,
  rules: [
    { type: 'containsText', operator: 'containsText', text: 'LIKELY ELIGIBLE', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: EMERALD_DARK } } } },
    { type: 'containsText', operator: 'containsText', text: 'GAPS FOUND', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: AMBER } } } },
    { type: 'containsText', operator: 'containsText', text: 'NOT READY', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: AMBER } } } },
    { type: 'containsText', operator: 'containsText', text: 'HARD STOP', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } } } },
  ],
});

sr += 2;

// Next steps
wsSum.mergeCells(`B${sr}:E${sr}`);
header(wsSum.getCell(`B${sr}`), 'NEXT STEPS', { align: 'left', size: 11 });
wsSum.getRow(sr).height = 22;
sr++;

const nextSteps = [
  'Open maps.certify.sba.gov and confirm your exact street address shows a HUBZone designation. Screenshot the result.',
  'Re-run the Employee Tracker tab after every hire or termination. The 35% test applies at every contract award, not just at certification.',
  'Gather employee proof-of-residency docs (W-2s, I-9s, recent utility bills). SBA examiners will ask.',
  'Verify your SAM.gov registration is active and your primary NAICS reflects your real work.',
  'When ready, apply at certify.sba.gov. Allow 60-90 days for review; budget another 30 days for follow-up questions.',
];
nextSteps.forEach((step, i) => {
  wsSum.mergeCells(`B${sr}:E${sr}`);
  wsSum.getCell(`B${sr}`).value = `${i + 1}.  ${step}`;
  wsSum.getCell(`B${sr}`).font = { name: 'Calibri', size: 10, color: { argb: SLATE_900 } };
  wsSum.getCell(`B${sr}`).alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
  wsSum.getCell(`B${sr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? SLATE_50 : WHITE } };
  wsSum.getCell(`B${sr}`).border = thinBorder();
  wsSum.getRow(sr).height = 32;
  sr++;
});

// ============================================================
// SHEET 6: HELP & EXAMPLES
// ============================================================
const wsHelp = wb.addWorksheet('Help & Examples', {
  pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  headerFooter: { oddHeader: '&L&B CapturePilot &R HUBZone — Worked Examples', oddFooter: '&L Federal Lead Kit · 05-B &C Page &P of &N &R captorpilot.com' },
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
});
setCol(wsHelp, [3, 80, 3]);

titleBanner(wsHelp, 'A1:C1', 'Help & Examples', 'Three worked scenarios — sanity-check your own answers against these before you apply.');

let hr = 3;

const helpBlocks = [
  { h: 'Example 1 — Eligible (small janitorial firm in qualified census tract)', body: [
    'Business: Brookdale Cleaning Services, LLC. Primary NAICS 561720. 12 employees.',
    'Principal office: 4218 Pulaski Hwy, Baltimore, MD 21224. Confirmed on maps.certify.sba.gov as a Qualified Census Tract.',
    'Owner: Two U.S. citizens, 60% / 40% split. Not publicly traded.',
    'Employees: 12 total. 5 reside in HUBZone ZIPs (all in Baltimore City). 7 do not. Residency = 5/12 = 41.7%. Passes the 35% test.',
    'Result: LIKELY ELIGIBLE. Apply.',
  ]},
  { h: 'Example 2 — Marginal (residency close to threshold)', body: [
    'Business: Cascade IT Services. Primary NAICS 541512. 8 employees.',
    'Principal office: 2401 N Pine St, Tacoma, WA 98406. Confirmed as Redesignated Area — expires June 2027.',
    'Employees: 8 total. 3 in HUBZone = 37.5%. Two part-timers (20 hrs/mo each) live in HUBZone.',
    'FTE math: 6 full-timers (1.0 each) + 2 part-timers (0.125 each) = 6.25 FTE total. HUBZone FTE = 2 full-timers + 2 part-timers = 2 + 0.25 = 2.25. Residency = 2.25/6.25 = 36%. Passes — barely.',
    'Risk: one hire of a non-HUBZone full-timer drops you to 32%. Plan hiring around this.',
    'Result: GAPS FOUND if you intend to hire soon. Otherwise LIKELY ELIGIBLE.',
  ]},
  { h: 'Example 3 — Ineligible (principal office not in HUBZone)', body: [
    'Business: Apex Technical Consulting. Primary NAICS 541330. 4 employees.',
    'Principal office: 1700 Wilson Blvd, Arlington, VA 22209. NOT a HUBZone (verified at maps.certify.sba.gov).',
    'Owner has been told by a consultant that "WFH employees in HUBZones make you eligible." This is wrong. The principal office itself must be in a HUBZone.',
    'Result: HARD STOP. Either move the principal office to a HUBZone (and conduct real business there for 90+ days before applying) or do not pursue HUBZone.',
  ]},
  { h: 'Common mistakes', body: [
    "P.O. box as principal office — disqualifying. Must be a real physical address where work actually happens.",
    "Counting independent contractors toward the 35% — disqualifying. Only W-2 employees count.",
    "Using a home address of someone who doesn't work there — disqualifying.",
    "Forgetting to maintain residency mid-contract — hiring three non-HUBZone employees can drop you below 35% and put your contract at risk.",
    "Relying on a Disaster Area HUBZone without checking the expiration — these refresh on different timelines than QCTs.",
  ]},
  { h: 'Where the data comes from', body: [
    'SBA HUBZone Map: maps.certify.sba.gov — official address checker. The only source SBA will accept.',
    'SBA Certify: certify.sba.gov — where you actually apply.',
    'Code of Federal Regulations: 13 CFR Part 126 — the legal definitions of "principal office," "employee," "reside," and "HUBZone." Worth reading before you apply.',
    'SBA Office of HUBZone: hubzone@sba.gov — they answer specific eligibility questions in writing.',
  ]},
];

helpBlocks.forEach((block) => {
  // Heading
  wsHelp.mergeCells(`B${hr}:B${hr}`);
  const hc = wsHelp.getCell(`B${hr}`);
  hc.value = block.h;
  hc.font = { name: 'Calibri', size: 12, bold: true, color: { argb: EMERALD_DARK } };
  hc.alignment = { vertical: 'middle', horizontal: 'left' };
  wsHelp.getRow(hr).height = 22;
  hr++;

  block.body.forEach((line) => {
    wsHelp.mergeCells(`B${hr}:B${hr}`);
    const lc = wsHelp.getCell(`B${hr}`);
    lc.value = '  •  ' + line;
    lc.font = { name: 'Calibri', size: 10, color: { argb: SLATE_700 } };
    lc.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    wsHelp.getRow(hr).height = Math.max(20, Math.ceil(line.length / 85) * 14);
    hr++;
  });
  hr++;
});

// ============================================================
// SAVE
// ============================================================
await wb.xlsx.writeFile(OUT_PATH);
console.log('Wrote:', OUT_PATH);
