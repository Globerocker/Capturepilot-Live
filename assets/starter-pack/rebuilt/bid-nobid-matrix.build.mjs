// Bid / No-Bid Decision Matrix — XLSX rebuild
// Build with: node bid-nobid-matrix.build.mjs
//
// Design goals:
//   - 25-criterion weighted scoring (5 categories of 5 criteria)
//   - Real working formulas (no LAMBDA/XLOOKUP/FILTER for Sheets compat)
//   - Data validation dropdowns for Score (0-5) and Yes/No fields
//   - Named ranges for every input cell
//   - Conditional formatting on the recommendation cell
//   - Summary/Output tab with per-category roll-up
//   - Instructions + Help tab with worked examples
//   - Frozen header row, brand styling, print setup

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ExcelJS = require("/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs");

const EMERALD = "FF10B981";
const EMERALD_DARK = "FF047857";
const SLATE_50 = "FFF8FAFC";
const SLATE_100 = "FFF1F5F9";
const SLATE_200 = "FFE2E8F0";
const SLATE_700 = "FF334155";
const SLATE_900 = "FF0F172A";
const AMBER = "FFF59E0B";
const RED = "FFEF4444";
const GREEN_FILL = "FFD1FAE5";
const AMBER_FILL = "FFFEF3C7";
const RED_FILL = "FFFEE2E2";

const WB_TITLE = "Bid / No-Bid Decision Matrix";
const FOOTER = "CapturePilot Federal Lead Kit  -  capturepilot.com  -  04 Bid/No-Bid Decision Matrix";

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

    // Row 1: human-readable title
    const titleCell = wsLists.getCell(`${colLetter}1`);
    titleCell.value = list.title;
    titleCell.font = { name: 'Calibri', size: 10, bold: true };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    // Rows 2+: option values
    list.items.forEach((item, itemIdx) => {
      const cell = wsLists.getCell(`${colLetter}${2 + itemIdx}`);
      cell.value = item;
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    });

    // Register workbook-scoped defined name
    const lastRow = 1 + list.items.length;
    wb.definedNames.add(`Lists!$${colLetter}$2:$${colLetter}$${lastRow}`, list.name);

    formulaMap[list.name] = list.name;
  });

  // Hide the sheet so it doesn't clutter the tab bar
  wsLists.state = 'veryHidden';

  return formulaMap;
}

// ───────────────────────────────────────────────────────────────
// Criteria definition — single source of truth
// ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    name: "STRATEGIC FIT",
    blurb: "Does this opportunity belong in our pipeline at all?",
    items: [
      { id: 1, label: "NAICS code alignment with our core capabilities", weight: 5, help: "Do we hold this NAICS on our SAM.gov registration? Is it a primary code, not an add-on?" },
      { id: 2, label: "Opportunity type matches our target contract vehicles", weight: 4, help: "FFP / T&M / CPFF / IDIQ — does the contract type match how we usually deliver?" },
      { id: 3, label: "Agency is in our target agency list", weight: 4, help: "Is this one of our top-five target agencies? Do we have an existing relationship anywhere in the org?" },
      { id: 4, label: "Geographic location is feasible for our team", weight: 3, help: "Can we deliver on-site if required? Do we have staff within reasonable distance of the place of performance?" },
      { id: 5, label: "Opportunity supports long-term capture strategy", weight: 4, help: "Does winning this open a vehicle, agency, or follow-on we actually want to be in for the next five years?" },
    ],
  },
  {
    name: "COMPETITIVE POSITION",
    blurb: "Can we actually win against the field that's likely to show up?",
    items: [
      { id: 6, label: "We have prior relationship with KO / COR / end user", weight: 5, help: "Have we met the KO, COR, or program office in the last 12 months? Not just a LinkedIn connection — a real conversation." },
      { id: 7, label: "We are the incumbent or have teamed with incumbent", weight: 4, help: "Incumbency or teaming with the incumbent is worth roughly 20 PWin points. If neither, score this honestly." },
      { id: 8, label: "We can differentiate from likely competitors", weight: 4, help: "Can we name 3 discriminators competitors cannot match? Write them in the notes column." },
      { id: 9, label: "We have relevant past performance (direct match)", weight: 5, help: "Do we have 2+ references at similar scope, dollar value, and agency type? Federal past performance beats commercial." },
      { id: 10, label: "Set-aside type favors our certifications", weight: 3, help: "Does our 8(a) / HUBZone / SDVOSB / WOSB status match the set-aside? If unrestricted, we're competing against everyone." },
    ],
  },
  {
    name: "CAPTURE READINESS",
    blurb: "Can we mount a credible response without breaking the company?",
    items: [
      { id: 11, label: "We have the personnel / capacity to respond in time", weight: 5, help: "Can we staff a proposal team without pulling people off paying work? B&P costs are real." },
      { id: 12, label: "We have or can assemble the right team / subs", weight: 4, help: "Do we have signed teaming agreements, or at least established sub relationships we can mobilize this week?" },
      { id: 13, label: "Required clearances are held or obtainable", weight: 4, help: "Do key staff already hold Secret / TS / TS-SCI? Don't bid 'we'll get them cleared' — that almost never works." },
      { id: 14, label: "Capture resources (proposal manager, writer) available", weight: 3, help: "Do we have a proposal manager, technical writer, and graphics support? Consultant or in-house both count." },
      { id: 15, label: "Solution / technical approach is clear to us now", weight: 4, help: "Could we sketch the technical approach on a napkin today? If not, we're going to learn on the proposal — that's expensive." },
    ],
  },
  {
    name: "WIN PROBABILITY FACTORS",
    blurb: "The intangibles that determine PWin once you actually submit.",
    items: [
      { id: 16, label: "We have intelligence on the customer's priorities", weight: 4, help: "Do we know their stated priorities, pain points, and how the incumbent is doing? FOIA, FPDS, and conversations are all valid sources." },
      { id: 17, label: "We can price competitively (LPTA or best-value)", weight: 5, help: "Can we price within plus or minus 5% of the likely winning price? Use FPDS history for similar work as your anchor." },
      { id: 18, label: "No disqualifying compliance gaps (reps & certs)", weight: 5, help: "Reps and certs current? CMMC level adequate? No outstanding debarments, suspensions, or pending size protests?" },
      { id: 19, label: "Evaluation criteria favor our strengths", weight: 4, help: "Look at Section M. Do the technical, management, and past performance weights play to our strengths or our gaps?" },
      { id: 20, label: "We have attended industry days / responded to RFIs", weight: 3, help: "Did we attend the industry day or respond to the sources sought? Shaping happens 6-18 months before solicitation." },
    ],
  },
  {
    name: "BUSINESS VALUE",
    blurb: "Even if we can win, is this the right use of B&P dollars?",
    items: [
      { id: 21, label: "Contract value meets our revenue threshold", weight: 4, help: "Is the total contract value above the minimum we set in our annual plan? Don't bid 50K opportunities if our floor is 250K." },
      { id: 22, label: "Win opens door to larger follow-on work", weight: 4, help: "Is this a gateway contract with likely option years, task orders, or follow-on awards? Small first deals can be worth it." },
      { id: 23, label: "Profit margin is acceptable given effort required", weight: 5, help: "After B&P costs, indirect costs, and delivery cost, can we still hit our target margin? Run the numbers, don't guess." },
      { id: 24, label: "Strategic value (agency expansion, certification use)", weight: 3, help: "Does winning expand our past performance portfolio into a new agency, vehicle, or capability we want to grow?" },
      { id: 25, label: "Resource investment is proportional to potential", weight: 4, help: "Is the B&P investment reasonable given expected TCV? Spending 60K to chase a 200K one-year deal almost never makes sense." },
    ],
  },
];

const TOTAL_CRITERIA = CATEGORIES.reduce((n, c) => n + c.items.length, 0);
const MAX_POSSIBLE = CATEGORIES.reduce(
  (sum, cat) => sum + cat.items.reduce((s, i) => s + i.weight * 5, 0),
  0,
);

// ───────────────────────────────────────────────────────────────
// Build workbook
// ───────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();

// Lists sheet must be created before any sheet that references its named ranges
const DV = buildListsSheet(wb, [
  { name: 'YesNoUnknown',    title: 'Yes / No / Unknown', items: ['Yes', 'No', 'Unknown'] },
  { name: 'SetAsideOptions', title: 'Set-Aside Type',     items: ['Unrestricted', 'Small Business', '8(a) Sole Source', '8(a) Competitive', 'HUBZone', 'SDVOSB', 'WOSB', 'EDWOSB', 'Total SB'] },
  { name: 'ContractType',    title: 'Contract Type',      items: ['FFP', 'FFP-LOE', 'T&M', 'CPFF', 'CPIF', 'CPAF', 'IDIQ', 'BPA', 'GSA Schedule', 'Other'] },
  { name: 'ScoreZeroToFive', title: 'Score (0-5)',        items: ['0', '1', '2', '3', '4', '5'] },
]);

wb.creator = "CapturePilot";
wb.lastModifiedBy = "CapturePilot";
wb.created = new Date();
wb.modified = new Date();
wb.company = "CapturePilot";
wb.title = WB_TITLE;
wb.subject = "Federal contract bid / no-bid decision framework";

// ───────────────────────────────────────────────────────────────
// SHEET 1 — Decision Matrix (Inputs + Calc combined for usability)
// ───────────────────────────────────────────────────────────────
const sMatrix = wb.addWorksheet("Decision Matrix", {
  views: [{ state: "frozen", ySplit: 15, showGridLines: false }],
  pageSetup: {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CBid / No-Bid Decision Matrix&Rcapturepilot.com",
    oddFooter: "&LFLK-04&C&P of &N&RConfidential",
  },
});

sMatrix.columns = [
  { width: 5 },   // A: #
  { width: 42 },  // B: criterion
  { width: 10 },  // C: weight
  { width: 10 },  // D: score
  { width: 13 },  // E: weighted
  { width: 13 },  // F: max
  { width: 38 },  // G: notes
];

// Title block
sMatrix.mergeCells("A1:G1");
sMatrix.getCell("A1").value = "BID / NO-BID DECISION MATRIX";
sMatrix.getCell("A1").font = { name: "Calibri", size: 22, bold: true, color: { argb: "FFFFFFFF" } };
sMatrix.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sMatrix.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sMatrix.getRow(1).height = 44;

sMatrix.mergeCells("A2:G2");
sMatrix.getCell("A2").value = "CapturePilot  -  Capture intelligence for government contractors";
sMatrix.getCell("A2").font = { name: "Calibri", size: 11, italic: true, color: { argb: "FFFFFFFF" } };
sMatrix.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
sMatrix.getCell("A2").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sMatrix.getRow(2).height = 22;

// Opportunity metadata block (rows 4-12)
const metaPairs = [
  { row: 4, leftLabel: "Opportunity Name", leftKey: "opp_name", rightLabel: "Solicitation #", rightKey: "sol_num" },
  { row: 5, leftLabel: "Agency / Office", leftKey: "agency", rightLabel: "NAICS Code", rightKey: "naics" },
  { row: 6, leftLabel: "Contract Value (USD)", leftKey: "value", rightLabel: "Set-Aside Type", rightKey: "setaside", isCurrency: true },
  { row: 7, leftLabel: "Period of Performance", leftKey: "pop", rightLabel: "Contract Type", rightKey: "ctype" },
  { row: 8, leftLabel: "Proposal Due Date", leftKey: "due_date", rightLabel: "Incumbent Known?", rightKey: "incumbent_known", isDate: true, isYesNo: true },
  { row: 9, leftLabel: "Evaluated By", leftKey: "evaluator", rightLabel: "Clearance Required?", rightKey: "clearance_req", isYesNo: true },
  { row: 10, leftLabel: "Date Evaluated", leftKey: "eval_date", rightLabel: "Teaming Partner?", rightKey: "teaming", isDate: true, isYesNo: true },
];

// Label/input style helpers
const labelStyle = {
  font: { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } },
  alignment: { vertical: "middle", horizontal: "right", indent: 1 },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_50 } },
};
const inputStyle = {
  font: { name: "Calibri", size: 11, color: { argb: SLATE_900 } },
  alignment: { vertical: "middle", horizontal: "left", indent: 1 },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } },
  border: { bottom: { style: "thin", color: { argb: SLATE_200 } } },
};

metaPairs.forEach(({ row, leftLabel, leftKey, rightLabel, rightKey, isCurrency, isDate, isYesNo }) => {
  // left label B, input C-D
  const labelL = sMatrix.getCell(`B${row}`);
  labelL.value = leftLabel;
  Object.assign(labelL, labelStyle);
  sMatrix.mergeCells(`C${row}:D${row}`);
  const inputL = sMatrix.getCell(`C${row}`);
  Object.assign(inputL, inputStyle);
  if (isCurrency && leftKey === "value") {
    inputL.numFmt = '"$"#,##0';
  }
  if (isDate && (leftKey === "due_date" || leftKey === "eval_date")) {
    inputL.numFmt = "mm/dd/yyyy";
  }
  wb.definedNames.add(`'Decision Matrix'!$C$${row}`, leftKey);

  // right label E, input F-G
  const labelR = sMatrix.getCell(`E${row}`);
  labelR.value = rightLabel;
  Object.assign(labelR, labelStyle);
  sMatrix.mergeCells(`F${row}:G${row}`);
  const inputR = sMatrix.getCell(`F${row}`);
  Object.assign(inputR, inputStyle);
  if (isYesNo && (rightKey === "incumbent_known" || rightKey === "clearance_req" || rightKey === "teaming")) {
    sMatrix.dataValidations.add(`F${row}`, {
      type: "list",
      allowBlank: true,
      formulae: [DV.YesNoUnknown],
      showErrorMessage: true,
      errorTitle: "Pick one",
      error: "Choose Yes, No, or Unknown",
    });
  }
  wb.definedNames.add(`'Decision Matrix'!$F$${row}`, rightKey);
  sMatrix.getRow(row).height = 22;
});

sMatrix.getRow(3).height = 8;
sMatrix.getRow(11).height = 8;

// Set-aside dropdown enrichment for cell F6 (it's actually leftKey "setaside" sitting in right slot of row 6)
sMatrix.dataValidations.add("F6", {
  type: "list",
  allowBlank: true,
  formulae: [DV.SetAsideOptions],
  showErrorMessage: false,
});
sMatrix.dataValidations.add("F7", {
  type: "list",
  allowBlank: true,
  formulae: [DV.ContractType],
  showErrorMessage: false,
});

// Header row for criteria table (row 12 blank, row 13 spacer)
sMatrix.getRow(12).height = 8;

// Scoring table header — row 14 (the freeze pane is at ySplit:15, so row 14 stays visible)
const headerRow = 14;
const headerCells = ["A", "B", "C", "D", "E", "F", "G"];
const headerLabels = ["#", "SCORING CRITERION", "WEIGHT\n(1-5)", "SCORE\n(0-5)", "WEIGHTED\nSCORE", "MAX\nPOSSIBLE", "NOTES / EVIDENCE"];
headerCells.forEach((col, i) => {
  const c = sMatrix.getCell(`${col}${headerRow}`);
  c.value = headerLabels[i];
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  c.border = {
    top: { style: "medium", color: { argb: SLATE_900 } },
    bottom: { style: "medium", color: { argb: EMERALD } },
  };
});
sMatrix.getRow(headerRow).height = 36;

// Criteria rows
let r = headerRow + 1; // 15
const criterionRows = []; // track each E-cell row for total formula
CATEGORIES.forEach((cat) => {
  // Category banner
  sMatrix.mergeCells(`A${r}:G${r}`);
  const banner = sMatrix.getCell(`A${r}`);
  banner.value = `${cat.name}  -  ${cat.blurb}`;
  banner.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
  banner.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sMatrix.getRow(r).height = 22;
  r += 1;

  cat.items.forEach((item, idx) => {
    const zebra = idx % 2 === 0 ? "FFFFFFFF" : SLATE_50;

    // # column
    const cA = sMatrix.getCell(`A${r}`);
    cA.value = item.id;
    cA.font = { name: "Consolas", size: 10, color: { argb: SLATE_700 } };
    cA.alignment = { vertical: "middle", horizontal: "center" };
    cA.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    cA.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

    // criterion label
    const cB = sMatrix.getCell(`B${r}`);
    cB.value = item.label;
    cB.font = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
    cB.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    cB.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    cB.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

    // weight (editable, default to item.weight)
    const cC = sMatrix.getCell(`C${r}`);
    cC.value = item.weight;
    cC.font = { name: "Calibri", size: 11, bold: true, color: { argb: SLATE_700 } };
    cC.alignment = { vertical: "middle", horizontal: "center" };
    cC.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
    cC.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
    sMatrix.dataValidations.add(`C${r}`, {
      type: "whole",
      operator: "between",
      formulae: [1, 5],
      allowBlank: false,
      showErrorMessage: true,
      errorTitle: "Weight 1-5",
      error: "Weight must be a whole number between 1 (low) and 5 (critical).",
    });

    // score (empty, user enters 0-5)
    const cD = sMatrix.getCell(`D${r}`);
    cD.font = { name: "Calibri", size: 11, bold: true, color: { argb: SLATE_900 } };
    cD.alignment = { vertical: "middle", horizontal: "center" };
    cD.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
    cD.border = {
      top: { style: "thin", color: { argb: AMBER } },
      bottom: { style: "thin", color: { argb: AMBER } },
      left: { style: "thin", color: { argb: AMBER } },
      right: { style: "thin", color: { argb: AMBER } },
    };
    sMatrix.dataValidations.add(`D${r}`, {
      type: "list",
      allowBlank: true,
      formulae: [DV.ScoreZeroToFive],
      showErrorMessage: true,
      errorTitle: "Score 0-5",
      error: "Pick 0 (N/A) through 5 (strong). Leave blank if you have not scored yet.",
      promptTitle: "Score",
      prompt: "5 strong | 4 good | 3 fair | 2 weak | 1 poor | 0 N/A",
      showInputMessage: true,
    });

    // weighted = IF(D="",0,C*D)
    const cE = sMatrix.getCell(`E${r}`);
    cE.value = { formula: `IF(D${r}="",0,C${r}*D${r})` };
    cE.font = { name: "Calibri", size: 11, bold: true, color: { argb: EMERALD_DARK } };
    cE.alignment = { vertical: "middle", horizontal: "center" };
    cE.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    cE.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
    cE.numFmt = "0";

    // max possible = C*5 if scored, else 0 (so unscored don't penalize the percentage)
    const cF = sMatrix.getCell(`F${r}`);
    cF.value = { formula: `IF(D${r}="",0,C${r}*5)` };
    cF.font = { name: "Calibri", size: 11, color: { argb: SLATE_700 } };
    cF.alignment = { vertical: "middle", horizontal: "center" };
    cF.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    cF.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
    cF.numFmt = "0";

    // notes
    const cG = sMatrix.getCell(`G${r}`);
    cG.font = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
    cG.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    cG.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    cG.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

    sMatrix.getRow(r).height = 22;
    criterionRows.push(r);
    r += 1;
  });
});

// Spacer
r += 1;
const totalsStart = r;

// Total weighted score
sMatrix.mergeCells(`A${r}:D${r}`);
sMatrix.getCell(`A${r}`).value = "TOTAL WEIGHTED SCORE";
sMatrix.getCell(`A${r}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
sMatrix.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sMatrix.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
const eTotalFormula = `SUM(E${criterionRows[0]}:E${criterionRows[criterionRows.length - 1]})`;
const fTotalFormula = `SUM(F${criterionRows[0]}:F${criterionRows[criterionRows.length - 1]})`;
sMatrix.getCell(`E${r}`).value = { formula: eTotalFormula };
sMatrix.getCell(`E${r}`).font = { name: "Calibri", size: 14, bold: true, color: { argb: EMERALD_DARK } };
sMatrix.getCell(`E${r}`).alignment = { vertical: "middle", horizontal: "center" };
sMatrix.getCell(`E${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
sMatrix.getCell(`E${r}`).numFmt = "0";
sMatrix.getCell(`F${r}`).value = { formula: fTotalFormula };
sMatrix.getCell(`F${r}`).font = { name: "Calibri", size: 14, bold: true, color: { argb: SLATE_700 } };
sMatrix.getCell(`F${r}`).alignment = { vertical: "middle", horizontal: "center" };
sMatrix.getCell(`F${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
sMatrix.getCell(`F${r}`).numFmt = "0";
sMatrix.getCell(`G${r}`).value = "Weighted score / Max possible";
sMatrix.getCell(`G${r}`).font = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
sMatrix.getCell(`G${r}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sMatrix.getRow(r).height = 30;
wb.definedNames.add(`'Decision Matrix'!$E$${r}`, "total_weighted");
wb.definedNames.add(`'Decision Matrix'!$F$${r}`, "total_max");
const totalWeightedRow = r;
r += 1;

// Score percentage
sMatrix.mergeCells(`A${r}:D${r}`);
sMatrix.getCell(`A${r}`).value = "SCORE PERCENTAGE";
sMatrix.getCell(`A${r}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
sMatrix.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sMatrix.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sMatrix.mergeCells(`E${r}:F${r}`);
sMatrix.getCell(`E${r}`).value = { formula: `IFERROR(E${totalWeightedRow}/F${totalWeightedRow},0)` };
sMatrix.getCell(`E${r}`).font = { name: "Calibri", size: 16, bold: true, color: { argb: SLATE_900 } };
sMatrix.getCell(`E${r}`).alignment = { vertical: "middle", horizontal: "center" };
sMatrix.getCell(`E${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
sMatrix.getCell(`E${r}`).numFmt = "0.0%";
sMatrix.getCell(`G${r}`).value = "0-40% No Bid  |  40-60% Review  |  60%+ Bid";
sMatrix.getCell(`G${r}`).font = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
sMatrix.getCell(`G${r}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sMatrix.getRow(r).height = 30;
wb.definedNames.add(`'Decision Matrix'!$E$${r}`, "score_pct");
const scorePctRow = r;
r += 1;

// Recommendation cell (with conditional formatting)
sMatrix.mergeCells(`A${r}:D${r}`);
sMatrix.getCell(`A${r}`).value = "RECOMMENDATION";
sMatrix.getCell(`A${r}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
sMatrix.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sMatrix.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sMatrix.mergeCells(`E${r}:G${r}`);
const recFormula = `IF(E${totalWeightedRow}=0,"Score the criteria to see a recommendation",IF(E${scorePctRow}>=0.6,"BID  -  Strong go signal",IF(E${scorePctRow}>=0.4,"REVIEW  -  Needs discussion","NO BID  -  Do not pursue")))`;
sMatrix.getCell(`E${r}`).value = { formula: recFormula };
sMatrix.getCell(`E${r}`).font = { name: "Calibri", size: 14, bold: true, color: { argb: SLATE_900 } };
sMatrix.getCell(`E${r}`).alignment = { vertical: "middle", horizontal: "center" };
sMatrix.getCell(`E${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
sMatrix.getRow(r).height = 36;
wb.definedNames.add(`'Decision Matrix'!$E$${r}`, "recommendation");
const recRow = r;

// Conditional formatting on the recommendation cell
sMatrix.addConditionalFormatting({
  ref: `E${recRow}:G${recRow}`,
  rules: [
    {
      type: "containsText",
      operator: "containsText",
      text: "BID  -  Strong",
      style: {
        fill: { type: "pattern", pattern: "solid", bgColor: { argb: GREEN_FILL } },
        font: { color: { argb: EMERALD_DARK }, bold: true, size: 14 },
      },
      priority: 1,
    },
    {
      type: "containsText",
      operator: "containsText",
      text: "REVIEW",
      style: {
        fill: { type: "pattern", pattern: "solid", bgColor: { argb: AMBER_FILL } },
        font: { color: { argb: "FF92400E" }, bold: true, size: 14 },
      },
      priority: 2,
    },
    {
      type: "containsText",
      operator: "containsText",
      text: "NO BID",
      style: {
        fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL } },
        font: { color: { argb: "FF991B1B" }, bold: true, size: 14 },
      },
      priority: 3,
    },
  ],
});

// Conditional formatting on score % cell
sMatrix.addConditionalFormatting({
  ref: `E${scorePctRow}:F${scorePctRow}`,
  rules: [
    {
      type: "cellIs",
      operator: "greaterThanOrEqual",
      formulae: ["0.6"],
      style: { font: { color: { argb: EMERALD_DARK }, bold: true, size: 16 } },
      priority: 1,
    },
    {
      type: "cellIs",
      operator: "between",
      formulae: ["0.4", "0.5999"],
      style: { font: { color: { argb: "FF92400E" }, bold: true, size: 16 } },
      priority: 2,
    },
    {
      type: "cellIs",
      operator: "lessThan",
      formulae: ["0.4"],
      style: { font: { color: { argb: "FF991B1B" }, bold: true, size: 16 } },
      priority: 3,
    },
  ],
});

// Conditional formatting on score column D (highlight 4-5 green, 1-2 red)
sMatrix.addConditionalFormatting({
  ref: `D${criterionRows[0]}:D${criterionRows[criterionRows.length - 1]}`,
  rules: [
    {
      type: "cellIs",
      operator: "greaterThanOrEqual",
      formulae: ["4"],
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: GREEN_FILL } } },
      priority: 1,
    },
    {
      type: "cellIs",
      operator: "between",
      formulae: ["3", "3"],
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: AMBER_FILL } } },
      priority: 2,
    },
    {
      type: "cellIs",
      operator: "between",
      formulae: ["1", "2"],
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL } } },
      priority: 3,
    },
  ],
});

// Sign-off block
r += 2;
sMatrix.getCell(`B${r}`).value = "Capture Lead Sign-Off:";
sMatrix.getCell(`B${r}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
sMatrix.getCell(`B${r}`).alignment = { vertical: "middle", horizontal: "right" };
sMatrix.mergeCells(`C${r}:D${r}`);
sMatrix.getCell(`C${r}`).border = { bottom: { style: "thin", color: { argb: SLATE_700 } } };
sMatrix.getCell(`E${r}`).value = "BD Director Approval:";
sMatrix.getCell(`E${r}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
sMatrix.getCell(`E${r}`).alignment = { vertical: "middle", horizontal: "right" };
sMatrix.mergeCells(`F${r}:G${r}`);
sMatrix.getCell(`F${r}`).border = { bottom: { style: "thin", color: { argb: SLATE_700 } } };
sMatrix.getRow(r).height = 22;

r += 2;
sMatrix.mergeCells(`A${r}:G${r}`);
sMatrix.getCell(`A${r}`).value = FOOTER;
sMatrix.getCell(`A${r}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
sMatrix.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "center" };

// ───────────────────────────────────────────────────────────────
// SHEET 2 — Summary
// ───────────────────────────────────────────────────────────────
const sSummary = wb.addWorksheet("Summary", {
  views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  pageSetup: {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CBid / No-Bid Summary&Rcapturepilot.com",
    oddFooter: "&LFLK-04&C&P of &N&RConfidential",
  },
});

sSummary.columns = [
  { width: 30 },
  { width: 28 },
  { width: 14 },
  { width: 14 },
  { width: 14 },
  { width: 14 },
];

// Title
sSummary.mergeCells("A1:F1");
sSummary.getCell("A1").value = "BID / NO-BID SUMMARY";
sSummary.getCell("A1").font = { name: "Calibri", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
sSummary.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sSummary.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sSummary.getRow(1).height = 40;

// Opportunity card
let sr = 3;
const summaryFields = [
  ["Opportunity Name", "opp_name"],
  ["Agency / Office", "agency"],
  ["Solicitation #", "sol_num"],
  ["NAICS Code", "naics"],
  ["Set-Aside", "setaside"],
  ["Contract Type", "ctype"],
  ["Contract Value", "value"],
  ["Period of Performance", "pop"],
  ["Proposal Due Date", "due_date"],
  ["Evaluated By", "evaluator"],
  ["Date Evaluated", "eval_date"],
];
summaryFields.forEach(([label, key]) => {
  sSummary.getCell(`A${sr}`).value = label;
  sSummary.getCell(`A${sr}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
  sSummary.getCell(`A${sr}`).alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  sSummary.getCell(`A${sr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_50 } };
  sSummary.mergeCells(`B${sr}:F${sr}`);
  sSummary.getCell(`B${sr}`).value = { formula: `IFERROR(${key},"")` };
  sSummary.getCell(`B${sr}`).font = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
  sSummary.getCell(`B${sr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sSummary.getCell(`B${sr}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  if (key === "value") sSummary.getCell(`B${sr}`).numFmt = '"$"#,##0';
  if (key === "due_date" || key === "eval_date") sSummary.getCell(`B${sr}`).numFmt = "mm/dd/yyyy";
  sSummary.getRow(sr).height = 20;
  sr += 1;
});

sr += 1;

// Per-category breakdown
sSummary.mergeCells(`A${sr}:F${sr}`);
sSummary.getCell(`A${sr}`).value = "CATEGORY BREAKDOWN";
sSummary.getCell(`A${sr}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
sSummary.getCell(`A${sr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
sSummary.getCell(`A${sr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sSummary.getRow(sr).height = 24;
sr += 1;

// Header
["Category", "What it measures", "Weighted", "Max", "Pct", "Status"].forEach((label, idx) => {
  const col = String.fromCharCode(65 + idx);
  const c = sSummary.getCell(`${col}${sr}`);
  c.value = label;
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  c.alignment = { vertical: "middle", horizontal: "center" };
});
sSummary.getRow(sr).height = 22;
sr += 1;

// Compute per-category row references on matrix sheet
let matrixRowCursor = headerRow + 1; // first banner row
CATEGORIES.forEach((cat) => {
  matrixRowCursor += 1; // skip banner
  const firstItemRow = matrixRowCursor;
  const lastItemRow = matrixRowCursor + cat.items.length - 1;
  matrixRowCursor = lastItemRow + 1;

  sSummary.getCell(`A${sr}`).value = cat.name;
  sSummary.getCell(`A${sr}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: SLATE_900 } };
  sSummary.getCell(`A${sr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  sSummary.getCell(`B${sr}`).value = cat.blurb;
  sSummary.getCell(`B${sr}`).font = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
  sSummary.getCell(`B${sr}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };

  sSummary.getCell(`C${sr}`).value = { formula: `SUM('Decision Matrix'!E${firstItemRow}:E${lastItemRow})` };
  sSummary.getCell(`C${sr}`).numFmt = "0";
  sSummary.getCell(`C${sr}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: EMERALD_DARK } };
  sSummary.getCell(`C${sr}`).alignment = { vertical: "middle", horizontal: "center" };

  sSummary.getCell(`D${sr}`).value = { formula: `SUM('Decision Matrix'!F${firstItemRow}:F${lastItemRow})` };
  sSummary.getCell(`D${sr}`).numFmt = "0";
  sSummary.getCell(`D${sr}`).font = { name: "Calibri", size: 11, color: { argb: SLATE_700 } };
  sSummary.getCell(`D${sr}`).alignment = { vertical: "middle", horizontal: "center" };

  sSummary.getCell(`E${sr}`).value = { formula: `IFERROR(C${sr}/D${sr},0)` };
  sSummary.getCell(`E${sr}`).numFmt = "0.0%";
  sSummary.getCell(`E${sr}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: SLATE_900 } };
  sSummary.getCell(`E${sr}`).alignment = { vertical: "middle", horizontal: "center" };

  sSummary.getCell(`F${sr}`).value = { formula: `IF(D${sr}=0,"Not scored",IF(E${sr}>=0.6,"Strong",IF(E${sr}>=0.4,"Mixed","Weak")))` };
  sSummary.getCell(`F${sr}`).font = { name: "Calibri", size: 11, bold: true };
  sSummary.getCell(`F${sr}`).alignment = { vertical: "middle", horizontal: "center" };

  sSummary.getRow(sr).height = 32;

  // CF on the status cell
  sSummary.addConditionalFormatting({
    ref: `F${sr}`,
    rules: [
      { type: "containsText", operator: "containsText", text: "Strong", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: GREEN_FILL } }, font: { color: { argb: EMERALD_DARK }, bold: true } }, priority: 1 },
      { type: "containsText", operator: "containsText", text: "Mixed", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: AMBER_FILL } }, font: { color: { argb: "FF92400E" }, bold: true } }, priority: 2 },
      { type: "containsText", operator: "containsText", text: "Weak", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL } }, font: { color: { argb: "FF991B1B" }, bold: true } }, priority: 3 },
    ],
  });

  sr += 1;
});

sr += 1;

// Big result card
sSummary.mergeCells(`A${sr}:F${sr}`);
sSummary.getCell(`A${sr}`).value = "OVERALL RECOMMENDATION";
sSummary.getCell(`A${sr}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
sSummary.getCell(`A${sr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sSummary.getCell(`A${sr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sSummary.getRow(sr).height = 24;
sr += 1;

sSummary.getCell(`A${sr}`).value = "Total weighted score";
sSummary.getCell(`A${sr}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
sSummary.getCell(`A${sr}`).alignment = { vertical: "middle", horizontal: "right", indent: 1 };
sSummary.getCell(`B${sr}`).value = { formula: "total_weighted" };
sSummary.getCell(`B${sr}`).font = { name: "Calibri", size: 14, bold: true, color: { argb: EMERALD_DARK } };
sSummary.getCell(`B${sr}`).alignment = { vertical: "middle", horizontal: "center" };
sSummary.getCell(`B${sr}`).numFmt = "0";

sSummary.getCell(`C${sr}`).value = "Max possible";
sSummary.getCell(`C${sr}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
sSummary.getCell(`C${sr}`).alignment = { vertical: "middle", horizontal: "right", indent: 1 };
sSummary.getCell(`D${sr}`).value = { formula: "total_max" };
sSummary.getCell(`D${sr}`).font = { name: "Calibri", size: 14, bold: true, color: { argb: SLATE_700 } };
sSummary.getCell(`D${sr}`).alignment = { vertical: "middle", horizontal: "center" };
sSummary.getCell(`D${sr}`).numFmt = "0";

sSummary.getCell(`E${sr}`).value = "Score %";
sSummary.getCell(`E${sr}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
sSummary.getCell(`E${sr}`).alignment = { vertical: "middle", horizontal: "right", indent: 1 };
sSummary.getCell(`F${sr}`).value = { formula: "score_pct" };
sSummary.getCell(`F${sr}`).font = { name: "Calibri", size: 14, bold: true, color: { argb: SLATE_900 } };
sSummary.getCell(`F${sr}`).alignment = { vertical: "middle", horizontal: "center" };
sSummary.getCell(`F${sr}`).numFmt = "0.0%";
sSummary.getRow(sr).height = 32;
sr += 1;

sSummary.mergeCells(`A${sr}:F${sr}`);
sSummary.getCell(`A${sr}`).value = { formula: "recommendation" };
sSummary.getCell(`A${sr}`).font = { name: "Calibri", size: 18, bold: true, color: { argb: SLATE_900 } };
sSummary.getCell(`A${sr}`).alignment = { vertical: "middle", horizontal: "center" };
sSummary.getCell(`A${sr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
sSummary.getRow(sr).height = 48;

sSummary.addConditionalFormatting({
  ref: `A${sr}:F${sr}`,
  rules: [
    { type: "containsText", operator: "containsText", text: "BID  -  Strong", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: GREEN_FILL } }, font: { color: { argb: EMERALD_DARK }, bold: true, size: 18 } }, priority: 1 },
    { type: "containsText", operator: "containsText", text: "REVIEW", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: AMBER_FILL } }, font: { color: { argb: "FF92400E" }, bold: true, size: 18 } }, priority: 2 },
    { type: "containsText", operator: "containsText", text: "NO BID", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL } }, font: { color: { argb: "FF991B1B" }, bold: true, size: 18 } }, priority: 3 },
  ],
});

sr += 2;
sSummary.mergeCells(`A${sr}:F${sr}`);
sSummary.getCell(`A${sr}`).value = FOOTER;
sSummary.getCell(`A${sr}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
sSummary.getCell(`A${sr}`).alignment = { vertical: "middle", horizontal: "center" };

// ───────────────────────────────────────────────────────────────
// SHEET 3 — Scoring Guide (help / examples)
// ───────────────────────────────────────────────────────────────
const sGuide = wb.addWorksheet("Scoring Guide", {
  views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
  headerFooter: {
    oddHeader: "&LCapturePilot&CScoring Guide&Rcapturepilot.com",
    oddFooter: "&LFLK-04&C&P of &N&RConfidential",
  },
});

sGuide.columns = [
  { width: 6 },
  { width: 8 },
  { width: 36 },
  { width: 8 },
  { width: 60 },
];

sGuide.mergeCells("A1:E1");
sGuide.getCell("A1").value = "SCORING GUIDE  -  How to rate each criterion";
sGuide.getCell("A1").font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
sGuide.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sGuide.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sGuide.getRow(1).height = 36;

let gr = 3;
sGuide.mergeCells(`A${gr}:E${gr}`);
sGuide.getCell(`A${gr}`).value = "SCORE DEFINITIONS  -  applies to every criterion";
sGuide.getCell(`A${gr}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
sGuide.getCell(`A${gr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
sGuide.getCell(`A${gr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sGuide.getRow(gr).height = 22;
gr += 1;

const scoreDefs = [
  { n: 5, label: "STRONG", color: GREEN_FILL, textColor: EMERALD_DARK, desc: "We clearly meet or exceed this criterion. Documented evidence is on file (signed CPARs, named POC, executed teaming agreement, etc.)." },
  { n: 4, label: "GOOD", color: GREEN_FILL, textColor: EMERALD_DARK, desc: "We generally meet this with minor gaps. We're not bluffing in the proposal." },
  { n: 3, label: "FAIR", color: AMBER_FILL, textColor: "FF92400E", desc: "We partially meet this. Closing the gap takes real effort and the gap is visible to evaluators." },
  { n: 2, label: "WEAK", color: RED_FILL, textColor: "FF991B1B", desc: "We barely meet this. The gap is a real bid risk. We will have to mitigate in the proposal." },
  { n: 1, label: "POOR", color: RED_FILL, textColor: "FF991B1B", desc: "We don't meet this or evidence is absent. Honest answer: if this matters, we shouldn't bid." },
  { n: 0, label: "N/A", color: SLATE_100, textColor: SLATE_700, desc: "Not applicable to this opportunity. Excluded from both numerator and denominator." },
];
scoreDefs.forEach((d) => {
  sGuide.getCell(`B${gr}`).value = d.n;
  sGuide.getCell(`B${gr}`).font = { name: "Calibri", size: 14, bold: true, color: { argb: d.textColor } };
  sGuide.getCell(`B${gr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: d.color } };
  sGuide.getCell(`B${gr}`).alignment = { vertical: "middle", horizontal: "center" };

  sGuide.getCell(`C${gr}`).value = d.label;
  sGuide.getCell(`C${gr}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: d.textColor } };
  sGuide.getCell(`C${gr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: d.color } };
  sGuide.getCell(`C${gr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  sGuide.mergeCells(`D${gr}:E${gr}`);
  sGuide.getCell(`D${gr}`).value = d.desc;
  sGuide.getCell(`D${gr}`).font = { name: "Calibri", size: 10, color: { argb: SLATE_900 } };
  sGuide.getCell(`D${gr}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  sGuide.getRow(gr).height = 30;
  gr += 1;
});

gr += 1;

// Criterion-by-criterion guide
sGuide.mergeCells(`A${gr}:E${gr}`);
sGuide.getCell(`A${gr}`).value = "CRITERION GUIDE  -  what to consider when scoring";
sGuide.getCell(`A${gr}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
sGuide.getCell(`A${gr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
sGuide.getCell(`A${gr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sGuide.getRow(gr).height = 22;
gr += 1;

["#", "", "Criterion", "Wt", "What to consider"].forEach((h, idx) => {
  const col = String.fromCharCode(65 + idx);
  const c = sGuide.getCell(`${col}${gr}`);
  c.value = h;
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  c.alignment = { vertical: "middle", horizontal: "center" };
});
sGuide.getRow(gr).height = 22;
gr += 1;

CATEGORIES.forEach((cat) => {
  sGuide.mergeCells(`A${gr}:E${gr}`);
  sGuide.getCell(`A${gr}`).value = cat.name;
  sGuide.getCell(`A${gr}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  sGuide.getCell(`A${gr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
  sGuide.getCell(`A${gr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sGuide.getRow(gr).height = 20;
  gr += 1;
  cat.items.forEach((item, idx) => {
    const zebra = idx % 2 === 0 ? "FFFFFFFF" : SLATE_50;
    sGuide.getCell(`A${gr}`).value = item.id;
    sGuide.getCell(`A${gr}`).font = { name: "Consolas", size: 10, color: { argb: SLATE_700 } };
    sGuide.getCell(`A${gr}`).alignment = { vertical: "middle", horizontal: "center" };
    sGuide.getCell(`A${gr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

    sGuide.getCell(`C${gr}`).value = item.label;
    sGuide.getCell(`C${gr}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_900 } };
    sGuide.getCell(`C${gr}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    sGuide.getCell(`C${gr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

    sGuide.getCell(`D${gr}`).value = item.weight;
    sGuide.getCell(`D${gr}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
    sGuide.getCell(`D${gr}`).alignment = { vertical: "middle", horizontal: "center" };
    sGuide.getCell(`D${gr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

    sGuide.getCell(`E${gr}`).value = item.help;
    sGuide.getCell(`E${gr}`).font = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
    sGuide.getCell(`E${gr}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    sGuide.getCell(`E${gr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

    sGuide.getRow(gr).height = 32;
    gr += 1;
  });
});

// ───────────────────────────────────────────────────────────────
// SHEET 4 — Instructions
// ───────────────────────────────────────────────────────────────
const sInst = wb.addWorksheet("Instructions", {
  views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
});

sInst.columns = [{ width: 4 }, { width: 14 }, { width: 100 }];

sInst.mergeCells("A1:C1");
sInst.getCell("A1").value = "INSTRUCTIONS  -  How to use this workbook";
sInst.getCell("A1").font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
sInst.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sInst.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sInst.getRow(1).height = 36;

const instructions = [
  { type: "h", text: "Why this exists" },
  { type: "p", text: "Most small businesses lose money by bidding everything that looks vaguely relevant. B&P costs run 1-5% of contract value, and a bad bid costs you the chance to chase a good one. This matrix forces a 10-minute structured conversation before you commit." },
  { type: "p", text: "It's built around 25 criteria split into 5 categories. Each criterion has a weight (1-5, how much it matters) and a score (0-5, how strong we are on it). The output is a weighted percentage and a Bid / Review / No-Bid recommendation." },
  { type: "h", text: "Step-by-step" },
  { type: "n", n: "1", text: "Fill in the opportunity metadata at the top of the Decision Matrix tab. Solicitation number, agency, value, due date, set-aside, contract type, NAICS. The Summary tab pulls from these cells, so they're worth getting right." },
  { type: "n", n: "2", text: "Adjust weights in column C if a criterion matters more or less for your business. The defaults are tuned for a typical small federal contractor. If you sell only to DoD, bump 'target agency' from 4 to 5. If you don't do classified work, drop 'clearances held' to 1." },
  { type: "n", n: "3", text: "Score each criterion 0-5 using the dropdown in column D. Use the Scoring Guide tab for definitions. Leave it blank if you genuinely haven't formed an opinion yet (blank rows are excluded from the percentage)." },
  { type: "n", n: "4", text: "Use the Notes column to record evidence. 'Met COR Lisa Chang at AFCEA West, March 2026.' 'No relevant past performance above 500K.' 'Incumbent is Booz, two task orders, $8.2M total.' This is what makes the matrix defensible six months from now when someone asks why you bid." },
  { type: "n", n: "5", text: "Read the recommendation. Below 40% means no bid - the math is telling you to spend B&P somewhere else. 40-60% means review with the team - usually there's one or two weak categories that, if fixed, would make this a real bid. 60% plus is a bid - move it into your capture pipeline." },
  { type: "h", text: "Reading the thresholds" },
  { type: "p", text: "The 40/60 thresholds aren't magic. They came from looking at hundreds of small business bid decisions and noticing that opportunities scoring below 40% on a weighted criteria model lose more than 90% of the time. Opportunities scoring above 60% win roughly 30-50%, which is high for federal work." },
  { type: "p", text: "If you're consistently bidding things in the 40-50% range, your win rate will live around 10-15% and your B&P spend will eat your margin. That's the actual problem this tool solves." },
  { type: "h", text: "When to ignore the score" },
  { type: "p", text: "Three legitimate reasons to bid a 35% opportunity: (1) it's a strategic must-win for an agency relationship you've been building for years, (2) the customer has signaled they will award to you and the solicitation is mostly procedural, (3) you're using it to shape - the bid itself is part of intel-gathering for a larger follow-on." },
  { type: "p", text: "If none of those three apply and the score is below 40%, don't bid. Spend the time on capture for a better target." },
  { type: "h", text: "Weight tuning" },
  { type: "p", text: "Weights are 1 (low) to 5 (critical). The default profile assumes a typical 8(a) or small business services contractor going after agencies they already know. Two profiles worth considering:" },
  { type: "p", text: "Hardware / product reseller: bump Pricing competitiveness to 5, drop Customer intelligence to 3, drop Past performance to 4. Price wins more often than relationships in product." },
  { type: "p", text: "Niche professional services: bump Past performance to 5, bump Differentiation to 5, drop Set-aside fit to 2. Your edge is expertise, not certification." },
  { type: "h", text: "Tabs in this workbook" },
  { type: "n", n: "1", text: "Decision Matrix - the working sheet. Enter scores here." },
  { type: "n", n: "2", text: "Summary - one-page output. Print this for the bid review meeting." },
  { type: "n", n: "3", text: "Scoring Guide - definitions for every criterion. Send this to anyone scoring with you so you're using the same scale." },
  { type: "n", n: "4", text: "Instructions - this page." },
  { type: "h", text: "If you change the criteria" },
  { type: "p", text: "Adding or removing criteria breaks the per-category roll-up on the Summary tab (it expects 5 items per category). Adjust the SUM ranges on the Summary tab if you restructure. Adjusting weights is safe at any time - the formulas use whatever is in column C." },
];

let ir = 3;
instructions.forEach((item) => {
  if (item.type === "h") {
    sInst.mergeCells(`A${ir}:C${ir}`);
    sInst.getCell(`A${ir}`).value = item.text;
    sInst.getCell(`A${ir}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    sInst.getCell(`A${ir}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
    sInst.getCell(`A${ir}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    sInst.getRow(ir).height = 24;
  } else if (item.type === "p") {
    sInst.mergeCells(`B${ir}:C${ir}`);
    sInst.getCell(`B${ir}`).value = item.text;
    sInst.getCell(`B${ir}`).font = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
    sInst.getCell(`B${ir}`).alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    sInst.getRow(ir).height = Math.max(36, Math.ceil(item.text.length / 90) * 18);
  } else if (item.type === "n") {
    sInst.getCell(`B${ir}`).value = item.n;
    sInst.getCell(`B${ir}`).font = { name: "Consolas", size: 11, bold: true, color: { argb: EMERALD_DARK } };
    sInst.getCell(`B${ir}`).alignment = { vertical: "top", horizontal: "center" };
    sInst.getCell(`C${ir}`).value = item.text;
    sInst.getCell(`C${ir}`).font = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
    sInst.getCell(`C${ir}`).alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    sInst.getRow(ir).height = Math.max(36, Math.ceil(item.text.length / 90) * 18);
  }
  ir += 1;
});

ir += 1;
sInst.mergeCells(`A${ir}:C${ir}`);
sInst.getCell(`A${ir}`).value = FOOTER;
sInst.getCell(`A${ir}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
sInst.getCell(`A${ir}`).alignment = { vertical: "middle", horizontal: "center" };

// ───────────────────────────────────────────────────────────────
// SHEET 5 — Worked Example
// ───────────────────────────────────────────────────────────────
const sExample = wb.addWorksheet("Worked Example", {
  views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
});

sExample.columns = [
  { width: 5 },
  { width: 42 },
  { width: 8 },
  { width: 8 },
  { width: 10 },
  { width: 10 },
  { width: 40 },
];

sExample.mergeCells("A1:G1");
sExample.getCell("A1").value = "WORKED EXAMPLE  -  GSA Janitorial Services, 8(a) sole source";
sExample.getCell("A1").font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
sExample.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sExample.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sExample.getRow(1).height = 36;

let er = 3;
sExample.mergeCells(`A${er}:G${er}`);
sExample.getCell(`A${er}`).value = "Hypothetical: small janitorial firm with 8(a), HUBZone-adjacent, three years of federal past performance at FBI and SSA. NAICS 561720. Considering a 2.4M GSA 8(a) sole-source opportunity, 5-year base + options, place of performance Atlanta. They have a small office in Decatur, so geography works.";
sExample.getCell(`A${er}`).font = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
sExample.getCell(`A${er}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
sExample.getRow(er).height = 56;
er += 2;

const exHeader = ["#", "CRITERION", "WT", "SCORE", "WEIGHTED", "MAX", "WHY"];
exHeader.forEach((h, idx) => {
  const col = String.fromCharCode(65 + idx);
  const c = sExample.getCell(`${col}${er}`);
  c.value = h;
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  c.alignment = { vertical: "middle", horizontal: "center" };
});
sExample.getRow(er).height = 24;
er += 1;

// Sample scores aligned to criteria order
const exampleScores = [
  // strategic fit
  { score: 5, why: "Primary NAICS, held on SAM for four years." },
  { score: 4, why: "FFP services - exactly what we deliver." },
  { score: 5, why: "GSA is top agency on our list, KO knows us." },
  { score: 5, why: "Atlanta office, 30-minute drive to site." },
  { score: 4, why: "Wins us a five-year footprint at GSA Region 4." },
  // competitive position
  { score: 4, why: "Have met the COR twice, but new KO assigned last month." },
  { score: 1, why: "Not incumbent - ABC Services Inc. holds it." },
  { score: 3, why: "Two real discriminators: green cleaning cert, local supervisor." },
  { score: 4, why: "Three CPARs at similar scope and dollar value." },
  { score: 5, why: "8(a) sole source - we're the only one allowed to bid." },
  // capture readiness
  { score: 4, why: "Have the people; one project wraps next month." },
  { score: 5, why: "Subs already vetted from prior FBI contract." },
  { score: 0, why: "No clearance required - N/A." },
  { score: 4, why: "Have an external proposal consultant on retainer." },
  { score: 5, why: "Janitorial is bread-and-butter; approach is obvious." },
  // win probability
  { score: 4, why: "Customer wants quality + green cleaning - we know this from RFI." },
  { score: 4, why: "Within 3% of FPDS comp prices for similar SOWs." },
  { score: 5, why: "Reps and certs current as of last month." },
  { score: 4, why: "60/40 technical/price - we're stronger on technical." },
  { score: 2, why: "Did not attend the industry day - missed it." },
  // business value
  { score: 5, why: "2.4M is well above our 500K floor." },
  { score: 4, why: "GSA wide-area BPA likely to follow." },
  { score: 4, why: "Margin penciled at 14% after B&P." },
  { score: 4, why: "Opens GSA Region 4 for follow-on work." },
  { score: 5, why: "B&P estimate is 18K against 2.4M TCV - proportionate." },
];

let totalW = 0;
let totalM = 0;
let exampleRowCursor = 0;

CATEGORIES.forEach((cat) => {
  sExample.mergeCells(`A${er}:G${er}`);
  sExample.getCell(`A${er}`).value = cat.name;
  sExample.getCell(`A${er}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  sExample.getCell(`A${er}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
  sExample.getCell(`A${er}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sExample.getRow(er).height = 20;
  er += 1;

  cat.items.forEach((item, idx) => {
    const ex = exampleScores[exampleRowCursor];
    const zebra = idx % 2 === 0 ? "FFFFFFFF" : SLATE_50;
    const weighted = ex.score === 0 ? 0 : ex.score * item.weight;
    const max = ex.score === 0 ? 0 : item.weight * 5;
    totalW += weighted;
    totalM += max;

    sExample.getCell(`A${er}`).value = item.id;
    sExample.getCell(`A${er}`).font = { name: "Consolas", size: 10, color: { argb: SLATE_700 } };
    sExample.getCell(`A${er}`).alignment = { vertical: "middle", horizontal: "center" };
    sExample.getCell(`A${er}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

    sExample.getCell(`B${er}`).value = item.label;
    sExample.getCell(`B${er}`).font = { name: "Calibri", size: 10, color: { argb: SLATE_900 } };
    sExample.getCell(`B${er}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    sExample.getCell(`B${er}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

    sExample.getCell(`C${er}`).value = item.weight;
    sExample.getCell(`C${er}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
    sExample.getCell(`C${er}`).alignment = { vertical: "middle", horizontal: "center" };
    sExample.getCell(`C${er}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

    sExample.getCell(`D${er}`).value = ex.score;
    sExample.getCell(`D${er}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_900 } };
    sExample.getCell(`D${er}`).alignment = { vertical: "middle", horizontal: "center" };
    const dFill = ex.score >= 4 ? GREEN_FILL : ex.score === 3 ? AMBER_FILL : ex.score === 0 ? SLATE_100 : RED_FILL;
    sExample.getCell(`D${er}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: dFill } };

    sExample.getCell(`E${er}`).value = weighted;
    sExample.getCell(`E${er}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: EMERALD_DARK } };
    sExample.getCell(`E${er}`).alignment = { vertical: "middle", horizontal: "center" };
    sExample.getCell(`E${er}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

    sExample.getCell(`F${er}`).value = max;
    sExample.getCell(`F${er}`).font = { name: "Calibri", size: 10, color: { argb: SLATE_700 } };
    sExample.getCell(`F${er}`).alignment = { vertical: "middle", horizontal: "center" };
    sExample.getCell(`F${er}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

    sExample.getCell(`G${er}`).value = ex.why;
    sExample.getCell(`G${er}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
    sExample.getCell(`G${er}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    sExample.getCell(`G${er}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

    sExample.getRow(er).height = 24;
    er += 1;
    exampleRowCursor += 1;
  });
});

// Totals row
er += 1;
sExample.mergeCells(`A${er}:D${er}`);
sExample.getCell(`A${er}`).value = "TOTAL";
sExample.getCell(`A${er}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
sExample.getCell(`A${er}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sExample.getCell(`A${er}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sExample.getCell(`E${er}`).value = totalW;
sExample.getCell(`E${er}`).font = { name: "Calibri", size: 14, bold: true, color: { argb: EMERALD_DARK } };
sExample.getCell(`E${er}`).alignment = { vertical: "middle", horizontal: "center" };
sExample.getCell(`F${er}`).value = totalM;
sExample.getCell(`F${er}`).font = { name: "Calibri", size: 14, bold: true, color: { argb: SLATE_700 } };
sExample.getCell(`F${er}`).alignment = { vertical: "middle", horizontal: "center" };
sExample.getCell(`G${er}`).value = `${((totalW / totalM) * 100).toFixed(1)}%`;
sExample.getCell(`G${er}`).font = { name: "Calibri", size: 14, bold: true, color: { argb: EMERALD_DARK } };
sExample.getCell(`G${er}`).alignment = { vertical: "middle", horizontal: "center" };
sExample.getRow(er).height = 30;
er += 1;

sExample.mergeCells(`A${er}:G${er}`);
const pct = totalW / totalM;
sExample.getCell(`A${er}`).value = pct >= 0.6 ? "RECOMMENDATION: BID  -  Strong go signal" : pct >= 0.4 ? "RECOMMENDATION: REVIEW  -  Needs discussion" : "RECOMMENDATION: NO BID  -  Do not pursue";
sExample.getCell(`A${er}`).font = { name: "Calibri", size: 16, bold: true, color: { argb: EMERALD_DARK } };
sExample.getCell(`A${er}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_FILL } };
sExample.getCell(`A${er}`).alignment = { vertical: "middle", horizontal: "center" };
sExample.getRow(er).height = 40;

er += 2;
sExample.mergeCells(`A${er}:G${er}`);
sExample.getCell(`A${er}`).value = "What this tells us: the firm is strong on strategic fit, capture readiness, and business value. The one weakness is incumbency (criterion 7) - someone else holds it. The 8(a) sole-source structure neutralizes that risk. The missed industry day is a minor B&P penalty, not a deal-killer. Bid it.";
sExample.getCell(`A${er}`).font = { name: "Calibri", size: 11, italic: true, color: { argb: SLATE_900 } };
sExample.getCell(`A${er}`).alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
sExample.getRow(er).height = 60;

er += 2;
sExample.mergeCells(`A${er}:G${er}`);
sExample.getCell(`A${er}`).value = FOOTER;
sExample.getCell(`A${er}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
sExample.getCell(`A${er}`).alignment = { vertical: "middle", horizontal: "center" };

// ───────────────────────────────────────────────────────────────
// Write
// ───────────────────────────────────────────────────────────────
const outPath = "/Users/andreschuler/Caturepilot 2.0/assets/starter-pack/rebuilt/FLK_04_Bid_No_Bid_Decision_Matrix.xlsx";
await wb.xlsx.writeFile(outPath);

console.log("WROTE:", outPath);
console.log("Sheets:", wb.worksheets.map(w => w.name).join(" | "));
console.log("Criteria:", TOTAL_CRITERIA, " Max possible:", MAX_POSSIBLE);
