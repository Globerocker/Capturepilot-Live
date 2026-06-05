// Builds /assets/starter-pack/rebuilt/FLK_09_Compliance_Matrix_Template.xlsx
// Run: node assets/starter-pack/rebuilt/compliance-matrix.build.mjs
//
// Design goal: a working Proposal Compliance Matrix that opens cleanly in both
// Microsoft Excel (2019+) and Google Sheets. No LAMBDA/XLOOKUP/FILTER.
// Real formulas, dropdowns, named ranges, conditional formatting, frozen rows.

import ExcelJS from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'FLK_09_Compliance_Matrix_Template.xlsx');

// ---------- brand palette ----------
const EMERALD = 'FF10B981';
const EMERALD_DK = 'FF047857';
const SLATE_50 = 'FFF8FAFC';
const SLATE_100 = 'FFF1F5F9';
const SLATE_200 = 'FFE2E8F0';
const SLATE_700 = 'FF334155';
const SLATE_900 = 'FF0F172A';
const AMBER = 'FFF59E0B';
const AMBER_LT = 'FFFEF3C7';
const RED = 'FFDC2626';
const RED_LT = 'FFFEE2E2';
const GREEN = 'FF16A34A';
const GREEN_LT = 'FFD1FAE5';
const BLUE_50 = 'FFEFF6FF';
const BLUE_200 = 'FFBFDBFE';
const WHITE = 'FFFFFFFF';
const VIOLET_LT = 'FFEDE9FE';

const FONT = 'Calibri';
const MONO = 'Consolas';

const wb = new ExcelJS.Workbook();
wb.creator = 'CapturePilot';
wb.lastModifiedBy = 'CapturePilot';
wb.created = new Date();
wb.modified = new Date();
wb.company = 'CapturePilot';
wb.title = 'Proposal Compliance Matrix Template';
wb.subject = 'Federal Lead Kit — 09 Internal Best-Practice Library';

// ---------- shared styles ----------
const fill = (color) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: color } });
const border = (color = SLATE_200) => ({
  top: { style: 'thin', color: { argb: color } },
  left: { style: 'thin', color: { argb: color } },
  bottom: { style: 'thin', color: { argb: color } },
  right: { style: 'thin', color: { argb: color } },
});

const titleStyle = {
  font: { name: FONT, size: 20, bold: true, color: { argb: WHITE } },
  fill: fill(EMERALD_DK),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
};
const subtitleStyle = {
  font: { name: FONT, size: 11, italic: true, color: { argb: SLATE_700 } },
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true },
};
const sectionHeader = {
  font: { name: FONT, size: 12, bold: true, color: { argb: WHITE } },
  fill: fill(SLATE_900),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  border: border(SLATE_700),
};
const colHeader = {
  font: { name: FONT, size: 10, bold: true, color: { argb: WHITE } },
  fill: fill(EMERALD),
  alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
  border: border(EMERALD_DK),
};
const labelStyle = {
  font: { name: FONT, size: 10, bold: true, color: { argb: SLATE_900 } },
  fill: fill(SLATE_100),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};
const inputStyle = {
  font: { name: FONT, size: 10, color: { argb: SLATE_900 } },
  fill: fill(WHITE),
  alignment: { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};
const inputCenter = {
  ...inputStyle,
  alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
};
const formulaStyle = {
  font: { name: FONT, size: 10, bold: true, color: { argb: SLATE_900 } },
  fill: fill(BLUE_50),
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: border(),
  numFmt: '0',
};
const formulaPct = {
  ...formulaStyle,
  numFmt: '0%',
};
const monoStyle = {
  font: { name: MONO, size: 10, bold: true, color: { argb: SLATE_900 } },
  fill: fill(WHITE),
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: border(),
};
const volumeBand = {
  font: { name: FONT, size: 11, bold: true, color: { argb: WHITE } },
  fill: fill(SLATE_700),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  border: border(SLATE_900),
};

function brandHeaderFooter(ws, tab) {
  ws.headerFooter.oddHeader =
    `&L&"Calibri,Bold"&12&K047857CapturePilot &K000000· Federal Lead Kit&R&"Calibri,Italic"&10 09 Compliance Matrix`;
  ws.headerFooter.oddFooter =
    `&Lcapturepilot.com&C&P of &N&R${tab}`;
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    paperSize: 9,
    horizontalCentered: true,
  };
}

// ============================================================
// SHEET 1 — Instructions
// ============================================================
const wsInstr = wb.addWorksheet('Instructions', {
  views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
});
wsInstr.columns = [
  { width: 4 },
  { width: 28 },
  { width: 80 },
];

wsInstr.mergeCells('B2:C2');
wsInstr.getCell('B2').value = 'PROPOSAL COMPLIANCE MATRIX — HOW TO USE';
wsInstr.getCell('B2').style = titleStyle;
wsInstr.getRow(2).height = 38;

wsInstr.mergeCells('B3:C3');
wsInstr.getCell('B3').value =
  "Tracks every Section L instruction and Section M evaluation factor so nothing slips between RFP release and submission. Built for owners with a proposal due in 30 days and zero government bid experience.";
wsInstr.getCell('B3').style = subtitleStyle;
wsInstr.getRow(3).height = 32;

const steps = [
  ['1. Setup', "Open Section L Matrix tab. Fill in the solicitation number, RFP release date, due date, proposal manager, and last-updated date at the top. The Completion Summary auto-counts the rest."],
  ['2. Section L', "Read Section L of the RFP line by line. Add one row per instruction (e.g. L.4.1, L.4.1.1, L.5.2). Paste the exact text — don't paraphrase. Assign a writer. Pick a status from the dropdown. Anything left as 'Not Started' 72 hours before Gold Team is a blocker."],
  ['3. Section M', "Open Section M Alignment tab. List every evaluation factor and sub-factor. Write a real discriminator in column D — 'We have experience' isn't one. 'We reduced system downtime by 34% on Contract X' is. Pink Team scores it 1-5, Red Team scores it 1-5, the gap column flags weak factors."],
  ['4. Submission Checklist', "Open Submission Checklist tab 24-48 hours before the deadline. Walk every line top to bottom with the proposal manager. Anything Failing or N/A needs a note. The sign-off row at the bottom is the go/no-go."],
  ['5. Help', "Open Help tab for a worked example based on a real Army janitorial RFP. Shows what good rows look like and what 'Reviewed' really means."],
];

let r = 5;
for (const [head, body] of steps) {
  const headRow = wsInstr.getRow(r);
  wsInstr.mergeCells(`B${r}:C${r}`);
  headRow.getCell(2).value = head;
  headRow.getCell(2).style = {
    font: { name: FONT, size: 12, bold: true, color: { argb: WHITE } },
    fill: fill(EMERALD),
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  };
  headRow.height = 22;
  r += 1;
  const bodyRow = wsInstr.getRow(r);
  wsInstr.mergeCells(`B${r}:C${r}`);
  bodyRow.getCell(2).value = body;
  bodyRow.getCell(2).style = {
    font: { name: FONT, size: 10, color: { argb: SLATE_900 } },
    fill: fill(SLATE_50),
    alignment: { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true },
    border: border(),
  };
  bodyRow.height = 56;
  r += 2;
}

// Status legend
wsInstr.mergeCells(`B${r}:C${r}`);
wsInstr.getCell(`B${r}`).value = 'STATUS LEGEND';
wsInstr.getCell(`B${r}`).style = sectionHeader;
wsInstr.getRow(r).height = 24;
r += 1;

const statusLegend = [
  ['Not Started', 'Section has no writer or no draft. Check every day during the Proposal Development Period.'],
  ['In Draft', 'Writer has started but not finished. Flag if stuck more than 24 hours.'],
  ['Complete', 'Writer says they are done. Section is ready for color team review.'],
  ['Reviewed', 'Color team has read it and the writer has incorporated comments. This is the only status that counts at Gold Team.'],
  ['Missing', 'Section L instruction exists in the RFP but no proposal section addresses it. Compliance gap. Fix it today.'],
];
for (const [label, body] of statusLegend) {
  const row = wsInstr.getRow(r);
  row.getCell(2).value = label;
  row.getCell(2).style = {
    font: { name: FONT, size: 10, bold: true, color: { argb: SLATE_900 } },
    fill: fill(SLATE_100),
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
    border: border(),
  };
  row.getCell(3).value = body;
  row.getCell(3).style = inputStyle;
  row.height = 30;
  r += 1;
}

r += 1;
// Critical rule banner
wsInstr.mergeCells(`B${r}:C${r}`);
wsInstr.getCell(`B${r}`).value =
  "Critical rule: every row in the Section L Matrix must reach 'Reviewed' before Gold Team review. Any 'Not Started' or 'Missing' at Gold Team is a go/no-go blocker. The proposal manager owns this — not the writers, not the reviewers.";
wsInstr.getCell(`B${r}`).style = {
  font: { name: FONT, size: 10, bold: true, color: { argb: WHITE } },
  fill: fill(RED),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};
wsInstr.getRow(r).height = 50;
r += 2;

// Operator note
wsInstr.mergeCells(`B${r}:C${r}`);
wsInstr.getCell(`B${r}`).value =
  "Operator note (Andre): boarding at 04:00 with incomplete intel, we learned to track every requirement on a single sheet because once you're on deck nobody has time to flip through binders. Same logic here. One sheet. Every L. Every M. If it isn't on the matrix it doesn't exist.";
wsInstr.getCell(`B${r}`).style = {
  font: { name: FONT, size: 10, italic: true, color: { argb: SLATE_700 } },
  fill: fill(SLATE_100),
  alignment: { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};
wsInstr.getRow(r).height = 70;

brandHeaderFooter(wsInstr, 'Instructions');

// ============================================================
// SHEET 2 — Section L Matrix
// ============================================================
const wsL = wb.addWorksheet('Section L Matrix', {
  views: [{ state: 'frozen', xSplit: 1, ySplit: 11, showGridLines: false }],
});
wsL.columns = [
  { width: 14 },  // A: RFP Reference
  { width: 50 },  // B: Instruction
  { width: 14 },  // C: Volume
  { width: 28 },  // D: Proposal Section
  { width: 10 },  // E: Page #
  { width: 11 },  // F: Page Limit Impact
  { width: 18 },  // G: Writer/Owner
  { width: 14 },  // H: Status
  { width: 11 },  // I: Priority
  { width: 30 },  // J: Notes
];

// Title
wsL.mergeCells('A1:J1');
wsL.getCell('A1').value = 'SECTION L COMPLIANCE MATRIX';
wsL.getCell('A1').style = titleStyle;
wsL.getRow(1).height = 36;

// Subtitle
wsL.mergeCells('A2:J2');
wsL.getCell('A2').value =
  "One row per Section L instruction. Every row must reach 'Reviewed' before Gold Team. Paste exact RFP text — paraphrasing misses sub-requirements.";
wsL.getCell('A2').style = subtitleStyle;
wsL.getRow(2).height = 24;

// Metadata block (rows 3-7)
const metaLabels = [
  ['Solicitation #:', 'C3', 'SolNum'],
  ['RFP Release Date:', 'C4', 'RfpRelease'],
  ['Proposal Due Date:', 'C5', 'DueDate'],
  ['Proposal Manager:', 'C6', 'PropMgr'],
  ['Last Updated:', 'C7', 'LastUpdated'],
];
metaLabels.forEach(([label, , name], i) => {
  const rowNum = 3 + i;
  const row = wsL.getRow(rowNum);
  wsL.mergeCells(`A${rowNum}:B${rowNum}`);
  row.getCell(1).value = label;
  row.getCell(1).style = {
    font: { name: FONT, size: 10, bold: true, color: { argb: SLATE_900 } },
    fill: fill(SLATE_100),
    alignment: { vertical: 'middle', horizontal: 'right', indent: 1 },
    border: border(),
  };
  wsL.mergeCells(`C${rowNum}:E${rowNum}`);
  row.getCell(3).value = null;
  row.getCell(3).style = {
    ...inputStyle,
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
    numFmt: name.includes('Date') ? 'yyyy-mm-dd' : 'General',
  };
  row.height = 20;
  wb.definedNames.add(`'Section L Matrix'!$C$${rowNum}`, name);
});

// Completion Summary on the right (rows 3-7)
wsL.mergeCells('F3:G3');
wsL.getCell('F3').value = 'COMPLETION SUMMARY';
wsL.getCell('F3').style = {
  font: { name: FONT, size: 10, bold: true, color: { argb: WHITE } },
  fill: fill(EMERALD),
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: border(EMERALD_DK),
};
wsL.getRow(3).getCell(8).value = 'Count';
wsL.getRow(3).getCell(8).style = {
  font: { name: FONT, size: 10, bold: true, color: { argb: WHITE } },
  fill: fill(EMERALD),
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: border(EMERALD_DK),
};
wsL.getRow(3).getCell(9).value = '%';
wsL.getRow(3).getCell(9).style = {
  font: { name: FONT, size: 10, bold: true, color: { argb: WHITE } },
  fill: fill(EMERALD),
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: border(EMERALD_DK),
};
wsL.getRow(3).getCell(10).value = 'Status';
wsL.getRow(3).getCell(10).style = {
  font: { name: FONT, size: 10, bold: true, color: { argb: WHITE } },
  fill: fill(EMERALD),
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: border(EMERALD_DK),
};

// Range for status column counting — data rows are 12 to 200
const STATUS_RANGE = '$H$12:$H$200';
const PRIORITY_RANGE = '$I$12:$I$200';

const summaryRows = [
  ['Total instructions logged', `=COUNTA(${STATUS_RANGE})`, '', ''],
  ['Reviewed', `=COUNTIF(${STATUS_RANGE},"Reviewed")`, '=IFERROR(H4/$H$4,0)', '=IF($H$4=0,"",IF(H5/$H$4>=0.95,"Ready","Working"))'],
  ['Complete (not yet reviewed)', `=COUNTIF(${STATUS_RANGE},"Complete")`, '=IFERROR(H6/$H$4,0)', '=IF($H$4=0,"",IF(H6=0,"OK","Schedule review"))'],
  ['In Draft', `=COUNTIF(${STATUS_RANGE},"In Draft")`, '=IFERROR(H7/$H$4,0)', '=IF($H$4=0,"",IF(H7=0,"OK","Track daily"))'],
];

// Row 4: Total
wsL.mergeCells('F4:G4');
wsL.getCell('F4').value = summaryRows[0][0];
wsL.getCell('F4').style = labelStyle;
wsL.getCell('H4').value = { formula: `COUNTA(${STATUS_RANGE})` };
wsL.getCell('H4').style = { ...formulaStyle, fill: fill(SLATE_100) };
wsL.getCell('I4').value = '';
wsL.getCell('I4').style = { ...formulaPct, fill: fill(SLATE_100) };
wsL.getCell('J4').value = '';
wsL.getCell('J4').style = { ...formulaStyle, fill: fill(SLATE_100) };
wsL.getRow(4).height = 22;

// Row 5: Reviewed
wsL.mergeCells('F5:G5');
wsL.getCell('F5').value = 'Reviewed';
wsL.getCell('F5').style = labelStyle;
wsL.getCell('H5').value = { formula: `COUNTIF(${STATUS_RANGE},"Reviewed")` };
wsL.getCell('H5').style = formulaStyle;
wsL.getCell('I5').value = { formula: `IFERROR(H5/H4,0)` };
wsL.getCell('I5').style = formulaPct;
wsL.getCell('J5').value = { formula: `IF(H4=0,"",IF(H5/H4>=0.95,"Ready for Gold","Working"))` };
wsL.getCell('J5').style = formulaStyle;
wsL.getRow(5).height = 22;

// Row 6: Complete
wsL.mergeCells('F6:G6');
wsL.getCell('F6').value = 'Complete (not reviewed)';
wsL.getCell('F6').style = labelStyle;
wsL.getCell('H6').value = { formula: `COUNTIF(${STATUS_RANGE},"Complete")` };
wsL.getCell('H6').style = formulaStyle;
wsL.getCell('I6').value = { formula: `IFERROR(H6/H4,0)` };
wsL.getCell('I6').style = formulaPct;
wsL.getCell('J6').value = { formula: `IF(H4=0,"",IF(H6=0,"All reviewed","Schedule review"))` };
wsL.getCell('J6').style = formulaStyle;
wsL.getRow(6).height = 22;

// Row 7: In Draft + Not Started rollup
wsL.mergeCells('F7:G7');
wsL.getCell('F7').value = 'In Draft + Not Started';
wsL.getCell('F7').style = labelStyle;
wsL.getCell('H7').value = { formula: `COUNTIF(${STATUS_RANGE},"In Draft")+COUNTIF(${STATUS_RANGE},"Not Started")` };
wsL.getCell('H7').style = formulaStyle;
wsL.getCell('I7').value = { formula: `IFERROR(H7/H4,0)` };
wsL.getCell('I7').style = formulaPct;
wsL.getCell('J7').value = { formula: `IF(H4=0,"",IF(H7=0,"OK","Track daily"))` };
wsL.getCell('J7').style = formulaStyle;
wsL.getRow(7).height = 22;

// Row 8: Missing (compliance gap)
wsL.mergeCells('F8:G8');
wsL.getCell('F8').value = 'Missing (compliance gap)';
wsL.getCell('F8').style = labelStyle;
wsL.getCell('H8').value = { formula: `COUNTIF(${STATUS_RANGE},"Missing")` };
wsL.getCell('H8').style = formulaStyle;
wsL.getCell('I8').value = { formula: `IFERROR(H8/H4,0)` };
wsL.getCell('I8').style = formulaPct;
wsL.getCell('J8').value = { formula: `IF(H8>0,"FIX NOW","OK")` };
wsL.getCell('J8').style = formulaStyle;
wsL.getRow(8).height = 22;

// Row 9: Critical priority items still open
wsL.mergeCells('F9:G9');
wsL.getCell('F9').value = "Critical priority still open";
wsL.getCell('F9').style = labelStyle;
wsL.getCell('H9').value = { formula: `SUMPRODUCT((${PRIORITY_RANGE}="Critical")*(${STATUS_RANGE}<>"Reviewed")*(${STATUS_RANGE}<>""))` };
wsL.getCell('H9').style = formulaStyle;
wsL.getCell('I9').value = { formula: `IFERROR(H9/MAX(COUNTIF(${PRIORITY_RANGE},"Critical"),1),0)` };
wsL.getCell('I9').style = formulaPct;
wsL.getCell('J9').value = { formula: `IF(H9=0,"All Critical reviewed","Critical gaps")` };
wsL.getCell('J9').style = formulaStyle;
wsL.getRow(9).height = 22;

// Spacer row 10
wsL.getRow(10).height = 8;

// Header row 11
const lHeaders = [
  'RFP Reference\n(L.X.X)',
  'Instruction / Requirement\n(paste exact RFP text)',
  'Volume',
  'Proposal Section',
  'Page #',
  'Page Limit\nImpact?',
  'Writer / Owner',
  'Status',
  'Priority',
  'Notes / Open Questions',
];
lHeaders.forEach((h, i) => {
  const c = wsL.getRow(11).getCell(i + 1);
  c.value = h;
  c.style = colHeader;
});
wsL.getRow(11).height = 36;

// Pre-populated example rows organized by Volume bands
const lRowData = [
  // Volume I — Technical
  { band: 'VOLUME I — TECHNICAL' },
  ['L.4.1', 'The offeror shall describe its technical approach to accomplishing all tasks in the Performance Work Statement (PWS). The description shall address each PWS task area.', 'Technical', 'Section 2.0 — Technical Approach', '', 'Y', '', '', 'Critical', ''],
  ['L.4.1.1', 'Describe the methodology and tools used for the primary service area. Include data flow diagrams where applicable.', 'Technical', 'Section 2.1 — Methodology', '', 'Y', '', '', 'Critical', ''],
  ['L.4.1.2', 'Identify risks to performance and describe specific mitigation strategies.', 'Technical', 'Section 2.4 — Risk Management', '', 'Y', '', '', 'High', ''],
  ['L.4.1.3', 'Describe any innovative approaches, automation, or technology differentiators.', 'Technical', 'Section 2.5 — Innovation', '', 'Y', '', '', 'High', ''],
  ['L.4.2', 'Provide a transition plan for assuming responsibility from the incumbent, including a detailed schedule with milestones for the first 90 days.', 'Technical', 'Section 2.6 — Transition Plan', '', 'Y', '', '', 'Critical', ''],
  ['L.4.3', 'Provide a Quality Control Plan addressing how the offeror will monitor and measure performance against the PWS metrics.', 'Technical', 'Section 2.7 — Quality Control', '', 'Y', '', '', 'High', ''],
  // Volume II — Management
  { band: 'VOLUME II — MANAGEMENT' },
  ['L.5.1', 'Provide an organizational chart showing all proposed key and non-key personnel, their roles, and reporting structure.', 'Management', 'Section 3.1 — Organization', '', 'Y', '', '', 'High', ''],
  ['L.5.2', 'Provide resumes for all Key Personnel named in Section J. Resumes must be limited to 2 pages per individual.', 'Management', 'Attachment A — Resumes', '', 'N', '', '', 'Critical', ''],
  ['L.5.3', "Describe the management approach, including how the Program Manager will interface with the Contracting Officer's Representative (COR).", 'Management', 'Section 3.2 — Management Approach', '', 'Y', '', '', 'High', ''],
  ['L.5.4', 'If any work will be subcontracted, identify proposed subcontractors and their roles, qualifications, and percentage of work.', 'Management', 'Section 3.4 — Subcontracting', '', 'Y', '', '', 'High', ''],
  ['L.5.5', 'Provide a staffing plan addressing how key vacancies will be filled and how retention will be maintained.', 'Management', 'Section 3.3 — Staffing Plan', '', 'Y', '', '', 'High', ''],
  // Volume III — Past Performance
  { band: 'VOLUME III — PAST PERFORMANCE' },
  ['L.6.1', 'Provide no more than X relevant past performance references for work of a similar nature, scope, and complexity completed within the past 5 years. Each reference shall be no longer than X pages.', 'Past Performance', 'Section 4.0 — Past Performance', '', 'Y', '', '', 'Critical', ''],
  ['L.6.1.1', 'For each reference, provide: contract number, award amount, period of performance, customer name, and a current POC with phone number and email.', 'Past Performance', 'Section 4.0 — PP References', '', 'Y', '', '', 'Critical', ''],
  ['L.6.1.2', 'Describe the scope of work performed, similarities to the current requirement, and key outcomes achieved.', 'Past Performance', 'Section 4.0 — PP Narratives', '', 'Y', '', '', 'High', ''],
  ['L.6.2', 'If offeror does not have directly relevant federal past performance, describe relevant commercial or subcontract experience.', 'Past Performance', 'Section 4.1 — Commercial Analogues', '', 'Y', '', '', 'Medium', ''],
  // Volume IV — Price
  { band: 'VOLUME IV — PRICE / COST' },
  ['L.7.1', 'Complete the pricing schedule (Schedule B / CLIN structure) in the format provided as Attachment X to Section J.', 'Price', 'Attachment B — Pricing Schedule', '', 'N', '', '', 'Critical', ''],
  ['L.7.2', 'Provide a Basis of Estimate (BOE) for each CLIN, identifying the labor categories, hours, and rates proposed.', 'Price', 'Price Narrative — BOE', '', 'Y', '', '', 'Critical', ''],
  ['L.7.3', 'Provide a complete listing of proposed labor categories, associated labor rates by year, and narrative justification for each rate.', 'Price', 'Price Narrative — Labor Rates', '', 'Y', '', '', 'High', ''],
  ['L.7.4', 'Certify that all cost or pricing data submitted are accurate, complete, and current as of the date of agreement on price (if CAS/TINA applies).', 'Price', 'Price Certification', '', 'N', '', '', 'Medium', ''],
  // Section J — Admin
  { band: 'SECTION J — ATTACHMENTS / ADMIN' },
  ['L.3.1', 'Complete, sign, and return Representations and Certifications (FAR 52.204-8) as part of the proposal.', 'Admin', 'Attachment — Reps & Certs', '', 'N', '', '', 'Critical', ''],
  ['L.3.2', 'Complete and sign SF-33 (if applicable) or provide the required cover page per Section L instructions.', 'Admin', 'Cover Page / SF-33', '', 'N', '', '', 'Critical', ''],
  ['L.3.3', 'Provide proof of active SAM.gov registration.', 'Admin', 'Admin Volume / Cover', '', 'N', '', '', 'High', ''],
];

let lr = 12;
const volumeDropdown = ['Technical', 'Management', 'Past Performance', 'Price', 'Admin', 'Other'];
const yesNo = ['Y', 'N'];
const statusDropdown = ['Not Started', 'In Draft', 'Complete', 'Reviewed', 'Missing'];
const priorityDropdown = ['Critical', 'High', 'Medium', 'Low'];

for (const item of lRowData) {
  const row = wsL.getRow(lr);
  if (item.band) {
    wsL.mergeCells(`A${lr}:J${lr}`);
    row.getCell(1).value = item.band;
    row.getCell(1).style = volumeBand;
    row.height = 22;
  } else {
    const [ref, instr, vol, ps, pg, pli, owner, status, pri, notes] = item;
    row.getCell(1).value = ref;
    row.getCell(1).style = monoStyle;
    row.getCell(2).value = instr;
    row.getCell(2).style = inputStyle;
    row.getCell(3).value = vol;
    row.getCell(3).style = inputCenter;
    row.getCell(4).value = ps;
    row.getCell(4).style = inputStyle;
    row.getCell(5).value = pg;
    row.getCell(5).style = inputCenter;
    row.getCell(6).value = pli;
    row.getCell(6).style = inputCenter;
    row.getCell(7).value = owner;
    row.getCell(7).style = inputCenter;
    row.getCell(8).value = status || 'Not Started';
    row.getCell(8).style = inputCenter;
    row.getCell(9).value = pri;
    row.getCell(9).style = inputCenter;
    row.getCell(10).value = notes;
    row.getCell(10).style = inputStyle;
    row.height = 44;
  }
  lr += 1;
}

// Add blank rows up to row 100 for user expansion
while (lr <= 100) {
  const row = wsL.getRow(lr);
  for (let c = 1; c <= 10; c++) {
    row.getCell(c).style = c === 1 ? monoStyle : (c === 3 || c === 5 || c === 6 || c === 7 || c === 8 || c === 9 ? inputCenter : inputStyle);
  }
  row.height = 34;
  lr += 1;
}

// Data validations on the full data range (12 to 200)
wsL.dataValidations.add('C12:C200', {
  type: 'list',
  allowBlank: true,
  formulae: [`"${volumeDropdown.join(',')}"`],
});
wsL.dataValidations.add('F12:F200', {
  type: 'list',
  allowBlank: true,
  formulae: [`"${yesNo.join(',')}"`],
});
wsL.dataValidations.add('H12:H200', {
  type: 'list',
  allowBlank: true,
  formulae: [`"${statusDropdown.join(',')}"`],
});
wsL.dataValidations.add('I12:I200', {
  type: 'list',
  allowBlank: true,
  formulae: [`"${priorityDropdown.join(',')}"`],
});

// Conditional formatting — Status column (H)
wsL.addConditionalFormatting({
  ref: 'H12:H200',
  rules: [
    {
      type: 'containsText',
      operator: 'containsText',
      text: 'Reviewed',
      priority: 1,
      style: { fill: fill(GREEN_LT), font: { color: { argb: 'FF065F46' }, bold: true } },
    },
    {
      type: 'containsText',
      operator: 'containsText',
      text: 'Complete',
      priority: 2,
      style: { fill: fill(BLUE_50), font: { color: { argb: 'FF1E40AF' }, bold: true } },
    },
    {
      type: 'containsText',
      operator: 'containsText',
      text: 'In Draft',
      priority: 3,
      style: { fill: fill(AMBER_LT), font: { color: { argb: 'FF92400E' }, bold: true } },
    },
    {
      type: 'containsText',
      operator: 'containsText',
      text: 'Not Started',
      priority: 4,
      style: { fill: fill(SLATE_100), font: { color: { argb: SLATE_700 }, italic: true } },
    },
    {
      type: 'containsText',
      operator: 'containsText',
      text: 'Missing',
      priority: 5,
      style: { fill: fill(RED_LT), font: { color: { argb: RED }, bold: true } },
    },
  ],
});

// Conditional formatting — Priority column (I)
wsL.addConditionalFormatting({
  ref: 'I12:I200',
  rules: [
    {
      type: 'containsText',
      operator: 'containsText',
      text: 'Critical',
      priority: 1,
      style: { fill: fill(RED_LT), font: { color: { argb: RED }, bold: true } },
    },
    {
      type: 'containsText',
      operator: 'containsText',
      text: 'High',
      priority: 2,
      style: { fill: fill(AMBER_LT), font: { color: { argb: 'FF92400E' }, bold: true } },
    },
    {
      type: 'containsText',
      operator: 'containsText',
      text: 'Medium',
      priority: 3,
      style: { fill: fill(BLUE_50), font: { color: { argb: 'FF1E40AF' } } },
    },
  ],
});

// Conditional formatting for I5 — overall readiness percentage
wsL.addConditionalFormatting({
  ref: 'I5',
  rules: [
    {
      type: 'cellIs',
      operator: 'greaterThanOrEqual',
      priority: 1,
      formulae: ['0.95'],
      style: { fill: fill(GREEN_LT), font: { color: { argb: 'FF065F46' }, bold: true } },
    },
    {
      type: 'cellIs',
      operator: 'between',
      priority: 2,
      formulae: ['0.7', '0.95'],
      style: { fill: fill(AMBER_LT), font: { color: { argb: 'FF92400E' }, bold: true } },
    },
    {
      type: 'cellIs',
      operator: 'lessThan',
      priority: 3,
      formulae: ['0.7'],
      style: { fill: fill(RED_LT), font: { color: { argb: RED }, bold: true } },
    },
  ],
});

brandHeaderFooter(wsL, 'Section L Matrix');

// ============================================================
// SHEET 3 — Section M Alignment
// ============================================================
const wsM = wb.addWorksheet('Section M Alignment', {
  views: [{ state: 'frozen', xSplit: 1, ySplit: 5, showGridLines: false }],
});
wsM.columns = [
  { width: 32 },  // A: Eval Factor
  { width: 13 },  // B: Relative Importance
  { width: 32 },  // C: Proposal Section
  { width: 38 },  // D: Discriminator
  { width: 32 },  // E: Proof Points
  { width: 10 },  // F: Pink Team Score
  { width: 10 },  // G: Red Team Score
  { width: 10 },  // H: Gap (calc)
  { width: 30 },  // I: Gap / Open Issue
  { width: 16 },  // J: Owner
];

wsM.mergeCells('A1:J1');
wsM.getCell('A1').value = 'SECTION M ALIGNMENT — EVALUATION FACTORS & DISCRIMINATORS';
wsM.getCell('A1').style = titleStyle;
wsM.getRow(1).height = 36;

wsM.mergeCells('A2:J2');
wsM.getCell('A2').value =
  "Map each Section M evaluation factor to your proposal sections. Column D is the discriminator that makes you the best-value choice. 'We have experience' is not a discriminator.";
wsM.getCell('A2').style = subtitleStyle;
wsM.getRow(2).height = 30;

// Summary band rows 3-4
wsM.mergeCells('A3:E3');
wsM.getCell('A3').value = 'SCORING SUMMARY (auto-calculates)';
wsM.getCell('A3').style = sectionHeader;
wsM.getRow(3).height = 22;
wsM.getCell('F3').value = 'Pink Avg';
wsM.getCell('F3').style = colHeader;
wsM.getCell('G3').value = 'Red Avg';
wsM.getCell('G3').style = colHeader;
wsM.getCell('H3').value = 'Avg Gap';
wsM.getCell('H3').style = colHeader;
wsM.mergeCells('I3:J3');
wsM.getCell('I3').value = 'Status';
wsM.getCell('I3').style = colHeader;

wsM.mergeCells('A4:E4');
wsM.getCell('A4').value = 'Average across all rated factors (rows 6 to 100). Blanks ignored.';
wsM.getCell('A4').style = {
  ...subtitleStyle,
  fill: fill(SLATE_50),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  border: border(),
};
wsM.getCell('F4').value = { formula: 'IFERROR(AVERAGEIF(F6:F100,">0"),0)' };
wsM.getCell('F4').style = { ...formulaStyle, numFmt: '0.00' };
wsM.getCell('G4').value = { formula: 'IFERROR(AVERAGEIF(G6:G100,">0"),0)' };
wsM.getCell('G4').style = { ...formulaStyle, numFmt: '0.00' };
wsM.getCell('H4').value = { formula: 'IFERROR(G4-F4,0)' };
wsM.getCell('H4').style = { ...formulaStyle, numFmt: '+0.00;-0.00;0.00' };
wsM.mergeCells('I4:J4');
wsM.getCell('I4').value = { formula: 'IF(G4=0,"No Red Team yet",IF(G4>=4,"On track",IF(G4>=3,"Needs work","Rewrite required")))' };
wsM.getCell('I4').style = { ...formulaStyle, alignment: { vertical: 'middle', horizontal: 'left', indent: 1 } };
wsM.getRow(4).height = 22;

// Header row 5
const mHeaders = [
  'Eval Factor / Sub-Factor\n(Section M reference)',
  'Relative\nImportance',
  'Proposal Section(s) Addressing This Factor',
  'Key Win Theme / Discriminator',
  'Proof Points\n(past perf / metrics)',
  'Pink Team\nScore (1-5)',
  'Red Team\nScore (1-5)',
  'Gap\n(Red - Pink)',
  'Gap / Open Issue',
  'Owner',
];
mHeaders.forEach((h, i) => {
  const c = wsM.getRow(5).getCell(i + 1);
  c.value = h;
  c.style = colHeader;
});
wsM.getRow(5).height = 36;

// Pre-populated M rows
const mRowData = [
  { band: 'FACTOR 1: TECHNICAL APPROACH' },
  ['1.1  Understanding of Requirements', 'Most Important', '', '', '', '', '', ''],
  ['1.2  Technical Methodology', 'Most Important', '', '', '', '', '', ''],
  ['1.3  Innovation / Unique Technical Approach', 'Important', '', '', '', '', '', ''],
  ['1.4  Risk Management', 'Important', '', '', '', '', '', ''],
  { band: 'FACTOR 2: MANAGEMENT APPROACH' },
  ['2.1  Program Management Plan', 'Important', '', '', '', '', '', ''],
  ['2.2  Key Personnel Qualifications', 'Important', '', '', '', '', '', ''],
  ['2.3  Staffing Plan and Retention', 'Important', '', '', '', '', '', ''],
  ['2.4  Subcontracting / Teaming Strategy', 'Less Important', '', '', '', '', '', ''],
  { band: 'FACTOR 3: PAST PERFORMANCE' },
  ['3.1  Relevance of Past Performance', 'Important', '', '', '', '', '', ''],
  ['3.2  Quality of Past Performance (CPARS)', 'Important', '', '', '', '', '', ''],
  ['3.3  Past Performance of Key Subs', 'Less Important', '', '', '', '', '', ''],
  { band: 'FACTOR 4: PRICE / COST (separately evaluated)' },
  ['4.1  Total Evaluated Price', 'N/A — Evaluated separately', '', '', '', '', '', ''],
  ['4.2  Price Realism / Reasonableness', 'N/A — Evaluated separately', '', '', '', '', '', ''],
];

const importanceDropdown = ['Most Important', 'Important', 'Less Important', 'N/A — Evaluated separately'];

let mr = 6;
for (const item of mRowData) {
  const row = wsM.getRow(mr);
  if (item.band) {
    wsM.mergeCells(`A${mr}:J${mr}`);
    row.getCell(1).value = item.band;
    row.getCell(1).style = volumeBand;
    row.height = 22;
  } else {
    const [factor, importance, propSec, disc, proof, pink, red, , issue, owner] = item;
    row.getCell(1).value = factor;
    row.getCell(1).style = labelStyle;
    row.getCell(2).value = importance;
    row.getCell(2).style = inputCenter;
    row.getCell(3).value = propSec;
    row.getCell(3).style = inputStyle;
    row.getCell(4).value = disc;
    row.getCell(4).style = inputStyle;
    row.getCell(5).value = proof;
    row.getCell(5).style = inputStyle;
    row.getCell(6).value = pink;
    row.getCell(6).style = inputCenter;
    row.getCell(7).value = red;
    row.getCell(7).style = inputCenter;
    row.getCell(8).value = { formula: `IF(OR(F${mr}="",G${mr}=""),"",G${mr}-F${mr})` };
    row.getCell(8).style = { ...formulaStyle, numFmt: '+0;-0;0' };
    row.getCell(9).value = issue;
    row.getCell(9).style = inputStyle;
    row.getCell(10).value = owner;
    row.getCell(10).style = inputCenter;
    row.height = 38;
  }
  mr += 1;
}

// Blank rows up to row 50
while (mr <= 50) {
  const row = wsM.getRow(mr);
  for (let c = 1; c <= 10; c++) {
    if (c === 8) {
      row.getCell(c).value = { formula: `IF(OR(F${mr}="",G${mr}=""),"",G${mr}-F${mr})` };
      row.getCell(c).style = { ...formulaStyle, numFmt: '+0;-0;0' };
    } else if (c === 2 || c === 6 || c === 7 || c === 10) {
      row.getCell(c).style = inputCenter;
    } else if (c === 1) {
      row.getCell(c).style = labelStyle;
    } else {
      row.getCell(c).style = inputStyle;
    }
  }
  row.height = 32;
  mr += 1;
}

// Data validations
wsM.dataValidations.add('B6:B50', {
  type: 'list',
  allowBlank: true,
  formulae: [`"${importanceDropdown.join(',')}"`],
});
wsM.dataValidations.add('F6:F50', {
  type: 'whole',
  allowBlank: true,
  operator: 'between',
  formulae: [1, 5],
  showErrorMessage: true,
  errorTitle: 'Score 1-5 only',
  error: 'Pink Team scores run 1 (rewrite) to 5 (best in class).',
});
wsM.dataValidations.add('G6:G50', {
  type: 'whole',
  allowBlank: true,
  operator: 'between',
  formulae: [1, 5],
  showErrorMessage: true,
  errorTitle: 'Score 1-5 only',
  error: 'Red Team scores run 1 (rewrite) to 5 (best in class).',
});

// Conditional formatting — Pink and Red team scores
const scoreCF = [
  {
    type: 'cellIs',
    operator: 'greaterThanOrEqual',
    priority: 1,
    formulae: ['4'],
    style: { fill: fill(GREEN_LT), font: { color: { argb: 'FF065F46' }, bold: true } },
  },
  {
    type: 'cellIs',
    operator: 'equal',
    priority: 2,
    formulae: ['3'],
    style: { fill: fill(AMBER_LT), font: { color: { argb: 'FF92400E' }, bold: true } },
  },
  {
    type: 'cellIs',
    operator: 'lessThanOrEqual',
    priority: 3,
    formulae: ['2'],
    style: { fill: fill(RED_LT), font: { color: { argb: RED }, bold: true } },
  },
];
wsM.addConditionalFormatting({ ref: 'F6:F50', rules: scoreCF });
wsM.addConditionalFormatting({ ref: 'G6:G50', rules: scoreCF });

// Gap CF — positive green, negative red, zero amber
wsM.addConditionalFormatting({
  ref: 'H6:H50',
  rules: [
    {
      type: 'cellIs',
      operator: 'greaterThan',
      priority: 1,
      formulae: ['0'],
      style: { fill: fill(GREEN_LT), font: { color: { argb: 'FF065F46' }, bold: true } },
    },
    {
      type: 'cellIs',
      operator: 'equal',
      priority: 2,
      formulae: ['0'],
      style: { fill: fill(AMBER_LT), font: { color: { argb: 'FF92400E' } } },
    },
    {
      type: 'cellIs',
      operator: 'lessThan',
      priority: 3,
      formulae: ['0'],
      style: { fill: fill(RED_LT), font: { color: { argb: RED }, bold: true } },
    },
  ],
});

// Footer banner
wsM.mergeCells(`A${mr + 1}:J${mr + 1}`);
wsM.getCell(`A${mr + 1}`).value =
  "Key rule: every evaluation factor needs an explicit discriminator in Column D. 'We have experience' is not a discriminator. 'We reduced system downtime by 34% on Contract HQ0034-22-C-0017' is. If you can't write one, you don't have one yet — and that's a capture gap, not a writing gap.";
wsM.getCell(`A${mr + 1}`).style = {
  font: { name: FONT, size: 10, bold: true, color: { argb: WHITE } },
  fill: fill(EMERALD_DK),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};
wsM.getRow(mr + 1).height = 50;

brandHeaderFooter(wsM, 'Section M Alignment');

// ============================================================
// SHEET 4 — Submission Checklist
// ============================================================
const wsSub = wb.addWorksheet('Submission Checklist', {
  views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
});
wsSub.columns = [
  { width: 16 },  // A: Category
  { width: 64 },  // B: Check item
  { width: 14 },  // C: Pass/Fail/N/A
  { width: 20 },  // D: Verified by
  { width: 14 },  // E: Time verified
  { width: 30 },  // F: Notes
];

wsSub.mergeCells('A1:F1');
wsSub.getCell('A1').value = 'FINAL SUBMISSION CHECKLIST — RUN 24-48 HOURS BEFORE DEADLINE';
wsSub.getCell('A1').style = titleStyle;
wsSub.getRow(1).height = 36;

wsSub.mergeCells('A2:F2');
wsSub.getCell('A2').value =
  'Every item must read PASS before submission. Anything else needs a note explaining why. The proposal manager owns the sign-off row at the bottom.';
wsSub.getCell('A2').style = subtitleStyle;
wsSub.getRow(2).height = 26;

// Summary block rows 3-4
wsSub.mergeCells('A3:B3');
wsSub.getCell('A3').value = 'CHECKLIST PROGRESS (auto)';
wsSub.getCell('A3').style = sectionHeader;
wsSub.getRow(3).height = 22;
wsSub.getCell('C3').value = 'Pass';
wsSub.getCell('C3').style = colHeader;
wsSub.getCell('D3').value = 'Fail';
wsSub.getCell('D3').style = colHeader;
wsSub.getCell('E3').value = 'N/A';
wsSub.getCell('E3').style = colHeader;
wsSub.getCell('F3').value = 'Go/No-Go';
wsSub.getCell('F3').style = colHeader;

wsSub.mergeCells('A4:B4');
wsSub.getCell('A4').value = 'Counts run across rows 6 to 60.';
wsSub.getCell('A4').style = {
  ...subtitleStyle,
  fill: fill(SLATE_50),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  border: border(),
};
wsSub.getCell('C4').value = { formula: 'COUNTIF(C6:C60,"Pass")' };
wsSub.getCell('C4').style = formulaStyle;
wsSub.getCell('D4').value = { formula: 'COUNTIF(C6:C60,"Fail")' };
wsSub.getCell('D4').style = formulaStyle;
wsSub.getCell('E4').value = { formula: 'COUNTIF(C6:C60,"N/A")' };
wsSub.getCell('E4').style = formulaStyle;
wsSub.getCell('F4').value = { formula: 'IF(D4>0,"NO-GO: fix Fails",IF(C4+E4=0,"Not started",IF(C4+E4>=COUNTA(B6:B60),"GO","Working")))' };
wsSub.getCell('F4').style = { ...formulaStyle, alignment: { vertical: 'middle', horizontal: 'center' } };
wsSub.getRow(4).height = 24;

// Header row 5
const subHeaders = ['Category', 'Check Item', 'Pass / Fail / N/A', 'Verified By', 'Time Verified', 'Notes'];
subHeaders.forEach((h, i) => {
  const c = wsSub.getRow(5).getCell(i + 1);
  c.value = h;
  c.style = colHeader;
});
wsSub.getRow(5).height = 28;

const subRowData = [
  { band: 'PAGE LIMITS' },
  ['Page Limits', 'Page count verified against Section L limits — EVERY volume separately', '', '', '', ''],
  ['Page Limits', 'Cover pages, TOC, resumes, and required forms excluded per RFP instructions', '', '', '', ''],
  { band: 'FORMAT' },
  ['Format', 'Font type and size match Section L requirements throughout every volume', '', '', '', ''],
  ['Format', 'Margins are correct (typically 1 inch) — verified on every page including headers/footers', '', '', '', ''],
  ['Format', 'Headers/footers include required fields: solicitation #, offeror name, volume name, page #', '', '', '', ''],
  ['Format', 'All pages are numbered within each volume (re-starts at 1 for each volume if required)', '', '', '', ''],
  { band: 'SECTION L COMPLIANCE' },
  ['Section L', "Section L compliance matrix shows 'Reviewed' status for every instruction row", '', '', '', ''],
  ['Section L', "Every 'Complete' item has been reviewed by at least one reviewer other than the writer", '', '', '', ''],
  { band: 'SECTION M ALIGNMENT' },
  ['Section M', 'Every evaluation factor has an explicit discriminator stated in the proposal', '', '', '', ''],
  { band: 'ATTACHMENTS' },
  ['Attachments', 'All Section J attachments are present, signed, and dated (SF-33, SF-1449, Reps & Certs)', '', '', '', ''],
  ['Attachments', 'Key personnel letters of commitment are signed and included', '', '', '', ''],
  ['Attachments', 'Teaming/subcontractor agreements are included (if required by RFP)', '', '', '', ''],
  ['Attachments', 'Past performance POC names and phone numbers are verified as current (call them)', '', '', '', ''],
  { band: 'PRICING' },
  ['Pricing', 'Price/cost schedule math verified — all CLINs sum to correct totals', '', '', '', ''],
  ['Pricing', 'Pricing format matches Schedule B / CLIN structure exactly (no added or missing CLINs)', '', '', '', ''],
  ['Pricing', 'Unit prices, quantities, and evaluated prices are consistent with technical assumptions', '', '', '', ''],
  ['Pricing', 'Multi-year escalation applied correctly (verify against Wage Determination years if SCA)', '', '', '', ''],
  { band: 'SUBMISSION' },
  ['Submission', 'Submission method confirmed in writing (SAM.gov portal / email / hand delivery / mail)', '', '', '', ''],
  ['Submission', 'File names comply with RFP naming conventions (exact format)', '', '', '', ''],
  ['Submission', 'File sizes are within any portal upload limits — tested with a dummy upload if uncertain', '', '', '', ''],
  ['Submission', 'Submission deadline verified including TIME ZONE (Eastern Time applies to most federal solicitations)', '', '', '', ''],
  ['Submission', 'Late submission contingency plan documented (alternate submitter identified)', '', '', '', ''],
  ['Submission', 'Confirmation of receipt mechanism understood — screenshot / email / portal confirmation expected', '', '', '', ''],
  { band: 'PROOFING' },
  ['Proofing', 'Spell check and grammar check completed — proposal manager sign-off confirmed', '', '', '', ''],
  ['Proofing', 'No placeholder text remains ([INSERT], TBD, XXXX, [Client Name]) in any volume', '', '', '', ''],
  ['Proofing', 'No prior client or competitor names from boilerplate (search for common names)', '', '', '', ''],
  ['Proofing', 'All cross-references (see Section X, Figure Y, Attachment Z) are verified as accurate', '', '', '', ''],
];

const subStatus = ['Pass', 'Fail', 'N/A'];
let sr = 6;
for (const item of subRowData) {
  const row = wsSub.getRow(sr);
  if (item.band) {
    wsSub.mergeCells(`A${sr}:F${sr}`);
    row.getCell(1).value = item.band;
    row.getCell(1).style = volumeBand;
    row.height = 22;
  } else {
    const [cat, check, status, verified, time, notes] = item;
    row.getCell(1).value = cat;
    row.getCell(1).style = labelStyle;
    row.getCell(2).value = check;
    row.getCell(2).style = inputStyle;
    row.getCell(3).value = status;
    row.getCell(3).style = inputCenter;
    row.getCell(4).value = verified;
    row.getCell(4).style = inputCenter;
    row.getCell(5).value = time;
    row.getCell(5).style = inputCenter;
    row.getCell(6).value = notes;
    row.getCell(6).style = inputStyle;
    row.height = 28;
  }
  sr += 1;
}

// Blank rows
while (sr <= 60) {
  const row = wsSub.getRow(sr);
  row.getCell(1).style = labelStyle;
  row.getCell(2).style = inputStyle;
  row.getCell(3).style = inputCenter;
  row.getCell(4).style = inputCenter;
  row.getCell(5).style = inputCenter;
  row.getCell(6).style = inputStyle;
  row.height = 24;
  sr += 1;
}

// Validations
wsSub.dataValidations.add('C6:C60', {
  type: 'list',
  allowBlank: true,
  formulae: [`"${subStatus.join(',')}"`],
});

// Conditional formatting on status column
wsSub.addConditionalFormatting({
  ref: 'C6:C60',
  rules: [
    {
      type: 'containsText',
      operator: 'containsText',
      text: 'Pass',
      priority: 1,
      style: { fill: fill(GREEN_LT), font: { color: { argb: 'FF065F46' }, bold: true } },
    },
    {
      type: 'containsText',
      operator: 'containsText',
      text: 'Fail',
      priority: 2,
      style: { fill: fill(RED_LT), font: { color: { argb: RED }, bold: true } },
    },
    {
      type: 'containsText',
      operator: 'containsText',
      text: 'N/A',
      priority: 3,
      style: { fill: fill(SLATE_100), font: { color: { argb: SLATE_700 }, italic: true } },
    },
  ],
});

// Sign-off row
const signR = sr + 1;
wsSub.mergeCells(`A${signR}:F${signR}`);
wsSub.getCell(`A${signR}`).value =
  'SIGN-OFF: Proposal Manager  ______________________________   Date / Time  ______________________________   All Critical items confirmed PASS.';
wsSub.getCell(`A${signR}`).style = {
  font: { name: FONT, size: 11, bold: true, color: { argb: WHITE } },
  fill: fill(EMERALD_DK),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};
wsSub.getRow(signR).height = 44;

brandHeaderFooter(wsSub, 'Submission Checklist');

// ============================================================
// SHEET 5 — Help (worked example)
// ============================================================
const wsHelp = wb.addWorksheet('Help', {
  views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
});
wsHelp.columns = [
  { width: 4 },
  { width: 30 },
  { width: 80 },
];

wsHelp.mergeCells('B2:C2');
wsHelp.getCell('B2').value = 'WORKED EXAMPLE — ARMY JANITORIAL RFP';
wsHelp.getCell('B2').style = titleStyle;
wsHelp.getRow(2).height = 38;

wsHelp.mergeCells('B3:C3');
wsHelp.getCell('B3').value =
  "Real-world example based on a Fort Bragg janitorial sources sought (NAICS 561720). Shows what a good Section L row and a good Section M discriminator look like — and what 'Reviewed' actually means in practice.";
wsHelp.getCell('B3').style = subtitleStyle;
wsHelp.getRow(3).height = 32;

const helpBlocks = [
  {
    title: 'Section L row — good vs bad',
    bullets: [
      "Bad: RFP Ref = 'L.4', Instruction = 'technical stuff', Section = 'Tech', Status = 'In Draft', Notes = blank.",
      "Good: RFP Ref = 'L.4.1.2', Instruction = 'Identify risks to performance and describe specific mitigation strategies' (exact quote), Volume = Technical, Section = '2.4 Risk Management', Page = 14, Writer = 'M. Hernandez', Status = 'Reviewed', Priority = High, Notes = 'Linked to L.4.2 transition plan; mitigation matrix on p.15'.",
      "What makes the good one work: exact RFP citation, exact RFP language, real human owner, cross-reference to related sections, real page number once draft exists.",
    ],
  },
  {
    title: 'Section M discriminator — good vs bad',
    bullets: [
      "Bad: 'We have experience with federal janitorial.' (Every offeror writes this. Zero discrimination.)",
      "Good: 'Same crew that ran Fort Stewart custodial (W912HN-22-C-0014) — 96.3% CPARS rating across 18 months, zero customer complaints, completed first-day phase-in with full crew.' (Specific contract, specific number, specific outcome.)",
      "Better: same line plus a proof point in column E: 'CPARS letter on file dated Apr 14, 2026; available to evaluator on request.' Now an evaluator can verify it without asking.",
    ],
  },
  {
    title: "What 'Reviewed' really means",
    bullets: [
      "Not: the writer thinks they are done.",
      "Not: the proposal manager skimmed it.",
      "Is: a color team reviewer (Pink, Red, or Gold) read it, scored it, wrote comments, and the writer incorporated those comments and confirmed the changes back to the reviewer.",
      "If that loop hasn't closed, status is 'Complete' — not 'Reviewed'. The difference matters at Gold Team.",
    ],
  },
  {
    title: 'Common compliance gaps to look for',
    bullets: [
      "Forgotten sub-clauses: L.4.1 lists three sub-requirements (a)(b)(c) and your matrix only has one row for L.4.1. Add (a), (b), (c) as separate rows.",
      "Page-limit miscounts: cover page, TOC, dividers, and required forms are usually excluded — check Section L. If you assume they count and the RFP says they don't, you wrote ten extra pages for nothing.",
      "Missing certifications: FAR 52.204-8 (Reps and Certs) and SF-33 signatures get forgotten because they live in Section J, not L. Put a row for each in your matrix anyway.",
      "Time-zone errors: federal deadlines are almost always Eastern Time. Saw a Pacific-coast offeror miss a 17:00 ET deadline by three hours because they thought it was 17:00 PT. The portal closed. They lost.",
    ],
  },
  {
    title: 'When to start this matrix',
    bullets: [
      "On RFP release day. Not 'after the kickoff meeting'. Not 'when the writers are assigned'. On release day.",
      "If you started after release day on a 30-day proposal, you're already two days behind. Backfill the matrix tonight and run a quick gap scan tomorrow morning.",
      "On a 60-day proposal: matrix done by day 3, Pink Team scored by day 30, Red Team by day 45, Gold Team by day 55.",
    ],
  },
];

let hr = 5;
for (const block of helpBlocks) {
  // Section header
  wsHelp.mergeCells(`B${hr}:C${hr}`);
  wsHelp.getCell(`B${hr}`).value = block.title;
  wsHelp.getCell(`B${hr}`).style = {
    font: { name: FONT, size: 12, bold: true, color: { argb: WHITE } },
    fill: fill(EMERALD),
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  };
  wsHelp.getRow(hr).height = 24;
  hr += 1;
  for (const bullet of block.bullets) {
    const row = wsHelp.getRow(hr);
    row.getCell(2).value = '•';
    row.getCell(2).style = {
      font: { name: FONT, size: 10, bold: true, color: { argb: EMERALD_DK } },
      alignment: { vertical: 'top', horizontal: 'center' },
      border: border(SLATE_200),
    };
    row.getCell(3).value = bullet;
    row.getCell(3).style = {
      font: { name: FONT, size: 10, color: { argb: SLATE_900 } },
      fill: fill(SLATE_50),
      alignment: { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true },
      border: border(SLATE_200),
    };
    row.height = Math.max(28, Math.ceil(bullet.length / 70) * 18);
    hr += 1;
  }
  hr += 1;
}

// Operator note at bottom
wsHelp.mergeCells(`B${hr}:C${hr}`);
wsHelp.getCell(`B${hr}`).value =
  "Operator note (Sergio): in Afghan infantry we ran a checklist before every patrol — boots, comms, ammo count, medkit, route brief. Same item every time. Same person checking. We didn't skip any of it because the day we skipped one was the day it mattered. Same logic for the Submission Checklist tab. Don't skip lines because 'we always get that one right'.";
wsHelp.getCell(`B${hr}`).style = {
  font: { name: FONT, size: 10, italic: true, color: { argb: SLATE_700 } },
  fill: fill(SLATE_100),
  alignment: { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};
wsHelp.getRow(hr).height = 80;

brandHeaderFooter(wsHelp, 'Help');

// ============================================================
// Write file
// ============================================================
await wb.xlsx.writeFile(OUT);
console.log('Wrote', OUT);
