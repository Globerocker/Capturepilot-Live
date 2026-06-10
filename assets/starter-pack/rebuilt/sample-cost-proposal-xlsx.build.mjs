// FLK_08_Sample_Cost_Proposal.xlsx — Worked Example Cost Proposal
// $750K FFP Professional Services, 24-month base + 2 option years
//
// Tabs: Direct Labor | Other Direct Costs | Indirect Rates | Fee | Summary | Lists
//
// Build: node assets/starter-pack/rebuilt/sample-cost-proposal-xlsx.build.mjs

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
const ExcelJS = require("/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs");

// ─── Colors ───────────────────────────────────────────────────────────────────
const EMERALD       = "FF10B981";
const EMERALD_DARK  = "FF047857";
const SLATE_50      = "FFF8FAFC";
const SLATE_100     = "FFF1F5F9";
const SLATE_200     = "FFE2E8F0";
const SLATE_700     = "FF334155";
const SLATE_900     = "FF0F172A";
const AMBER         = "FFF59E0B";
const AMBER_FILL    = "FFFEF3C7";
const GREEN_FILL    = "FFD1FAE5";
const INPUT_YELLOW  = "FFFFFBEB";
const WHITE         = "FFFFFFFF";

const FOOTER = "CapturePilot Federal Lead Kit  -  capturepilot.com  -  08 Price-to-Win Toolkit";
const WB_TITLE = "Sample Cost Proposal  —  $750K FFP Professional Services";

// ─── Deploy path ──────────────────────────────────────────────────────────────
const DEPLOY = "/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Sample_Cost_Proposal.xlsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hdr(ws, row, text, cols = "A", spanEnd = null, bgArgb = SLATE_900, fgArgb = WHITE, size = 18) {
  if (spanEnd) ws.mergeCells(`${cols}${row}:${spanEnd}${row}`);
  const c = ws.getCell(`${cols}${row}`);
  c.value = text;
  c.font = { name: "Calibri", size, bold: true, color: { argb: fgArgb } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(row).height = size === 18 ? 40 : 26;
  return c;
}

function subhdr(ws, row, text, colStart, colEnd, bg = EMERALD_DARK) {
  ws.mergeCells(`${colStart}${row}:${colEnd}${row}`);
  const c = ws.getCell(`${colStart}${row}`);
  c.value = text;
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(row).height = 22;
}

function colHdr(ws, row, labels, bgArgb = SLATE_900) {
  labels.forEach(({ col, label, align = "center" }) => {
    const c = ws.getCell(`${col}${row}`);
    c.value = label;
    c.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
    c.alignment = { vertical: "middle", horizontal: align, wrapText: true, indent: align === "left" ? 1 : 0 };
    c.border = { bottom: { style: "medium", color: { argb: EMERALD } } };
  });
  ws.getRow(row).height = 32;
}

function dataCell(ws, row, col, value, fmt = null, style = {}) {
  const c = ws.getCell(`${col}${row}`);
  c.value = value;
  if (fmt) c.numFmt = fmt;
  c.font = style.font || { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
  c.alignment = style.alignment || { vertical: "middle", horizontal: "center" };
  c.fill = style.fill || { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
  c.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  return c;
}

function inputCell(ws, row, col, value = null, fmt = null) {
  const c = ws.getCell(`${col}${row}`);
  if (value !== null) c.value = value;
  if (fmt) c.numFmt = fmt;
  c.font = { name: "Calibri", size: 11, bold: true, color: { argb: SLATE_900 } };
  c.alignment = { vertical: "middle", horizontal: "center" };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT_YELLOW } };
  c.border = {
    top:    { style: "thin", color: { argb: AMBER } },
    bottom: { style: "thin", color: { argb: AMBER } },
    left:   { style: "thin", color: { argb: AMBER } },
    right:  { style: "thin", color: { argb: AMBER } },
  };
  return c;
}

function formulaCell(ws, row, col, formula, fmt = null, bold = false, color = EMERALD_DARK) {
  const c = ws.getCell(`${col}${row}`);
  c.value = { formula };
  if (fmt) c.numFmt = fmt;
  c.font = { name: "Calibri", size: 11, bold, color: { argb: color } };
  c.alignment = { vertical: "middle", horizontal: "center" };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
  c.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  return c;
}

function labelCell(ws, row, col, text, indent = 1) {
  const c = ws.getCell(`${col}${row}`);
  c.value = text;
  c.font = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
  c.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
  c.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  return c;
}

function footerRow(ws, row, colStart, colEnd) {
  ws.mergeCells(`${colStart}${row}:${colEnd}${row}`);
  const c = ws.getCell(`${colStart}${row}`);
  c.value = FOOTER;
  c.font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
  c.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(row).height = 18;
}

function totalRow(ws, row, label, colLabel, formula, colFormula, fmt = '"$"#,##0', colEnd = null, colStart = "A") {
  if (colEnd) ws.mergeCells(`${colStart}${row}:${colLabel}${row}`);
  const lc = ws.getCell(`${colStart}${row}`);
  lc.value = label;
  lc.font = { name: "Calibri", size: 12, bold: true, color: { argb: WHITE } };
  lc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  lc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(row).height = 28;

  const fc = ws.getCell(`${colFormula}${row}`);
  fc.value = { formula };
  fc.numFmt = fmt;
  fc.font = { name: "Calibri", size: 14, bold: true, color: { argb: EMERALD_DARK } };
  fc.alignment = { vertical: "middle", horizontal: "center" };
  fc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
  fc.border = { bottom: { style: "medium", color: { argb: EMERALD } } };
}

// ─── buildListsSheet ─────────────────────────────────────────────────────────
function buildListsSheet(wb, lists) {
  let wsLists = wb.getWorksheet("Lists");
  if (!wsLists) {
    wsLists = wb.addWorksheet("Lists", { views: [{ showGridLines: false }] });
  }
  wsLists.columns = lists.map(() => ({ width: 28 }));
  const formulaMap = {};
  lists.forEach((list, colIdx) => {
    const colLetter = String.fromCharCode(65 + colIdx);
    const titleCell = wsLists.getCell(`${colLetter}1`);
    titleCell.value = list.title;
    titleCell.font = { name: "Calibri", size: 10, bold: true };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
    titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    list.items.forEach((item, itemIdx) => {
      const cell = wsLists.getCell(`${colLetter}${2 + itemIdx}`);
      cell.value = item;
      cell.font = { name: "Calibri", size: 10 };
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    });
    const lastRow = 1 + list.items.length;
    wb.definedNames.add(`Lists!$${colLetter}$2:$${colLetter}$${lastRow}`, list.name);
    formulaMap[list.name] = list.name;
  });
  wsLists.state = "veryHidden";
  return formulaMap;
}

// ─── Workbook setup ───────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
wb.creator = "CapturePilot";
wb.lastModifiedBy = "CapturePilot";
wb.created = new Date();
wb.modified = new Date();
wb.title = WB_TITLE;
wb.subject = "Sample FFP cost proposal — price-to-win reference";

// Lists must come before sheets that reference named ranges
const DV = buildListsSheet(wb, [
  { name: "YesNo",        title: "Yes / No",              items: ["Yes", "No"] },
  { name: "ContractType", title: "Contract Type",         items: ["FFP", "FFP-LOE", "T&M", "CPFF", "CPIF", "IDIQ"] },
  { name: "Period",       title: "Period",                items: ["Base Year", "Option Year 1", "Option Year 2", "All Periods"] },
  { name: "ODCCategory",  title: "ODC Category",          items: ["Travel", "Other Direct Costs", "Subcontracts", "Materials", "Equipment", "Other"] },
]);

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 1 — Direct Labor
// ═══════════════════════════════════════════════════════════════════════════════
const sDL = wb.addWorksheet("Direct Labor", {
  views: [{ state: "frozen", ySplit: 14, showGridLines: false }],
  pageSetup: {
    paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot — Sample Cost Proposal&CDirect Labor&Rcapturepilot.com",
    oddFooter: "&LFLK-08&C&P of &N&RConfidential — Do Not Distribute",
  },
});

sDL.columns = [
  { width: 3  },  // A: row #
  { width: 32 },  // B: labor category
  { width: 14 },  // C: labor grade
  { width: 13 },  // D: hours BY
  { width: 12 },  // E: rate BY
  { width: 14 },  // F: cost BY
  { width: 13 },  // G: hours OY1
  { width: 12 },  // H: rate OY1 (escalated)
  { width: 14 },  // I: cost OY1
  { width: 13 },  // J: hours OY2
  { width: 12 },  // K: rate OY2
  { width: 14 },  // L: cost OY2
  { width: 15 },  // M: total hours
  { width: 15 },  // N: total cost
];

// Title block
hdr(sDL, 1, "DIRECT LABOR COST ESTIMATE", "A", "N");
sDL.mergeCells("A2:N2");
sDL.getCell("A2").value = "Contract: Professional Services Support  —  Agency: Department of Health and Human Services (HHS/ASFR)  —  NAICS 541611";
sDL.getCell("A2").font = { name: "Calibri", size: 11, italic: true, color: { argb: WHITE } };
sDL.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
sDL.getCell("A2").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sDL.getRow(2).height = 22;

// Contract info block rows 4-8
const dlInfoRows = [
  ["Solicitation #",       "HHS-2026-ASFR-0042",     "Contract Type",    "FFP"],
  ["Contractor",           "Acme Advisory Group LLC",  "Set-Aside",       "Small Business"],
  ["Period of Performance","24 months (base) + 2×12-month option years", "Contracting Office", "HHS / OASAM"],
  ["Place of Performance", "Washington, DC (hybrid — on-site 2 days/wk)", "FAR Part",         "FAR 15.404 (Structured Fee)"],
  ["Submitted",            "2026-06-09",              "Rev",              "v1.0"],
];
dlInfoRows.forEach(([lL, vL, lR, vR], i) => {
  const r = 4 + i;
  sDL.getCell(`B${r}`).value = lL;
  sDL.getCell(`B${r}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
  sDL.getCell(`B${r}`).alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  sDL.mergeCells(`C${r}:F${r}`);
  sDL.getCell(`C${r}`).value = vL;
  sDL.getCell(`C${r}`).font = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
  sDL.getCell(`C${r}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  sDL.getCell(`H${r}`).value = lR;
  sDL.getCell(`H${r}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
  sDL.getCell(`H${r}`).alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  sDL.mergeCells(`I${r}:N${r}`);
  sDL.getCell(`I${r}`).value = vR;
  sDL.getCell(`I${r}`).font = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
  sDL.getCell(`I${r}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  sDL.getRow(r).height = 20;
});

// Escalation note row 10
sDL.mergeCells("A10:N10");
sDL.getCell("A10").value = "⚑  Escalation: OY1 rates = BY × 1.03  |  OY2 rates = BY × 1.0609 (3% COLA per FAR 52.215-14)  |  Hours are fixed across all periods for this FFP vehicle";
sDL.getCell("A10").font = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
sDL.getCell("A10").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sDL.getRow(10).height = 20;

sDL.getRow(11).height = 6; // spacer

// Period banners row 12
["A","B","C"].forEach((col, i) => {
  const titles = ["BASE YEAR (BY)  —  Months 1-24", "OPTION YEAR 1 (OY1)  —  Months 25-36", "OPTION YEAR 2 (OY2)  —  Months 37-48"];
  const starts = ["D", "G", "J"];
  const ends   = ["F", "I", "L"];
  sDL.mergeCells(`${starts[i]}12:${ends[i]}12`);
  const c = sDL.getCell(`${starts[i]}12`);
  c.value = titles[i];
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
  c.alignment = { vertical: "middle", horizontal: "center" };
  sDL.getRow(12).height = 22;
});
sDL.mergeCells("M12:N12");
const totBanner = sDL.getCell("M12");
totBanner.value = "CONTRACT TOTAL";
totBanner.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
totBanner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
totBanner.alignment = { vertical: "middle", horizontal: "center" };

// Column headers row 13
colHdr(sDL, 13, [
  { col: "A", label: "#" },
  { col: "B", label: "Labor Category / Position", align: "left" },
  { col: "C", label: "Grade / Level" },
  { col: "D", label: "Hours" },
  { col: "E", label: "Loaded Rate\n($/hr)" },
  { col: "F", label: "Cost" },
  { col: "G", label: "Hours" },
  { col: "H", label: "Loaded Rate\n($/hr)" },
  { col: "I", label: "Cost" },
  { col: "J", label: "Hours" },
  { col: "K", label: "Loaded Rate\n($/hr)" },
  { col: "L", label: "Cost" },
  { col: "M", label: "Total Hours" },
  { col: "N", label: "Total Cost" },
]);

// ─── Labor categories ─────────────────────────────────────────────────────────
// Three labor categories × three periods
// BY = 24 months, OY1 = 12 months, OY2 = 12 months
// Hours are fixed; rates escalate at 3% per option year

const laborData = [
  {
    category: "Senior Management Consultant",
    grade: "Level III (GS-14 equiv)",
    byHours: 1040,   // 50% of a 2080-hr FTE for 24 months = 1040 hrs
    byRate: 145.00,  // fully loaded rate $/hr
    note: "FAR 52.222-46 price realism anchor: GS-14 Step 5 DC locality = $57.22/hr base + fringes + OH",
  },
  {
    category: "Business Process Analyst",
    grade: "Level II (GS-12 equiv)",
    byHours: 2080,   // 1.0 FTE for 24 months = 2080 hrs
    byRate: 98.50,
    note: "GS-12 Step 5 DC locality = $38.35/hr base + fringes + OH",
  },
  {
    category: "Administrative Support Specialist",
    grade: "Level I (GS-7 equiv)",
    byHours: 520,    // 0.25 FTE for 24 months = 520 hrs
    byRate: 62.00,
    note: "GS-7 Step 5 DC locality = $24.17/hr base + fringes + OH",
  },
];

let dlRow = 14;
const dlDataRows = []; // track cost-column rows for SUMPRODUCT
laborData.forEach((lc, idx) => {
  const r = dlRow + idx;
  const zebra = idx % 2 === 0 ? WHITE : SLATE_50;

  // Row #
  dataCell(sDL, r, "A", idx + 1, null, { font: { name: "Consolas", size: 10, color: { argb: SLATE_700 } }, alignment: { vertical: "middle", horizontal: "center" }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: zebra } } });
  // Category
  labelCell(sDL, r, "B", lc.category);
  sDL.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  // Grade
  dataCell(sDL, r, "C", lc.grade, null, { font: { name: "Calibri", size: 10, color: { argb: SLATE_700 } }, alignment: { vertical: "middle", horizontal: "center" }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: zebra } } });

  // BY hours (input)
  inputCell(sDL, r, "D", lc.byHours, "#,##0");
  // BY rate (input)
  inputCell(sDL, r, "E", lc.byRate, '"$"#,##0.00');
  // BY cost = D*E
  formulaCell(sDL, r, "F", `D${r}*E${r}`, '"$"#,##0', true);

  // OY1 hours = same as BY hours (fixed scope FFP)
  formulaCell(sDL, r, "G", `D${r}`, "#,##0", false, SLATE_700);
  // OY1 rate = BY * 1.03
  formulaCell(sDL, r, "H", `E${r}*1.03`, '"$"#,##0.00', false, SLATE_700);
  // OY1 cost
  formulaCell(sDL, r, "I", `G${r}*H${r}`, '"$"#,##0', true);

  // OY2 hours = same as BY hours
  formulaCell(sDL, r, "J", `D${r}`, "#,##0", false, SLATE_700);
  // OY2 rate = BY * 1.03^2
  formulaCell(sDL, r, "K", `E${r}*1.0609`, '"$"#,##0.00', false, SLATE_700);
  // OY2 cost
  formulaCell(sDL, r, "L", `J${r}*K${r}`, '"$"#,##0', true);

  // Total hours = D+G+J
  formulaCell(sDL, r, "M", `D${r}+G${r}+J${r}`, "#,##0", true, SLATE_900);
  // Total cost = F+I+L
  formulaCell(sDL, r, "N", `F${r}+I${r}+L${r}`, '"$"#,##0', true);

  sDL.getRow(r).height = 22;
  dlDataRows.push(r);
});

dlRow = dlRow + laborData.length;

// Totals row
const totR = dlRow;
sDL.getRow(totR).height = 28;
sDL.mergeCells(`A${totR}:C${totR}`);
sDL.getCell(`A${totR}`).value = "SUBTOTAL  —  DIRECT LABOR";
sDL.getCell(`A${totR}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: WHITE } };
sDL.getCell(`A${totR}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sDL.getCell(`A${totR}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

[
  ["D", `SUM(D${dlDataRows[0]}:D${dlDataRows[dlDataRows.length-1]})`, "#,##0"],
  ["F", `SUM(F${dlDataRows[0]}:F${dlDataRows[dlDataRows.length-1]})`, '"$"#,##0'],
  ["G", `SUM(G${dlDataRows[0]}:G${dlDataRows[dlDataRows.length-1]})`, "#,##0"],
  ["I", `SUM(I${dlDataRows[0]}:I${dlDataRows[dlDataRows.length-1]})`, '"$"#,##0'],
  ["J", `SUM(J${dlDataRows[0]}:J${dlDataRows[dlDataRows.length-1]})`, "#,##0"],
  ["L", `SUM(L${dlDataRows[0]}:L${dlDataRows[dlDataRows.length-1]})`, '"$"#,##0'],
  ["M", `SUM(M${dlDataRows[0]}:M${dlDataRows[dlDataRows.length-1]})`, "#,##0"],
  ["N", `SUM(N${dlDataRows[0]}:N${dlDataRows[dlDataRows.length-1]})`, '"$"#,##0'],
].forEach(([col, formula, fmt]) => {
  const c = sDL.getCell(`${col}${totR}`);
  c.value = { formula };
  c.numFmt = fmt;
  c.font = { name: "Calibri", size: 13, bold: true, color: { argb: EMERALD_DARK } };
  c.alignment = { vertical: "middle", horizontal: "center" };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
  c.border = { top: { style: "medium", color: { argb: EMERALD } } };
});

// Named ranges for cross-sheet references
wb.definedNames.add(`'Direct Labor'!$F$${totR}`, "DL_BY");
wb.definedNames.add(`'Direct Labor'!$I$${totR}`, "DL_OY1");
wb.definedNames.add(`'Direct Labor'!$L$${totR}`, "DL_OY2");
wb.definedNames.add(`'Direct Labor'!$N$${totR}`, "DL_TOTAL");

// Notes row
const notesR = totR + 1;
sDL.mergeCells(`A${notesR}:N${notesR}`);
sDL.getCell(`A${notesR}`).value = "Note: Rates are \"fully loaded\" — base salary + fringe (34%) + overhead (62%) wrapped into a single $/hr figure per FAR 31.201-2 cost allowability. Rates do NOT include G&A or fee — those are applied on Indirect Rates tab.";
sDL.getCell(`A${notesR}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
sDL.getCell(`A${notesR}`).alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
sDL.getRow(notesR).height = 30;

footerRow(sDL, notesR + 2, "A", "N");

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 2 — Other Direct Costs (ODCs)
// ═══════════════════════════════════════════════════════════════════════════════
const sODC = wb.addWorksheet("Other Direct Costs", {
  views: [{ state: "frozen", ySplit: 9, showGridLines: false }],
  pageSetup: {
    paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot — Sample Cost Proposal&COther Direct Costs&Rcapturepilot.com",
    oddFooter: "&LFLK-08&C&P of &N&RConfidential — Do Not Distribute",
  },
});

sODC.columns = [
  { width: 3  },  // A
  { width: 30 },  // B: description
  { width: 16 },  // C: category
  { width: 10 },  // D: qty/trips
  { width: 12 },  // E: unit cost
  { width: 14 },  // F: BY cost
  { width: 14 },  // G: OY1 cost
  { width: 14 },  // H: OY2 cost
  { width: 16 },  // I: total
  { width: 36 },  // J: justification
];

hdr(sODC, 1, "OTHER DIRECT COSTS (ODCs)", "A", "J");
sDL.getRow(3).height = 6;

sDL.getRow(2).height = 22;
sODC.getRow(3).height = 6;

// Info block rows 4-5
[
  ["NOTE:", "ODCs are direct charges not attributable to labor. They must be specifically identified and justified per FAR 31.202. Each line below ties to a specific SOW task or deliverable."],
  ["Travel policy:", "Government travel rate per GSA per diem schedule (FY 2026). DC hotel cap $258/night. M&IE $79/day. Airfare coach class only per FAR 31.205-46."],
].forEach(([lbl, txt], i) => {
  const r = 4 + i;
  sODC.getCell(`B${r}`).value = lbl;
  sODC.getCell(`B${r}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
  sODC.getCell(`B${r}`).alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  sODC.mergeCells(`C${r}:J${r}`);
  sODC.getCell(`C${r}`).value = txt;
  sODC.getCell(`C${r}`).font = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
  sODC.getCell(`C${r}`).alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  sODC.getRow(r).height = 26;
});

sODC.getRow(6).height = 6;

// Period banners row 7
[["F","F","BASE YEAR"], ["G","G","OPTION YEAR 1"], ["H","H","OPTION YEAR 2"]].forEach(([s,e,lbl]) => {
  const c = sODC.getCell(`${s}7`);
  c.value = lbl;
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
  c.alignment = { vertical: "middle", horizontal: "center" };
  sODC.getRow(7).height = 22;
});
sODC.getCell("I7").value = "CONTRACT\nTOTAL";
sODC.getCell("I7").font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
sODC.getCell("I7").fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sODC.getCell("I7").alignment = { vertical: "middle", horizontal: "center", wrapText: true };

// Column headers row 8
colHdr(sODC, 8, [
  { col: "A", label: "#" },
  { col: "B", label: "Item Description", align: "left" },
  { col: "C", label: "Category" },
  { col: "D", label: "Qty / Trips" },
  { col: "E", label: "Unit Cost" },
  { col: "F", label: "BY Cost" },
  { col: "G", label: "OY1 Cost" },
  { col: "H", label: "OY2 Cost" },
  { col: "I", label: "Total" },
  { col: "J", label: "Justification / Reference", align: "left" },
]);

// ODC line items
const odcItems = [
  // category, description, qty (by), unitCost (by), oy1Mult, oy2Mult, justification
  ["Travel", "Quarterly kick-off and progress review meetings (airfare + hotel + M&IE)", 4, 650, 1.0, 1.0, "4 trips × contractor + COR at each. GSA per diem BWI-IAD corridor. FAR 31.205-46 coach class."],
  ["Travel", "Site visit to HHS program office (local day trip)", 8, 45, 1.0, 1.0, "Metro SmarTrip $4.60 each way × 8 visits BY. OY = same frequency."],
  ["Other Direct Costs", "Software licenses — MS Project Professional (annual)", 3, 560, 1.03, 1.0609, "3 licenses × project manager + 2 analysts. Vendor quote #QPR-2026-0412 on file."],
  ["Other Direct Costs", "SharePoint / O365 per-user (annual, contractor-provided)", 3, 360, 1.03, 1.0609, "3 seats × $120/user/yr. GFE not available for contractors on this task."],
  ["Materials", "Printed deliverables and binders for 4 quarterly reports", 4, 120, 1.0, 1.0, "4 reports × 10 copies each. Agency requires physical binder per CDRL A001."],
  ["Other Direct Costs", "Professional publications and reference databases", 1, 950, 1.0, 1.0, "Federal Register archive access. One annual subscription covers all staff."],
];

let odcRow = 9;
const odcDataRows = [];
odcItems.forEach((item, idx) => {
  const [cat, desc, qty, unitCost, oy1Mult, oy2Mult, just] = item;
  const r = odcRow + idx;
  const zebra = idx % 2 === 0 ? WHITE : SLATE_50;
  const fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

  dataCell(sODC, r, "A", idx + 1, null, { font: { name: "Consolas", size: 10, color: { argb: SLATE_700 } }, alignment: { vertical: "middle", horizontal: "center" }, fill });
  labelCell(sODC, r, "B", desc);
  sODC.getCell(`B${r}`).fill = fill;

  // Category dropdown
  const catC = sODC.getCell(`C${r}`);
  catC.value = cat;
  catC.font = { name: "Calibri", size: 10, color: { argb: SLATE_700 } };
  catC.alignment = { vertical: "middle", horizontal: "center" };
  catC.fill = fill;
  catC.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  sODC.dataValidations.add(`C${r}`, { type: "list", allowBlank: true, formulae: [DV.ODCCategory], showErrorMessage: false });

  inputCell(sODC, r, "D", qty, "#,##0");
  inputCell(sODC, r, "E", unitCost, '"$"#,##0.00');

  // BY cost = D*E
  formulaCell(sODC, r, "F", `D${r}*E${r}`, '"$"#,##0', true);
  // OY1 — same qty, escalated price
  formulaCell(sODC, r, "G", `D${r}*E${r}*${oy1Mult}`, '"$"#,##0', true);
  // OY2
  formulaCell(sODC, r, "H", `D${r}*E${r}*${oy2Mult}`, '"$"#,##0', true);
  // Total
  formulaCell(sODC, r, "I", `F${r}+G${r}+H${r}`, '"$"#,##0', true);

  const jc = sODC.getCell(`J${r}`);
  jc.value = just;
  jc.font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
  jc.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  jc.fill = fill;
  jc.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  sODC.getRow(r).height = 30;
  odcDataRows.push(r);
});

odcRow = odcRow + odcItems.length;
const odcTotR = odcRow;
sODC.getRow(odcTotR).height = 28;
sODC.mergeCells(`A${odcTotR}:E${odcTotR}`);
sODC.getCell(`A${odcTotR}`).value = "SUBTOTAL  —  OTHER DIRECT COSTS";
sODC.getCell(`A${odcTotR}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: WHITE } };
sODC.getCell(`A${odcTotR}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sODC.getCell(`A${odcTotR}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

["F","G","H","I"].forEach(col => {
  const c = sODC.getCell(`${col}${odcTotR}`);
  c.value = { formula: `SUM(${col}${odcDataRows[0]}:${col}${odcDataRows[odcDataRows.length-1]})` };
  c.numFmt = '"$"#,##0';
  c.font = { name: "Calibri", size: 13, bold: true, color: { argb: EMERALD_DARK } };
  c.alignment = { vertical: "middle", horizontal: "center" };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
  c.border = { top: { style: "medium", color: { argb: EMERALD } } };
});

wb.definedNames.add(`'Other Direct Costs'!$F$${odcTotR}`, "ODC_BY");
wb.definedNames.add(`'Other Direct Costs'!$G$${odcTotR}`, "ODC_OY1");
wb.definedNames.add(`'Other Direct Costs'!$H$${odcTotR}`, "ODC_OY2");
wb.definedNames.add(`'Other Direct Costs'!$I$${odcTotR}`, "ODC_TOTAL");

footerRow(sODC, odcTotR + 2, "A", "J");

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 3 — Indirect Rates
// ═══════════════════════════════════════════════════════════════════════════════
const sIR = wb.addWorksheet("Indirect Rates", {
  views: [{ state: "frozen", ySplit: 8, showGridLines: false }],
  pageSetup: {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot — Sample Cost Proposal&CIndirect Rates&Rcapturepilot.com",
    oddFooter: "&LFLK-08&C&P of &N&RConfidential — Do Not Distribute",
  },
});

sIR.columns = [
  { width: 36 },  // A: element
  { width: 16 },  // B: BY
  { width: 16 },  // C: OY1
  { width: 16 },  // D: OY2
  { width: 16 },  // E: total
  { width: 40 },  // F: notes
];

hdr(sIR, 1, "INDIRECT RATES  &  COST BUILDUP", "A", "F");
sIR.mergeCells("A2:F2");
sIR.getCell("A2").value = "Rates based on most recent DCAA-audited forward pricing rate agreement (FPRA). Final negotiated rates will govern per FAR 42.703. All pools applied to direct labor only (ODCs are not a G&A base on this contract structure).";
sIR.getCell("A2").font = { name: "Calibri", size: 10, italic: true, color: { argb: WHITE } };
sIR.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
sIR.getCell("A2").alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
sIR.getRow(2).height = 32;
sIR.getRow(3).height = 6;

// Rate table — rows 4-7 (rate definitions, editable)
subhdr(sIR, 4, "RATE DEFINITIONS  (edit these cells — formulas below will update automatically)", "A", "F", EMERALD_DARK);

colHdr(sIR, 5, [
  { col: "A", label: "Indirect Pool", align: "left" },
  { col: "B", label: "BY Rate" },
  { col: "C", label: "OY1 Rate" },
  { col: "D", label: "OY2 Rate" },
  { col: "E", label: "Base" },
  { col: "F", label: "FAR Reference / Audit Authority", align: "left" },
]);

const rateData = [
  ["Fringe Benefits",          0.34,  0.35,  0.36, "Direct Labor", "FAR 31.205-6(m). DCAA audit report #2025-001. Covers FICA, medical, dental, vision, 401(k) match, PTO, holidays."],
  ["Overhead (Facilities)",    0.62,  0.63,  0.64, "Direct Labor + Fringe", "FAR 31.203. Pools indirect facilities costs: rent, utilities, IT infrastructure, equipment depreciation."],
  ["G&A (General & Admin)",    0.15,  0.15,  0.15, "Total Cost Input (TCI)", "FAR 31.203(d). Applied to TCI (DL + fringe + OH + ODC) — captures executive salaries, accounting, BD costs."],
];

let irRow = 6;
const rateRows = {}; // store row numbers for formula references
rateData.forEach((rd, idx) => {
  const [pool, byR, oy1R, oy2R, base, far] = rd;
  const r = irRow + idx;
  const zebra = idx % 2 === 0 ? WHITE : SLATE_50;

  sIR.getCell(`A${r}`).value = pool;
  sIR.getCell(`A${r}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: SLATE_900 } };
  sIR.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "left", indent: 2 };
  sIR.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  sIR.getCell(`A${r}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  inputCell(sIR, r, "B", byR, "0.00%");
  inputCell(sIR, r, "C", oy1R, "0.00%");
  inputCell(sIR, r, "D", oy2R, "0.00%");

  sIR.getCell(`E${r}`).value = base;
  sIR.getCell(`E${r}`).font = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
  sIR.getCell(`E${r}`).alignment = { vertical: "middle", horizontal: "center" };
  sIR.getCell(`E${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  sIR.getCell(`E${r}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  sIR.getCell(`F${r}`).value = far;
  sIR.getCell(`F${r}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
  sIR.getCell(`F${r}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  sIR.getCell(`F${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  sIR.getCell(`F${r}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  sIR.getRow(r).height = 32;
  rateRows[pool.split(" ")[0]] = r;
});

// Row numbers for rates
const rFringe = 6;      // row 6 = Fringe
const rOH     = 7;      // row 7 = Overhead
const rGA     = 8;      // row 8 = G&A

// Named ranges for rate cells
wb.definedNames.add(`'Indirect Rates'!$B$${rFringe}`, "RATE_FRINGE_BY");
wb.definedNames.add(`'Indirect Rates'!$C$${rFringe}`, "RATE_FRINGE_OY1");
wb.definedNames.add(`'Indirect Rates'!$D$${rFringe}`, "RATE_FRINGE_OY2");
wb.definedNames.add(`'Indirect Rates'!$B$${rOH}`,     "RATE_OH_BY");
wb.definedNames.add(`'Indirect Rates'!$C$${rOH}`,     "RATE_OH_OY1");
wb.definedNames.add(`'Indirect Rates'!$D$${rOH}`,     "RATE_OH_OY2");
wb.definedNames.add(`'Indirect Rates'!$B$${rGA}`,     "RATE_GA_BY");

irRow = rGA + 2; // skip a row after rate table

// Cost buildup section
subhdr(sIR, irRow, "COST BUILDUP BY PERIOD  (all formulas reference Direct Labor and ODC named ranges)", "A", "F");
irRow++;

colHdr(sIR, irRow, [
  { col: "A", label: "Cost Element", align: "left" },
  { col: "B", label: "Base Year" },
  { col: "C", label: "Option Year 1" },
  { col: "D", label: "Option Year 2" },
  { col: "E", label: "Contract Total" },
  { col: "F", label: "Notes", align: "left" },
]);
irRow++;

// Build up rows: DL, Fringe, OH, ODC, G&A base, G&A, Total Before Fee
const buildupRows = {}; // name -> row number

const buildupDef = [
  {
    key: "DL",
    label: "Direct Labor",
    by:   "DL_BY",
    oy1:  "DL_OY1",
    oy2:  "DL_OY2",
    note: "From Direct Labor tab — SUMPRODUCT of hours × fully-loaded rate per labor category",
  },
  {
    key: "Fringe",
    label: "Fringe Benefits",
    byF:  (r) => `B${buildupRows.DL}*RATE_FRINGE_BY`,
    oy1F: (r) => `C${buildupRows.DL}*RATE_FRINGE_OY1`,
    oy2F: (r) => `D${buildupRows.DL}*RATE_FRINGE_OY2`,
    note: `DL × fringe rate (B${rFringe}/C${rFringe}/D${rFringe}). FAR 31.205-6(m).`,
  },
  {
    key: "OH",
    label: "Overhead",
    byF:  () => `(B${buildupRows.DL}+B${buildupRows.Fringe})*RATE_OH_BY`,
    oy1F: () => `(C${buildupRows.DL}+C${buildupRows.Fringe})*RATE_OH_OY1`,
    oy2F: () => `(D${buildupRows.DL}+D${buildupRows.Fringe})*RATE_OH_OY2`,
    note: `(DL + Fringe) × overhead rate. Pool covers facilities, IT, equipment.`,
  },
  {
    key: "ODC",
    label: "Other Direct Costs",
    by:   "ODC_BY",
    oy1:  "ODC_OY1",
    oy2:  "ODC_OY2",
    note: "From ODC tab — travel, software, materials. All individually justified.",
  },
  {
    key: "GA",
    label: "G&A (applied to TCI)",
    byF:  () => `(B${buildupRows.DL}+B${buildupRows.Fringe}+B${buildupRows.OH}+B${buildupRows.ODC})*RATE_GA_BY`,
    oy1F: () => `(C${buildupRows.DL}+C${buildupRows.Fringe}+C${buildupRows.OH}+C${buildupRows.ODC})*RATE_GA_BY`,
    oy2F: () => `(D${buildupRows.DL}+D${buildupRows.Fringe}+D${buildupRows.OH}+D${buildupRows.ODC})*RATE_GA_BY`,
    note: `G&A rate (${rGA}) × Total Cost Input (DL+Fringe+OH+ODC). FAR 31.203(d).`,
  },
];

buildupDef.forEach((bd, idx) => {
  const r = irRow + idx;
  buildupRows[bd.key] = r;
  const zebra = idx % 2 === 0 ? WHITE : SLATE_50;

  sIR.getCell(`A${r}`).value = bd.label;
  sIR.getCell(`A${r}`).font = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
  sIR.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "left", indent: 2 };
  sIR.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  sIR.getCell(`A${r}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  ["B","C","D"].forEach((col, pi) => {
    const periods = ["BY","OY1","OY2"];
    const c = sIR.getCell(`${col}${r}`);
    if (bd[periods[pi].toLowerCase()]) {
      // Named range reference
      c.value = { formula: bd[periods[pi].toLowerCase()] };
    } else if (bd[`${periods[pi].toLowerCase()}F`]) {
      c.value = { formula: bd[`${periods[pi].toLowerCase()}F`](r) };
    }
    c.numFmt = '"$"#,##0';
    c.font = { name: "Calibri", size: 11, bold: false, color: { argb: EMERALD_DARK } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    c.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  });

  // Total = B+C+D
  const tc = sIR.getCell(`E${r}`);
  tc.value = { formula: `B${r}+C${r}+D${r}` };
  tc.numFmt = '"$"#,##0';
  tc.font = { name: "Calibri", size: 11, bold: true, color: { argb: SLATE_900 } };
  tc.alignment = { vertical: "middle", horizontal: "center" };
  tc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  tc.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  const nc = sIR.getCell(`F${r}`);
  nc.value = bd.note;
  nc.font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
  nc.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  nc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  nc.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  sIR.getRow(r).height = 26;
});

irRow += buildupDef.length;

// Total Cost Before Fee row
const tcbfR = irRow;
sIR.getCell(`A${tcbfR}`).value = "TOTAL COST BEFORE FEE";
sIR.getCell(`A${tcbfR}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: WHITE } };
sIR.getCell(`A${tcbfR}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sIR.getCell(`A${tcbfR}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sIR.getRow(tcbfR).height = 28;

["B","C","D","E"].forEach(col => {
  const c = sIR.getCell(`${col}${tcbfR}`);
  const firstRow = buildupRows.DL;
  const lastRow  = buildupRows.GA;
  c.value = { formula: `SUM(${col}${firstRow}:${col}${lastRow})` };
  c.numFmt = '"$"#,##0';
  c.font = { name: "Calibri", size: 13, bold: true, color: { argb: EMERALD_DARK } };
  c.alignment = { vertical: "middle", horizontal: "center" };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
  c.border = { top: { style: "medium", color: { argb: EMERALD } } };
});

wb.definedNames.add(`'Indirect Rates'!$B$${tcbfR}`, "TCBF_BY");
wb.definedNames.add(`'Indirect Rates'!$C$${tcbfR}`, "TCBF_OY1");
wb.definedNames.add(`'Indirect Rates'!$D$${tcbfR}`, "TCBF_OY2");
wb.definedNames.add(`'Indirect Rates'!$E$${tcbfR}`, "TCBF_TOTAL");

footerRow(sIR, tcbfR + 2, "A", "F");

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 4 — Fee
// ═══════════════════════════════════════════════════════════════════════════════
const sFee = wb.addWorksheet("Fee", {
  views: [{ state: "frozen", ySplit: 6, showGridLines: false }],
  pageSetup: {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot — Sample Cost Proposal&CFee Computation&Rcapturepilot.com",
    oddFooter: "&LFLK-08&C&P of &N&RConfidential — Do Not Distribute",
  },
});

sFee.columns = [
  { width: 36 },
  { width: 16 },
  { width: 16 },
  { width: 16 },
  { width: 16 },
  { width: 40 },
];

hdr(sFee, 1, "FEE COMPUTATION  —  8% FIXED FEE", "A", "F");
sFee.mergeCells("A2:F2");
sFee.getCell("A2").value = "Fixed fee (profit) applied at 8% of total estimated cost (DL + indirect costs). Per DFARS 215.404-4, DoD weighted guidelines suggest 8-10% for low-risk FFP professional services. DCAA will not audit fee — it's negotiated, not cost-justified.";
sFee.getCell("A2").font = { name: "Calibri", size: 10, italic: true, color: { argb: WHITE } };
sFee.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
sFee.getCell("A2").alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
sFee.getRow(2).height = 36;
sFee.getRow(3).height = 6;

colHdr(sFee, 4, [
  { col: "A", label: "Fee Element", align: "left" },
  { col: "B", label: "Base Year" },
  { col: "C", label: "Option Year 1" },
  { col: "D", label: "Option Year 2" },
  { col: "E", label: "Contract Total" },
  { col: "F", label: "Notes", align: "left" },
]);

// Fee rate row 5 — editable
const feeRateRow = 5;
sFee.getCell(`A${feeRateRow}`).value = "Fee Rate (edit to adjust)";
sFee.getCell(`A${feeRateRow}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: SLATE_900 } };
sFee.getCell(`A${feeRateRow}`).alignment = { vertical: "middle", horizontal: "left", indent: 2 };
sFee.getCell(`A${feeRateRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_50 } };
sFee.getCell(`A${feeRateRow}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
inputCell(sFee, feeRateRow, "B", 0.08, "0.00%");
// OY1 and OY2 reference the same rate cell (all years same fee)
sFee.getCell(`C${feeRateRow}`).value = { formula: `B${feeRateRow}` };
sFee.getCell(`C${feeRateRow}`).numFmt = "0.00%";
sFee.getCell(`C${feeRateRow}`).font = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
sFee.getCell(`C${feeRateRow}`).alignment = { vertical: "middle", horizontal: "center" };
sFee.getCell(`C${feeRateRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
sFee.getCell(`D${feeRateRow}`).value = { formula: `B${feeRateRow}` };
sFee.getCell(`D${feeRateRow}`).numFmt = "0.00%";
sFee.getCell(`D${feeRateRow}`).font = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
sFee.getCell(`D${feeRateRow}`).alignment = { vertical: "middle", horizontal: "center" };
sFee.getCell(`D${feeRateRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
sFee.getCell(`F${feeRateRow}`).value = "Edit column B only. OY1 and OY2 inherit same rate. Defensible range for FFP professional services: 7-12% (DFARS 215.404-4).";
sFee.getCell(`F${feeRateRow}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
sFee.getCell(`F${feeRateRow}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
sFee.getCell(`F${feeRateRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_50 } };
sFee.getRow(feeRateRow).height = 26;

wb.definedNames.add(`'Fee'!$B$${feeRateRow}`, "FEE_RATE");

// Fee amount row 6
const feeAmtRow = 6;
sFee.getCell(`A${feeAmtRow}`).value = "Fee Amount (TCBF × Fee Rate)";
sFee.getCell(`A${feeAmtRow}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: SLATE_900 } };
sFee.getCell(`A${feeAmtRow}`).alignment = { vertical: "middle", horizontal: "left", indent: 2 };
sFee.getCell(`A${feeAmtRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
sFee.getCell(`A${feeAmtRow}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

[
  ["B", "TCBF_BY*FEE_RATE"],
  ["C", "TCBF_OY1*FEE_RATE"],
  ["D", "TCBF_OY2*FEE_RATE"],
].forEach(([col, formula]) => {
  formulaCell(sFee, feeAmtRow, col, formula, '"$"#,##0', true);
});
formulaCell(sFee, feeAmtRow, "E", `B${feeAmtRow}+C${feeAmtRow}+D${feeAmtRow}`, '"$"#,##0', true);
sFee.getCell(`F${feeAmtRow}`).value = "Computed as TCBF (from Indirect Rates tab) × fee rate above. On FFP you lock this number at award — it doesn't float with actuals.";
sFee.getCell(`F${feeAmtRow}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
sFee.getCell(`F${feeAmtRow}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
sFee.getCell(`F${feeAmtRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
sFee.getRow(feeAmtRow).height = 26;

wb.definedNames.add(`'Fee'!$B$${feeAmtRow}`, "FEE_BY");
wb.definedNames.add(`'Fee'!$C$${feeAmtRow}`, "FEE_OY1");
wb.definedNames.add(`'Fee'!$D$${feeAmtRow}`, "FEE_OY2");
wb.definedNames.add(`'Fee'!$E$${feeAmtRow}`, "FEE_TOTAL");

// Total price row 7
const totPriceRow = 7;
sFee.getCell(`A${totPriceRow}`).value = "TOTAL PROPOSED PRICE  (TCBF + Fee)";
sFee.getCell(`A${totPriceRow}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: WHITE } };
sFee.getCell(`A${totPriceRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sFee.getCell(`A${totPriceRow}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sFee.getRow(totPriceRow).height = 32;

[
  ["B", "TCBF_BY+FEE_BY"],
  ["C", "TCBF_OY1+FEE_OY1"],
  ["D", "TCBF_OY2+FEE_OY2"],
  ["E", "TCBF_TOTAL+FEE_TOTAL"],
].forEach(([col, formula]) => {
  const c = sFee.getCell(`${col}${totPriceRow}`);
  c.value = { formula };
  c.numFmt = '"$"#,##0';
  c.font = { name: "Calibri", size: 14, bold: true, color: { argb: EMERALD_DARK } };
  c.alignment = { vertical: "middle", horizontal: "center" };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
  c.border = { top: { style: "medium", color: { argb: EMERALD } } };
});
sFee.getCell(`F${totPriceRow}`).value = "This is the number that goes on Section B of the SF 1449 / SF 33 and your Cover Page. Verify it's within ±5% of your PTW estimate before submitting.";
sFee.getCell(`F${totPriceRow}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
sFee.getCell(`F${totPriceRow}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
sFee.getCell(`F${totPriceRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };

wb.definedNames.add(`'Fee'!$B$${totPriceRow}`, "PRICE_BY");
wb.definedNames.add(`'Fee'!$C$${totPriceRow}`, "PRICE_OY1");
wb.definedNames.add(`'Fee'!$D$${totPriceRow}`, "PRICE_OY2");
wb.definedNames.add(`'Fee'!$E$${totPriceRow}`, "PRICE_TOTAL");

// Sanity check row
const sanityRow = 9;
sFee.mergeCells(`A${sanityRow}:F${sanityRow}`);
sFee.getCell(`A${sanityRow}`).value = "SANITY CHECK  —  Total proposed price above should be near $750,000. If it's significantly off, review your hours or rates on the Direct Labor tab.";
sFee.getCell(`A${sanityRow}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF92400E" } };
sFee.getCell(`A${sanityRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBER_FILL } };
sFee.getCell(`A${sanityRow}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sFee.getRow(sanityRow).height = 26;

footerRow(sFee, sanityRow + 2, "A", "F");

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 5 — Summary
// ═══════════════════════════════════════════════════════════════════════════════
const sSumm = wb.addWorksheet("Summary", {
  views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  pageSetup: {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot — Sample Cost Proposal&CSummary&Rcapturepilot.com",
    oddFooter: "&LFLK-08&C&P of &N&RConfidential — Do Not Distribute",
  },
});

sSumm.columns = [
  { width: 32 },  // A: element
  { width: 16 },  // B: BY
  { width: 16 },  // C: OY1
  { width: 16 },  // D: OY2
  { width: 16 },  // E: total
  { width: 12 },  // F: % of total
];

hdr(sSumm, 1, "COST PROPOSAL SUMMARY  —  SF 1411 FORMAT", "A", "F");
sSumm.mergeCells("A2:F2");
sSumm.getCell("A2").value = "Professional Services Support  |  HHS-2026-ASFR-0042  |  Acme Advisory Group LLC  |  24-month base + 2 option years";
sSumm.getCell("A2").font = { name: "Calibri", size: 10, italic: true, color: { argb: WHITE } };
sSumm.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
sSumm.getCell("A2").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sSumm.getRow(2).height = 22;
sSumm.getRow(3).height = 6;

colHdr(sSumm, 4, [
  { col: "A", label: "Cost Element", align: "left" },
  { col: "B", label: "Base Year" },
  { col: "C", label: "Option Year 1" },
  { col: "D", label: "Option Year 2" },
  { col: "E", label: "Contract Total" },
  { col: "F", label: "% of Price" },
]);

const summLines = [
  { label: "Direct Labor",           by: "DL_BY",      oy1: "DL_OY1",    oy2: "DL_OY2",    tot: "DL_TOTAL"    },
  { label: "Fringe Benefits",        byF: (r) => `'Indirect Rates'!B${buildupRows.Fringe}`, oy1F: (r) => `'Indirect Rates'!C${buildupRows.Fringe}`, oy2F: (r) => `'Indirect Rates'!D${buildupRows.Fringe}` },
  { label: "Overhead",               byF: (r) => `'Indirect Rates'!B${buildupRows.OH}`,     oy1F: (r) => `'Indirect Rates'!C${buildupRows.OH}`,     oy2F: (r) => `'Indirect Rates'!D${buildupRows.OH}`     },
  { label: "Other Direct Costs",     by: "ODC_BY",     oy1: "ODC_OY1",   oy2: "ODC_OY2",   tot: "ODC_TOTAL"   },
  { label: "G&A",                    byF: (r) => `'Indirect Rates'!B${buildupRows.GA}`,     oy1F: (r) => `'Indirect Rates'!C${buildupRows.GA}`,     oy2F: (r) => `'Indirect Rates'!D${buildupRows.GA}`     },
  { label: "Total Cost Before Fee",  by: "TCBF_BY",    oy1: "TCBF_OY1",  oy2: "TCBF_OY2",  tot: "TCBF_TOTAL", bold: true },
  { label: "Fee (8%)",               by: "FEE_BY",     oy1: "FEE_OY1",   oy2: "FEE_OY2",   tot: "FEE_TOTAL"   },
  { label: "TOTAL PROPOSED PRICE",   by: "PRICE_BY",   oy1: "PRICE_OY1", oy2: "PRICE_OY2", tot: "PRICE_TOTAL", isTotalPrice: true },
];

let summRow = 5;
const summPriceRow = summRow + summLines.findIndex(l => l.isTotalPrice);

summLines.forEach((line, idx) => {
  const r = summRow + idx;
  const zebra = idx % 2 === 0 ? WHITE : SLATE_50;
  const fill = { type: "pattern", pattern: "solid", fgColor: { argb: line.isTotalPrice ? SLATE_900 : zebra } };
  const fntColor = line.isTotalPrice ? WHITE : (line.bold ? SLATE_900 : SLATE_900);

  sSumm.getCell(`A${r}`).value = line.label;
  sSumm.getCell(`A${r}`).font = { name: "Calibri", size: 11, bold: !!line.bold || !!line.isTotalPrice, color: { argb: fntColor } };
  sSumm.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "left", indent: line.isTotalPrice ? 1 : 2 };
  sSumm.getCell(`A${r}`).fill = fill;
  sSumm.getCell(`A${r}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  sSumm.getRow(r).height = line.isTotalPrice ? 32 : 24;

  ["B","C","D","E"].forEach((col, pi) => {
    const periods = ["by","oy1","oy2","tot"];
    const pF = ["byF","oy1F","oy2F","totF"];
    const c = sSumm.getCell(`${col}${r}`);
    let formula;
    if (col === "E" && line.tot) {
      formula = line.tot;
    } else if (col === "E" && !line.tot) {
      formula = `B${r}+C${r}+D${r}`;
    } else if (line[periods[pi]]) {
      formula = line[periods[pi]];
    } else if (line[pF[pi]]) {
      formula = line[pF[pi]](r);
    }
    if (formula) c.value = { formula };
    c.numFmt = '"$"#,##0';
    c.font = { name: "Calibri", size: line.isTotalPrice ? 13 : 11, bold: !!line.bold || !!line.isTotalPrice, color: { argb: line.isTotalPrice ? EMERALD_DARK : (line.bold ? SLATE_900 : EMERALD_DARK) } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.fill = line.isTotalPrice ? { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } } : fill;
    c.border = line.isTotalPrice ? { top: { style: "medium", color: { argb: EMERALD } } } : { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  });

  // % of total price = E / PRICE_TOTAL
  const pctC = sSumm.getCell(`F${r}`);
  if (!line.isTotalPrice) {
    pctC.value = { formula: `IFERROR(E${r}/PRICE_TOTAL,0)` };
    pctC.numFmt = "0.0%";
    pctC.font = { name: "Calibri", size: 10, color: { argb: SLATE_700 } };
    pctC.alignment = { vertical: "middle", horizontal: "center" };
    pctC.fill = fill;
    pctC.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  } else {
    pctC.value = "100.0%";
    pctC.numFmt = "0.0%";
    pctC.font = { name: "Calibri", size: 12, bold: true, color: { argb: EMERALD_DARK } };
    pctC.alignment = { vertical: "middle", horizontal: "center" };
    pctC.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
    pctC.border = { top: { style: "medium", color: { argb: EMERALD } } };
  }
});

summRow += summLines.length + 1;

// Cost-share table (for cost-sharing contracts — reference only, N/A for this FFP)
subhdr(sSumm, summRow, "COST-SHARE REFERENCE TABLE  (N/A for this FFP — shown for cost-plus reference)", "A", "F", SLATE_700);
summRow++;

colHdr(sSumm, summRow, [
  { col: "A", label: "Scenario", align: "left" },
  { col: "B", label: "Gov't Share" },
  { col: "C", label: "Contractor Share" },
  { col: "D", label: "Gov't Dollar Amount" },
  { col: "E", label: "Contractor Dollar Amount" },
  { col: "F", label: "Note", align: "left" },
], SLATE_700);
summRow++;

const shareScenarios = [
  ["No cost-sharing (standard FFP)",           "100%", "0%",  `PRICE_TOTAL`,      `0`,                  "Standard FFP — contractor bears all cost risk above ceiling price."],
  ["20% contractor cost-share (SBIR Phase II)", "80%",  "20%", `PRICE_TOTAL*0.8`,  `PRICE_TOTAL*0.2`,    "Common in SBIR Phase II (FAR 35.003, SBA SBIR Policy Directive §4(a))."],
  ["50/50 cost-share (R&D partnership)",        "50%",  "50%", `PRICE_TOTAL*0.5`,  `PRICE_TOTAL*0.5`,    "DOE and NSF sometimes require 50/50 for commercialization programs."],
];

shareScenarios.forEach((sc, idx) => {
  const r = summRow + idx;
  const zebra = idx % 2 === 0 ? WHITE : SLATE_50;
  const fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };

  sSumm.getCell(`A${r}`).value = sc[0];
  sSumm.getCell(`A${r}`).font = { name: "Calibri", size: 10, color: { argb: SLATE_900 } };
  sSumm.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sSumm.getCell(`A${r}`).fill = fill;
  sSumm.getCell(`A${r}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  ["B","C"].forEach((col, i) => {
    const c = sSumm.getCell(`${col}${r}`);
    c.value = sc[1 + i];
    c.numFmt = "0%";
    c.font = { name: "Calibri", size: 10, color: { argb: SLATE_700 } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.fill = fill;
    c.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  });

  ["D","E"].forEach((col, i) => {
    const c = sSumm.getCell(`${col}${r}`);
    c.value = { formula: sc[3 + i] };
    c.numFmt = '"$"#,##0';
    c.font = { name: "Calibri", size: 10, bold: false, color: { argb: EMERALD_DARK } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.fill = fill;
    c.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  });

  sSumm.getCell(`F${r}`).value = sc[5];
  sSumm.getCell(`F${r}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
  sSumm.getCell(`F${r}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  sSumm.getCell(`F${r}`).fill = fill;
  sSumm.getCell(`F${r}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  sSumm.getRow(r).height = 26;
});

summRow += shareScenarios.length + 1;
footerRow(sSumm, summRow, "A", "F");

// ─── Write file ───────────────────────────────────────────────────────────────
const outDir = path.dirname(DEPLOY);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

await wb.xlsx.writeFile(DEPLOY);
const stats = fs.statSync(DEPLOY);
console.log(`Written: ${DEPLOY}`);
console.log(`Size: ${(stats.size / 1024).toFixed(1)} KB`);
