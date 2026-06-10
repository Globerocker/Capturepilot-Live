// FLK_05_SDB_Self_Assessment.xlsx builder
// SBA Small Disadvantaged Business (SDB) self-assessment worksheet
// Mirrors the 8(a) self-assessment pattern; covers:
//   - Social disadvantage (presumed groups + individual showing)
//   - Economic disadvantage (net worth < $850K, AGI < $400K 3-yr avg)
//   - Unconditional ownership (51%+) and control
//   - Size standard per NAICS (SBA Table of Size Standards)
// Tabs: Inputs, Checklist, Calc, Output, Help, Lists

import { createRequire } from "module";
import { mkdirSync } from "fs";
import path from "path";

const require = createRequire(import.meta.url);
const ExcelJS = require("/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs");

// ── Colors ────────────────────────────────────────────────────────
const EMERALD      = "FF10B981";
const EMERALD_DARK = "FF047857";
const EMERALD_BG   = "FFD1FAE5";
const SLATE_50     = "FFF8FAFC";
const SLATE_100    = "FFF1F5F9";
const SLATE_200    = "FFE2E8F0";
const SLATE_700    = "FF334155";
const SLATE_900    = "FF0F172A";
const AMBER        = "FFF59E0B";
const AMBER_FILL   = "FFFEF3C7";
const RED_FILL     = "FFFEE2E2";
const WHITE        = "FFFFFFFF";

const FOOTER = "CapturePilot Federal Lead Kit  –  capturepilot.com  –  FLK-05 SDB Self-Assessment";

// ── Output path ───────────────────────────────────────────────────
const DEPLOY = "/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/05_Certification_Eligibility_Worksheets/FLK_05_SDB_Self_Assessment.xlsx";
mkdirSync(path.dirname(DEPLOY), { recursive: true });

// ═══════════════════════════════════════════════════════════════════
// buildListsSheet — canonical cross-compat dropdown helper
// ═══════════════════════════════════════════════════════════════════
function buildListsSheet(wb, lists) {
  let wsLists = wb.getWorksheet("Lists");
  if (!wsLists) {
    wsLists = wb.addWorksheet("Lists", { views: [{ showGridLines: false }] });
  }
  wsLists.columns = lists.map(() => ({ width: 30 }));
  const formulaMap = {};
  lists.forEach((list, colIdx) => {
    const colLetter = String.fromCharCode(65 + colIdx);
    const titleCell = wsLists.getCell(`${colLetter}1`);
    titleCell.value = list.title;
    titleCell.font = { name: "Calibri", size: 10, bold: true };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
    titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    list.items.forEach((item, i) => {
      const cell = wsLists.getCell(`${colLetter}${2 + i}`);
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

// ═══════════════════════════════════════════════════════════════════
// Shared style helpers
// ═══════════════════════════════════════════════════════════════════
function applyLabelStyle(cell) {
  cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_50 } };
  cell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
}
function applyInputStyle(cell) {
  cell.font = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
  cell.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}
function sectionBanner(ws, ref, text, bg) {
  const c = ws.getCell(ref);
  c.value = text;
  c.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg || EMERALD_DARK } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}
function noteCell(ws, ref, text) {
  const c = ws.getCell(ref);
  c.value = text;
  c.font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
  c.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
}

// ═══════════════════════════════════════════════════════════════════
// Build workbook
// ═══════════════════════════════════════════════════════════════════
const wb = new ExcelJS.Workbook();
wb.creator      = "CapturePilot";
wb.company      = "CapturePilot";
wb.title        = "SDB Self-Assessment Worksheet";
wb.subject      = "SBA Small Disadvantaged Business eligibility self-check";
wb.created      = new Date();
wb.modified     = new Date();

// Lists first (named ranges must exist before any sheet references them)
const DV = buildListsSheet(wb, [
  { name: "YesNo",           title: "Yes / No",            items: ["Yes", "No"] },
  { name: "YesNoNA",         title: "Yes / No / N/A",      items: ["Yes", "No", "N/A"] },
  { name: "YesNoPending",    title: "Yes / No / Pending",  items: ["Yes", "No", "Pending"] },
  { name: "PresumptionGrp",  title: "Presumed Social Disadv. Groups",
    items: [
      "Black American",
      "Hispanic American",
      "Native American",
      "Asian Pacific American",
      "Subcontinent Asian American",
      "None of the above – individual showing required",
    ] },
  { name: "EntityType",      title: "Business Entity",
    items: ["C Corporation", "S Corporation", "LLC", "Partnership", "Sole Proprietorship", "Other"] },
  { name: "ContractBasis",   title: "Revenue Basis",
    items: ["Annual receipts (3-yr avg)", "Number of employees"] },
]);

// ═══════════════════════════════════════════════════════════════════
// SHEET 1 — Inputs
// ═══════════════════════════════════════════════════════════════════
const sInputs = wb.addWorksheet("Inputs", {
  views: [{ state: "frozen", ySplit: 6, showGridLines: false }],
  pageSetup: {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CSDB Self-Assessment – Inputs&Rcapturepilot.com",
    oddFooter:  "&LFLK-05&C&P of &N&RConfidential",
  },
});

sInputs.columns = [
  { width: 3  },  // A
  { width: 34 },  // B  label
  { width: 24 },  // C  input
  { width: 34 },  // D  label-right
  { width: 24 },  // E  input-right
  { width: 6  },  // F
];

// Title block
sInputs.mergeCells("A1:F1");
const t1 = sInputs.getCell("A1");
t1.value = "SMALL DISADVANTAGED BUSINESS (SDB) SELF-ASSESSMENT";
t1.font  = { name: "Calibri", size: 20, bold: true, color: { argb: WHITE } };
t1.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
t1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sInputs.getRow(1).height = 44;

sInputs.mergeCells("A2:F2");
const t2 = sInputs.getCell("A2");
t2.value = "CapturePilot  –  Capture intelligence for government contractors";
t2.font  = { name: "Calibri", size: 11, italic: true, color: { argb: WHITE } };
t2.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
t2.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sInputs.getRow(2).height = 22;

sInputs.mergeCells("A3:F3");
noteCell(sInputs, "A3",
  "Fill in the yellow cells. Your answers feed the Checklist, Calc, and Output tabs automatically. " +
  "Nothing leaves this spreadsheet — it's a private self-check, not a submission to SBA. " +
  "Reference: 13 C.F.R. Part 124, Subpart B; SBA SDB program (separate from 8(a) program since 2011 MOU).");
sInputs.getRow(3).height = 30;
sInputs.getRow(4).height = 6;

// Section A — Company basics (rows 5-14)
sInputs.mergeCells("A5:F5");
sectionBanner(sInputs, "A5", "SECTION A — COMPANY BASICS", SLATE_900);
sInputs.getRow(5).height = 24;

const inputFields = [
  { row: 6,  labelL: "Legal Business Name",        keyL: "company_name",    labelR: "UEI (SAM.gov)",             keyR: "uei"          },
  { row: 7,  labelL: "Primary NAICS Code",          keyL: "naics_primary",   labelR: "Secondary NAICS (optional)", keyR: "naics_sec"    },
  { row: 8,  labelL: "Business Entity Type",        keyL: "entity_type",     dvL: "EntityType",
             labelR: "State of Incorporation",      keyR: "state_inc"        },
  { row: 9,  labelL: "Year Founded / Established", keyL: "year_founded",    labelR: "SAM.gov Registration Active?", keyR: "sam_active", dvR: "YesNo" },
  { row: 10, labelL: "Fiscal Year End (mm/dd)",     keyL: "fy_end",          labelR: "Number of Full-Time Employees", keyR: "num_employees" },
  { row: 11, labelL: "3-Year Avg Annual Receipts ($)", keyL: "avg_receipts", numFmtL: '"$"#,##0',
             labelR: "Size Standard Basis",         keyR: "size_basis",  dvR: "ContractBasis" },
  { row: 12, labelL: "SBA Size Standard for NAICS (receipts $M or # employees)", keyL: "size_std_val",
             labelR: "Current Size Standard Source (link or doc)", keyR: "size_std_src" },
  { row: 13, labelL: "Currently 8(a) Certified?",  keyL: "is_8a",  dvL: "YesNo",
             labelR: "Previously SDB-certified?",  keyR: "prev_sdb", dvR: "YesNoPending" },
];

inputFields.forEach(f => {
  const row = sInputs.getRow(f.row);
  row.height = 22;

  const labelL = sInputs.getCell(`B${f.row}`);
  applyLabelStyle(labelL);
  labelL.value = f.labelL;

  sInputs.mergeCells(`C${f.row}:C${f.row}`);
  const inputL = sInputs.getCell(`C${f.row}`);
  applyInputStyle(inputL);
  inputL.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
  if (f.numFmtL) inputL.numFmt = f.numFmtL;
  if (f.dvL) {
    sInputs.dataValidations.add(`C${f.row}`, {
      type: "list", allowBlank: true, formulae: [DV[f.dvL]],
      showErrorMessage: true, errorTitle: "Pick from list", error: "Select a value from the dropdown.",
    });
  }
  wb.definedNames.add(`Inputs!$C$${f.row}`, f.keyL);

  if (f.labelR) {
    const labelR = sInputs.getCell(`D${f.row}`);
    applyLabelStyle(labelR);
    labelR.value = f.labelR;

    const inputR = sInputs.getCell(`E${f.row}`);
    applyInputStyle(inputR);
    inputR.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
    if (f.dvR) {
      sInputs.dataValidations.add(`E${f.row}`, {
        type: "list", allowBlank: true, formulae: [DV[f.dvR]],
        showErrorMessage: true, errorTitle: "Pick from list", error: "Select a value from the dropdown.",
      });
    }
    wb.definedNames.add(`Inputs!$E$${f.row}`, f.keyR);
  }
});

sInputs.getRow(14).height = 6;

// Section B — Social Disadvantage (rows 15-26)
sInputs.mergeCells("A15:F15");
sectionBanner(sInputs, "A15", "SECTION B — SOCIAL DISADVANTAGE  (13 C.F.R. § 124.103)", EMERALD_DARK);
sInputs.getRow(15).height = 24;

sInputs.mergeCells("A16:F16");
noteCell(sInputs, "A16",
  "Social disadvantage means chronic and substantial bias or prejudice in society — not just personal hardship. " +
  "Members of certain groups are presumed socially disadvantaged (see dropdown). " +
  "Everyone else must provide a written individual showing on their own behalf (§ 124.103(c)).");
sInputs.getRow(16).height = 28;

const socFields = [
  { row: 17, labelL: "Disadvantaged Group Membership",      keyL: "disadv_group",   dvL: "PresumptionGrp" },
  { row: 18, labelL: "Owner's Name (primary disadvantaged owner)",  keyL: "owner_name",
             labelR: "Owner % Ownership",                   keyR: "owner_pct"       },
  { row: 19, labelL: "Individual Showing Required? (non-presumed)", keyL: "indiv_showing_req", dvL: "YesNo",
             labelR: "Individual Showing Prepared?",        keyR: "indiv_showing_done", dvR: "YesNoPending" },
  { row: 20, labelL: "Narrative describes specific biased events?",  keyL: "narrative_events",  dvL: "YesNo",
             labelR: "Narrative connects bias to business harm?",     keyR: "narrative_harm",    dvR: "YesNo"  },
  { row: 21, labelL: "Supporting evidence attached (filings, letters, etc.)?", keyL: "evidence_attached", dvL: "YesNo" },
];

socFields.forEach(f => {
  sInputs.getRow(f.row).height = 22;
  const lbl = sInputs.getCell(`B${f.row}`);
  applyLabelStyle(lbl); lbl.value = f.labelL;
  const inp = sInputs.getCell(`C${f.row}`);
  applyInputStyle(inp);
  inp.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
  if (f.dvL) sInputs.dataValidations.add(`C${f.row}`, { type: "list", allowBlank: true, formulae: [DV[f.dvL]], showErrorMessage: true, errorTitle: "Pick from list", error: "Select a value." });
  wb.definedNames.add(`Inputs!$C$${f.row}`, f.keyL);
  if (f.labelR) {
    const lblR = sInputs.getCell(`D${f.row}`);
    applyLabelStyle(lblR); lblR.value = f.labelR;
    const inpR = sInputs.getCell(`E${f.row}`);
    applyInputStyle(inpR);
    inpR.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
    if (f.dvR) sInputs.dataValidations.add(`E${f.row}`, { type: "list", allowBlank: true, formulae: [DV[f.dvR]], showErrorMessage: true, errorTitle: "Pick from list", error: "Select a value." });
    wb.definedNames.add(`Inputs!$E$${f.row}`, f.keyR);
  }
});

sInputs.getRow(22).height = 6;

// Section C — Economic Disadvantage (rows 23-35)
sInputs.mergeCells("A23:F23");
sectionBanner(sInputs, "A23", "SECTION C — ECONOMIC DISADVANTAGE  (13 C.F.R. § 124.104)", EMERALD_DARK);
sInputs.getRow(23).height = 24;

sInputs.mergeCells("A24:F24");
noteCell(sInputs, "A24",
  "Thresholds for initial SDB eligibility: adjusted net worth < $850,000 (excluding primary residence + business equity); " +
  "3-year avg adjusted gross income < $400,000; total assets < $6.5M. " +
  "Continuing eligibility: net worth < $1.25M; AGI < $400K; total assets < $9M.");
sInputs.getRow(24).height = 32;

const econFields = [
  { row: 25, labelL: "Owner Adjusted Net Worth ($)",          keyL: "owner_net_worth",   numFmtL: '"$"#,##0',
             labelR: "Net Worth < $850K? (initial threshold)", keyR: "nw_threshold_met",  dvR: "YesNo" },
  { row: 26, labelL: "3-Yr Avg Adjusted Gross Income ($)",    keyL: "owner_agi",         numFmtL: '"$"#,##0',
             labelR: "AGI < $400K? (initial threshold)",       keyR: "agi_threshold_met", dvR: "YesNo" },
  { row: 27, labelL: "Owner Total Assets ($)",                keyL: "owner_assets",      numFmtL: '"$"#,##0',
             labelR: "Total Assets < $6.5M? (initial)",        keyR: "assets_threshold",  dvR: "YesNo" },
  { row: 28, labelL: "Primary Residence Value ($)",           keyL: "residence_val",     numFmtL: '"$"#,##0',
             labelR: "Business Equity Value ($)",              keyR: "biz_equity",        numFmtR: '"$"#,##0' },
  { row: 29, labelL: "Retirement Account Balance ($)",        keyL: "retirement_acct",   numFmtL: '"$"#,##0',
             labelR: "Retirement excluded from net worth calc?", keyR: "retirement_excl", dvR: "YesNo" },
  { row: 30, labelL: "Personal financial stmts prepared by CPA?", keyL: "cpa_stmts",    dvL: "YesNoPending",
             labelR: "3 years tax returns available?",         keyR: "tax_returns_avail", dvR: "YesNo" },
];

econFields.forEach(f => {
  sInputs.getRow(f.row).height = 22;
  const lbl = sInputs.getCell(`B${f.row}`);
  applyLabelStyle(lbl); lbl.value = f.labelL;
  const inp = sInputs.getCell(`C${f.row}`);
  applyInputStyle(inp);
  inp.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
  if (f.numFmtL) inp.numFmt = f.numFmtL;
  if (f.dvL) sInputs.dataValidations.add(`C${f.row}`, { type: "list", allowBlank: true, formulae: [DV[f.dvL]], showErrorMessage: true, errorTitle: "Pick from list", error: "Select a value." });
  wb.definedNames.add(`Inputs!$C$${f.row}`, f.keyL);
  if (f.labelR) {
    const lblR = sInputs.getCell(`D${f.row}`);
    applyLabelStyle(lblR); lblR.value = f.labelR;
    const inpR = sInputs.getCell(`E${f.row}`);
    applyInputStyle(inpR);
    inpR.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
    if (f.numFmtR) inpR.numFmt = f.numFmtR;
    if (f.dvR) sInputs.dataValidations.add(`E${f.row}`, { type: "list", allowBlank: true, formulae: [DV[f.dvR]], showErrorMessage: true, errorTitle: "Pick from list", error: "Select a value." });
    wb.definedNames.add(`Inputs!$E$${f.row}`, f.keyR);
  }
});

sInputs.getRow(31).height = 6;

// Section D — Ownership + Control (rows 32-41)
sInputs.mergeCells("A32:F32");
sectionBanner(sInputs, "A32", "SECTION D — UNCONDITIONAL OWNERSHIP & CONTROL  (13 C.F.R. § 124.105–106)", EMERALD_DARK);
sInputs.getRow(32).height = 24;

sInputs.mergeCells("A33:F33");
noteCell(sInputs, "A33",
  "Disadvantaged individuals must unconditionally own 51%+ of the firm and control its management and daily operations. " +
  "Conditions on ownership (buy-sell agreements, stock options, voting trusts) can disqualify the firm. " +
  "Control means genuine decision-making authority over strategy, BD, contracts, and personnel — not just a title.");
sInputs.getRow(33).height = 28;

const ownerFields = [
  { row: 34, labelL: "Total % owned by socially/econ. disadv. individuals", keyL: "disadv_pct",
             labelR: "Ownership ≥ 51%?",                    keyR: "owns_51",  dvR: "YesNo" },
  { row: 35, labelL: "Ownership unconditional (no restricting agreements)?", keyL: "ownership_uncond", dvL: "YesNo",
             labelR: "Beneficial interest held by non-disadv. parties?", keyR: "non_disadv_interest", dvR: "YesNo" },
  { row: 36, labelL: "Disadvantaged owner serves as highest officer (CEO/President/GM)?", keyL: "highest_officer", dvL: "YesNo",
             labelR: "Does owner make final BD / contract decisions?", keyR: "controls_bd", dvR: "YesNo" },
  { row: 37, labelL: "Does owner control hiring / firing of key personnel?", keyL: "controls_hr",  dvL: "YesNo",
             labelR: "Any outside control restrictions (bank covenants, investor rights)?", keyR: "outside_ctrl", dvR: "YesNo" },
  { row: 38, labelL: "If franchisee — franchisor control documented as acceptable?", keyL: "franchise_ok", dvL: "YesNoNA",
             labelR: "Licenses / permits held in owner's / firm's name?", keyR: "licenses_ok", dvR: "YesNo" },
];

ownerFields.forEach(f => {
  sInputs.getRow(f.row).height = 22;
  const lbl = sInputs.getCell(`B${f.row}`);
  applyLabelStyle(lbl); lbl.value = f.labelL;
  const inp = sInputs.getCell(`C${f.row}`);
  applyInputStyle(inp);
  inp.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
  if (f.dvL) sInputs.dataValidations.add(`C${f.row}`, { type: "list", allowBlank: true, formulae: [DV[f.dvL]], showErrorMessage: true, errorTitle: "Pick from list", error: "Select a value." });
  wb.definedNames.add(`Inputs!$C$${f.row}`, f.keyL);
  if (f.labelR) {
    const lblR = sInputs.getCell(`D${f.row}`);
    applyLabelStyle(lblR); lblR.value = f.labelR;
    const inpR = sInputs.getCell(`E${f.row}`);
    applyInputStyle(inpR);
    inpR.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
    if (f.dvR) sInputs.dataValidations.add(`E${f.row}`, { type: "list", allowBlank: true, formulae: [DV[f.dvR]], showErrorMessage: true, errorTitle: "Pick from list", error: "Select a value." });
    wb.definedNames.add(`Inputs!$E$${f.row}`, f.keyR);
  }
});

sInputs.getRow(39).height = 6;

// Section E — Size Standard (rows 40-46)
sInputs.mergeCells("A40:F40");
sectionBanner(sInputs, "A40", "SECTION E — SIZE STANDARD  (13 C.F.R. Part 121)", EMERALD_DARK);
sInputs.getRow(40).height = 24;

sInputs.mergeCells("A41:F41");
noteCell(sInputs, "A41",
  "SDB requires the firm to be a small business under the applicable SBA size standard for its primary NAICS. " +
  "Most construction + services NAICS use average annual receipts; most manufacturing + some tech use employee headcount. " +
  "Check the current table at https://www.sba.gov/document/support-table-size-standards. Affiliation rules at 13 C.F.R. § 121.103 apply.");
sInputs.getRow(41).height = 32;

const sizeFields = [
  { row: 42, labelL: "Receipts size standard for primary NAICS ($M)",  keyL: "receipts_std",
             labelR: "Employee size standard for primary NAICS (# empl)", keyR: "employee_std" },
  { row: 43, labelL: "Firm qualifies as small by receipts?",           keyL: "small_by_receipts",  dvL: "YesNoNA",
             labelR: "Firm qualifies as small by employees?",           keyR: "small_by_employees", dvR: "YesNoNA" },
  { row: 44, labelL: "Affiliated entities identified?",                keyL: "affiliates_identified", dvL: "YesNo",
             labelR: "Combined receipts/employees still under standard?", keyR: "aff_still_small",  dvR: "YesNoNA" },
  { row: 45, labelL: "Self-certified as small in SAM.gov for this NAICS?", keyL: "sam_small_cert",  dvL: "YesNo",
             labelR: "SBA size determination outstanding / pending?",    keyR: "size_protest",      dvR: "YesNo" },
];

sizeFields.forEach(f => {
  sInputs.getRow(f.row).height = 22;
  const lbl = sInputs.getCell(`B${f.row}`);
  applyLabelStyle(lbl); lbl.value = f.labelL;
  const inp = sInputs.getCell(`C${f.row}`);
  applyInputStyle(inp);
  inp.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
  if (f.dvL) sInputs.dataValidations.add(`C${f.row}`, { type: "list", allowBlank: true, formulae: [DV[f.dvL]], showErrorMessage: true, errorTitle: "Pick from list", error: "Select a value." });
  wb.definedNames.add(`Inputs!$C$${f.row}`, f.keyL);
  if (f.labelR) {
    const lblR = sInputs.getCell(`D${f.row}`);
    applyLabelStyle(lblR); lblR.value = f.labelR;
    const inpR = sInputs.getCell(`E${f.row}`);
    applyInputStyle(inpR);
    inpR.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
    if (f.dvR) sInputs.dataValidations.add(`E${f.row}`, { type: "list", allowBlank: true, formulae: [DV[f.dvR]], showErrorMessage: true, errorTitle: "Pick from list", error: "Select a value." });
    wb.definedNames.add(`Inputs!$E$${f.row}`, f.keyR);
  }
});

// Footer
sInputs.getRow(47).height = 6;
sInputs.mergeCells("A48:F48");
noteCell(sInputs, "A48", FOOTER);
sInputs.getCell("A48").alignment = { horizontal: "center" };


// ═══════════════════════════════════════════════════════════════════
// SHEET 2 — Checklist
// ═══════════════════════════════════════════════════════════════════
const sCheck = wb.addWorksheet("Checklist", {
  views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  pageSetup: {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CSDB Checklist&Rcapturepilot.com",
    oddFooter:  "&LFLK-05&C&P of &N&RConfidential",
  },
});

sCheck.columns = [
  { width: 5  },  // A  #
  { width: 50 },  // B  requirement
  { width: 14 },  // C  status
  { width: 45 },  // D  notes
];

sCheck.mergeCells("A1:D1");
const ch1 = sCheck.getCell("A1");
ch1.value = "SDB ELIGIBILITY CHECKLIST";
ch1.font  = { name: "Calibri", size: 20, bold: true, color: { argb: WHITE } };
ch1.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
ch1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sCheck.getRow(1).height = 44;

sCheck.mergeCells("A2:D2");
const ch2 = sCheck.getCell("A2");
ch2.value = "CapturePilot  –  Capture intelligence for government contractors";
ch2.font  = { name: "Calibri", size: 11, italic: true, color: { argb: WHITE } };
ch2.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
ch2.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sCheck.getRow(2).height = 22;

sCheck.mergeCells("A3:D3");
noteCell(sCheck, "A3",
  "Work through each item. Set the Status column to Met / Gap / N/A. " +
  "Every 'Gap' is a real risk to your SDB eligibility — document a remediation plan in the Notes column. " +
  "When all items are Met or N/A, you're ready for the SBA application or the Output tab summary.");
sCheck.getRow(3).height = 28;
sCheck.getRow(4).height = 6;

// Header row
["#", "REQUIREMENT", "STATUS", "NOTES / EVIDENCE"].forEach((lbl, i) => {
  const col = String.fromCharCode(65 + i);
  const c   = sCheck.getCell(`${col}5`);
  c.value   = lbl;
  c.font    = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
  c.fill    = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
});
sCheck.getRow(5).height = 22;

// Build DV for Status (inline, sheet-scoped list)
const statusDV = { name: "StatusMGN", items: ["Met", "Gap", "N/A", "Unknown"] };
const listsSheet = wb.getWorksheet("Lists");
// Add statusDV to the Lists sheet (column G)
const colG = "G";
listsSheet.getCell(`${colG}1`).value = "Status Options";
listsSheet.getCell(`${colG}1`).font = { name: "Calibri", size: 10, bold: true };
listsSheet.getCell(`${colG}1`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
statusDV.items.forEach((item, i) => {
  listsSheet.getCell(`${colG}${2 + i}`).value = item;
  listsSheet.getCell(`${colG}${2 + i}`).font = { name: "Calibri", size: 10 };
});
wb.definedNames.add(`Lists!$${colG}$2:$${colG}$${1 + statusDV.items.length}`, statusDV.name);
DV.StatusMGN = statusDV.name;

const checkItems = [
  { cat: "SOCIAL DISADVANTAGE — PRESUMED GROUPS (§ 124.103(b))", items: [
    { id: "S1", req: "Owner is a U.S. citizen", note: "Copies of passport, birth certificate, or naturalization cert." },
    { id: "S2", req: "Owner is a member of a presumed disadvantaged group (Black, Hispanic, Native American, Asian Pacific, Subcontinent Asian)", note: "Document group membership — tribal enrollment, community affiliation, contemporaneous documentation." },
    { id: "S3", req: "Presumption has not been rebutted by SBA or OHA", note: "Check BDMIS for prior rulings if the firm or owner has previously been in the 8(a) program." },
  ]},
  { cat: "SOCIAL DISADVANTAGE — INDIVIDUAL SHOWING (§ 124.103(c)) — required if not in a presumed group", items: [
    { id: "S4", req: "Written individual showing prepared and attached", note: "Must identify specific incidents of bias — 'I was disadvantaged' is not enough. Name dates, actors, and economic harm." },
    { id: "S5", req: "Narrative demonstrates chronic and substantial prejudice — not isolated personal setbacks", note: "Courts and SBA OHA have rejected narratives that describe normal business difficulties unrelated to race/ethnicity." },
    { id: "S6", req: "Evidence corroborates narrative (letters, media, sworn statements)", note: "Third-party corroboration strengthens the showing; pure self-attestation is vulnerable to rebuttal." },
  ]},
  { cat: "ECONOMIC DISADVANTAGE — INITIAL ELIGIBILITY (§ 124.104)", items: [
    { id: "E1", req: "Adjusted personal net worth < $850,000 (excluding primary residence + business equity)", note: "Use IRS Form 4506-C to pull tax transcripts. Net worth calc: total assets minus liabilities, minus excluded items." },
    { id: "E2", req: "3-year average adjusted gross income < $400,000", note: "Average the owner's AGI from three most recent federal returns. Spouses' income may need to be included if community property state." },
    { id: "E3", req: "Total assets < $6,500,000", note: "Includes retirement accounts, brokerage, real estate other than primary residence, vehicles, personal property." },
    { id: "E4", req: "Personal financial statement prepared (SBA Form 413 or equivalent) within 90 days", note: "SBA typically requires the statement to be recent. Engage a CPA early to avoid last-minute scramble." },
    { id: "E5", req: "3 years of federal personal tax returns available (most recent)", note: "W-2, 1040, Schedule C/K-1 as applicable. If owner is salaried from the firm, W-2 must reconcile with business financials." },
  ]},
  { cat: "OWNERSHIP — UNCONDITIONAL 51%+ (§ 124.105)", items: [
    { id: "O1", req: "Disadvantaged individuals own 51%+ of the firm unconditionally", note: "Review articles of incorporation, operating agreement, or partnership agreement for exact percentages." },
    { id: "O2", req: "No stock options, buy-sell agreements, or reversionary clauses that could reduce ownership below 51%", note: "Even contingent instruments that could theoretically transfer control are disqualifying." },
    { id: "O3", req: "No non-disadvantaged individual holds a veto right or blocking minority on major decisions", note: "Voting rights, board seats, and management agreements must not vest effective control elsewhere." },
    { id: "O4", req: "Community property of non-disadvantaged spouse properly addressed", note: "Community property states (CA, TX, AZ, NM, NV, WA, ID, WI, LA): non-disadvantaged spouse's community interest in the firm must be formally waived or structured out." },
  ]},
  { cat: "CONTROL — MANAGEMENT & OPERATIONS (§ 124.106)", items: [
    { id: "C1", req: "Disadvantaged owner holds the highest officer title (CEO, President, or equivalent)", note: "Title alone isn't sufficient — SBA looks at actual decision-making. Keep records of owner signing contracts, hiring key staff, attending BD meetings." },
    { id: "C2", req: "Owner makes final decisions on contracts, BD, and strategic direction", note: "If a non-disadvantaged manager effectively runs the business, control fails. Common in firms where a technical expert (non-owner) dominates operations." },
    { id: "C3", req: "Owner controls hiring, firing, and compensation of senior staff", note: "Boards of advisors with real authority or investors with employment-veto rights have sunk otherwise-qualifying firms." },
    { id: "C4", req: "No outside control restrictions (bank covenants, investor protective provisions, licensing body requirements) that override owner's authority", note: "SBA reviews loan agreements, investor rights, and franchise agreements for hidden control provisions." },
    { id: "C5", req: "If franchisee — franchise relationship documented as not overriding owner control per SBA's franchise directory", note: "SBA maintains a list of SBA-reviewed franchise agreements. Check the SBA Franchise Directory before applying." },
    { id: "C6", req: "Licenses and permits held in firm's name (not solely in a non-disadvantaged individual's name)", note: "A contractor's license held exclusively by a non-owner manager creates a control question." },
  ]},
  { cat: "SIZE STANDARD — SMALL BUSINESS (13 C.F.R. Part 121)", items: [
    { id: "SZ1", req: "Firm meets the SBA size standard for the primary NAICS code on its SAM.gov registration", note: "Verify at https://www.sba.gov/document/support-table-size-standards. Use the correct NAICS for each contract opportunity, not just primary." },
    { id: "SZ2", req: "Affiliation analysis completed — all affiliated entities identified per § 121.103", note: "Affiliates' receipts/employees aggregate with the firm's. Common triggers: shared ownership, management, identity of interest, franchise." },
    { id: "SZ3", req: "Combined size (with affiliates) still under the applicable size standard", note: "If near the threshold, model both best-case and worst-case affiliate scenarios." },
    { id: "SZ4", req: "Self-certification as small business in SAM.gov is current and matches the NAICS claim", note: "Re-certify annually and whenever the firm changes size due to growth or affiliate changes." },
    { id: "SZ5", req: "No active SBA size protest or determination finding the firm other-than-small", note: "A pending size protest does not automatically disqualify, but an adverse final determination does." },
  ]},
  { cat: "PROCESS READINESS", items: [
    { id: "P1", req: "SAM.gov registration active + SDB flag updated", note: "The SDB designation in SAM.gov is self-certified. Contracting officers use it to filter set-aside opportunities. Keep it current." },
    { id: "P2", req: "Capability statement references SDB status and specific NAICS codes", note: "Contracting officers and prime contractors searching for SDB subs want to see the certification front and center." },
    { id: "P3", req: "Owner has reviewed and is familiar with 13 C.F.R. Part 124, Subpart B", note: "Your attorney can handle the fine print, but you need to understand what you're certifying — false SDB claims are fraud." },
    { id: "P4", req: "Documentation package compiled and ready to produce on request", note: "Primes regularly ask SDB subs for proof before awarding subcontracts. Keep a binder: org docs, tax returns, personal financial statement, ownership cert." },
  ]},
];

let cr = 6;
const checkRowMap = {};
checkItems.forEach(section => {
  sCheck.mergeCells(`A${cr}:D${cr}`);
  sectionBanner(sCheck, `A${cr}`, section.cat, EMERALD_DARK);
  sCheck.getRow(cr).height = 24;
  cr++;

  section.items.forEach((item, idx) => {
    const zebra = idx % 2 === 0 ? WHITE : SLATE_50;
    const cA = sCheck.getCell(`A${cr}`);
    cA.value = item.id;
    cA.font  = { name: "Consolas", size: 10, color: { argb: SLATE_700 } };
    cA.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    cA.alignment = { vertical: "middle", horizontal: "center" };
    cA.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

    const cB = sCheck.getCell(`B${cr}`);
    cB.value = item.req;
    cB.font  = { name: "Calibri", size: 10, color: { argb: SLATE_900 } };
    cB.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    cB.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    cB.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

    const cC = sCheck.getCell(`C${cr}`);
    cC.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
    cC.border = { top: { style: "thin", color: { argb: AMBER } }, bottom: { style: "thin", color: { argb: AMBER } }, left: { style: "thin", color: { argb: AMBER } }, right: { style: "thin", color: { argb: AMBER } } };
    cC.alignment = { vertical: "middle", horizontal: "center" };
    sCheck.dataValidations.add(`C${cr}`, {
      type: "list", allowBlank: true, formulae: [DV.StatusMGN],
      showErrorMessage: true, errorTitle: "Pick a status", error: "Choose Met, Gap, N/A, or Unknown.",
      showInputMessage: true, promptTitle: "Status", prompt: "Met = satisfied  |  Gap = needs work  |  N/A = not applicable",
    });

    const cD = sCheck.getCell(`D${cr}`);
    cD.value = item.note;
    cD.font  = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
    cD.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    cD.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    cD.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

    sCheck.getRow(cr).height = 32;
    checkRowMap[item.id] = cr;
    cr++;
  });
});

// Conditional formatting on Status column
sCheck.addConditionalFormatting({
  ref: `C6:C${cr - 1}`,
  rules: [
    { type: "containsText", operator: "containsText", text: "Met",     style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: EMERALD_BG } }, font: { color: { argb: EMERALD_DARK }, bold: true } }, priority: 1 },
    { type: "containsText", operator: "containsText", text: "Gap",     style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL   } }, font: { color: { argb: "FF991B1B" }, bold: true } }, priority: 2 },
    { type: "containsText", operator: "containsText", text: "N/A",     style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: SLATE_100  } }, font: { color: { argb: SLATE_700 } } }, priority: 3 },
    { type: "containsText", operator: "containsText", text: "Unknown", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: AMBER_FILL } }, font: { color: { argb: "FF92400E" }, bold: true } }, priority: 4 },
  ],
});

// Totals
cr++;
const totalCheckRows = Object.values(checkRowMap);
const firstCheckRow  = totalCheckRows[0];
const lastCheckRow   = totalCheckRows[totalCheckRows.length - 1];

sCheck.mergeCells(`A${cr}:B${cr}`);
sCheck.getCell(`A${cr}`).value = "ITEMS MET (auto-count)";
sCheck.getCell(`A${cr}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
sCheck.getCell(`A${cr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sCheck.getCell(`A${cr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sCheck.getCell(`C${cr}`).value = { formula: `COUNTIF(C${firstCheckRow}:C${lastCheckRow},"Met")` };
sCheck.getCell(`C${cr}`).font  = { name: "Calibri", size: 14, bold: true, color: { argb: EMERALD_DARK } };
sCheck.getCell(`C${cr}`).alignment = { vertical: "middle", horizontal: "center" };
sCheck.getCell(`D${cr}`).value = { formula: `"of "&COUNTA(A${firstCheckRow}:A${lastCheckRow})&" total items"` };
sCheck.getCell(`D${cr}`).font  = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
sCheck.getRow(cr).height = 28;
wb.definedNames.add(`Checklist!$C$${cr}`, "items_met");
const itemsMetRow = cr; cr++;

sCheck.mergeCells(`A${cr}:B${cr}`);
sCheck.getCell(`A${cr}`).value = "ITEMS WITH GAPS";
sCheck.getCell(`A${cr}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
sCheck.getCell(`A${cr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sCheck.getCell(`A${cr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sCheck.getCell(`C${cr}`).value = { formula: `COUNTIF(C${firstCheckRow}:C${lastCheckRow},"Gap")` };
sCheck.getCell(`C${cr}`).font  = { name: "Calibri", size: 14, bold: true, color: { argb: "FF991B1B" } };
sCheck.getCell(`C${cr}`).alignment = { vertical: "middle", horizontal: "center" };
sCheck.getCell(`D${cr}`).value = "Gaps need a remediation plan before you apply — or self-certify with risk.";
sCheck.getCell(`D${cr}`).font  = { name: "Calibri", size: 10, italic: true, color: { argb: SLATE_700 } };
sCheck.getRow(cr).height = 28;
wb.definedNames.add(`Checklist!$C$${cr}`, "items_gap");

cr += 2;
sCheck.mergeCells(`A${cr}:D${cr}`);
noteCell(sCheck, `A${cr}`, FOOTER);
sCheck.getCell(`A${cr}`).alignment = { horizontal: "center" };


// ═══════════════════════════════════════════════════════════════════
// SHEET 3 — Calc  (economic threshold math)
// ═══════════════════════════════════════════════════════════════════
const sCalc = wb.addWorksheet("Calc", {
  views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  pageSetup: {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CSDB Calc — Economic Thresholds&Rcapturepilot.com",
    oddFooter:  "&LFLK-05&C&P of &N&RConfidential",
  },
});

sCalc.columns = [
  { width: 3  },
  { width: 40 },
  { width: 22 },
  { width: 22 },
  { width: 14 },
  { width: 5  },
];

sCalc.mergeCells("A1:F1");
sCalc.getCell("A1").value = "ECONOMIC DISADVANTAGE — THRESHOLD CALCULATOR";
sCalc.getCell("A1").font  = { name: "Calibri", size: 18, bold: true, color: { argb: WHITE } };
sCalc.getCell("A1").fill  = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sCalc.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sCalc.getRow(1).height = 40;

sCalc.mergeCells("A2:F2");
sCalc.getCell("A2").value = "CapturePilot  –  Capture intelligence for government contractors";
sCalc.getCell("A2").font  = { name: "Calibri", size: 11, italic: true, color: { argb: WHITE } };
sCalc.getCell("A2").fill  = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
sCalc.getCell("A2").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sCalc.getRow(2).height = 22;

sCalc.mergeCells("A3:F3");
noteCell(sCalc, "A3",
  "This tab auto-pulls dollar values from the Inputs tab and compares them to SDB economic disadvantage thresholds. " +
  "Yellow cells in this tab are for override/manual entry only — use the Inputs tab for your primary data entry.");
sCalc.getRow(3).height = 26;
sCalc.getRow(4).height = 6;

// Header row
["", "THRESHOLD TEST", "YOUR VALUE", "LIMIT", "RESULT"].forEach((lbl, i) => {
  if (!lbl) return;
  const col = String.fromCharCode(65 + i);
  const c   = sCalc.getCell(`${col}5`);
  c.value   = lbl;
  c.font    = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
  c.fill    = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  c.alignment = { vertical: "middle", horizontal: "center" };
});
sCalc.getRow(5).height = 22;

const calcRows = [
  {
    label: "Adjusted Net Worth (excl. primary residence + business equity)",
    formula_val: "=IFERROR(owner_net_worth,0)",
    limit: 850000,
    pass_condition: "<",
    note: "Initial threshold: < $850,000",
    key: "calc_nw",
  },
  {
    label: "3-Year Average Adjusted Gross Income",
    formula_val: "=IFERROR(owner_agi,0)",
    limit: 400000,
    pass_condition: "<",
    note: "Initial threshold: < $400,000 (3-yr avg)",
    key: "calc_agi",
  },
  {
    label: "Total Personal Assets",
    formula_val: "=IFERROR(owner_assets,0)",
    limit: 6500000,
    pass_condition: "<",
    note: "Initial threshold: < $6,500,000",
    key: "calc_assets",
  },
];

let calcR = 6;
const calcValueCells = [];
const calcResultCells = [];

calcRows.forEach((row, idx) => {
  const zebra = idx % 2 === 0 ? WHITE : SLATE_50;
  sCalc.getRow(calcR).height = 28;

  const cB = sCalc.getCell(`B${calcR}`);
  cB.value = row.label;
  cB.font  = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
  cB.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  cB.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  cB.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  const cC = sCalc.getCell(`C${calcR}`);
  cC.value  = { formula: row.formula_val };
  cC.numFmt = '"$"#,##0';
  cC.font   = { name: "Calibri", size: 13, bold: true, color: { argb: SLATE_900 } };
  cC.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
  cC.alignment = { vertical: "middle", horizontal: "center" };
  cC.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  const cD = sCalc.getCell(`D${calcR}`);
  cD.value  = row.limit;
  cD.numFmt = '"$"#,##0';
  cD.font   = { name: "Calibri", size: 11, color: { argb: SLATE_700 } };
  cD.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  cD.alignment = { vertical: "middle", horizontal: "center" };
  cD.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  const passFormula = `IF(C${calcR}=0,"Not entered",IF(C${calcR}<D${calcR},"PASS","FAIL"))`;
  const cE = sCalc.getCell(`E${calcR}`);
  cE.value = { formula: passFormula };
  cE.font  = { name: "Calibri", size: 12, bold: true };
  cE.alignment = { vertical: "middle", horizontal: "center" };
  cE.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };

  wb.definedNames.add(`Calc!$C$${calcR}`, row.key);
  calcValueCells.push(`C${calcR}`);
  calcResultCells.push(`E${calcR}`);

  // CF on result
  sCalc.addConditionalFormatting({
    ref: `E${calcR}`,
    rules: [
      { type: "containsText", operator: "containsText", text: "PASS", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: EMERALD_BG } }, font: { color: { argb: EMERALD_DARK }, bold: true, size: 12 } }, priority: 1 },
      { type: "containsText", operator: "containsText", text: "FAIL", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL    } }, font: { color: { argb: "FF991B1B"  }, bold: true, size: 12 } }, priority: 2 },
    ],
  });

  calcR++;
});

// Summary pass/fail
calcR++;
sCalc.mergeCells(`A${calcR}:D${calcR}`);
sCalc.getCell(`A${calcR}`).value = "ALL ECONOMIC THRESHOLDS MET?";
sCalc.getCell(`A${calcR}`).font  = { name: "Calibri", size: 12, bold: true, color: { argb: WHITE } };
sCalc.getCell(`A${calcR}`).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sCalc.getCell(`A${calcR}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

const allPassFormula = `IF(COUNTIF(${calcResultCells.join(",")},"PASS")=${calcResultCells.length},"YES — economic disadvantage thresholds met","NO — one or more thresholds not met")`;
sCalc.getCell(`E${calcR}`).value = { formula: allPassFormula };
sCalc.getCell(`E${calcR}`).font  = { name: "Calibri", size: 12, bold: true };
sCalc.getCell(`E${calcR}`).alignment = { vertical: "middle", horizontal: "center" };
sCalc.getRow(calcR).height = 32;
wb.definedNames.add(`Calc!$E$${calcR}`, "econ_all_pass");

sCalc.addConditionalFormatting({
  ref: `E${calcR}`,
  rules: [
    { type: "containsText", operator: "containsText", text: "YES",  style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: EMERALD_BG } }, font: { color: { argb: EMERALD_DARK }, bold: true, size: 12 } }, priority: 1 },
    { type: "containsText", operator: "containsText", text: "NO —", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL   } }, font: { color: { argb: "FF991B1B"  }, bold: true, size: 12 } }, priority: 2 },
  ],
});

calcR += 2;
sCalc.mergeCells(`A${calcR}:F${calcR}`);
noteCell(sCalc, `A${calcR}`,
  "Continuing eligibility thresholds (post-initial): net worth < $1.25M; AGI < $400K; total assets < $9M. " +
  "The calc above uses initial thresholds. If you're already certified and re-certifying, update the limit column (D) accordingly.");
sCalc.getRow(calcR).height = 28;

calcR += 2;
sCalc.mergeCells(`A${calcR}:F${calcR}`);
noteCell(sCalc, `A${calcR}`, FOOTER);
sCalc.getCell(`A${calcR}`).alignment = { horizontal: "center" };


// ═══════════════════════════════════════════════════════════════════
// SHEET 4 — Output
// ═══════════════════════════════════════════════════════════════════
const sOut = wb.addWorksheet("Output", {
  views: [{ showGridLines: false }],
  pageSetup: {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CSDB Output — Eligibility Summary&Rcapturepilot.com",
    oddFooter:  "&LFLK-05&C&P of &N&RConfidential",
  },
});

sOut.columns = [
  { width: 4  },
  { width: 40 },
  { width: 22 },
  { width: 34 },
];

sOut.mergeCells("A1:D1");
sOut.getCell("A1").value = "SDB ELIGIBILITY SUMMARY";
sOut.getCell("A1").font  = { name: "Calibri", size: 22, bold: true, color: { argb: WHITE } };
sOut.getCell("A1").fill  = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sOut.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sOut.getRow(1).height = 48;

sOut.mergeCells("A2:D2");
sOut.getCell("A2").value = "CapturePilot  –  Capture intelligence for government contractors";
sOut.getCell("A2").font  = { name: "Calibri", size: 11, italic: true, color: { argb: WHITE } };
sOut.getCell("A2").fill  = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
sOut.getCell("A2").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sOut.getRow(2).height = 22;

// Firm card
sOut.getRow(3).height = 6;
let or = 4;

[
  ["Legal Name",            "=IFERROR(company_name,\"\")"],
  ["Primary NAICS",         "=IFERROR(naics_primary,\"\")"],
  ["UEI",                   "=IFERROR(uei,\"\")"],
  ["Owner / Disadv. Group", "=IFERROR(owner_name&\" / \"&disadv_group,\"\")"],
  ["Ownership %",           "=IFERROR(TEXT(disadv_pct,\"0.0%\"),\"\")"],
].forEach(([lbl, formula]) => {
  sOut.getRow(or).height = 20;
  applyLabelStyle(sOut.getCell(`B${or}`));
  sOut.getCell(`B${or}`).value = lbl;
  applyInputStyle(sOut.getCell(`C${or}`));
  sOut.mergeCells(`C${or}:D${or}`);
  sOut.getCell(`C${or}`).value = { formula };
  sOut.getCell(`C${or}`).font  = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
  or++;
});

or++;

// Gate results table
sOut.mergeCells(`A${or}:D${or}`);
sectionBanner(sOut, `A${or}`, "ELIGIBILITY GATE RESULTS", SLATE_900);
sOut.getRow(or).height = 28; or++;

// Header
["GATE", "TEST DESCRIPTION", "RESULT", "PATH NOTES"].forEach((lbl, i) => {
  const col = String.fromCharCode(65 + i);
  const c   = sOut.getCell(`${col}${or}`);
  c.value   = lbl;
  c.font    = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
  c.fill    = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
  c.alignment = { vertical: "middle", horizontal: "center" };
});
sOut.getRow(or).height = 22; or++;

const gates = [
  {
    gate: "G1",
    label: "Social Disadvantage — Presumed Group OR Individual Showing",
    formula: `=IF(IFERROR(EXACT(disadv_group,"None of the above – individual showing required"),FALSE),IF(AND(IFERROR(EXACT(indiv_showing_req,"Yes"),FALSE),IFERROR(EXACT(indiv_showing_done,"Yes"),FALSE)),"PASS — individual showing prepared","GAP — individual showing required but not prepared"),IF(disadv_group="","Not entered","PASS — presumed group member"))`,
    path: "Presumed group: attach documentation of group membership. Individual showing: prepare § 124.103(c) narrative with specific incidents.",
  },
  {
    gate: "G2",
    label: "Economic Disadvantage — All Thresholds Met",
    formula: `=IFERROR(econ_all_pass,"Not calculated — complete Calc tab")`,
    path: "Verify net worth excludes primary residence + business equity. Get CPA-prepared personal financial statement (Form 413 or equivalent).",
  },
  {
    gate: "G3",
    label: "Unconditional Ownership ≥ 51%",
    formula: `=IF(AND(IFERROR(EXACT(owns_51,"Yes"),FALSE),IFERROR(EXACT(ownership_uncond,"Yes"),FALSE)),"PASS","GAP — review ownership structure and org documents")`,
    path: "Review operating agreement / articles of incorporation. Remove or restructure any clause that could dilute below 51%.",
  },
  {
    gate: "G4",
    label: "Management Control",
    formula: `=IF(AND(IFERROR(EXACT(highest_officer,"Yes"),FALSE),IFERROR(EXACT(controls_bd,"Yes"),FALSE),IFERROR(EXACT(controls_hr,"Yes"),FALSE)),"PASS","GAP — document owner's actual decision-making authority")`,
    path: "Build a control evidence file: signed contracts, hiring decisions, BD correspondence, board minutes all showing owner in charge.",
  },
  {
    gate: "G5",
    label: "Small Business Size Standard",
    formula: `=IF(AND(IFERROR(EXACT(small_by_receipts,"Yes"),FALSE),IFERROR(EXACT(sam_small_cert,"Yes"),FALSE)),"PASS",IF(AND(IFERROR(EXACT(small_by_employees,"Yes"),FALSE),IFERROR(EXACT(sam_small_cert,"Yes"),FALSE)),"PASS","GAP — verify size and SAM.gov self-certification"))`,
    path: "Pull the SBA Table of Size Standards for each NAICS on your SAM registration. Factor in all affiliated entities' headcount or receipts.",
  },
];

gates.forEach((g, idx) => {
  const zebra = idx % 2 === 0 ? WHITE : SLATE_50;
  sOut.getRow(or).height = 36;

  const cA = sOut.getCell(`A${or}`);
  cA.value = g.gate;
  cA.font  = { name: "Consolas", size: 11, bold: true, color: { argb: SLATE_700 } };
  cA.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  cA.alignment = { vertical: "middle", horizontal: "center" };
  cA.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  const cB = sOut.getCell(`B${or}`);
  cB.value = g.label;
  cB.font  = { name: "Calibri", size: 11, color: { argb: SLATE_900 } };
  cB.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  cB.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  cB.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  const cC = sOut.getCell(`C${or}`);
  cC.value = { formula: g.formula };
  cC.font  = { name: "Calibri", size: 11, bold: true };
  cC.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cC.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };

  const cD = sOut.getCell(`D${or}`);
  cD.value = g.path;
  cD.font  = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
  cD.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  cD.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  cD.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  sOut.addConditionalFormatting({
    ref: `C${or}`,
    rules: [
      { type: "containsText", operator: "containsText", text: "PASS", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: EMERALD_BG } }, font: { color: { argb: EMERALD_DARK }, bold: true } }, priority: 1 },
      { type: "containsText", operator: "containsText", text: "GAP",  style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL   } }, font: { color: { argb: "FF991B1B"  }, bold: true } }, priority: 2 },
    ],
  });

  or++;
});

or++;

// Overall verdict
sOut.mergeCells(`A${or}:B${or}`);
sOut.getCell(`A${or}`).value = "OVERALL SDB ELIGIBILITY";
sOut.getCell(`A${or}`).font  = { name: "Calibri", size: 13, bold: true, color: { argb: WHITE } };
sOut.getCell(`A${or}`).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sOut.getCell(`A${or}`).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sOut.getRow(or).height = 28;

// Count gates — need static row references. Gates are at rows or-5 to or-1 (5 gates).
// Use items_gap and items_met named ranges from Checklist
const gateFirstRow = or - 5;
const gateLastRow  = or - 1;
sOut.mergeCells(`C${or}:D${or}`);
const verdictFormula = `IF(COUNTIF(C${gateFirstRow}:C${gateLastRow},"GAP*")>0,` +
  `"NOT READY — "&COUNTIF(C${gateFirstRow}:C${gateLastRow},"GAP*")&" gate(s) with gaps. Resolve before self-certifying.",` +
  `IF(COUNTIF(C${gateFirstRow}:C${gateLastRow},"Not entered*")>0,"INCOMPLETE — fill in all Inputs tabs first.",` +
  `"ELIGIBLE — all gates pass. Self-certify in SAM.gov and update your capability statement."))`;
sOut.getCell(`C${or}`).value     = { formula: verdictFormula };
sOut.getCell(`C${or}`).font      = { name: "Calibri", size: 14, bold: true };
sOut.getCell(`C${or}`).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
sOut.getCell(`C${or}`).fill      = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
sOut.getRow(or).height = 44;
wb.definedNames.add(`Output!$C$${or}`, "sdb_verdict");

sOut.addConditionalFormatting({
  ref: `C${or}:D${or}`,
  rules: [
    { type: "containsText", operator: "containsText", text: "ELIGIBLE",     style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: EMERALD_BG } }, font: { color: { argb: EMERALD_DARK }, bold: true, size: 14 } }, priority: 1 },
    { type: "containsText", operator: "containsText", text: "NOT READY",    style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL   } }, font: { color: { argb: "FF991B1B"  }, bold: true, size: 14 } }, priority: 2 },
    { type: "containsText", operator: "containsText", text: "INCOMPLETE",   style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: AMBER_FILL  } }, font: { color: { argb: "FF92400E"  }, bold: true, size: 14 } }, priority: 3 },
  ],
});

or += 2;
sOut.mergeCells(`A${or}:D${or}`);
noteCell(sOut, `A${or}`, FOOTER);
sOut.getCell(`A${or}`).alignment = { horizontal: "center" };


// ═══════════════════════════════════════════════════════════════════
// SHEET 5 — Help
// ═══════════════════════════════════════════════════════════════════
const sHelp = wb.addWorksheet("Help", {
  views: [{ showGridLines: false }],
  pageSetup: {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CSDB Help&Rcapturepilot.com",
    oddFooter:  "&LFLK-05&C&P of &N&RConfidential",
  },
});

sHelp.columns = [
  { width: 3  },
  { width: 26 },
  { width: 65 },
  { width: 3  },
];

sHelp.mergeCells("A1:D1");
sHelp.getCell("A1").value = "SDB SELF-ASSESSMENT — HELP & REFERENCE";
sHelp.getCell("A1").font  = { name: "Calibri", size: 18, bold: true, color: { argb: WHITE } };
sHelp.getCell("A1").fill  = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sHelp.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sHelp.getRow(1).height = 40;

sHelp.mergeCells("A2:D2");
sHelp.getCell("A2").value = "CapturePilot  –  Capture intelligence for government contractors";
sHelp.getCell("A2").font  = { name: "Calibri", size: 11, italic: true, color: { argb: WHITE } };
sHelp.getCell("A2").fill  = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
sHelp.getCell("A2").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sHelp.getRow(2).height = 22;

const helpContent = [
  { section: "WHAT IS SDB?",
    items: [
      ["Definition", "Small Disadvantaged Business is an SBA designation for small businesses that are ≥51% owned and controlled by one or more socially and economically disadvantaged individuals. SDB is self-certified — unlike 8(a), there's no SBA application or approval process. But the certification standard is the same (13 C.F.R. Part 124, Subpart B)."],
      ["SDB vs 8(a)", "8(a) firms are automatically SDB. If you're in the 8(a) program, skip this worksheet — your 8(a) certificate covers SDB. SDB certification without 8(a) still gets you counted toward agency SDB subcontracting goals and qualifies you for SDB price evaluation preferences at some agencies."],
      ["Why it matters", "Agencies report SDB prime and subcontract awards to SBA annually. Many primes have 5–22% SDB subcontracting goals in their subcontracting plans (FAR 52.219-9). Being SDB-certified and visible in SAM.gov makes you searchable for those goals."],
    ]},
  { section: "SOCIAL DISADVANTAGE — KEY FACTS",
    items: [
      ["Presumed groups", "Black Americans, Hispanic Americans (including persons with origins in Mexico, Puerto Rico, Cuba, Central and South America), Native Americans (American Indian, Eskimo, Aleut, Native Hawaiian), Asian Pacific Americans (originating from Japan, China, Philippines, Vietnam, Korea, Samoa, Guam, U.S. Trust Territories, Northern Mariana Islands, Laos, Cambodia, Taiwan, and the Pacific Islands), and Subcontinent Asian Americans (from India, Pakistan, Bangladesh, Sri Lanka, Bhutan, Nepal, Maldives)."],
      ["Individual showing", "If you're not in a presumed group, your written showing must describe specific events — not general observations about systemic bias. State the date, the parties involved, how it affected your business specifically. One paragraph rarely suffices; SBA OHA decisions run 10–30 pages on contested cases."],
      ["Rebuttable presumption", "SBA can rebut the presumption — e.g., if the owner's background, education, and wealth suggest they did not suffer chronic disadvantage. It happens rarely but does happen."],
    ]},
  { section: "ECONOMIC DISADVANTAGE — KEY FACTS",
    items: [
      ["Net worth exclusions", "Primary residence equity and the equity value of the applicant firm itself are excluded from the $850K net worth calculation. Retirement accounts are excluded under the 2020 rule change — but only IRAs and qualified retirement plans (401k, 403b, SEP-IRA), not brokerage accounts."],
      ["AGI calculation", "Use Line 11 of Form 1040 (AGI). If the owner has a spouse in a community property state, the spouse's income may need to be attributed. Consult a CPA familiar with SBA's community property approach."],
      ["Community property states", "California, Texas, Arizona, New Mexico, Nevada, Washington, Idaho, Wisconsin, and Louisiana. Spouses' income and assets may be attributed in these states. Some exceptions apply — get specific legal advice if your firm is in one of these states."],
    ]},
  { section: "CONTROL — COMMON DISQUALIFIERS",
    items: [
      ["Technical expert control", "If your lead engineer or operations manager effectively runs the business because the owner lacks the technical background, SBA can find control lacking. The owner must be able to make strategic decisions — not necessarily the technical ones — but must genuinely drive the business."],
      ["Non-disadvantaged majority outside a firm", "If a large company (or a non-disadvantaged person) has the ability to veto major contracts, remove the CEO, or redirect the firm's work, the control test fails. Investor protective provisions in venture-backed firms are a common issue."],
      ["Loan covenants", "Banks sometimes include covenants that restrict certain business decisions without lender consent. Review your loan agreements before self-certifying."],
    ]},
  { section: "USEFUL REFERENCES",
    items: [
      ["13 C.F.R. Part 124", "The full SDB/8(a) regulation. Subpart B covers SDB specifically. https://ecfr.gov/current/title-13/chapter-I/part-124"],
      ["SBA Size Standards Table", "Current size standards for all NAICS codes. https://www.sba.gov/document/support-table-size-standards"],
      ["SBA Franchise Directory", "If you're a franchisee, check whether your franchise agreement has been SBA-reviewed. https://www.sba.gov/funding-programs/loans/franchises"],
      ["CapturePilot", "Find set-aside opportunities that match your SDB status, build your pipeline, and track your certifications. https://capturepilot.com"],
    ]},
  { section: "DISCLAIMER",
    items: [
      ["Not legal advice", "This worksheet is an educational tool, not legal advice. SDB eligibility determinations involve facts, law, and regulatory interpretation that change. Consult a procurement attorney before self-certifying, especially if any element of your situation is non-standard. False SDB certifications are federal fraud."],
    ]},
];

let hr = 4;
helpContent.forEach(section => {
  sHelp.mergeCells(`A${hr}:D${hr}`);
  sectionBanner(sHelp, `A${hr}`, section.section, EMERALD_DARK);
  sHelp.getRow(hr).height = 24;
  hr++;
  section.items.forEach(([term, desc]) => {
    sHelp.getRow(hr).height = 56;
    applyLabelStyle(sHelp.getCell(`B${hr}`));
    sHelp.getCell(`B${hr}`).value = term;
    sHelp.getCell(`B${hr}`).alignment = { vertical: "top", horizontal: "right", indent: 1 };
    sHelp.getCell(`C${hr}`).value = desc;
    sHelp.getCell(`C${hr}`).font  = { name: "Calibri", size: 10, color: { argb: SLATE_900 } };
    sHelp.getCell(`C${hr}`).alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    sHelp.getCell(`C${hr}`).border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
    hr++;
  });
  hr++;
});

sHelp.mergeCells(`A${hr}:D${hr}`);
noteCell(sHelp, `A${hr}`, FOOTER);
sHelp.getCell(`A${hr}`).alignment = { horizontal: "center" };


// ═══════════════════════════════════════════════════════════════════
// Save
// ═══════════════════════════════════════════════════════════════════
await wb.xlsx.writeFile(DEPLOY);
console.log(`✓ Saved → ${DEPLOY}`);
