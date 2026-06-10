// Win Themes Workbook — XLSX builder
// Part of the CapturePilot Federal Lead Kit v1.5
// Build: node win-themes-workbook-xlsx.build.mjs

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
const ExcelJS = require("/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs");

// ── Constants ──────────────────────────────────────────────────────────────
const EMERALD      = "FF10B981";
const EMERALD_DARK = "FF047857";
const SLATE_50     = "FFF8FAFC";
const SLATE_100    = "FFF1F5F9";
const SLATE_200    = "FFE2E8F0";
const SLATE_700    = "FF334155";
const SLATE_900    = "FF0F172A";
const AMBER        = "FFF59E0B";
const AMBER_FILL   = "FFFEF3C7";
const GREEN_FILL   = "FFD1FAE5";
const RED_FILL     = "FFFEE2E2";
const BLUE_FILL    = "FFDBEAFE";
const PURPLE_FILL  = "FFEDE9FE";
const WHITE        = "FFFFFFFF";

const FOOTER = "CapturePilot Federal Lead Kit  -  capturepilot.com  -  03 Win Themes Workbook";

const DEPLOY = path.resolve(
  fileURLToPath(import.meta.url),
  "../../../../dashboard/public/starter-pack/03_Solicitation_Playbooks/FLK_03_Win_Themes_Workbook.xlsx"
);

// ── buildListsSheet (canonical pattern) ───────────────────────────────────
function buildListsSheet(wb, lists) {
  let wsLists = wb.getWorksheet("Lists");
  if (!wsLists) {
    wsLists = wb.addWorksheet("Lists", { views: [{ showGridLines: false }] });
  }
  wsLists.columns = lists.map(() => ({ width: 32 }));
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

// ── Header helper ──────────────────────────────────────────────────────────
function sheetHeader(ws, cols, title, subtitle) {
  ws.columns = cols;

  const last = String.fromCharCode(64 + cols.length);

  ws.mergeCells(`A1:${last}1`);
  const h1 = ws.getCell("A1");
  h1.value = title;
  h1.font = { name: "Calibri", size: 20, bold: true, color: { argb: WHITE } };
  h1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  h1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 42;

  ws.mergeCells(`A2:${last}2`);
  const h2 = ws.getCell("A2");
  h2.value = subtitle;
  h2.font = { name: "Calibri", size: 11, italic: true, color: { argb: WHITE } };
  h2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
  h2.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 22;

  ws.getRow(3).height = 8;
}

function sectionBanner(ws, row, text, colCount, bgArgb) {
  const last = String.fromCharCode(64 + colCount);
  ws.mergeCells(`A${row}:${last}${row}`);
  const c = ws.getCell(`A${row}`);
  c.value = text;
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb || EMERALD_DARK } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(row).height = 22;
}

function tableHeader(ws, row, cols, labels) {
  labels.forEach((label, i) => {
    const col = String.fromCharCode(65 + i);
    const c = ws.getCell(`${col}${row}`);
    c.value = label;
    c.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = {
      bottom: { style: "medium", color: { argb: EMERALD } },
    };
  });
  ws.getRow(row).height = 32;
}

function footerRow(ws, row, colCount) {
  const last = String.fromCharCode(64 + colCount);
  ws.mergeCells(`A${row}:${last}${row}`);
  const c = ws.getCell(`A${row}`);
  c.value = FOOTER;
  c.font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
  c.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(row).height = 18;
}

// ══════════════════════════════════════════════════════════════════════════════
// BUILD WORKBOOK
// ══════════════════════════════════════════════════════════════════════════════
const wb = new ExcelJS.Workbook();
wb.creator = "CapturePilot";
wb.lastModifiedBy = "CapturePilot";
wb.created = new Date();
wb.modified = new Date();
wb.company = "CapturePilot";
wb.title = "Win Themes Workbook";
wb.subject = "Federal proposal win themes, ghosting matrix, hot buttons, and section mapping";

// ── Lists must be created first ────────────────────────────────────────────
const EVAL_FACTORS = [
  "Technical Approach",
  "Management Approach",
  "Past Performance",
  "Price / Cost",
  "Key Personnel",
  "Small Business Participation",
  "Transition Plan",
  "Security / Clearance",
  "Oral Presentation",
  "Other Factor",
];

const RATINGS = ["Strong Discriminator", "Moderate Advantage", "Slight Advantage", "Neutral / Parity", "Weakness"];
const STRENGTH_RATINGS = ["Our Strength", "Competitor Strength", "Parity", "Unknown"];
const THEME_STATUS = ["Draft", "Approved", "Needs Evidence", "Cut"];
const PRIORITY = ["High", "Medium", "Low"];
const SECTION_LIST = [
  "Cover Page",
  "Executive Summary",
  "Section L – Technical Approach",
  "Section L – Management Approach",
  "Section L – Past Performance",
  "Section L – Staffing Plan",
  "Section L – Transition Plan",
  "Section L – Price Volume",
  "Section M – Evaluation Factors",
  "Transmittal Letter",
  "Past Performance Submission",
  "Price / Cost Volume",
];
const YES_NO_PARTIAL = ["Yes", "No", "Partial"];

const DV = buildListsSheet(wb, [
  { name: "EvalFactors",     title: "Evaluation Factors",   items: EVAL_FACTORS },
  { name: "Ratings",         title: "Theme Rating",         items: RATINGS },
  { name: "StrengthRatings", title: "Strength / Weakness",  items: STRENGTH_RATINGS },
  { name: "ThemeStatus",     title: "Theme Status",         items: THEME_STATUS },
  { name: "Priority",        title: "Priority",             items: PRIORITY },
  { name: "SectionList",     title: "Proposal Section",     items: SECTION_LIST },
  { name: "YesNoPartial",    title: "Yes / No / Partial",   items: YES_NO_PARTIAL },
]);

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 1 — Win Themes
// ══════════════════════════════════════════════════════════════════════════════
const sThemes = wb.addWorksheet("Win Themes", {
  views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  pageSetup: {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CWin Themes&Rcapturepilot.com",
    oddFooter: "&LFLK-03&C&P of &N&RConfidential",
  },
});

const THEME_COLS = [
  { width: 5 },   // A: #
  { width: 30 },  // B: Theme Statement
  { width: 12 },  // C: Eval Factor
  { width: 12 },  // D: Rating
  { width: 30 },  // E: Discriminator Narrative
  { width: 28 },  // F: Proof Point (past contract, cert, metric)
  { width: 26 },  // G: Risk Being Mitigated
  { width: 14 },  // H: Status
  { width: 10 },  // I: Priority
];

sheetHeader(
  sThemes,
  THEME_COLS,
  "WIN THEMES",
  "CapturePilot  -  One row per theme. Keep each statement to 1-2 lines. Shorter is stickier."
);

sectionBanner(sThemes, 4, "INSTRUCTIONS  |  A win theme = customer hot button + your capability + proof + risk mitigated. Write for the evaluator, not your BD team.", THEME_COLS.length, SLATE_700);

tableHeader(sThemes, 5, THEME_COLS, [
  "#",
  "THEME STATEMENT\n(1-2 sentences max)",
  "EVAL FACTOR",
  "RATING",
  "DISCRIMINATOR NARRATIVE\n(what makes this defensible)",
  "PROOF POINT\n(contract #, cert, metric, award)",
  "RISK BEING MITIGATED\n(what the customer is afraid of)",
  "STATUS",
  "PRIORITY",
]);

// 15 data rows
for (let i = 0; i < 15; i++) {
  const row = 6 + i;
  const zebra = i % 2 === 0 ? WHITE : SLATE_50;

  const cells = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  cells.forEach((col) => {
    const c = sThemes.getCell(`${col}${row}`);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    c.font = { name: "Calibri", size: 10, color: { argb: SLATE_900 } };
    c.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    c.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  });

  // # column
  sThemes.getCell(`A${row}`).value = i + 1;
  sThemes.getCell(`A${row}`).font = { name: "Consolas", size: 10, color: { argb: SLATE_700 } };
  sThemes.getCell(`A${row}`).alignment = { vertical: "top", horizontal: "center" };

  // Eval Factor dropdown
  sThemes.dataValidations.add(`C${row}`, {
    type: "list",
    allowBlank: true,
    formulae: [DV.EvalFactors],
    showErrorMessage: false,
  });

  // Rating dropdown
  sThemes.dataValidations.add(`D${row}`, {
    type: "list",
    allowBlank: true,
    formulae: [DV.Ratings],
    showErrorMessage: false,
  });

  // Status dropdown
  sThemes.dataValidations.add(`H${row}`, {
    type: "list",
    allowBlank: true,
    formulae: [DV.ThemeStatus],
    showErrorMessage: false,
  });

  // Priority dropdown
  sThemes.dataValidations.add(`I${row}`, {
    type: "list",
    allowBlank: true,
    formulae: [DV.Priority],
    showErrorMessage: false,
  });

  sThemes.getRow(row).height = 42;
}

// Conditional formatting — Rating column D
sThemes.addConditionalFormatting({
  ref: `D6:D20`,
  rules: [
    { type: "containsText", operator: "containsText", text: "Strong Discriminator",  style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: GREEN_FILL } }, font: { color: { argb: EMERALD_DARK }, bold: true } }, priority: 1 },
    { type: "containsText", operator: "containsText", text: "Moderate Advantage",    style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: BLUE_FILL  } } }, priority: 2 },
    { type: "containsText", operator: "containsText", text: "Weakness",              style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL   } }, font: { color: { argb: "FF991B1B" } } }, priority: 3 },
  ],
});

// Status CF
sThemes.addConditionalFormatting({
  ref: `H6:H20`,
  rules: [
    { type: "containsText", operator: "containsText", text: "Approved",        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: GREEN_FILL  } } }, priority: 1 },
    { type: "containsText", operator: "containsText", text: "Needs Evidence",  style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: AMBER_FILL  } } }, priority: 2 },
    { type: "containsText", operator: "containsText", text: "Cut",             style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL    } } }, priority: 3 },
  ],
});

footerRow(sThemes, 22, THEME_COLS.length);

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 2 — Ghosting Matrix
// ══════════════════════════════════════════════════════════════════════════════
const sGhost = wb.addWorksheet("Ghosting Matrix", {
  views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  pageSetup: {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CGhosting Matrix&Rcapturepilot.com",
    oddFooter: "&LFLK-03&C&P of &N&RConfidential",
  },
});

// 9 columns: Strength + 4 competitor slots + Action / How to Ghost + RFP Language + Eval Factor + Notes
const GHOST_COLS = [
  { width: 34 },  // A: Our Strength / Capability
  { width: 14 },  // B: Competitor 1
  { width: 14 },  // C: Competitor 2
  { width: 14 },  // D: Competitor 3
  { width: 14 },  // E: Competitor 4
  { width: 30 },  // F: How to Ghost (RFP language / discriminator tactic)
  { width: 24 },  // G: Proposed RFP Language
  { width: 14 },  // H: Eval Factor
  { width: 10 },  // I: Priority
];

sheetHeader(
  sGhost,
  GHOST_COLS,
  "GHOSTING MATRIX",
  "CapturePilot  -  List your real strengths, then score each competitor on each. Write RFP language that highlights your advantage without naming them."
);

sectionBanner(
  sGhost, 4,
  "INSTRUCTIONS  |  Ghosting = structuring your proposal so the evaluator can only give the max score to an offeror with your exact qualifications. Column F is the key output.",
  GHOST_COLS.length, SLATE_700
);

// Competitor name inputs — row 5 as special header with editable competitor name cells
sGhost.getRow(5).height = 30;
["A", "B", "C", "D", "E", "F", "G", "H", "I"].forEach((col, i) => {
  const c = sGhost.getCell(`${col}5`);
  const labels = [
    "OUR STRENGTH / CAPABILITY",
    "COMPETITOR 1\n(click to name)",
    "COMPETITOR 2\n(click to name)",
    "COMPETITOR 3\n(click to name)",
    "COMPETITOR 4\n(click to name)",
    "HOW TO GHOST\n(tactic / RFP language)",
    "PROPOSED RFP LANGUAGE\n(suggest to KO via amendment / Q&A)",
    "EVAL FACTOR",
    "PRIORITY",
  ];
  c.value = labels[i];
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i === 0 ? SLATE_900 : i <= 4 ? EMERALD_DARK : SLATE_900 } };
  c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  c.border = { bottom: { style: "medium", color: { argb: EMERALD } } };
});

// 12 data rows
for (let i = 0; i < 12; i++) {
  const row = 6 + i;
  const zebra = i % 2 === 0 ? WHITE : SLATE_50;

  ["A", "B", "C", "D", "E", "F", "G", "H", "I"].forEach((col) => {
    const c = sGhost.getCell(`${col}${row}`);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    c.font = { name: "Calibri", size: 10, color: { argb: SLATE_900 } };
    c.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    c.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  });

  // Competitor rating dropdowns (B-E)
  ["B", "C", "D", "E"].forEach((col) => {
    sGhost.dataValidations.add(`${col}${row}`, {
      type: "list",
      allowBlank: true,
      formulae: [DV.StrengthRatings],
      showErrorMessage: false,
    });
  });

  // Eval Factor dropdown
  sGhost.dataValidations.add(`H${row}`, {
    type: "list",
    allowBlank: true,
    formulae: [DV.EvalFactors],
    showErrorMessage: false,
  });

  // Priority
  sGhost.dataValidations.add(`I${row}`, {
    type: "list",
    allowBlank: true,
    formulae: [DV.Priority],
    showErrorMessage: false,
  });

  sGhost.getRow(row).height = 42;
}

// CF on competitor columns — highlight their strengths in red, our strengths in green
["B", "C", "D", "E"].forEach((col) => {
  sGhost.addConditionalFormatting({
    ref: `${col}6:${col}17`,
    rules: [
      { type: "containsText", operator: "containsText", text: "Our Strength",         style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: GREEN_FILL  } }, font: { color: { argb: EMERALD_DARK }, bold: true } }, priority: 1 },
      { type: "containsText", operator: "containsText", text: "Competitor Strength",  style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL    } }, font: { color: { argb: "FF991B1B"  }, bold: true } }, priority: 2 },
      { type: "containsText", operator: "containsText", text: "Unknown",              style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: AMBER_FILL  } } }, priority: 3 },
    ],
  });
});

footerRow(sGhost, 20, GHOST_COLS.length);

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 3 — Hot Buttons
// ══════════════════════════════════════════════════════════════════════════════
const sHotButtons = wb.addWorksheet("Hot Buttons", {
  views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  pageSetup: {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CHot Buttons&Rcapturepilot.com",
    oddFooter: "&LFLK-03&C&P of &N&RConfidential",
  },
});

const HB_COLS = [
  { width: 5  },  // A: #
  { width: 30 },  // B: Hot Button / Agency Priority
  { width: 16 },  // C: Source (where you learned this)
  { width: 14 },  // D: Source Date
  { width: 14 },  // E: Priority
  { width: 26 },  // F: Verbatim Quote or Paraphrase
  { width: 28 },  // G: Our Response / Win Theme it Feeds
  { width: 14 },  // H: Eval Factor
  { width: 14 },  // I: Addressed in Proposal?
];

sheetHeader(
  sHotButtons,
  HB_COLS,
  "HOT BUTTONS",
  "CapturePilot  -  Capture agency-stated priorities from sources sought, industry days, Q&A, FOIA, and past award debrief notes."
);

sectionBanner(
  sHotButtons, 4,
  "SOURCES  |  Sources Sought / RFI responses  -  Industry day transcript  -  FPDS award description  -  GAO protest decisions  -  Debrief notes  -  Customer meetings",
  HB_COLS.length, SLATE_700
);

tableHeader(sHotButtons, 5, HB_COLS, [
  "#",
  "HOT BUTTON / AGENCY PRIORITY",
  "SOURCE\n(Doc title or meeting)",
  "SOURCE DATE",
  "PRIORITY",
  "VERBATIM QUOTE OR PARAPHRASE\n(exact wording when possible)",
  "OUR RESPONSE / WIN THEME IT FEEDS",
  "EVAL FACTOR",
  "ADDRESSED\nIN PROPOSAL?",
]);

for (let i = 0; i < 15; i++) {
  const row = 6 + i;
  const zebra = i % 2 === 0 ? WHITE : SLATE_50;

  ["A", "B", "C", "D", "E", "F", "G", "H", "I"].forEach((col) => {
    const c = sHotButtons.getCell(`${col}${row}`);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    c.font = { name: "Calibri", size: 10, color: { argb: SLATE_900 } };
    c.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    c.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  });

  sHotButtons.getCell(`A${row}`).value = i + 1;
  sHotButtons.getCell(`A${row}`).font = { name: "Consolas", size: 10, color: { argb: SLATE_700 } };
  sHotButtons.getCell(`A${row}`).alignment = { vertical: "top", horizontal: "center" };

  // Date format column D
  sHotButtons.getCell(`D${row}`).numFmt = "mm/dd/yyyy";

  // Priority dropdown
  sHotButtons.dataValidations.add(`E${row}`, {
    type: "list",
    allowBlank: true,
    formulae: [DV.Priority],
    showErrorMessage: false,
  });

  // Eval Factor dropdown
  sHotButtons.dataValidations.add(`H${row}`, {
    type: "list",
    allowBlank: true,
    formulae: [DV.EvalFactors],
    showErrorMessage: false,
  });

  // Addressed in proposal dropdown
  sHotButtons.dataValidations.add(`I${row}`, {
    type: "list",
    allowBlank: true,
    formulae: [DV.YesNoPartial],
    showErrorMessage: false,
  });

  sHotButtons.getRow(row).height = 42;
}

// CF on "Addressed" column I
sHotButtons.addConditionalFormatting({
  ref: `I6:I20`,
  rules: [
    { type: "containsText", operator: "containsText", text: "Yes",     style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: GREEN_FILL } } }, priority: 1 },
    { type: "containsText", operator: "containsText", text: "Partial", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: AMBER_FILL } } }, priority: 2 },
    { type: "containsText", operator: "containsText", text: "No",      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL   } } }, priority: 3 },
  ],
});

// CF on priority column E
sHotButtons.addConditionalFormatting({
  ref: `E6:E20`,
  rules: [
    { type: "containsText", operator: "containsText", text: "High",   style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_FILL   } }, font: { color: { argb: "FF991B1B" }, bold: true } }, priority: 1 },
    { type: "containsText", operator: "containsText", text: "Medium", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: AMBER_FILL } } }, priority: 2 },
  ],
});

footerRow(sHotButtons, 22, HB_COLS.length);

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 4 — Mapping (which theme appears in which section)
// ══════════════════════════════════════════════════════════════════════════════
const sMapping = wb.addWorksheet("Mapping", {
  views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  pageSetup: {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CTheme-to-Section Mapping&Rcapturepilot.com",
    oddFooter: "&LFLK-03&C&P of &N&RConfidential",
  },
});

// Columns: Theme # | Theme Statement | then one column per proposal section (12 sections)
// 14 cols total
const MAPPING_COLS = [
  { width: 6  },  // A: Theme #
  { width: 28 },  // B: Theme Statement (short)
  { width: 11 },  // C: Cover Page
  { width: 11 },  // D: Exec Summary
  { width: 11 },  // E: Tech Approach
  { width: 11 },  // F: Mgmt Approach
  { width: 11 },  // G: Past Perf
  { width: 11 },  // H: Staffing
  { width: 11 },  // I: Transition
  { width: 11 },  // J: Price Vol
  { width: 11 },  // K: Sec M
  { width: 11 },  // L: Trans Letter
  { width: 11 },  // M: PP Submission
  { width: 11 },  // N: Price/Cost Vol
];

sheetHeader(
  sMapping,
  MAPPING_COLS,
  "THEME-TO-SECTION MAPPING",
  "CapturePilot  -  Mark each cell with P (Primary), S (Secondary), or leave blank. Every HOT theme should appear in at least 3 sections."
);

sectionBanner(
  sMapping, 4,
  "LEGEND  |  P = Primary placement (full theme stated here)  -  S = Secondary (reinforced, echoed)  -  Blank = not addressed in this section",
  MAPPING_COLS.length, SLATE_700
);

// Header row 5
sMapping.getRow(5).height = 48;
const mappingLabels = [
  "THEME\n#",
  "THEME STATEMENT\n(short form)",
  "Cover\nPage",
  "Exec\nSummary",
  "Technical\nApproach",
  "Management\nApproach",
  "Past\nPerformance",
  "Staffing\nPlan",
  "Transition\nPlan",
  "Price\nVolume",
  "Section M\nFactors",
  "Transmittal\nLetter",
  "Past Perf\nSubmission",
  "Price/Cost\nVolume",
];
mappingLabels.forEach((label, i) => {
  const col = String.fromCharCode(65 + i);
  const c = sMapping.getCell(`${col}5`);
  c.value = label;
  c.font = { name: "Calibri", size: 9, bold: true, color: { argb: WHITE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i < 2 ? SLATE_900 : EMERALD_DARK } };
  c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  c.border = { bottom: { style: "medium", color: { argb: EMERALD } } };
});

// 15 theme rows
for (let i = 0; i < 15; i++) {
  const row = 6 + i;
  const zebra = i % 2 === 0 ? WHITE : SLATE_50;

  for (let col = 0; col < 14; col++) {
    const colLetter = String.fromCharCode(65 + col);
    const c = sMapping.getCell(`${colLetter}${row}`);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    c.font = { name: "Calibri", size: 10, color: { argb: SLATE_900 } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
  }

  // Theme # (links conceptually to Win Themes tab by row number)
  sMapping.getCell(`A${row}`).value = i + 1;
  sMapping.getCell(`A${row}`).font = { name: "Consolas", size: 10, bold: true, color: { argb: SLATE_700 } };

  // Theme statement — left-aligned
  sMapping.getCell(`B${row}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  sMapping.getCell(`B${row}`).font = { name: "Calibri", size: 10, color: { argb: SLATE_900 } };

  // Section columns C-N: P/S or blank, with dropdowns
  for (let col = 2; col < 14; col++) {
    const colLetter = String.fromCharCode(65 + col);
    sMapping.dataValidations.add(`${colLetter}${row}`, {
      type: "list",
      allowBlank: true,
      formulae: ['"P,S"'],   // simple 2-option, no Lists sheet needed
      showErrorMessage: false,
    });
  }

  sMapping.getRow(row).height = 28;
}

// CF for P (primary) = green, S (secondary) = blue
for (let col = 2; col < 14; col++) {
  const colLetter = String.fromCharCode(65 + col);
  sMapping.addConditionalFormatting({
    ref: `${colLetter}6:${colLetter}20`,
    rules: [
      { type: "containsText", operator: "containsText", text: "P", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: GREEN_FILL  } }, font: { color: { argb: EMERALD_DARK }, bold: true, size: 12 } }, priority: 1 },
      { type: "containsText", operator: "containsText", text: "S", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: BLUE_FILL   } }, font: { color: { argb: "FF1D4ED8"  }, bold: true } }, priority: 2 },
    ],
  });
}

footerRow(sMapping, 22, MAPPING_COLS.length);

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 5 — Instructions (Settings / Lists visible guide)
// ══════════════════════════════════════════════════════════════════════════════
const sInstr = wb.addWorksheet("Instructions", {
  views: [{ showGridLines: false }],
  pageSetup: {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CInstructions&Rcapturepilot.com",
    oddFooter: "&LFLK-03&C&P of &N&RConfidential",
  },
});

const INSTR_COLS = [
  { width: 20 },  // A
  { width: 60 },  // B
];
sheetHeader(
  sInstr,
  INSTR_COLS,
  "WIN THEMES WORKBOOK — INSTRUCTIONS",
  "CapturePilot Federal Lead Kit v1.5  -  capturepilot.com"
);

let ir = 4;

const instrSections = [
  {
    heading: "WHAT THIS FILE IS FOR",
    items: [
      "Win themes are the strategic core of any federal proposal. They answer the question every evaluator is really asking: 'Why should we pick you over the other four offerors?' This workbook gives you a structured place to develop, vet, and track them — before you write a single proposal section.",
      "Use it starting at RFP release (or earlier if you have a sources sought). Revisit it every time you get new intelligence: Q&A responses, site visits, amendment L/M changes.",
    ],
  },
  {
    heading: "TAB 1 — WIN THEMES",
    items: [
      "One row per theme. Aim for 4-8 themes per proposal — more than that and evaluators can't remember any of them.",
      "Theme Statement: Write it as a complete sentence that names the customer benefit, your capability, and the proof. Bad: 'We have strong cybersecurity.' Good: 'Our CMMC Level 2 certification — achieved 14 months ahead of the DoD deadline — means HHS will not carry compliance risk into the base year.'",
      "Discriminator Narrative: What makes this theme yours alone? If your competitor could say the same thing, it is not a discriminator.",
      "Proof Point: Contract number, certification date, specific metric (e.g., 99.97% SLA over 36 months on Task Order W912DY-22-F-0043), award, or past performance rating. Vague proof is worse than no proof.",
      "Risk Mitigated: What is the customer afraid of? Mission disruption, transition failure, cost overrun, incumbent lock-in, audit findings? Name it explicitly — then show how your capability neutralizes it.",
    ],
  },
  {
    heading: "TAB 2 — GHOSTING MATRIX",
    items: [
      "Ghosting is legal, ethical, and expected at the top tier. It means writing evaluation criteria language — through your proposal, your Q&A responses, or direct KO engagement — that only an offeror with your exact qualifications can score maximum points on.",
      "Column B-E: Score each competitor as Our Strength, Competitor Strength, Parity, or Unknown. Red cells are gaps you need to address or mitigate in the proposal.",
      "Column F: How to Ghost. 'Require CMMC Level 2 certification at time of proposal submission' (not 'in progress'). 'Require demonstrated experience with USDA's FSA cloud infrastructure on an active or recently-completed contract.' Be specific enough to matter.",
      "Column G: Proposed RFP language you could submit in a Q&A response or amendment request. Keep it neutral and defensible — frame it as improving evaluation clarity, not helping yourself.",
    ],
  },
  {
    heading: "TAB 3 — HOT BUTTONS",
    items: [
      "Hot buttons are priorities the customer has already told you about — in writing, on the record. Every sources sought response, industry day slide deck, Q&A log, and FPDS award description contains them. FOIA requests for the incumbent's performance evaluation summary are also valid sources.",
      "Capture the verbatim quote when possible. 'Rapid on-boarding of cleared personnel' hits differently in a proposal than your paraphrase of it.",
      "The 'Addressed in Proposal?' column is your QC check before final submission. Every High-priority hot button should read 'Yes' by Final Review.",
    ],
  },
  {
    heading: "TAB 4 — MAPPING",
    items: [
      "Mark P (Primary) where the theme is fully stated and substantiated. Mark S (Secondary) where the theme is echoed or reinforced. Blank means the section does not address it.",
      "Every HOT theme (Rating = Strong Discriminator) should have at least one P and two or three S marks. If a theme only appears once, you're leaving evaluation points on the table.",
      "Use this map to brief your proposal writers. Instead of handing them a full document, hand them the row for their section: these three themes, these two proof points, this risk to address.",
    ],
  },
  {
    heading: "TIPS FROM CAPTURE LEADS",
    items: [
      "Start with the customer's pain, not your capability. Evaluators don't care that you're great — they care that you'll solve their problem without creating a new one.",
      "One theme per paragraph in the technical volume. Stacking three themes in one paragraph dilutes all three.",
      "Run a 'can a competitor say this?' test on every theme statement before final review. If the answer is yes, sharpen it.",
      "If you can't fill in the Proof Point column, you don't have a theme — you have an aspiration. Find the evidence or cut the theme.",
      "The best sources sought responses don't just prove capability — they shape the evaluation criteria. If the KO uses language from your sources sought response in the final RFP Section M, that's a ghosting win.",
      "FAR 15.303 requires the source selection plan to include evaluation factors and sub-factors that represent the key areas of importance. Request a pre-proposal conference (FAR 15.201) if the agency is willing — that's where real hot buttons surface.",
    ],
  },
];

instrSections.forEach((section) => {
  // Section banner
  sInstr.mergeCells(`A${ir}:B${ir}`);
  const bCell = sInstr.getCell(`A${ir}`);
  bCell.value = section.heading;
  bCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
  bCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
  bCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sInstr.getRow(ir).height = 24;
  ir += 1;

  section.items.forEach((item) => {
    sInstr.mergeCells(`A${ir}:B${ir}`);
    const c = sInstr.getCell(`A${ir}`);
    c.value = "•  " + item;
    c.font = { name: "Calibri", size: 10, color: { argb: SLATE_900 } };
    c.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ir % 2 === 0 ? WHITE : SLATE_50 } };
    c.border = { bottom: { style: "thin", color: { argb: SLATE_200 } } };
    sInstr.getRow(ir).height = 48;
    ir += 1;
  });

  // Spacer
  sInstr.getRow(ir).height = 8;
  ir += 1;
});

footerRow(sInstr, ir, 2);

// ══════════════════════════════════════════════════════════════════════════════
// WRITE OUTPUT
// ══════════════════════════════════════════════════════════════════════════════
const outDir = path.dirname(DEPLOY);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

await wb.xlsx.writeFile(DEPLOY);
console.log(`✓ Written to ${DEPLOY}`);
const stat = fs.statSync(DEPLOY);
console.log(`  Size: ${(stat.size / 1024).toFixed(1)} KB`);
