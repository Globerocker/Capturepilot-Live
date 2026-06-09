// Builds /assets/starter-pack/rebuilt/FLK_04_Competitive_Bid_Analysis.xlsx
// Run: node assets/starter-pack/rebuilt/competitive-bid-analysis.build.mjs
//
// Design goal: a working Competitive Bid Analysis workbook that opens cleanly
// in both Microsoft Excel (2019+) and Google Sheets. No LAMBDA/XLOOKUP/FILTER.
// Real formulas, dropdowns, named ranges, conditional formatting.

import ExcelJS from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'FLK_04_Competitive_Bid_Analysis.xlsx');

// ---------- brand palette ----------
const EMERALD = 'FF10B981';
const EMERALD_DK = 'FF047857';
const SLATE_50 = 'FFF8FAFC';
const SLATE_100 = 'FFF1F5F9';
const SLATE_200 = 'FFE2E8F0';
const SLATE_700 = 'FF334155';
const SLATE_900 = 'FF0F172A';
const AMBER = 'FFF59E0B';
const RED = 'FFDC2626';
const GREEN = 'FF16A34A';
const BLUE_50 = 'FFEFF6FF';
const WHITE = 'FFFFFFFF';

const FONT = 'Calibri';
const MONO = 'Consolas';

// ---------- buildListsSheet helper ----------
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
    const colLetter = String.fromCharCode(65 + colIdx);

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
wb.creator = 'CapturePilot';
wb.lastModifiedBy = 'CapturePilot';
wb.created = new Date();
wb.modified = new Date();
wb.company = 'CapturePilot';
wb.title = 'Competitive Bid Analysis Worksheet';
wb.subject = 'Federal Lead Kit — 04 Bid/No-Bid Decision Toolkit';

// ---------- Lists sheet + named-range dropdown map ----------
const DV = buildListsSheet(wb, [
  { name: 'SetAsideOptions',    title: 'Set-Aside Type',            items: ['Full and Open', 'Small Business', '8(a)', 'HUBZone', 'SDVOSB', 'WOSB', 'EDWOSB', 'Total Small Business', 'Other'] },
  { name: 'ContractType',       title: 'Contract Type',             items: ['FFP — Firm Fixed Price', 'T&M — Time & Materials', 'CPFF — Cost Plus Fixed Fee', 'CPIF — Cost Plus Incentive', 'IDIQ — Indefinite Delivery', 'BPA — Blanket Purchase', 'Other'] },
  { name: 'SourceSelection',    title: 'Source Selection Method',   items: ['LPTA — Lowest Price Technically Acceptable', 'Best Value Tradeoff', 'Highest Technically Rated, Fair & Reasonable', 'Other'] },
  { name: 'BusinessSize',       title: 'Business Size',             items: ['Large', 'Small', 'Small — 8(a)', 'Small — HUBZone', 'Small — SDVOSB', 'Small — WOSB', 'Small — EDWOSB', 'Unknown'] },
  { name: 'YesNoUnknown',       title: 'Yes / No / Unknown',        items: ['Yes', 'No', 'Unknown'] },
  { name: 'RelationshipStrength', title: 'Relationship Strength',   items: ['Strong', 'Some history', 'Cold', 'Unknown'] },
  { name: 'PricingApproach',    title: 'Pricing Approach',          items: ['Aggressive — undercut', 'Market', 'Premium', 'LPTA play', 'Unknown'] },
  { name: 'WillTheyBid',        title: 'Will They Bid?',            items: ['Yes', 'Probably', 'Unlikely', 'No', 'Unknown'] },
  { name: 'ThreatLevel',        title: 'Threat Level',              items: ['HIGH', 'MEDIUM', 'LOW'] },
]);

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
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
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
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};
const inputNumber = {
  ...inputStyle,
  alignment: { vertical: 'middle', horizontal: 'center' },
  numFmt: '0',
};
const inputPct = {
  ...inputStyle,
  alignment: { vertical: 'middle', horizontal: 'center' },
  numFmt: '0%',
};
const formulaStyle = {
  font: { name: FONT, size: 10, bold: true, color: { argb: SLATE_900 } },
  fill: fill(BLUE_50),
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: border(),
  numFmt: '0.00',
};
const monoStyle = {
  font: { name: MONO, size: 10, color: { argb: SLATE_900 } },
  fill: fill(WHITE),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  border: border(),
};
const footerStyle = {
  font: { name: FONT, size: 9, italic: true, color: { argb: SLATE_700 } },
  alignment: { vertical: 'middle', horizontal: 'center' },
};

function brandHeaderFooter(ws) {
  ws.headerFooter.oddHeader =
    '&L&"Calibri,Bold"&12&K047857CapturePilot &K000000· Federal Lead Kit&R&"Calibri,Italic"&10 04 Bid/No-Bid Toolkit';
  ws.headerFooter.oddFooter =
    '&Lcapturepilot.com&C&P of &N&RCompetitive Bid Analysis';
  ws.pageSetup = {
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    paperSize: 9, // A4; works fine in US too
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
  { width: 68 },
];

wsInstr.mergeCells('B2:C2');
wsInstr.getCell('B2').value = 'COMPETITIVE BID ANALYSIS — HOW TO USE';
wsInstr.getCell('B2').style = titleStyle;
wsInstr.getRow(2).height = 38;

wsInstr.mergeCells('B3:C3');
wsInstr.getCell('B3').value =
  'Know your competition before you write a single proposal word. Built for owners with a contract due in six months and zero government experience.';
wsInstr.getCell('B3').style = subtitleStyle;
wsInstr.getRow(3).height = 26;

const steps = [
  ['1. Setup', 'Open Setup tab. Type the opportunity name, solicitation number, due date, your company name, and your bid price estimate. Everything else flows from these.'],
  ['2. Profiles', 'Open Profiles tab. List up to 5 competitors. Fill the rows you actually know — leave blanks alone, don\'t guess. Source: SAM.gov entity search, USASpending.gov, the contractor\'s LinkedIn page, prior award notices.'],
  ['3. Scoring', 'Open Scoring tab. The RFP\'s Section M lists evaluation factors with weights. Type each factor and its weight (weights must sum to 100). Rate each competitor 1-10 on every factor. Be honest about your own score — wishful thinking loses bids.'],
  ['4. SWOT', 'Open SWOT tab for the top two threats. One column per competitor. Strengths and weaknesses go in the top half; opportunities and threats (your counter-moves) below.'],
  ['5. Summary', 'Open Summary tab. Read the win-probability line, the score gap, and the recommended action. If the gap is negative on more than two factors, rework your approach before you write a word.'],
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
  bodyRow.height = 46;
  r += 2;
}

// Operator note
const noteR = r;
wsInstr.mergeCells(`B${noteR}:C${noteR}`);
wsInstr.getCell(`B${noteR}`).value =
  'Operator note (Andre): I built this because the first time we boarded a federal RFP, we treated it like a commercial pitch. We lost. The team that won had run this exact analysis four weeks earlier and already knew where they were beating us on Past Performance. Run it cold, not warm.';
wsInstr.getCell(`B${noteR}`).style = {
  font: { name: FONT, size: 10, italic: true, color: { argb: SLATE_700 } },
  fill: fill(SLATE_100),
  alignment: { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};
wsInstr.getRow(noteR).height = 70;
brandHeaderFooter(wsInstr);

// ============================================================
// SHEET 2 — Setup (Inputs)
// ============================================================
const wsSetup = wb.addWorksheet('Setup', {
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
});
wsSetup.columns = [
  { width: 4 },
  { width: 32 },
  { width: 44 },
  { width: 24 },
];

wsSetup.mergeCells('B2:D2');
wsSetup.getCell('B2').value = 'OPPORTUNITY SETUP';
wsSetup.getCell('B2').style = titleStyle;
wsSetup.getRow(2).height = 36;

wsSetup.mergeCells('B3:D3');
wsSetup.getCell('B3').value = 'Fill these fields once. The other tabs read from here.';
wsSetup.getCell('B3').style = subtitleStyle;
wsSetup.getRow(3).height = 22;

const setupRows = [
  { label: 'Opportunity Name', cell: 'C5', name: 'OppName', placeholder: 'e.g. Janitorial Services — Fort Bragg' },
  { label: 'Solicitation Number', cell: 'C6', name: 'SolNum', placeholder: 'e.g. W912DY-26-R-0007' },
  { label: 'Agency / Buying Office', cell: 'C7', name: 'Agency', placeholder: 'e.g. U.S. Army Corps of Engineers' },
  { label: 'NAICS Code', cell: 'C8', name: 'NaicsCode', placeholder: 'e.g. 561720' },
  { label: 'Due Date', cell: 'C9', name: 'DueDate', placeholder: 'YYYY-MM-DD', numFmt: 'yyyy-mm-dd' },
  { label: 'Estimated Contract Value (USD)', cell: 'C10', name: 'OppValue', placeholder: 'e.g. 4500000', numFmt: '"$"#,##0' },
  { label: 'Your Company Name', cell: 'C11', name: 'YourCo', placeholder: 'e.g. Acme Federal Services LLC' },
  { label: 'Your Bid Price (USD)', cell: 'C12', name: 'YourPrice', placeholder: 'e.g. 4200000', numFmt: '"$"#,##0' },
  { label: 'Set-Aside Type', cell: 'C13', name: 'SetAside', dvKey: 'SetAsideOptions' },
  { label: 'Contract Type', cell: 'C14', name: 'ContractType', dvKey: 'ContractType' },
  { label: 'Source Selection Method', cell: 'C15', name: 'Selection', dvKey: 'SourceSelection' },
  { label: 'Incumbent on This Contract', cell: 'C16', name: 'Incumbent', placeholder: 'e.g. ServPro Federal Group' },
];

setupRows.forEach((row, i) => {
  const rNum = 5 + i;
  const ws = wsSetup.getRow(rNum);
  ws.height = 24;
  ws.getCell(2).value = row.label;
  ws.getCell(2).style = labelStyle;
  const c = ws.getCell(3);
  c.value = null;
  c.style = row.numFmt ? { ...inputStyle, numFmt: row.numFmt } : inputStyle;
  if (row.dvKey) {
    c.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [DV[row.dvKey]],
      showErrorMessage: true,
      errorTitle: 'Pick a value',
      error: 'Use the dropdown — keeps the rest of the workbook consistent.',
    };
  }
  // Hint column
  const hint = ws.getCell(4);
  hint.value = row.placeholder || '';
  hint.style = {
    font: { name: FONT, size: 9, italic: true, color: { argb: SLATE_700 } },
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  };
  // Named range
  wb.definedNames.add(`Setup!$C$${rNum}`, row.name);
});

// Footer note
wsSetup.mergeCells('B18:D18');
wsSetup.getCell('B18').value =
  'Tip: Section L of the RFP tells you what to submit. Section M tells you how they will score you. Both belong here before you start the Scoring tab.';
wsSetup.getCell('B18').style = {
  font: { name: FONT, size: 9, italic: true, color: { argb: SLATE_700 } },
  fill: fill(SLATE_50),
  alignment: { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 },
  border: border(),
};
wsSetup.getRow(18).height = 36;

brandHeaderFooter(wsSetup);

// ============================================================
// SHEET 3 — Profiles
// ============================================================
const wsProf = wb.addWorksheet('Profiles', {
  views: [{ state: 'frozen', xSplit: 1, ySplit: 5, showGridLines: false }],
});
wsProf.columns = [
  { width: 32 },
  { width: 22 },
  { width: 22 },
  { width: 22 },
  { width: 22 },
  { width: 22 },
];

wsProf.mergeCells('A2:F2');
wsProf.getCell('A2').value = 'COMPETITOR PROFILES';
wsProf.getCell('A2').style = titleStyle;
wsProf.getRow(2).height = 36;

wsProf.mergeCells('A3:F3');
wsProf.getCell('A3').value =
  'One column per competitor. Skip rows you don\'t know yet — better to leave blank than to guess.';
wsProf.getCell('A3').style = subtitleStyle;
wsProf.getRow(3).height = 22;

// Header row 5
const profHeaders = ['PROFILE FIELD', 'YOUR COMPANY', 'COMPETITOR 1', 'COMPETITOR 2', 'COMPETITOR 3', 'COMPETITOR 4'];
profHeaders.forEach((h, i) => {
  const c = wsProf.getRow(5).getCell(i + 1);
  c.value = h;
  c.style = i === 0 ? sectionHeader : colHeader;
});
wsProf.getRow(5).height = 28;

// Pre-fill "Your Company" from Setup
wsProf.getRow(6).getCell(2).value = { formula: 'IF(YourCo="","(see Setup tab)",YourCo)' };

const profileFields = [
  { label: 'Company Name', startRow: 6 },
  { label: 'UEI / CAGE Code', hint: 'SAM.gov UEI' },
  { label: 'Business Size', dvKey: 'BusinessSize' },
  { label: 'Revenue (annual est.)', numFmt: '"$"#,##0' },
  { label: 'Employee Count (est.)', numFmt: '#,##0' },
  { label: 'Primary NAICS Code', mono: true },
  { label: 'Set-Aside Certifications' },
  { label: 'Active GSA Schedules / IDIQs' },
  { label: 'Incumbent on This Contract?', dvKey: 'YesNoUnknown' },
  { label: 'Relationship with KO / PM', dvKey: 'RelationshipStrength' },
  { label: 'Recent Agency Awards (LTM)' },
  { label: 'USASpending LTM ($)', numFmt: '"$"#,##0' },
  { label: 'Key Personnel / Clearances' },
  { label: 'Likely Teaming Partners' },
  { label: 'Technical Strengths' },
  { label: 'Known Weaknesses / Past Protests' },
  { label: 'Likely Pricing Approach', dvKey: 'PricingApproach' },
  { label: 'Will They Bid?', dvKey: 'WillTheyBid' },
  { label: 'Threat Level', dvKey: 'ThreatLevel' },
  { label: 'Your Edge vs This Competitor' },
];

let pr = 6;
profileFields.forEach((field) => {
  const row = wsProf.getRow(pr);
  row.height = 22;
  row.getCell(1).value = field.label;
  row.getCell(1).style = labelStyle;
  for (let col = 2; col <= 6; col += 1) {
    const c = row.getCell(col);
    // skip YourCo cell on row 6 (already a formula)
    if (!(pr === 6 && col === 2)) {
      c.value = null;
    }
    let s = inputStyle;
    if (field.numFmt) s = { ...inputStyle, numFmt: field.numFmt, alignment: { ...inputStyle.alignment, horizontal: 'right' } };
    if (field.mono) s = monoStyle;
    c.style = s;
    if (field.dvKey) {
      c.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [DV[field.dvKey]],
      };
    }
  }
  pr += 1;
});

// Conditional format threat level row (HIGH = red, MEDIUM = amber, LOW = green)
const threatRow = 6 + profileFields.findIndex((f) => f.label === 'Threat Level');
const threatRange = `B${threatRow}:F${threatRow}`;
wsProf.addConditionalFormatting({
  ref: threatRange,
  rules: [
    {
      type: 'containsText', operator: 'containsText', text: 'HIGH', priority: 1,
      style: { fill: fill('FFFEE2E2'), font: { color: { argb: RED }, bold: true } },
    },
    {
      type: 'containsText', operator: 'containsText', text: 'MEDIUM', priority: 2,
      style: { fill: fill('FFFEF3C7'), font: { color: { argb: AMBER }, bold: true } },
    },
    {
      type: 'containsText', operator: 'containsText', text: 'LOW', priority: 3,
      style: { fill: fill('FFDCFCE7'), font: { color: { argb: GREEN }, bold: true } },
    },
  ],
});

brandHeaderFooter(wsProf);

// ============================================================
// SHEET 4 — Scoring (the calculator)
// ============================================================
const wsScore = wb.addWorksheet('Scoring', {
  views: [{ state: 'frozen', xSplit: 2, ySplit: 7, showGridLines: false }],
});
wsScore.columns = [
  { width: 5 },   // #
  { width: 38 },  // Factor
  { width: 10 },  // Weight
  { width: 11 },  // Your score
  { width: 11 },  // Your weighted
  { width: 11 },  // Comp 1 score
  { width: 11 },  // Comp 1 weighted
  { width: 11 },  // Comp 2 score
  { width: 11 },  // Comp 2 weighted
  { width: 11 },  // Comp 3 score
  { width: 11 },  // Comp 3 weighted
  { width: 11 },  // Comp 4 score
  { width: 11 },  // Comp 4 weighted
];

wsScore.mergeCells('A2:M2');
wsScore.getCell('A2').value = 'EVALUATION SCORING — RFP SECTION M FACTORS';
wsScore.getCell('A2').style = titleStyle;
wsScore.getRow(2).height = 36;

wsScore.mergeCells('A3:M3');
wsScore.getCell('A3').value =
  'Type each factor from Section M and its weight. Rate every bidder 1-10. Weighted = weight × rating. Watch the gap.';
wsScore.getCell('A3').style = subtitleStyle;
wsScore.getRow(3).height = 22;

// How-to row
wsScore.mergeCells('A5:M5');
wsScore.getCell('A5').value =
  'Scoring scale: 10 = clear winner on this factor, 7 = solid, 5 = average, 3 = weak, 1 = serious gap. Weights should total 100. The Summary tab will flag if they don\'t.';
wsScore.getCell('A5').style = {
  font: { name: FONT, size: 9, italic: true, color: { argb: SLATE_700 } },
  fill: fill(SLATE_50),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};
wsScore.getRow(5).height = 32;

// Competitor names row 6 — formulas pulling from Profiles
wsScore.getRow(6).getCell(4).value = { formula: "IF(Profiles!B6=\"\",\"YOUR CO\",Profiles!B6)" };
wsScore.getRow(6).getCell(6).value = { formula: "IF(Profiles!C6=\"\",\"COMP 1\",Profiles!C6)" };
wsScore.getRow(6).getCell(8).value = { formula: "IF(Profiles!D6=\"\",\"COMP 2\",Profiles!D6)" };
wsScore.getRow(6).getCell(10).value = { formula: "IF(Profiles!E6=\"\",\"COMP 3\",Profiles!E6)" };
wsScore.getRow(6).getCell(12).value = { formula: "IF(Profiles!F6=\"\",\"COMP 4\",Profiles!F6)" };
for (let col = 4; col <= 12; col += 2) {
  wsScore.mergeCells(6, col, 6, col + 1);
  const c = wsScore.getRow(6).getCell(col);
  c.style = {
    font: { name: FONT, size: 10, bold: true, color: { argb: SLATE_900 } },
    fill: fill(SLATE_100),
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
    border: border(),
  };
}
wsScore.getCell('A6').value = 'Bidder →';
wsScore.getCell('A6').style = labelStyle;
wsScore.mergeCells('A6:C6');
wsScore.getRow(6).height = 24;

// Column headers row 7
const scoreHeaders = ['#', 'EVALUATION FACTOR', 'WEIGHT (%)',
  'SCORE\n(1-10)', 'WTD',
  'SCORE\n(1-10)', 'WTD',
  'SCORE\n(1-10)', 'WTD',
  'SCORE\n(1-10)', 'WTD',
  'SCORE\n(1-10)', 'WTD',
];
scoreHeaders.forEach((h, i) => {
  const c = wsScore.getRow(7).getCell(i + 1);
  c.value = h;
  c.style = colHeader;
});
wsScore.getRow(7).height = 36;

// Default factor seeds (editable)
const defaultFactors = [
  'Technical Approach / Methodology',
  'Management Approach / Key Personnel',
  'Past Performance (relevance & quality)',
  'Small Business Utilization / Subcontracting',
  'Price / Cost Reasonableness',
  'Transition Plan',
  'Quality Control / QASP Response',
  'Security & Compliance Posture',
  '',
  '',
  '',
  '',
];

const FIRST_FACTOR_ROW = 8;
const LAST_FACTOR_ROW = FIRST_FACTOR_ROW + defaultFactors.length - 1; // 19

for (let i = 0; i < defaultFactors.length; i += 1) {
  const rowNum = FIRST_FACTOR_ROW + i;
  const row = wsScore.getRow(rowNum);
  row.height = 22;

  // #
  row.getCell(1).value = i + 1;
  row.getCell(1).style = {
    font: { name: FONT, size: 10, bold: true, color: { argb: SLATE_700 } },
    fill: fill(SLATE_50),
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: border(),
  };

  // Factor name
  row.getCell(2).value = defaultFactors[i] || null;
  row.getCell(2).style = inputStyle;

  // Weight (%)
  row.getCell(3).value = null;
  row.getCell(3).style = inputPct;
  row.getCell(3).dataValidation = {
    type: 'decimal',
    operator: 'between',
    formulae: [0, 1],
    showErrorMessage: true,
    errorTitle: 'Weight as a percent',
    error: 'Enter a value between 0 and 1 (e.g. 0.25 for 25%). Total weights must equal 100%.',
  };

  // Bidder score columns: cols 4,6,8,10,12 = raw; cols 5,7,9,11,13 = weighted (formula)
  for (let bidder = 0; bidder < 5; bidder += 1) {
    const scoreCol = 4 + bidder * 2;
    const wtdCol = scoreCol + 1;
    row.getCell(scoreCol).value = null;
    row.getCell(scoreCol).style = inputNumber;
    row.getCell(scoreCol).dataValidation = {
      type: 'whole',
      operator: 'between',
      formulae: [1, 10],
      showErrorMessage: true,
      errorTitle: 'Score 1-10',
      error: '1 = serious gap, 10 = clear winner. Leave blank if unknown.',
    };
    const scoreAddr = `${String.fromCharCode(64 + scoreCol)}${rowNum}`;
    const weightAddr = `$C${rowNum}`;
    row.getCell(wtdCol).value = {
      formula: `IF(OR(${weightAddr}="",${scoreAddr}=""),"",${weightAddr}*${scoreAddr})`,
    };
    row.getCell(wtdCol).style = formulaStyle;
  }
}

// Totals row
const totalsRow = LAST_FACTOR_ROW + 2; // 21
wsScore.getRow(totalsRow).height = 28;
wsScore.mergeCells(totalsRow, 1, totalsRow, 2);
wsScore.getCell(totalsRow, 1).value = 'TOTAL WEIGHTED SCORE';
wsScore.getCell(totalsRow, 1).style = sectionHeader;

// Weight total in col C
wsScore.getCell(totalsRow, 3).value = {
  formula: `SUM(C${FIRST_FACTOR_ROW}:C${LAST_FACTOR_ROW})`,
};
wsScore.getCell(totalsRow, 3).style = {
  ...formulaStyle,
  numFmt: '0%',
  fill: fill(SLATE_200),
};

// Per-bidder totals — sum the WTD columns
for (let bidder = 0; bidder < 5; bidder += 1) {
  const scoreCol = 4 + bidder * 2;
  const wtdCol = scoreCol + 1;
  const wtdLetter = String.fromCharCode(64 + wtdCol);
  wsScore.getCell(totalsRow, scoreCol).value = 'TOTAL →';
  wsScore.getCell(totalsRow, scoreCol).style = {
    font: { name: FONT, size: 10, bold: true, color: { argb: SLATE_700 } },
    fill: fill(SLATE_100),
    alignment: { vertical: 'middle', horizontal: 'right' },
    border: border(),
  };
  wsScore.getCell(totalsRow, wtdCol).value = {
    formula: `IFERROR(SUM(${wtdLetter}${FIRST_FACTOR_ROW}:${wtdLetter}${LAST_FACTOR_ROW}),0)`,
  };
  wsScore.getCell(totalsRow, wtdCol).style = {
    ...formulaStyle,
    fill: fill(EMERALD),
    font: { name: FONT, size: 11, bold: true, color: { argb: WHITE } },
  };
}

// Named ranges for totals — used by Summary
wb.definedNames.add(`Scoring!$E$${totalsRow}`, 'TotalYou');
wb.definedNames.add(`Scoring!$G$${totalsRow}`, 'TotalC1');
wb.definedNames.add(`Scoring!$I$${totalsRow}`, 'TotalC2');
wb.definedNames.add(`Scoring!$K$${totalsRow}`, 'TotalC3');
wb.definedNames.add(`Scoring!$M$${totalsRow}`, 'TotalC4');
wb.definedNames.add(`Scoring!$C$${totalsRow}`, 'WeightTotal');

// Weight sanity check row
const sanityRow = totalsRow + 1;
wsScore.mergeCells(sanityRow, 1, sanityRow, 2);
wsScore.getCell(sanityRow, 1).value = 'Weights must total 100%';
wsScore.getCell(sanityRow, 1).style = {
  font: { name: FONT, size: 9, italic: true, color: { argb: SLATE_700 } },
  alignment: { vertical: 'middle', horizontal: 'right', indent: 1 },
};
wsScore.mergeCells(sanityRow, 4, sanityRow, 13);
wsScore.getCell(sanityRow, 4).value = {
  formula: `IF(ROUND(WeightTotal,4)=1,"OK — weights sum to 100%","WARNING — weights sum to " & TEXT(WeightTotal,"0%") & ". Fix before reading Summary.")`,
};
wsScore.getCell(sanityRow, 4).style = {
  font: { name: FONT, size: 10, bold: true, color: { argb: SLATE_900 } },
  fill: fill(SLATE_50),
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: border(),
};

// Conditional format: weighted total cells colored vs your score
const totalWtdRange = `G${totalsRow}:M${totalsRow}`;
wsScore.addConditionalFormatting({
  ref: totalWtdRange,
  rules: [
    {
      type: 'cellIs', operator: 'greaterThan', priority: 1,
      formulae: ['TotalYou'],
      style: { fill: fill('FFFEE2E2'), font: { color: { argb: RED }, bold: true } },
    },
    {
      type: 'cellIs', operator: 'lessThan', priority: 2,
      formulae: ['TotalYou'],
      style: { fill: fill('FFDCFCE7'), font: { color: { argb: GREEN }, bold: true } },
    },
  ],
});

brandHeaderFooter(wsScore);

// ============================================================
// SHEET 5 — SWOT (top two competitors)
// ============================================================
const wsSwot = wb.addWorksheet('SWOT', {
  views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
});
wsSwot.columns = [
  { width: 22 },
  { width: 38 },
  { width: 38 },
];

wsSwot.mergeCells('A2:C2');
wsSwot.getCell('A2').value = 'SWOT — TOP TWO COMPETITIVE THREATS';
wsSwot.getCell('A2').style = titleStyle;
wsSwot.getRow(2).height = 36;

wsSwot.mergeCells('A3:C3');
wsSwot.getCell('A3').value =
  'One column per competitor. Pull facts from the Profiles tab. Be specific: name people, contracts, dollar amounts.';
wsSwot.getCell('A3').style = subtitleStyle;
wsSwot.getRow(3).height = 22;

// Headers row 5
wsSwot.getRow(5).getCell(1).value = 'YOUR COMPANY';
wsSwot.getRow(5).getCell(2).value = { formula: 'IF(Profiles!C6="","COMPETITOR 1",Profiles!C6)' };
wsSwot.getRow(5).getCell(3).value = { formula: 'IF(Profiles!D6="","COMPETITOR 2",Profiles!D6)' };
[1, 2, 3].forEach((col) => {
  wsSwot.getRow(5).getCell(col).style = colHeader;
});
wsSwot.getRow(5).height = 28;

const swotSections = [
  { title: 'STRENGTHS — what they do better', color: GREEN, fill: 'FFDCFCE7' },
  { title: 'WEAKNESSES — gaps the evaluator might notice', color: RED, fill: 'FFFEE2E2' },
  { title: 'OPPORTUNITIES — evaluation factors that favor your approach', color: EMERALD_DK, fill: 'FFD1FAE5' },
  { title: 'THREATS — how they out-score you, and your counter-move', color: AMBER, fill: 'FFFEF3C7' },
];

let sr = 6;
swotSections.forEach((sec) => {
  wsSwot.mergeCells(sr, 1, sr, 3);
  const head = wsSwot.getRow(sr).getCell(1);
  head.value = sec.title;
  head.style = {
    font: { name: FONT, size: 11, bold: true, color: { argb: WHITE } },
    fill: fill(sec.color),
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  };
  wsSwot.getRow(sr).height = 22;
  sr += 1;
  for (let i = 1; i <= 5; i += 1) {
    const row = wsSwot.getRow(sr);
    row.height = 26;
    row.getCell(1).value = `${i}.`;
    row.getCell(1).style = {
      font: { name: FONT, size: 10, bold: true, color: { argb: SLATE_700 } },
      fill: fill(sec.fill),
      alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
      border: border(),
    };
    row.getCell(2).style = inputStyle;
    row.getCell(3).style = inputStyle;
    sr += 1;
  }
  sr += 1; // spacer
});

brandHeaderFooter(wsSwot);

// ============================================================
// SHEET 6 — Summary (the output)
// ============================================================
const wsSum = wb.addWorksheet('Summary', {
  views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
});
wsSum.columns = [
  { width: 32 },
  { width: 22 },
  { width: 22 },
  { width: 22 },
  { width: 22 },
  { width: 22 },
];

wsSum.mergeCells('A2:F2');
wsSum.getCell('A2').value = 'COMPETITIVE POSITION — SUMMARY';
wsSum.getCell('A2').style = titleStyle;
wsSum.getRow(2).height = 36;

wsSum.mergeCells('A3:F3');
wsSum.getCell('A3').value = {
  formula: `IF(OppName="","Add opportunity details on the Setup tab to see this populate.","Opportunity: " & OppName & "   ·   Sol# " & SolNum & "   ·   Due " & IF(DueDate="","TBD",TEXT(DueDate,"yyyy-mm-dd")))`,
};
wsSum.getCell('A3').style = subtitleStyle;
wsSum.getRow(3).height = 22;

// Scoreboard header row 5
const sumHeaders = ['BIDDER', 'TOTAL WTD SCORE', 'GAP vs YOU', 'WILL BID?', 'THREAT', 'YOUR EDGE'];
sumHeaders.forEach((h, i) => {
  const c = wsSum.getRow(5).getCell(i + 1);
  c.value = h;
  c.style = colHeader;
});
wsSum.getRow(5).height = 28;

const profileBidRow = 6 + profileFields.findIndex((f) => f.label === 'Will They Bid?');
const profileThreatRow = 6 + profileFields.findIndex((f) => f.label === 'Threat Level');
const profileEdgeRow = 6 + profileFields.findIndex((f) => f.label === 'Your Edge vs This Competitor');

const bidderMap = [
  { name: 'YOUR COMPANY', totalNamed: 'TotalYou', profileCol: 'B' },
  { name: 'COMPETITOR 1', totalNamed: 'TotalC1', profileCol: 'C' },
  { name: 'COMPETITOR 2', totalNamed: 'TotalC2', profileCol: 'D' },
  { name: 'COMPETITOR 3', totalNamed: 'TotalC3', profileCol: 'E' },
  { name: 'COMPETITOR 4', totalNamed: 'TotalC4', profileCol: 'F' },
];

bidderMap.forEach((b, i) => {
  const rowNum = 6 + i;
  const row = wsSum.getRow(rowNum);
  row.height = 24;

  // Name (from Profiles)
  row.getCell(1).value = {
    formula: `IF(Profiles!${b.profileCol}6="","${b.name}",Profiles!${b.profileCol}6)`,
  };
  row.getCell(1).style = labelStyle;

  // Total weighted (from Scoring named range)
  row.getCell(2).value = { formula: b.totalNamed };
  row.getCell(2).style = {
    ...formulaStyle,
    font: { name: FONT, size: 11, bold: true, color: { argb: SLATE_900 } },
    fill: fill(BLUE_50),
  };

  // Gap vs YOU
  if (i === 0) {
    row.getCell(3).value = '—';
    row.getCell(3).style = {
      ...formulaStyle,
      font: { name: FONT, size: 10, color: { argb: SLATE_700 } },
      fill: fill(SLATE_50),
    };
  } else {
    row.getCell(3).value = { formula: `TotalYou - ${b.totalNamed}` };
    row.getCell(3).style = {
      ...formulaStyle,
      numFmt: '+0.00;-0.00;0',
    };
  }

  // Will bid? (Profiles row 23 in original ordering — compute dynamic)
  if (i === 0) {
    row.getCell(4).value = '—';
    row.getCell(4).style = { ...inputStyle, alignment: { vertical: 'middle', horizontal: 'center' } };
    row.getCell(5).value = '—';
    row.getCell(5).style = { ...inputStyle, alignment: { vertical: 'middle', horizontal: 'center' } };
    row.getCell(6).value = '—';
    row.getCell(6).style = { ...inputStyle, alignment: { vertical: 'middle', horizontal: 'center' } };
  } else {
    row.getCell(4).value = { formula: `IF(Profiles!${b.profileCol}${profileBidRow}="","-",Profiles!${b.profileCol}${profileBidRow})` };
    row.getCell(4).style = { ...inputStyle, alignment: { vertical: 'middle', horizontal: 'center' } };

    row.getCell(5).value = { formula: `IF(Profiles!${b.profileCol}${profileThreatRow}="","-",Profiles!${b.profileCol}${profileThreatRow})` };
    row.getCell(5).style = { ...inputStyle, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true } };

    row.getCell(6).value = { formula: `IF(Profiles!${b.profileCol}${profileEdgeRow}="","(add edge note in Profiles)",Profiles!${b.profileCol}${profileEdgeRow})` };
    row.getCell(6).style = inputStyle;
  }
});

// CF for gap column
wsSum.addConditionalFormatting({
  ref: 'C7:C10',
  rules: [
    {
      type: 'cellIs', operator: 'greaterThan', priority: 1, formulae: [0],
      style: { fill: fill('FFDCFCE7'), font: { color: { argb: GREEN }, bold: true } },
    },
    {
      type: 'cellIs', operator: 'lessThan', priority: 2, formulae: [0],
      style: { fill: fill('FFFEE2E2'), font: { color: { argb: RED }, bold: true } },
    },
  ],
});
// CF for threat column
wsSum.addConditionalFormatting({
  ref: 'E7:E10',
  rules: [
    { type: 'containsText', operator: 'containsText', text: 'HIGH', priority: 1,
      style: { fill: fill('FFFEE2E2'), font: { color: { argb: RED }, bold: true } } },
    { type: 'containsText', operator: 'containsText', text: 'MEDIUM', priority: 2,
      style: { fill: fill('FFFEF3C7'), font: { color: { argb: AMBER }, bold: true } } },
    { type: 'containsText', operator: 'containsText', text: 'LOW', priority: 3,
      style: { fill: fill('FFDCFCE7'), font: { color: { argb: GREEN }, bold: true } } },
  ],
});

// Win-probability and price-position section
const probRow = 12;
wsSum.mergeCells(`A${probRow}:F${probRow}`);
wsSum.getCell(`A${probRow}`).value = 'WIN-PROBABILITY MODEL';
wsSum.getCell(`A${probRow}`).style = sectionHeader;
wsSum.getRow(probRow).height = 24;

// Highest competitor score
wsSum.getRow(probRow + 1).getCell(1).value = 'Highest competitor weighted score';
wsSum.getRow(probRow + 1).getCell(1).style = labelStyle;
wsSum.getRow(probRow + 1).getCell(2).value = {
  formula: 'MAX(TotalC1,TotalC2,TotalC3,TotalC4)',
};
wsSum.getRow(probRow + 1).getCell(2).style = formulaStyle;

// Your lead points
wsSum.getRow(probRow + 2).getCell(1).value = 'Your lead (or deficit) in score points';
wsSum.getRow(probRow + 2).getCell(1).style = labelStyle;
wsSum.getRow(probRow + 2).getCell(2).value = {
  formula: `TotalYou - MAX(TotalC1,TotalC2,TotalC3,TotalC4)`,
};
wsSum.getRow(probRow + 2).getCell(2).style = { ...formulaStyle, numFmt: '+0.00;-0.00;0' };

// Estimated PWin (logistic-ish heuristic, max-capped)
// Translation of point lead into PWin estimate: clamp((lead+1)/2 + 0.5, 0.05, 0.95)
// Lead of 0 → 0.5, lead of +1 → 1.0 (capped 0.95), lead of -1 → 0 (capped 0.05)
const pwinRow = probRow + 3;
wsSum.getRow(pwinRow).getCell(1).value = 'Estimated PWin (rough)';
wsSum.getRow(pwinRow).getCell(1).style = labelStyle;
wsSum.getRow(pwinRow).getCell(2).value = {
  formula:
    'IF(OR(TotalYou=0,MAX(TotalC1,TotalC2,TotalC3,TotalC4)=0),"Fill Scoring tab first",ROUND(MAX(0.05,MIN(0.95,0.5+(TotalYou-MAX(TotalC1,TotalC2,TotalC3,TotalC4))/(2*MAX(TotalYou,MAX(TotalC1,TotalC2,TotalC3,TotalC4))))),2))',
};
wsSum.getRow(pwinRow).getCell(2).style = {
  ...formulaStyle,
  numFmt: '0%',
  font: { name: FONT, size: 13, bold: true, color: { argb: WHITE } },
  fill: fill(EMERALD),
};

// CF on PWin
wsSum.addConditionalFormatting({
  ref: `B${pwinRow}`,
  rules: [
    { type: 'cellIs', operator: 'greaterThanOrEqual', priority: 1, formulae: [0.6],
      style: { fill: fill(GREEN), font: { color: { argb: WHITE }, bold: true } } },
    { type: 'cellIs', operator: 'between', priority: 2, formulae: [0.3, 0.599999],
      style: { fill: fill(AMBER), font: { color: { argb: WHITE }, bold: true } } },
    { type: 'cellIs', operator: 'lessThan', priority: 3, formulae: [0.3],
      style: { fill: fill(RED), font: { color: { argb: WHITE }, bold: true } } },
  ],
});

// Price position
const priceRow = probRow + 5;
wsSum.mergeCells(`A${priceRow}:F${priceRow}`);
wsSum.getCell(`A${priceRow}`).value = 'PRICE POSITION';
wsSum.getCell(`A${priceRow}`).style = sectionHeader;
wsSum.getRow(priceRow).height = 24;

wsSum.getRow(priceRow + 1).getCell(1).value = 'Your bid vs. estimated contract value';
wsSum.getRow(priceRow + 1).getCell(1).style = labelStyle;
wsSum.getRow(priceRow + 1).getCell(2).value = {
  formula: 'IF(OR(YourPrice="",OppValue="",OppValue=0),"Add prices on Setup tab",YourPrice/OppValue)',
};
wsSum.getRow(priceRow + 1).getCell(2).style = { ...formulaStyle, numFmt: '0.0%' };

wsSum.getRow(priceRow + 2).getCell(1).value = 'Pricing call';
wsSum.getRow(priceRow + 2).getCell(1).style = labelStyle;
wsSum.getRow(priceRow + 2).getCell(2).value = {
  formula:
    'IF(OR(YourPrice="",OppValue="",OppValue=0),"-",IF(YourPrice/OppValue<0.9,"Aggressive — verify margins hold",IF(YourPrice/OppValue<1.05,"Market — defendable","Premium — needs strong technical story")))',
};
wsSum.mergeCells(`B${priceRow + 2}:F${priceRow + 2}`);
wsSum.getRow(priceRow + 2).getCell(2).style = {
  font: { name: FONT, size: 10, bold: true, color: { argb: SLATE_900 } },
  fill: fill(SLATE_50),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};

// Recommendation block
const recRow = priceRow + 4;
wsSum.mergeCells(`A${recRow}:F${recRow}`);
wsSum.getCell(`A${recRow}`).value = 'RECOMMENDED ACTION';
wsSum.getCell(`A${recRow}`).style = sectionHeader;
wsSum.getRow(recRow).height = 24;

wsSum.mergeCells(`A${recRow + 1}:F${recRow + 1}`);
wsSum.getCell(`A${recRow + 1}`).value = {
  formula:
    `IF(OR(TotalYou=0,MAX(TotalC1,TotalC2,TotalC3,TotalC4)=0),"Fill the Scoring tab — recommendation pending.",IF(TotalYou-MAX(TotalC1,TotalC2,TotalC3,TotalC4)>=1,"BID. You lead the field on weighted score. Lock the win themes on your top three factors and protect against price erosion.",IF(TotalYou-MAX(TotalC1,TotalC2,TotalC3,TotalC4)>=-0.5,"BID WITH CAUTION. Race is close. Identify the two factors with the largest competitor lead and rework your approach before the proposal start.",IF(TotalYou-MAX(TotalC1,TotalC2,TotalC3,TotalC4)>=-1.5,"NO-BID CANDIDATE. Multiple competitors out-score you on weighted factors. Either find a teaming partner who closes the gap, or save the proposal budget for a better fit.","NO-BID. The field is well ahead. Use this opportunity to learn — request a debrief if it lands, and add the winners to your competitor watchlist."))))`,
};
wsSum.getCell(`A${recRow + 1}`).style = {
  font: { name: FONT, size: 11, bold: true, color: { argb: SLATE_900 } },
  fill: fill(SLATE_50),
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true },
  border: border(),
};
wsSum.getRow(recRow + 1).height = 60;

// Footer
const footR = recRow + 3;
wsSum.mergeCells(`A${footR}:F${footR}`);
wsSum.getCell(`A${footR}`).value =
  'CapturePilot Federal Lead Kit  ·  capturepilot.com  ·  04 Bid/No-Bid Decision Toolkit';
wsSum.getCell(`A${footR}`).style = footerStyle;

brandHeaderFooter(wsSum);

// ============================================================
// SHEET 7 — Help (examples)
// ============================================================
const wsHelp = wb.addWorksheet('Help', {
  views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
});
wsHelp.columns = [
  { width: 4 },
  { width: 30 },
  { width: 70 },
];

wsHelp.mergeCells('B2:C2');
wsHelp.getCell('B2').value = 'HELP — EXAMPLES & SOURCES';
wsHelp.getCell('B2').style = titleStyle;
wsHelp.getRow(2).height = 36;

wsHelp.mergeCells('B3:C3');
wsHelp.getCell('B3').value =
  'Where the numbers come from, and what good answers look like.';
wsHelp.getCell('B3').style = subtitleStyle;
wsHelp.getRow(3).height = 22;

const helpRows = [
  ['Where do I find competitors?',
    'Three places. (1) SAM.gov entity search — filter by your NAICS and the agency\'s state. (2) USASpending.gov — search prior awards on the same NAICS and agency, then look at "Recipient Name". (3) The award notice for the prior contract — it names the incumbent.'],
  ['How do I estimate revenue?',
    'For private firms, LinkedIn lists employee count — multiply by $150,000 to $200,000 per head for services work. For prior federal awards, USASpending.gov shows lifetime obligations. Round generously and note the source in the cell.'],
  ['What weight should each factor get?',
    'Read the RFP\'s Section M. Most federal RFPs spell out the weight ("Technical: 40 points, Past Performance: 30, Price: 30"). Convert to percentages: 40/30/30 becomes 0.40/0.30/0.30. If Section M is vague, default to: Technical 35%, Management 15%, Past Performance 25%, Small Business 10%, Price 15%.'],
  ['Example — Past Performance score',
    'A 10 means three highly relevant federal contracts over $1M in the last 3 years, all rated Exceptional. A 5 means one relevant contract or two adjacent ones. A 1 means commercial-only work or no documented references.'],
  ['Example — Technical Approach score',
    'A 10 means a named, proven methodology with metrics, a clear staffing plan, and a transition strategy. A 5 means a generic approach without specifics. A 1 means the proposer is learning the work on the customer\'s dime.'],
  ['Example — Past Protest weakness',
    '"GAO sustained protest 2024 on similar contract — staffing assumptions challenged". Public source: gao.gov/products/b-422xxx — every protest decision is published. Search the competitor\'s name. Free.'],
  ['What does the PWin estimate mean?',
    'It\'s a rough heuristic — your lead in weighted points, normalized against the highest competitor, scaled into a 5%-95% probability band. Treat 60%+ as "bid hard", 30-60% as "bid with caution", under 30% as a no-bid candidate. This is a directional tool, not a guarantee.'],
  ['What if the weights don\'t total 100%?',
    'The Scoring tab shows a warning under the totals row. The PWin and Recommendation will still calculate, but the comparison is biased. Fix the weights first.'],
];

let hr = 5;
helpRows.forEach(([q, a]) => {
  wsHelp.mergeCells(`B${hr}:C${hr}`);
  wsHelp.getCell(`B${hr}`).value = q;
  wsHelp.getCell(`B${hr}`).style = {
    font: { name: FONT, size: 11, bold: true, color: { argb: WHITE } },
    fill: fill(EMERALD_DK),
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  };
  wsHelp.getRow(hr).height = 22;
  hr += 1;
  wsHelp.mergeCells(`B${hr}:C${hr}`);
  wsHelp.getCell(`B${hr}`).value = a;
  wsHelp.getCell(`B${hr}`).style = {
    font: { name: FONT, size: 10, color: { argb: SLATE_900 } },
    fill: fill(SLATE_50),
    alignment: { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true },
    border: border(),
  };
  wsHelp.getRow(hr).height = 60;
  hr += 2;
});

brandHeaderFooter(wsHelp);

// ============================================================
// Reorder sheets so Instructions is first, Summary is the payoff
// ============================================================
wb.views = [{
  x: 0, y: 0, width: 12000, height: 7500,
  firstSheet: 0, activeTab: 0, visibility: 'visible',
}];

// ---------- write ----------
await wb.xlsx.writeFile(OUT);
console.log(`Wrote ${OUT}`);
