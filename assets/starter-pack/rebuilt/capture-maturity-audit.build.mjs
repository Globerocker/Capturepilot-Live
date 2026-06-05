// Build: Capture Maturity Self-Audit (XLSX, Excel + Google Sheets compatible)
// Output: FLK_09_Capture_Maturity_Self_Audit.xlsx
//
// Tabs:
//   1. Instructions   — how to use, scoring rubric, voice
//   2. Self-Audit     — 7 domains × ~6 practices; 0-4 score input with dropdown
//   3. Score Dashboard — weighted rollup, maturity tier, gap to benchmark
//   4. Action Plan    — 30/60/90 tracker with status dropdown + completion %
//   5. Help & Examples — what a "3" vs "4" actually looks like per domain
//
// Formulas avoid LAMBDA / XLOOKUP / FILTER (broken in older Excel / some Sheets).
// Uses SUMPRODUCT, IF, IFS, COUNTIF, AVERAGEIF, INDEX/MATCH.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ExcelJS = require("/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs");
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT = join(__dirname, "FLK_09_Capture_Maturity_Self_Audit.xlsx");

const BRAND = {
  emerald: "FF10B981",
  emeraldDark: "FF047857",
  ink: "FF0F172A",
  paper: "FFF8FAFC",
  border: "FFCBD5E1",
  amber: "FFF59E0B",
  red: "FFDC2626",
  green: "FF16A34A",
  slate: "FF475569",
  cardBg: "FFECFDF5",
};

const wb = new ExcelJS.Workbook();
wb.creator = "CapturePilot";
wb.lastModifiedBy = "CapturePilot";
wb.created = new Date();
wb.modified = new Date();
wb.title = "Capture Maturity Self-Audit";
wb.subject = "Federal Lead Kit — diagnostic for small federal contractors";
wb.company = "CapturePilot";

// ---------- shared style helpers ----------
const thin = { style: "thin", color: { argb: BRAND.border } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function sectionHeader(cell, text) {
  cell.value = text;
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: "Calibri" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.emerald } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  cell.border = border;
}
function subHeader(cell, text) {
  cell.value = text;
  cell.font = { bold: true, color: { argb: BRAND.ink }, size: 11 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.cardBg } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  cell.border = border;
}
function labelCell(cell, text, opts = {}) {
  cell.value = text;
  cell.font = { name: "Calibri", size: 11, color: { argb: BRAND.ink }, bold: !!opts.bold };
  cell.alignment = { vertical: "middle", horizontal: opts.align || "left", wrapText: true, indent: opts.indent || 0 };
  cell.border = border;
  if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
}
function inputCell(cell, value, opts = {}) {
  cell.value = value;
  cell.font = { name: "Calibri", size: 11, color: { argb: BRAND.ink }, bold: !!opts.bold };
  cell.alignment = { vertical: "middle", horizontal: opts.align || "center" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill || "FFFFFBEB" } };
  cell.border = border;
  if (opts.numFmt) cell.numFmt = opts.numFmt;
}
function outputCell(cell, formula, opts = {}) {
  cell.value = { formula };
  cell.font = { name: "Calibri", size: 11, color: { argb: BRAND.ink }, bold: !!opts.bold };
  cell.alignment = { vertical: "middle", horizontal: opts.align || "center" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill || BRAND.paper } };
  cell.border = border;
  if (opts.numFmt) cell.numFmt = opts.numFmt;
}

// ---------- 1) INSTRUCTIONS ----------
const wsInst = wb.addWorksheet("Instructions", {
  views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
  headerFooter: { oddHeader: "&LCapturePilot &C Capture Maturity Self-Audit &RFederal Lead Kit", oddFooter: "&LRebuilt &C Page &P of &N &Rcapturepilot.com" },
});
wsInst.columns = [{ width: 4 }, { width: 28 }, { width: 70 }, { width: 4 }];

wsInst.mergeCells("B1:C1");
sectionHeader(wsInst.getCell("B1"), "CAPTURE MATURITY SELF-AUDIT — INSTRUCTIONS");
wsInst.getRow(1).height = 28;

const instLines = [
  ["What this is", "A diagnostic for small federal contractors. Rate seven capture domains 0-4. The workbook calculates a weighted maturity score and tells you where to focus first."],
  ["Time required", "About 25 to 40 minutes if you're honest. Most founders try to rush it and end up grading themselves 3s across the board. Don't."],
  ["How to use it", "1) Open the Self-Audit tab. 2) Pick a score 0-4 for every practice using the dropdown. 3) Check the Score Dashboard for your weighted total and tier. 4) Open Action Plan and start working the items the dashboard flagged red."],
  ["Scoring rubric", "0 = Not in place. 1 = We know we should, we don't. 2 = Partially in place, inconsistent. 3 = Consistently doing it. 4 = Documented, repeatable, you could show evidence in a DCAA audit or due diligence review."],
  ["When to retake it", "Quarterly is the sweet spot. Re-score before each color review or before submitting a major proposal. Track movement — a stuck '2' across two quarters means you have a process problem, not a knowledge problem."],
  ["Who fills it out", "Founder plus capture/BD lead, separately. Compare answers. If you score yourself 4 on Past Performance and your BD lead scores 1, that gap is the story."],
  ["What 'Best practice' actually means", "A '4' is rare. If you have to think hard about whether you've ever done the thing, you're at 2. If you do it but it lives in one person's head, that's a 3. A 4 has a written SOP, a named owner, and evidence."],
  ["About the benchmark target", "We set 75% as the target for each domain. That's the median for firms with 3+ years of federal wins and a deliberate capture function. Below 40% is normal for first-year contractors. Don't beat yourself up — just work the plan."],
  ["Voice note", "We wrote this for a business owner with a contract due in six months and zero government experience. If a question is unclear, the wording is on us, not you. Email Andre at info@capturepilot.com."],
];
let r = 3;
for (const [label, body] of instLines) {
  labelCell(wsInst.getCell(`B${r}`), label, { bold: true, fill: BRAND.cardBg });
  labelCell(wsInst.getCell(`C${r}`), body);
  wsInst.getRow(r).height = Math.max(34, Math.ceil(body.length / 65) * 16);
  r++;
}

r += 1;
wsInst.mergeCells(`B${r}:C${r}`);
sectionHeader(wsInst.getCell(`B${r}`), "THE SEVEN DOMAINS (and why they're weighted that way)");
wsInst.getRow(r).height = 24;
r++;

const domainDescriptions = [
  ["Market Intelligence (15%)", "Do you know what's coming six to twelve months out, and who's likely to win it?"],
  ["Pipeline & Capture Management (20%)", "Highest weight. Capture work done early — six to nine months before RFP — is the single biggest driver of win rate."],
  ["Relationship Building (15%)", "If you're meeting the KO for the first time at the proposal kickoff, you're already losing."],
  ["Proposal Quality (20%)", "Tied for highest weight. Includes color team reviews, compliance, and pricing discipline. This is where good capture work goes to die if your proposal team is sloppy."],
  ["Past Performance (15%)", "Federal evaluators read CPARS before they read your prose. A library of structured, RFP-ready references is non-negotiable."],
  ["Compliance & Certifications (10%)", "Lower weight only because it's binary — either your SAM registration is current or it isn't. But if you score 0 here, nothing else matters."],
  ["BD Infrastructure (5%)", "The plumbing. CRM, written BD strategy, separate cost pool. Small weight because tools don't win contracts. People who use them do."],
];
for (const [label, body] of domainDescriptions) {
  labelCell(wsInst.getCell(`B${r}`), label, { bold: true });
  labelCell(wsInst.getCell(`C${r}`), body);
  wsInst.getRow(r).height = Math.max(28, Math.ceil(body.length / 65) * 16);
  r++;
}

// ---------- 2) SELF-AUDIT ----------
const wsAudit = wb.addWorksheet("Self-Audit", {
  views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
  pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  headerFooter: { oddHeader: "&LCapturePilot &C Capture Maturity Self-Audit &RFederal Lead Kit", oddFooter: "&LScore honestly &C Page &P of &N &Rcapturepilot.com" },
});
wsAudit.columns = [
  { width: 4 },   // A spacer
  { width: 62 },  // B practice
  { width: 12 },  // C score
  { width: 8 },   // D max
  { width: 14 },  // E pct
  { width: 16 },  // F tier
  { width: 14 },  // G priority flag
  { width: 32 },  // H notes
];

wsAudit.mergeCells("B1:H1");
sectionHeader(wsAudit.getCell("B1"), "CAPTURE MATURITY SELF-AUDIT — score each practice 0 to 4");
wsAudit.getRow(1).height = 26;

wsAudit.mergeCells("B2:H2");
labelCell(wsAudit.getCell("B2"), "Use the dropdown in the Score column. 0 = not in place. 4 = documented and you could prove it. Be honest — this is a diagnostic, not a report card.", { fill: BRAND.paper });
wsAudit.getRow(2).height = 30;

// Column headers
const headers = ["Domain / Practice", "Score (0-4)", "Max", "Domain %", "Tier", "Priority", "Notes"];
headers.forEach((h, i) => subHeader(wsAudit.getCell(3, 2 + i), h));
wsAudit.getRow(3).height = 22;

// Domain definitions
const domains = [
  {
    key: "MI",
    title: "MARKET INTELLIGENCE",
    weight: 0.15,
    practices: [
      "We have a documented target agency list with 6 to 12 months of pipeline visibility.",
      "We monitor SAM.gov daily and have alerts set for our NAICS codes.",
      "We track incumbent contract expiration dates for opportunities we want to recompete.",
      "We have researched at least 3 competitors' rates, capabilities, and past performance.",
      "We understand our top agencies' strategic plans and mission priorities.",
      "We know which GWACs and IDIQs our target agencies prefer, and why.",
    ],
    actionWhenLow: "Build agency target list; set SAM.gov alerts; pull FPDS incumbent data on top 5 contracts.",
  },
  {
    key: "PC",
    title: "PIPELINE & CAPTURE MANAGEMENT",
    weight: 0.20,
    practices: [
      "We maintain a written pipeline with probability of win (PWin) scores per opportunity.",
      "We use a documented bid / no-bid process — not gut feel.",
      "We start capture activities at least 6 to 9 months before RFP release.",
      "We track time invested per pursuit and compare against win rates.",
      "We have a defined capture stage gate process (market research, pre-sol, RFP, proposal).",
      "We conduct win / loss analyses on every submitted proposal.",
    ],
    actionWhenLow: "Implement a stage-gate capture process; start pursuits at 6+ months pre-RFP; require PWin per row.",
  },
  {
    key: "RB",
    title: "RELATIONSHIP BUILDING",
    weight: 0.15,
    practices: [
      "We have established relationships with at least 2 KOs or CORs at target agencies.",
      "We regularly attend industry days, sources sought events, and agency briefings.",
      "We've had at least one capability briefing with a target agency in the past 6 months.",
      "We have a defined outreach cadence — not just responding to solicitations.",
      "We maintain relationships with at least 2 large primes as a potential sub.",
      "We attend at least one small business networking event per quarter.",
    ],
    actionWhenLow: "Book 2 OSDBU briefings this quarter; attend industry days consistently; build 2 prime relationships.",
  },
  {
    key: "PQ",
    title: "PROPOSAL QUALITY",
    weight: 0.20,
    practices: [
      "We have a written proposal development process with roles and timelines.",
      "We conduct internal color team reviews (Pink, Red, Gold) before submission.",
      "Our proposals consistently address evaluation criteria in the order listed in the RFP.",
      "We use past performance references that are directly relevant to the requirement.",
      "Our pricing is informed by competitor analysis, not just cost-plus to margin.",
      "We comply fully with Section L and M — page limits, font, format, submission method.",
    ],
    actionWhenLow: "Install color team reviews; build a Section L/M compliance matrix template; price to win, not to margin.",
  },
  {
    key: "PP",
    title: "PAST PERFORMANCE",
    weight: 0.15,
    practices: [
      "We maintain a library of past performance references in a structured format.",
      "We have at least 3 directly relevant federal contracts (or strong commercial analogues).",
      "We collect CPARS / PPIRS ratings and know our scores.",
      "We proactively manage government POC relationships on active contracts.",
      "We document lessons learned and outcome metrics on every completed contract.",
      "We have written narratives ready for our top 5 past performance references.",
    ],
    actionWhenLow: "Build 5 structured PP write-ups (CPARS format); collect every CPARS score on file.",
  },
  {
    key: "CC",
    title: "COMPLIANCE & CERTIFICATIONS",
    weight: 0.10,
    practices: [
      "Our SAM.gov registration is active and was updated within the past 12 months.",
      "Our NAICS codes in SAM.gov accurately reflect our current service offerings.",
      "We have verified our size standard for every NAICS code we compete under.",
      "If we hold a set-aside certification (8(a), SDVOSB, HUBZone, WOSB), it is current.",
      "We understand FAR 52.219 small business subcontracting requirements for primes.",
      "We have a written Conflict of Interest policy and OCI disclosure process.",
    ],
    actionWhenLow: "Renew SAM; verify certifications; document COI process; review NAICS size standards.",
  },
  {
    key: "BD",
    title: "BD INFRASTRUCTURE",
    weight: 0.05,
    practices: [
      "We have a current, one-page capability statement that is mission-focused (not generic).",
      "We have a written BD strategy with documented annual new business targets.",
      "We track BD costs as a separate cost pool (or at least as a line item).",
      "We have a CRM or pipeline tracker — not spreadsheets on personal drives.",
    ],
    actionWhenLow: "Write the BD strategy; install a CRM; refresh the capability statement per top agency.",
  },
];

// Track row mapping per domain for dashboard formulas
const domainRowMap = {}; // key -> { totalRow, startRow, endRow, weight, title, actionWhenLow }
let row = 4;
const practiceScoreRows = []; // all individual practice score rows (for global stats)

for (const d of domains) {
  // Domain header
  wsAudit.mergeCells(`B${row}:H${row}`);
  const headerCell = wsAudit.getCell(`B${row}`);
  headerCell.value = `${d.title}   (Weight: ${(d.weight * 100).toFixed(0)}%)`;
  headerCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.emeraldDark } };
  headerCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  headerCell.border = border;
  wsAudit.getRow(row).height = 22;
  row++;

  const startRow = row;
  for (const p of d.practices) {
    labelCell(wsAudit.getCell(`B${row}`), p, { indent: 2 });
    inputCell(wsAudit.getCell(`C${row}`), 0, { fill: "FFFFFBEB" });
    inputCell(wsAudit.getCell(`D${row}`), 4, { fill: BRAND.paper });
    // Per-row tier text (so user sees instant feedback)
    outputCell(
      wsAudit.getCell(`E${row}`),
      `IFERROR(C${row}/D${row},0)`,
      { numFmt: "0%" }
    );
    outputCell(
      wsAudit.getCell(`F${row}`),
      `IF(C${row}=0,"Missing",IF(C${row}=1,"Aware",IF(C${row}=2,"Partial",IF(C${row}=3,"Consistent","Documented"))))`
    );
    outputCell(
      wsAudit.getCell(`G${row}`),
      `IF(C${row}<=1,"FIX",IF(C${row}=2,"Improve",""))`,
      { fill: BRAND.paper }
    );
    inputCell(wsAudit.getCell(`H${row}`), "", { align: "left", fill: "FFFFFFFF" });
    practiceScoreRows.push(row);
    wsAudit.getRow(row).height = 32;

    // Data validation 0-4
    wsAudit.getCell(`C${row}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"0,1,2,3,4"'],
      showErrorMessage: true,
      errorTitle: "Score must be 0-4",
      error: "Pick a value between 0 and 4 from the dropdown.",
    };
    row++;
  }
  const endRow = row - 1;

  // Domain total row
  labelCell(wsAudit.getCell(`B${row}`), `  ${d.title} — Domain Total`, { bold: true, fill: BRAND.cardBg });
  outputCell(wsAudit.getCell(`C${row}`), `SUM(C${startRow}:C${endRow})`, { bold: true, fill: BRAND.cardBg });
  outputCell(wsAudit.getCell(`D${row}`), `SUM(D${startRow}:D${endRow})`, { bold: true, fill: BRAND.cardBg });
  outputCell(wsAudit.getCell(`E${row}`), `IFERROR(C${row}/D${row},0)`, { bold: true, numFmt: "0%", fill: BRAND.cardBg });
  outputCell(
    wsAudit.getCell(`F${row}`),
    `IF(E${row}>=0.85,"Optimized",IF(E${row}>=0.70,"Strong",IF(E${row}>=0.40,"Progressing","Developing")))`,
    { bold: true, fill: BRAND.cardBg }
  );
  outputCell(
    wsAudit.getCell(`G${row}`),
    `IF(E${row}<0.40,"PRIORITY","")`,
    { bold: true, fill: BRAND.cardBg }
  );
  labelCell(wsAudit.getCell(`H${row}`), "", { fill: BRAND.cardBg });
  wsAudit.getRow(row).height = 22;

  domainRowMap[d.key] = {
    title: d.title,
    weight: d.weight,
    actionWhenLow: d.actionWhenLow,
    startRow,
    endRow,
    totalRow: row,
  };
  row++;
}

// Note row
wsAudit.mergeCells(`B${row}:H${row}`);
labelCell(
  wsAudit.getCell(`B${row}`),
  "SCORING NOTE: A '4' is rare. Score it only if the practice is documented, consistently applied, and you could show evidence in a DCAA audit or due diligence review. Aspirational practices score 1 or 2, not 3.",
  { fill: "FFFEF3C7" }
);
wsAudit.getRow(row).height = 36;

// Conditional formatting on domain % column for total rows
const totalRows = Object.values(domainRowMap).map((d) => d.totalRow);
for (const tr of totalRows) {
  wsAudit.addConditionalFormatting({
    ref: `E${tr}`,
    rules: [
      { type: "cellIs", operator: "greaterThanOrEqual", priority: 1, formulae: [0.85], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD1FAE5" } }, font: { color: { argb: BRAND.green }, bold: true } } },
      { type: "cellIs", operator: "between", priority: 2, formulae: [0.40, 0.8499], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFEF3C7" } }, font: { color: { argb: BRAND.amber }, bold: true } } },
      { type: "cellIs", operator: "lessThan", priority: 3, formulae: [0.40], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFEE2E2" } }, font: { color: { argb: BRAND.red }, bold: true } } },
    ],
  });
}

// ---------- 3) SCORE DASHBOARD ----------
const wsDash = wb.addWorksheet("Score Dashboard", {
  views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  headerFooter: { oddHeader: "&LCapturePilot &C Capture Maturity Dashboard &RFederal Lead Kit", oddFooter: "&LAuto-calculated &C Page &P of &N &Rcapturepilot.com" },
});
wsDash.columns = [
  { width: 4 },
  { width: 38 }, // domain
  { width: 12 }, // weight
  { width: 14 }, // your %
  { width: 18 }, // weighted contrib
  { width: 16 }, // benchmark
  { width: 12 }, // gap
  { width: 32 }, // recommended action
];

wsDash.mergeCells("B1:H1");
sectionHeader(wsDash.getCell("B1"), "CAPTURE MATURITY DASHBOARD — auto-calculated from Self-Audit");
wsDash.getRow(1).height = 26;

// Sub-header
const dashHeaders = ["Domain", "Weight", "Your Score %", "Weighted Contribution", "Benchmark", "Gap", "Recommended Focus Area"];
dashHeaders.forEach((h, i) => subHeader(wsDash.getCell(3, 2 + i), h));
wsDash.getRow(3).height = 22;

let dr = 4;
const benchmark = 0.75;
const dashDomainRows = [];
for (const d of domains) {
  const m = domainRowMap[d.key];
  labelCell(wsDash.getCell(`B${dr}`), d.title);
  inputCell(wsDash.getCell(`C${dr}`), d.weight, { numFmt: "0%", fill: BRAND.paper });
  outputCell(wsDash.getCell(`D${dr}`), `'Self-Audit'!E${m.totalRow}`, { numFmt: "0%" });
  outputCell(wsDash.getCell(`E${dr}`), `C${dr}*D${dr}`, { numFmt: "0.0%" });
  inputCell(wsDash.getCell(`F${dr}`), benchmark, { numFmt: "0%", fill: BRAND.paper });
  outputCell(wsDash.getCell(`G${dr}`), `F${dr}-D${dr}`, { numFmt: "0%" });
  outputCell(
    wsDash.getCell(`H${dr}`),
    `IF(D${dr}<0.40,"${d.actionWhenLow.replace(/"/g, '""')}","On track — maintain")`,
    { align: "left" }
  );
  wsDash.getRow(dr).height = 28;
  dashDomainRows.push(dr);

  // Conditional formatting on Your Score %
  wsDash.addConditionalFormatting({
    ref: `D${dr}`,
    rules: [
      { type: "cellIs", operator: "greaterThanOrEqual", priority: 1, formulae: [0.85], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD1FAE5" } }, font: { color: { argb: BRAND.green }, bold: true } } },
      { type: "cellIs", operator: "between", priority: 2, formulae: [0.40, 0.8499], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFEF3C7" } }, font: { color: { argb: BRAND.amber }, bold: true } } },
      { type: "cellIs", operator: "lessThan", priority: 3, formulae: [0.40], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFEE2E2" } }, font: { color: { argb: BRAND.red }, bold: true } } },
    ],
  });
  dr++;
}

// Overall row
labelCell(wsDash.getCell(`B${dr}`), "OVERALL MATURITY SCORE", { bold: true, fill: BRAND.cardBg });
outputCell(wsDash.getCell(`C${dr}`), `SUM(C4:C${dr - 1})`, { bold: true, numFmt: "0%", fill: BRAND.cardBg });
outputCell(wsDash.getCell(`D${dr}`), `SUMPRODUCT(C4:C${dr - 1},D4:D${dr - 1})/SUM(C4:C${dr - 1})`, { bold: true, numFmt: "0%", fill: BRAND.cardBg });
outputCell(wsDash.getCell(`E${dr}`), `SUM(E4:E${dr - 1})`, { bold: true, numFmt: "0.0%", fill: BRAND.cardBg });
outputCell(wsDash.getCell(`F${dr}`), `${benchmark}`, { bold: true, numFmt: "0%", fill: BRAND.cardBg });
outputCell(wsDash.getCell(`G${dr}`), `F${dr}-D${dr}`, { bold: true, numFmt: "0%", fill: BRAND.cardBg });
outputCell(
  wsDash.getCell(`H${dr}`),
  `IF(D${dr}>=0.85,"Optimized — keep refining",IF(D${dr}>=0.70,"Strong — work the gaps",IF(D${dr}>=0.40,"Progressing — pick 3 priorities","Developing — work the 30-day plan")))`,
  { bold: true, align: "left", fill: BRAND.cardBg }
);
wsDash.getRow(dr).height = 26;
const overallRow = dr;
dr += 2;

// Maturity tier interpretation block
wsDash.mergeCells(`B${dr}:H${dr}`);
sectionHeader(wsDash.getCell(`B${dr}`), "MATURITY LEVEL INTERPRETATION");
wsDash.getRow(dr).height = 22;
dr++;

const tiers = [
  ["0 to 39%", "Developing", "Capture is ad hoc. You respond to solicitations as they appear, without a system. Win rates are low and unpredictable — typically under 10%."],
  ["40 to 69%", "Progressing", "Some practices in place, but inconsistent. Win rates are improving and depend heavily on one or two people's effort. A bus problem."],
  ["70 to 84%", "Strong", "Capture is documented, consistent, and showing results. You win competitively and can articulate why. Win rate usually 25-40%."],
  ["85 to 100%", "Optimized", "Capture is a competitive advantage. You shape requirements, you have agency relationships, and your win rate consistently clears 40%."],
];
for (const [range, tier, desc] of tiers) {
  labelCell(wsDash.getCell(`B${dr}`), range, { bold: true, fill: BRAND.paper });
  labelCell(wsDash.getCell(`C${dr}`), tier, { bold: true });
  wsDash.mergeCells(`D${dr}:H${dr}`);
  labelCell(wsDash.getCell(`D${dr}`), desc);
  wsDash.getRow(dr).height = 32;
  dr++;
}

dr += 1;
// Your current tier callout
wsDash.mergeCells(`B${dr}:C${dr}`);
labelCell(wsDash.getCell(`B${dr}`), "YOUR CURRENT TIER", { bold: true, fill: BRAND.emerald });
wsDash.getCell(`B${dr}`).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
wsDash.mergeCells(`D${dr}:H${dr}`);
outputCell(
  wsDash.getCell(`D${dr}`),
  `IF(D${overallRow}>=0.85,"OPTIMIZED",IF(D${overallRow}>=0.70,"STRONG",IF(D${overallRow}>=0.40,"PROGRESSING","DEVELOPING")))`,
  { bold: true, align: "left", fill: BRAND.cardBg }
);
wsDash.getCell(`D${dr}`).font = { bold: true, size: 14, color: { argb: BRAND.emeraldDark } };
wsDash.getRow(dr).height = 28;
dr++;

// Top 3 priorities (smallest D values among domains)
dr += 1;
wsDash.mergeCells(`B${dr}:H${dr}`);
sectionHeader(wsDash.getCell(`B${dr}`), "TOP 3 PRIORITY DOMAINS (lowest score first)");
wsDash.getRow(dr).height = 22;
dr++;

["#1", "#2", "#3"].forEach((rank, i) => {
  labelCell(wsDash.getCell(`B${dr}`), rank, { bold: true, fill: BRAND.paper });
  // Rank by Your % column D4:D(dr-1 area). dashDomainRows is exact rows.
  const rangeD = `D${dashDomainRows[0]}:D${dashDomainRows[dashDomainRows.length - 1]}`;
  const rangeB = `B${dashDomainRows[0]}:B${dashDomainRows[dashDomainRows.length - 1]}`;
  const rangeH = `H${dashDomainRows[0]}:H${dashDomainRows[dashDomainRows.length - 1]}`;
  // i+1th smallest
  outputCell(
    wsDash.getCell(`C${dr}`),
    `INDEX(${rangeB},MATCH(SMALL(${rangeD},${i + 1}),${rangeD},0))`,
    { align: "left" }
  );
  outputCell(
    wsDash.getCell(`D${dr}`),
    `SMALL(${rangeD},${i + 1})`,
    { numFmt: "0%" }
  );
  wsDash.mergeCells(`E${dr}:H${dr}`);
  outputCell(
    wsDash.getCell(`E${dr}`),
    `INDEX(${rangeH},MATCH(SMALL(${rangeD},${i + 1}),${rangeD},0))`,
    { align: "left" }
  );
  wsDash.getRow(dr).height = 32;
  dr++;
});

// ---------- 4) ACTION PLAN ----------
const wsPlan = wb.addWorksheet("Action Plan", {
  views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
  pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  headerFooter: { oddHeader: "&LCapturePilot &C 30/60/90 Action Plan &RFederal Lead Kit", oddFooter: "&LWork the plan &C Page &P of &N &Rcapturepilot.com" },
});
wsPlan.columns = [
  { width: 4 },
  { width: 52 }, // action
  { width: 18 }, // domain
  { width: 14 }, // window
  { width: 14 }, // owner
  { width: 14 }, // due
  { width: 12 }, // priority
  { width: 14 }, // status
  { width: 10 }, // done?
];

wsPlan.mergeCells("B1:I1");
sectionHeader(wsPlan.getCell("B1"), "30 / 60 / 90 DAY ACTION PLAN — translate the audit into work");
wsPlan.getRow(1).height = 26;

wsPlan.mergeCells("B2:I2");
labelCell(
  wsPlan.getCell("B2"),
  "Pre-loaded with the most common starter actions. Edit, delete, add your own. Set the Status column to Complete as you finish each one — the bar at the bottom tracks your completion rate.",
  { fill: BRAND.paper }
);
wsPlan.getRow(2).height = 30;

const planHeaders = ["Action Item", "Domain", "Window", "Owner", "Due Date", "Priority", "Status", "Done?"];
planHeaders.forEach((h, i) => subHeader(wsPlan.getCell(3, 2 + i), h));
wsPlan.getRow(3).height = 22;

const actions = [
  // 30-day
  ["Set SAM.gov email alerts for top 3 NAICS codes", "Market Intelligence", "30 days", "High"],
  ["Pull FPDS data on top 5 incumbent contracts in our space", "Market Intelligence", "30 days", "High"],
  ["Verify SAM.gov registration is active and every NAICS code is current", "Compliance", "30 days", "Critical"],
  ["Create a one-page pipeline tracker with PWin scores per pursuit", "Pipeline & Capture", "30 days", "Critical"],
  ["Refresh capability statement — one page, mission-aligned, per top agency", "BD Infrastructure", "30 days", "High"],
  ["Write a bid / no-bid scoring matrix for any opportunity over $500K", "Pipeline & Capture", "30 days", "High"],
  // 60-day
  ["Book a capability briefing with at least 1 target agency OSDBU or KO", "Relationships", "60 days", "High"],
  ["Write 3 structured past performance references in CPARS format", "Past Performance", "60 days", "High"],
  ["Pull competitor labor rates from GSA CALC for top 5 categories", "Market Intelligence", "60 days", "Medium"],
  ["Template your standard proposal outline mapped to Section L and M", "Proposal Quality", "60 days", "High"],
  ["Identify 2 large primes to pursue teaming relationships with", "Relationships", "60 days", "Medium"],
  ["Collect every current CPARS rating and document performance scores", "Past Performance", "60 days", "High"],
  // 90-day
  ["Run a Pink team internal review on the next live proposal", "Proposal Quality", "90 days", "High"],
  ["Debrief win / loss on the last 3 submitted proposals", "Pipeline & Capture", "90 days", "High"],
  ["Map 6-month pipeline; flag opportunities expiring in 30-180 days", "Market Intelligence", "90 days", "High"],
  ["Install a real CRM or pipeline tracker — kill the personal spreadsheets", "BD Infrastructure", "90 days", "Medium"],
  ["Complete set-aside certification review — 8(a), SDVOSB, HUBZone, WOSB", "Compliance", "90 days", "Medium"],
  ["Attend at least 2 agency industry days or small business events", "Relationships", "90 days", "Medium"],
];

let pr = 4;
const planStart = pr;
for (const [item, domain, win, prio] of actions) {
  labelCell(wsPlan.getCell(`B${pr}`), item);
  labelCell(wsPlan.getCell(`C${pr}`), domain);
  labelCell(wsPlan.getCell(`D${pr}`), win, { align: "center" });
  inputCell(wsPlan.getCell(`E${pr}`), "", { align: "left" });
  inputCell(wsPlan.getCell(`F${pr}`), null, { numFmt: "yyyy-mm-dd" });
  inputCell(wsPlan.getCell(`G${pr}`), prio, { fill: BRAND.paper });
  inputCell(wsPlan.getCell(`H${pr}`), "Not Started", { fill: "FFFFFBEB" });
  outputCell(wsPlan.getCell(`I${pr}`), `IF(H${pr}="Complete","Yes","")`);

  // Validations
  wsPlan.getCell(`D${pr}`).dataValidation = {
    type: "list", allowBlank: false, formulae: ['"30 days,60 days,90 days"'],
  };
  wsPlan.getCell(`G${pr}`).dataValidation = {
    type: "list", allowBlank: false, formulae: ['"Critical,High,Medium,Low"'],
  };
  wsPlan.getCell(`H${pr}`).dataValidation = {
    type: "list", allowBlank: false, formulae: ['"Not Started,In Progress,Blocked,Complete"'],
  };

  // Conditional formatting on status
  wsPlan.addConditionalFormatting({
    ref: `H${pr}`,
    rules: [
      { type: "containsText", operator: "containsText", text: "Complete", priority: 1, style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD1FAE5" } }, font: { color: { argb: BRAND.green }, bold: true } } },
      { type: "containsText", operator: "containsText", text: "Blocked", priority: 2, style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFEE2E2" } }, font: { color: { argb: BRAND.red }, bold: true } } },
      { type: "containsText", operator: "containsText", text: "In Progress", priority: 3, style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFEF3C7" } }, font: { color: { argb: BRAND.amber }, bold: true } } },
    ],
  });
  wsPlan.getRow(pr).height = 30;
  pr++;
}
const planEnd = pr - 1;

pr++;
// Completion stats
wsPlan.mergeCells(`B${pr}:I${pr}`);
sectionHeader(wsPlan.getCell(`B${pr}`), "COMPLETION SUMMARY");
wsPlan.getRow(pr).height = 22;
pr++;

const statBlocks = [
  ["Total actions", `COUNTA(B${planStart}:B${planEnd})`, "0"],
  ["Completed", `COUNTIF(H${planStart}:H${planEnd},"Complete")`, "0"],
  ["In progress", `COUNTIF(H${planStart}:H${planEnd},"In Progress")`, "0"],
  ["Blocked", `COUNTIF(H${planStart}:H${planEnd},"Blocked")`, "0"],
  ["Not started", `COUNTIF(H${planStart}:H${planEnd},"Not Started")`, "0"],
  ["Completion rate", `IFERROR(COUNTIF(H${planStart}:H${planEnd},"Complete")/COUNTA(B${planStart}:B${planEnd}),0)`, "0%"],
];
for (const [label, fx, fmt] of statBlocks) {
  labelCell(wsPlan.getCell(`B${pr}`), label, { bold: true, fill: BRAND.paper });
  outputCell(wsPlan.getCell(`C${pr}`), fx, { bold: true, numFmt: fmt });
  wsPlan.mergeCells(`D${pr}:I${pr}`);
  labelCell(wsPlan.getCell(`D${pr}`), "");
  wsPlan.getRow(pr).height = 22;
  pr++;
}

// Quick reference footer
pr += 1;
wsPlan.mergeCells(`B${pr}:I${pr}`);
labelCell(
  wsPlan.getCell(`B${pr}`),
  'Priority key: Critical = this week. High = this month. Medium = this quarter. Low = next quarter. Status options: Not Started, In Progress, Blocked, Complete.',
  { fill: "FFFEF3C7" }
);
wsPlan.getRow(pr).height = 28;

// ---------- 5) HELP & EXAMPLES ----------
const wsHelp = wb.addWorksheet("Help & Examples", {
  views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  headerFooter: { oddHeader: "&LCapturePilot &C What '3' vs '4' Actually Looks Like &RFederal Lead Kit", oddFooter: "&LScoring examples &C Page &P of &N &Rcapturepilot.com" },
});
wsHelp.columns = [{ width: 4 }, { width: 30 }, { width: 30 }, { width: 60 }];

wsHelp.mergeCells("B1:D1");
sectionHeader(wsHelp.getCell("B1"), "WHAT A '3' VS A '4' ACTUALLY LOOKS LIKE");
wsHelp.getRow(1).height = 26;

const helpHeaders = ["Domain", "Score 3 (Consistent)", "Score 4 (Documented + Provable)"];
helpHeaders.forEach((h, i) => subHeader(wsHelp.getCell(3, 2 + i), h));
wsHelp.getRow(3).height = 22;

const helpRows = [
  ["Market Intelligence", "Founder checks SAM.gov a few times a week, knows the top 5 incumbents by name.", "Daily SAM alerts firing into Slack; FPDS pull on incumbents refreshed monthly; written agency target list with PWin estimates."],
  ["Pipeline & Capture", "Spreadsheet pipeline with deals and dates. Bid/no-bid decided in a Tuesday meeting.", "Stage-gated capture in CRM; PWin scored per row; written bid/no-bid rubric with go/no-go criteria; capture starts 6+ months pre-RFP for any deal over $500K."],
  ["Relationship Building", "You've met a couple of KOs at conferences. You know who they are.", "Quarterly cadence of capability briefings; documented relationship map per agency; teaming agreements signed with 2+ primes."],
  ["Proposal Quality", "You do a final read-through before submitting. Compliance matrix is in your head.", "Color reviews (Pink, Red, Gold) on every proposal over $250K; written Section L/M compliance matrix per submission; price-to-win analysis on file."],
  ["Past Performance", "You have a folder of past contracts and can pull a reference when asked.", "Library of structured PP write-ups (5+) ready to drop into any proposal; CPARS scores tracked; lessons learned captured on every closeout."],
  ["Compliance", "SAM is current. You think your NAICS codes are right.", "SAM updated within 12 months; NAICS reviewed quarterly; size standard verified per code; OCI policy written and signed."],
  ["BD Infrastructure", "You use Google Sheets for the pipeline. Capability statement was last updated 'recently'.", "Real CRM (HubSpot, Salesforce, or a federal-specific tool); BD strategy in writing with annual targets; capability statement refreshed quarterly per top agency."],
];
let hr = 4;
for (const [domain, three, four] of helpRows) {
  labelCell(wsHelp.getCell(`B${hr}`), domain, { bold: true });
  labelCell(wsHelp.getCell(`C${hr}`), three);
  labelCell(wsHelp.getCell(`D${hr}`), four);
  wsHelp.getRow(hr).height = Math.max(40, Math.ceil(Math.max(three.length, four.length) / 55) * 16);
  hr++;
}

hr += 1;
wsHelp.mergeCells(`B${hr}:D${hr}`);
sectionHeader(wsHelp.getCell(`B${hr}`), "COMMON HONEST-ASSESSMENT MISTAKES");
wsHelp.getRow(hr).height = 22;
hr++;

const mistakes = [
  ["Scoring 3 for 'I know how to'", "Knowing how to do something and consistently doing it are different. If you've done it on one proposal, that's a 2, not a 3."],
  ["Scoring 4 because 'we always do it'", "If it's not written down, somebody leaves and it's gone. A '4' requires documentation."],
  ["Scoring 0 as 'rare'", "0 means it's not in place at all. If you've ever done it once on purpose, you're at 1 or 2."],
  ["Averaging founder + BD lead scores", "Don't. Compare them side by side — the gap itself is the diagnostic."],
];
for (const [m, fix] of mistakes) {
  labelCell(wsHelp.getCell(`B${hr}`), m, { bold: true, fill: BRAND.paper });
  wsHelp.mergeCells(`C${hr}:D${hr}`);
  labelCell(wsHelp.getCell(`C${hr}`), fix);
  wsHelp.getRow(hr).height = 36;
  hr++;
}

// ---------- save ----------
await wb.xlsx.writeFile(OUT);
console.log("WROTE:", OUT);
