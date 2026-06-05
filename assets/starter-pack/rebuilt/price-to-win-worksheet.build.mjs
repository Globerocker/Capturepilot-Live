// Price-to-Win Worksheet — rebuild via exceljs
// Designed for Excel + Google Sheets compatibility (no LAMBDA/FILTER/XLOOKUP).

import { createRequire } from 'node:module';
const require = createRequire('/Users/andreschuler/Caturepilot 2.0/dashboard/');
const ExcelJS = require('exceljs');
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'FLK_08_Price_to_Win_Worksheet.xlsx');

const wb = new ExcelJS.Workbook();
wb.creator = 'CapturePilot — Federal Lead Kit';
wb.created = new Date();
wb.title = 'Price-to-Win Worksheet';
wb.company = 'CapturePilot';

// ----- shared styles ------------------------------------------------------
const EMERALD = 'FF10B981';
const EMERALD_DARK = 'FF047857';
const SLATE = 'FF1F2937';
const SLATE_LIGHT = 'FFF1F5F9';
const BLUE_INPUT = 'FFDBEAFE';
const BLUE_TEXT = 'FF1D4ED8';
const AMBER = 'FFFEF3C7';
const RED = 'FFFEE2E2';
const GREEN_OK = 'FFD1FAE5';

const titleStyle = {
  font: { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } },
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
};
const subtitleStyle = {
  font: { name: 'Calibri', size: 11, italic: true, color: { argb: SLATE } },
  alignment: { vertical: 'middle', horizontal: 'left', wrapText: true },
};
const sectionStyle = {
  font: { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD } },
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
};
const labelStyle = {
  font: { name: 'Calibri', size: 10, bold: true, color: { argb: SLATE } },
  alignment: { vertical: 'middle', horizontal: 'left', wrapText: true },
};
const headerStyle = {
  font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE } },
  alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  },
};
const inputStyle = {
  font: { name: 'Calibri', size: 10, color: { argb: BLUE_TEXT }, bold: true },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_INPUT } },
  alignment: { vertical: 'middle', horizontal: 'right' },
  border: { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } },
};
const inputTextStyle = {
  font: { name: 'Calibri', size: 10, color: { argb: BLUE_TEXT } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_INPUT } },
  alignment: { vertical: 'middle', horizontal: 'left' },
  border: inputStyle.border,
};
const calcStyle = {
  font: { name: 'Calibri', size: 10, color: { argb: SLATE } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_LIGHT } },
  alignment: { vertical: 'middle', horizontal: 'right' },
  border: inputStyle.border,
};
const calcBoldStyle = {
  ...calcStyle,
  font: { name: 'Calibri', size: 10, color: { argb: SLATE }, bold: true },
};
const benchStyle = {
  font: { name: 'Calibri', size: 10, color: { argb: 'FF15803D' }, italic: true },
  alignment: { vertical: 'middle', horizontal: 'right' },
  border: inputStyle.border,
};

const printSetup = (ws) => {
  ws.pageSetup.orientation = 'portrait';
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  ws.pageSetup.margins = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };
  ws.headerFooter.oddHeader = '&L&B&"Calibri,Bold"&12CapturePilot &R&"Calibri,Italic"&10Price-to-Win Worksheet';
  ws.headerFooter.oddFooter = '&LFLK 08 — Price-to-Win&C&P of &N&Rcapturepilot.com';
};

const setBorder = (cell) => {
  cell.border = inputStyle.border;
};

// =========================================================================
// SHEET 1 — INSTRUCTIONS
// =========================================================================
const w1 = wb.addWorksheet('Instructions', {
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  properties: { tabColor: { argb: EMERALD_DARK } },
});
printSetup(w1);

w1.columns = [
  { width: 4 },
  { width: 22 },
  { width: 78 },
];

w1.mergeCells('A1:C1');
w1.getCell('A1').value = 'FEDERAL LEAD KIT — Price-to-Win Worksheet';
w1.getCell('A1').style = titleStyle;
w1.getRow(1).height = 32;

w1.mergeCells('A2:C2');
w1.getCell('A2').value = "Estimate your real cost position, sanity-check it against the market, and find the price that wins without giving away margin. Built for federal proposals where you're competing against three to seven other small firms.";
w1.getCell('A2').style = subtitleStyle;
w1.getRow(2).height = 36;

let r = 4;
const writeSection = (title) => {
  w1.mergeCells(`A${r}:C${r}`);
  w1.getCell(`A${r}`).value = title;
  w1.getCell(`A${r}`).style = sectionStyle;
  w1.getRow(r).height = 22;
  r++;
};
const writeStep = (label, body) => {
  w1.getCell(`B${r}`).value = label;
  w1.getCell(`B${r}`).style = { ...labelStyle, font: { ...labelStyle.font, color: { argb: EMERALD_DARK } } };
  w1.getCell(`C${r}`).value = body;
  w1.getCell(`C${r}`).style = { font: { name: 'Calibri', size: 10, color: { argb: SLATE } }, alignment: { vertical: 'top', wrapText: true } };
  w1.getRow(r).height = 32;
  r++;
};

writeSection('HOW TO USE THIS WORKBOOK');
writeStep('Step 1 — Cost Buildup', 'Open the Cost Buildup tab. Enter your indirect rates (fringe, OH, G&A, fee) at the top — these drive every wrap calculation below. Then list each labor category you plan to bid: title, clearance, headcount, annual hours, and base hourly rate.');
writeStep('Step 2 — Labor Benchmarks', 'Sanity-check your bill rates against FY2026 market data by clearance level. If your fully-loaded rate is more than 20% above the benchmark band, you will lose on price. More than 20% below and you risk a price realism finding.');
writeStep('Step 3 — Competitor Analysis', "List the three to five firms you expect to compete against. Use SAM.gov, USASpending, GSA Advantage, and CALC to estimate their wrap rates and bill rates. You won't get this perfect — get it close.");
writeStep('Step 4 — Price-to-Win', 'The model produces three scenarios (Conservative, Base, Aggressive) for your total price. Compare against the competitor range. Pick the scenario that gives you a real shot at winning while protecting at least 6% profit.');
writeStep('Step 5 — Summary', 'Single-page view: your price, the competitor range, your PTW recommendation, and the risk flags. Send this to your capture lead or pricing reviewer before submitting.');

r++;
writeSection('CELL COLOR LEGEND');
const writeLegend = (color, label, body) => {
  w1.getCell(`B${r}`).value = label;
  w1.getCell(`B${r}`).style = {
    font: { name: 'Calibri', size: 10, bold: true, color: { argb: SLATE } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } },
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: inputStyle.border,
  };
  w1.getCell(`C${r}`).value = body;
  w1.getCell(`C${r}`).style = { font: { name: 'Calibri', size: 10, color: { argb: SLATE } }, alignment: { vertical: 'middle', wrapText: true } };
  w1.getRow(r).height = 24;
  r++;
};
writeLegend(BLUE_INPUT, 'Input', "Blue cells. You type your numbers here. Everything else is a formula — don't overwrite it.");
writeLegend(SLATE_LIGHT, 'Calculated', 'Grey cells. Formulas. Read-only by convention; will recompute when you change inputs.');
writeLegend('FFD1FAE5', 'Benchmark', 'Green cells. FY2026 reference data from CALC, GSA Advantage, and BLS OEWS. Adjust the year column if you have newer data.');
writeLegend(AMBER, 'Assumption', 'Amber cells. Soft inputs that drive big outputs — fee target, win probability, escalation. Write down your source.');
writeLegend(RED, 'Risk flag', "Red highlighting on outputs. Means a value crossed a threshold (e.g. fee below 5%, wrap above 2.5, or you're outside the competitor band). Investigate before submitting.");

r++;
writeSection('GLOSSARY');
const writeDef = (term, body) => {
  w1.getCell(`B${r}`).value = term;
  w1.getCell(`B${r}`).style = { font: { name: 'Calibri', size: 10, bold: true, color: { argb: SLATE } }, alignment: { vertical: 'top' } };
  w1.getCell(`C${r}`).value = body;
  w1.getCell(`C${r}`).style = { font: { name: 'Calibri', size: 10, color: { argb: SLATE } }, alignment: { vertical: 'top', wrapText: true } };
  w1.getRow(r).height = 28;
  r++;
};
writeDef('Direct Labor (DL)', 'The salary you pay employees who actually perform work on the contract. The base of every cost buildup.');
writeDef('Fringe', "Benefits, payroll taxes, PTO, health insurance — applied as a percentage of DL. Most small GovCon firms run 25-35%. If you don't know yours, use 30%.");
writeDef('Overhead (OH)', 'Indirect costs tied to contract performance: facilities, supervision, indirect labor. Typically 10-25% for small services firms; 30-50% for product/engineering.');
writeDef('G&A', 'General and Administrative — BD, accounting, executive salaries, recruiting. Typically 10-20%. DCAA-audited firms know this number exactly.');
writeDef('Fee / Profit', "Your margin on top of cost. CPFF caps at 10% statutory (15% for R&D). On FFP, you can charge more — but the customer compares total price, so high fee = high price.");
writeDef('Wrap Rate', 'Multiplier from base DL to fully-loaded cost (before fee). Roughly: (1 + Fringe%) × (1 + OH%) × (1 + G&A%). A 1.80-2.20 wrap is normal. Above 2.50 you have a cost problem.');
writeDef('Bill Rate', 'Fully-loaded rate per labor hour including all indirect costs and fee. Wrap Rate × Base Hourly × (1 + Fee%).');
writeDef('Price-to-Win (PTW)', "The price that wins the contract while preserving acceptable margin. Not the lowest price — the best-value price the customer expects to pay.");
writeDef('LPTA', 'Lowest Price Technically Acceptable. The lowest compliant offer wins. PTW = the cost floor. Skip this RFP if your wrap is high.');
writeDef('Best Value', 'Tradeoff between technical and price. You can win at a higher price if your past performance and approach justify it. Most federal services work uses this.');

r++;
writeSection('SOURCES TO USE FOR COMPETITOR PRICING');
const writeSource = (name, url) => {
  w1.getCell(`B${r}`).value = name;
  w1.getCell(`B${r}`).style = labelStyle;
  w1.getCell(`C${r}`).value = url;
  w1.getCell(`C${r}`).style = { font: { name: 'Calibri', size: 10, color: { argb: BLUE_TEXT } }, alignment: { vertical: 'middle' } };
  r++;
};
writeSource('CALC', 'https://calc.gsa.gov — contract-awarded labor rates by category and clearance, filtered by ceiling year.');
writeSource('GSA Advantage', 'https://gsaadvantage.gov — current GSA Schedule pricing for products and services.');
writeSource('USASpending', 'https://usaspending.gov — historic award amounts to your competitors; divide by period of performance to back into a wrap.');
writeSource('SAM.gov contract data', 'https://sam.gov — past contract awards by NAICS, by agency, by competitor name.');
writeSource('BLS OEWS', 'https://www.bls.gov/oes/ — civilian wage data by occupation and metro. Cleared work runs 20-40% above OEWS.');

// =========================================================================
// SHEET 2 — LABOR BENCHMARKS  (build before Cost Buildup so VLOOKUP works)
// =========================================================================
const w3 = wb.addWorksheet('Labor Benchmarks', {
  views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  properties: { tabColor: { argb: EMERALD } },
});
printSetup(w3);

w3.columns = [
  { width: 36 }, // Labor Category
  { width: 14 }, // Clearance
  { width: 14 }, // Low ($/hr)
  { width: 14 }, // Median ($/hr)
  { width: 14 }, // High ($/hr)
  { width: 14 }, // Source year
  { width: 24 }, // Source
];

w3.mergeCells('A1:G1');
w3.getCell('A1').value = 'LABOR BENCHMARKS — FY2026';
w3.getCell('A1').style = titleStyle;
w3.getRow(1).height = 28;

w3.mergeCells('A2:G2');
w3.getCell('A2').value = 'Fully-loaded hourly bill rates by labor category and clearance level. Sourced from CALC contract awards, GSA Advantage, and BLS OEWS adjusted for cleared premium. Use the Median column as your target; if your computed bill rate is more than 20% outside the Low-High band, you have a pricing problem.';
w3.getCell('A2').style = subtitleStyle;
w3.getRow(2).height = 40;

const benchHeaders = ['Labor Category', 'Clearance', 'Low ($/hr)', 'Median ($/hr)', 'High ($/hr)', 'Source Year', 'Source'];
benchHeaders.forEach((h, i) => {
  const c = w3.getCell(4, i + 1);
  c.value = h;
  c.style = headerStyle;
});
w3.getRow(4).height = 22;

// Seed benchmark data. ~25 rows covering the most common federal services categories.
const bench = [
  ['Program Manager', 'Public Trust', 115, 145, 185, 'FY2026', 'CALC + adj'],
  ['Program Manager', 'Secret', 135, 168, 215, 'FY2026', 'CALC + adj'],
  ['Program Manager', 'TS/SCI', 165, 205, 265, 'FY2026', 'CALC + adj'],
  ['Project Manager', 'Public Trust', 95, 120, 155, 'FY2026', 'CALC'],
  ['Project Manager', 'Secret', 110, 138, 175, 'FY2026', 'CALC'],
  ['Senior Systems Engineer', 'Secret', 125, 158, 195, 'FY2026', 'CALC'],
  ['Senior Systems Engineer', 'TS/SCI', 155, 195, 245, 'FY2026', 'CALC'],
  ['Systems Engineer', 'Public Trust', 85, 110, 140, 'FY2026', 'CALC'],
  ['Systems Engineer', 'Secret', 105, 132, 165, 'FY2026', 'CALC'],
  ['Software Developer (Sr.)', 'Public Trust', 110, 138, 175, 'FY2026', 'CALC + BLS'],
  ['Software Developer (Sr.)', 'Secret', 130, 165, 210, 'FY2026', 'CALC + BLS'],
  ['Software Developer (Sr.)', 'TS/SCI', 160, 200, 255, 'FY2026', 'CALC + BLS'],
  ['Software Developer (Mid)', 'Public Trust', 85, 108, 138, 'FY2026', 'CALC + BLS'],
  ['Software Developer (Mid)', 'Secret', 100, 128, 162, 'FY2026', 'CALC + BLS'],
  ['Cybersecurity Analyst', 'Secret', 115, 145, 185, 'FY2026', 'CALC'],
  ['Cybersecurity Analyst', 'TS/SCI', 145, 182, 230, 'FY2026', 'CALC'],
  ['Cloud Architect', 'Public Trust', 130, 165, 210, 'FY2026', 'BLS + adj'],
  ['Cloud Architect', 'Secret', 155, 195, 245, 'FY2026', 'BLS + adj'],
  ['Data Scientist', 'Public Trust', 110, 142, 180, 'FY2026', 'BLS + adj'],
  ['Data Scientist', 'Secret', 130, 165, 210, 'FY2026', 'BLS + adj'],
  ['DevOps Engineer', 'Public Trust', 105, 135, 170, 'FY2026', 'CALC'],
  ['DevOps Engineer', 'Secret', 125, 158, 200, 'FY2026', 'CALC'],
  ['Technical Writer', 'Public Trust', 65, 85, 110, 'FY2026', 'CALC'],
  ['Technical Writer', 'Secret', 80, 102, 128, 'FY2026', 'CALC'],
  ['Help Desk Tier 1', 'Public Trust', 35, 48, 62, 'FY2026', 'CALC'],
  ['Help Desk Tier 2', 'Public Trust', 48, 62, 78, 'FY2026', 'CALC'],
  ['Help Desk Tier 3', 'Secret', 65, 82, 105, 'FY2026', 'CALC'],
  ['Administrative Support', 'Public Trust', 28, 38, 50, 'FY2026', 'BLS'],
  ['Subject Matter Expert', 'Secret', 165, 210, 275, 'FY2026', 'CALC'],
  ['Subject Matter Expert', 'TS/SCI', 195, 250, 325, 'FY2026', 'CALC'],
];

bench.forEach((row, i) => {
  const rowNum = 5 + i;
  row.forEach((val, ci) => {
    const cell = w3.getCell(rowNum, ci + 1);
    cell.value = val;
    if (ci >= 2 && ci <= 4) {
      cell.style = { ...benchStyle, numFmt: '"$"#,##0.00' };
    } else {
      cell.style = { ...benchStyle, alignment: { vertical: 'middle', horizontal: ci === 0 ? 'left' : 'center' } };
    }
  });
});

const benchLastRow = 4 + bench.length;
// Named range covering the lookup table
wb.definedNames.add(`'Labor Benchmarks'!$A$5:$G$${benchLastRow}`, 'BenchTable');
wb.definedNames.add(`'Labor Benchmarks'!$A$5:$A$${benchLastRow}`, 'BenchCategories');

// =========================================================================
// SHEET 3 — COST BUILDUP
// =========================================================================
const w2 = wb.addWorksheet('Cost Buildup', {
  views: [{ state: 'frozen', ySplit: 12, showGridLines: false }],
  properties: { tabColor: { argb: EMERALD } },
});
printSetup(w2);

w2.columns = [
  { width: 32 }, // A Labor category / label
  { width: 14 }, // B Clearance
  { width: 12 }, // C Headcount
  { width: 12 }, // D Hours/FTE
  { width: 12 }, // E Total Hours (calc)
  { width: 14 }, // F Base Hourly
  { width: 14 }, // G Fringe loaded
  { width: 14 }, // H + OH
  { width: 14 }, // I + G&A
  { width: 14 }, // J Fully loaded rate
  { width: 14 }, // K Fully loaded cost
  { width: 14 }, // L Bill rate (w/ fee)
  { width: 14 }, // M Revenue
  { width: 14 }, // N Bench median
  { width: 12 }, // O Variance %
];

w2.mergeCells('A1:O1');
w2.getCell('A1').value = 'COST BUILDUP — Direct Labor and Indirect Rates';
w2.getCell('A1').style = titleStyle;
w2.getRow(1).height = 28;

w2.mergeCells('A2:O2');
w2.getCell('A2').value = "Enter your indirect rates at the top, then add labor categories below. Wrap rate, fully-loaded cost, bill rate, and bench variance all calculate automatically. The whole worksheet keys off the period set in B11 — change it once.";
w2.getCell('A2').style = subtitleStyle;
w2.getRow(2).height = 32;

// --- Indirect rates section ---
w2.mergeCells('A4:O4');
w2.getCell('A4').value = 'INDIRECT RATE ASSUMPTIONS  (enter your real or provisional rates)';
w2.getCell('A4').style = sectionStyle;

const indirectRows = [
  ['Fringe Rate', 0.30, 'Incurred cost submission or DCAA forward pricing', '%'],
  ['Overhead Rate', 0.18, 'Indirect rate agreement or forward pricing proposal', '%'],
  ['G&A Rate', 0.12, 'Indirect rate agreement', '%'],
  ['Fee / Profit Target', 0.08, 'FFP: competitive; CPFF: capped at 10%', '%'],
];

indirectRows.forEach((row, i) => {
  const rowNum = 5 + i;
  w2.getCell(rowNum, 1).value = row[0];
  w2.getCell(rowNum, 1).style = labelStyle;
  w2.getCell(rowNum, 2).value = row[1];
  w2.getCell(rowNum, 2).style = { ...inputStyle, numFmt: '0.0%' };
  w2.mergeCells(rowNum, 3, rowNum, 6);
  w2.getCell(rowNum, 3).value = row[2];
  w2.getCell(rowNum, 3).style = { font: { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }, alignment: { vertical: 'middle', horizontal: 'left', indent: 1 } };
});

// Named ranges for indirect rates
wb.definedNames.add(`'Cost Buildup'!$B$5`, 'FringeRate');
wb.definedNames.add(`'Cost Buildup'!$B$6`, 'OHRate');
wb.definedNames.add(`'Cost Buildup'!$B$7`, 'GARate');
wb.definedNames.add(`'Cost Buildup'!$B$8`, 'FeeRate');

// Computed wrap rate
w2.getCell('A9').value = 'Effective Wrap Rate (excl. fee)';
w2.getCell('A9').style = { ...labelStyle, font: { ...labelStyle.font, color: { argb: EMERALD_DARK } } };
w2.getCell('B9').value = { formula: '(1+FringeRate)*(1+OHRate)*(1+GARate)' };
w2.getCell('B9').style = { ...calcBoldStyle, numFmt: '0.000' };
w2.mergeCells('C9:F9');
w2.getCell('C9').value = 'Multiplier on base DL wage. Healthy range 1.70-2.20.';
w2.getCell('C9').style = { font: { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }, alignment: { vertical: 'middle' } };
wb.definedNames.add(`'Cost Buildup'!$B$9`, 'WrapRate');

w2.getCell('A10').value = 'Wrap Rate w/ Fee';
w2.getCell('A10').style = { ...labelStyle, font: { ...labelStyle.font, color: { argb: EMERALD_DARK } } };
w2.getCell('B10').value = { formula: 'WrapRate*(1+FeeRate)' };
w2.getCell('B10').style = { ...calcBoldStyle, numFmt: '0.000' };
w2.mergeCells('C10:F10');
w2.getCell('C10').value = 'Total bill-rate multiplier on DL. This is the number your CO will benchmark.';
w2.getCell('C10').style = { font: { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }, alignment: { vertical: 'middle' } };
wb.definedNames.add(`'Cost Buildup'!$B$10`, 'WrapWithFee');

// Period of performance
w2.getCell('A11').value = 'Period of Performance (years)';
w2.getCell('A11').style = labelStyle;
w2.getCell('B11').value = 5;
w2.getCell('B11').style = { ...inputStyle, numFmt: '0' };
wb.definedNames.add(`'Cost Buildup'!$B$11`, 'PoPYears');

// --- Direct labor table ---
w2.mergeCells('A13:O13');
w2.getCell('A13').value = 'DIRECT LABOR — BY LABOR CATEGORY';
w2.getCell('A13').style = sectionStyle;

const dlHeaders = [
  'Labor Category', 'Clearance', 'Headcount', 'Hrs/FTE/yr', 'Total Hrs',
  'Base $/hr', '+ Fringe', '+ OH', '+ G&A',
  'Fully-Loaded $/hr', 'Loaded Cost (PoP)', 'Bill Rate ($/hr)', 'Revenue (PoP)',
  'Bench Median', 'Variance %'
];
dlHeaders.forEach((h, i) => {
  const c = w2.getCell(14, i + 1);
  c.value = h;
  c.style = headerStyle;
});
w2.getRow(14).height = 30;

// Seed 12 labor category rows (user overwrites as needed)
const dlSeed = [
  ['Program Manager', 'Secret', 1, 1880, 165],
  ['Senior Systems Engineer', 'TS/SCI', 2, 1880, 145],
  ['Systems Engineer', 'Secret', 3, 1880, 105],
  ['Software Developer (Sr.)', 'Secret', 2, 1880, 130],
  ['Software Developer (Mid)', 'Public Trust', 2, 1880, 95],
  ['Cybersecurity Analyst', 'Secret', 1, 1880, 115],
  ['DevOps Engineer', 'Public Trust', 1, 1880, 105],
  ['Technical Writer', 'Public Trust', 1, 1880, 65],
  ['', '', '', 1880, ''],
  ['', '', '', 1880, ''],
  ['', '', '', 1880, ''],
  ['', '', '', 1880, ''],
];

const DL_START = 15;
const DL_END = DL_START + dlSeed.length - 1;

dlSeed.forEach((row, i) => {
  const rn = DL_START + i;
  // A category
  w2.getCell(rn, 1).value = row[0];
  w2.getCell(rn, 1).style = inputTextStyle;
  // B clearance
  w2.getCell(rn, 2).value = row[1];
  w2.getCell(rn, 2).style = { ...inputTextStyle, alignment: { vertical: 'middle', horizontal: 'center' } };
  // C headcount
  w2.getCell(rn, 3).value = row[2];
  w2.getCell(rn, 3).style = { ...inputStyle, numFmt: '0' };
  // D hours/FTE
  w2.getCell(rn, 4).value = row[3];
  w2.getCell(rn, 4).style = { ...inputStyle, numFmt: '#,##0' };
  // E Total Hours = C*D*PoP
  w2.getCell(rn, 5).value = { formula: `IF(OR(C${rn}="",D${rn}=""),"",C${rn}*D${rn}*PoPYears)` };
  w2.getCell(rn, 5).style = { ...calcStyle, numFmt: '#,##0' };
  // F base rate
  w2.getCell(rn, 6).value = row[4];
  w2.getCell(rn, 6).style = { ...inputStyle, numFmt: '"$"#,##0.00' };
  // G + Fringe ($/hr)
  w2.getCell(rn, 7).value = { formula: `IF(F${rn}="","",F${rn}*(1+FringeRate))` };
  w2.getCell(rn, 7).style = { ...calcStyle, numFmt: '"$"#,##0.00' };
  // H + OH
  w2.getCell(rn, 8).value = { formula: `IF(G${rn}="","",G${rn}*(1+OHRate))` };
  w2.getCell(rn, 8).style = { ...calcStyle, numFmt: '"$"#,##0.00' };
  // I + G&A
  w2.getCell(rn, 9).value = { formula: `IF(H${rn}="","",H${rn}*(1+GARate))` };
  w2.getCell(rn, 9).style = { ...calcStyle, numFmt: '"$"#,##0.00' };
  // J Fully-Loaded $/hr (no fee)
  w2.getCell(rn, 10).value = { formula: `IF(I${rn}="","",I${rn})` };
  w2.getCell(rn, 10).style = { ...calcBoldStyle, numFmt: '"$"#,##0.00' };
  // K Loaded Cost (PoP)
  w2.getCell(rn, 11).value = { formula: `IF(OR(E${rn}="",J${rn}=""),"",E${rn}*J${rn})` };
  w2.getCell(rn, 11).style = { ...calcStyle, numFmt: '"$"#,##0' };
  // L Bill Rate w/ fee
  w2.getCell(rn, 12).value = { formula: `IF(J${rn}="","",J${rn}*(1+FeeRate))` };
  w2.getCell(rn, 12).style = { ...calcBoldStyle, numFmt: '"$"#,##0.00' };
  // M Revenue
  w2.getCell(rn, 13).value = { formula: `IF(OR(E${rn}="",L${rn}=""),"",E${rn}*L${rn})` };
  w2.getCell(rn, 13).style = { ...calcStyle, numFmt: '"$"#,##0' };
  // N Bench Median (VLOOKUP) — match category only on first hit
  w2.getCell(rn, 14).value = { formula: `IFERROR(VLOOKUP(A${rn},BenchTable,4,FALSE),"")` };
  w2.getCell(rn, 14).style = { ...benchStyle, numFmt: '"$"#,##0.00' };
  // O Variance vs bench median
  w2.getCell(rn, 15).value = { formula: `IF(OR(N${rn}="",L${rn}=""),"",(L${rn}-N${rn})/N${rn})` };
  w2.getCell(rn, 15).style = { ...calcStyle, numFmt: '0.0%' };
});

// Totals row
const totRow = DL_END + 1;
w2.getCell(totRow, 1).value = 'TOTAL';
w2.getCell(totRow, 1).style = { font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } }, alignment: { vertical: 'middle', horizontal: 'left', indent: 1 } };
w2.mergeCells(totRow, 1, totRow, 4);
w2.getCell(totRow, 5).value = { formula: `SUM(E${DL_START}:E${DL_END})` };
w2.getCell(totRow, 5).style = { ...calcBoldStyle, numFmt: '#,##0', font: { ...calcBoldStyle.font, color: { argb: EMERALD_DARK } } };
for (let col = 6; col <= 10; col++) {
  w2.getCell(totRow, col).value = '';
  w2.getCell(totRow, col).style = calcStyle;
}
w2.getCell(totRow, 11).value = { formula: `SUM(K${DL_START}:K${DL_END})` };
w2.getCell(totRow, 11).style = { ...calcBoldStyle, numFmt: '"$"#,##0', font: { ...calcBoldStyle.font, color: { argb: EMERALD_DARK }, bold: true } };
w2.getCell(totRow, 12).value = '';
w2.getCell(totRow, 12).style = calcStyle;
w2.getCell(totRow, 13).value = { formula: `SUM(M${DL_START}:M${DL_END})` };
w2.getCell(totRow, 13).style = { ...calcBoldStyle, numFmt: '"$"#,##0', font: { ...calcBoldStyle.font, color: { argb: EMERALD_DARK }, bold: true } };
w2.getCell(totRow, 14).value = '';
w2.getCell(totRow, 14).style = calcStyle;
w2.getCell(totRow, 15).value = '';
w2.getCell(totRow, 15).style = calcStyle;

wb.definedNames.add(`'Cost Buildup'!$K$${totRow}`, 'TotalLaborCost');
wb.definedNames.add(`'Cost Buildup'!$M$${totRow}`, 'TotalLaborRevenue');

// --- Other Direct Costs ---
const odcStartRow = totRow + 2;
w2.mergeCells(`A${odcStartRow}:O${odcStartRow}`);
w2.getCell(`A${odcStartRow}`).value = 'OTHER DIRECT COSTS (ODCs) — Materials, Travel, Subcontractors';
w2.getCell(`A${odcStartRow}`).style = sectionStyle;

const odcHead = odcStartRow + 1;
['Description', 'Category', 'Quantity', 'Unit Cost ($)', 'Subtotal', 'G&A Applied?', 'Total Cost', 'Total Price (w/ fee)'].forEach((h, i) => {
  const c = w2.getCell(odcHead, i + 1);
  c.value = h;
  c.style = headerStyle;
});
// merge unused columns
for (let col = 9; col <= 15; col++) {
  w2.getCell(odcHead, col).style = headerStyle;
}
w2.getRow(odcHead).height = 24;

const odcSeed = [
  ['Travel — CONUS trips', 'Travel', 12, 1500, 'Yes'],
  ['Materials / hardware', 'Materials', 1, 25000, 'Yes'],
  ['Subcontractor — Smith LLC', 'Sub', 1, 180000, 'No'],
  ['', '', '', '', 'Yes'],
  ['', '', '', '', 'Yes'],
];
const ODC_START = odcHead + 1;
const ODC_END = ODC_START + odcSeed.length - 1;

odcSeed.forEach((row, i) => {
  const rn = ODC_START + i;
  w2.getCell(rn, 1).value = row[0]; w2.getCell(rn, 1).style = inputTextStyle;
  w2.getCell(rn, 2).value = row[1]; w2.getCell(rn, 2).style = { ...inputTextStyle, alignment: { vertical: 'middle', horizontal: 'center' } };
  w2.getCell(rn, 3).value = row[2]; w2.getCell(rn, 3).style = { ...inputStyle, numFmt: '#,##0' };
  w2.getCell(rn, 4).value = row[3]; w2.getCell(rn, 4).style = { ...inputStyle, numFmt: '"$"#,##0.00' };
  w2.getCell(rn, 5).value = { formula: `IF(OR(C${rn}="",D${rn}=""),"",C${rn}*D${rn})` };
  w2.getCell(rn, 5).style = { ...calcStyle, numFmt: '"$"#,##0' };
  w2.getCell(rn, 6).value = row[4]; w2.getCell(rn, 6).style = { ...inputTextStyle, alignment: { vertical: 'middle', horizontal: 'center' } };
  w2.getCell(rn, 7).value = { formula: `IF(E${rn}="","",IF(F${rn}="Yes",E${rn}*(1+GARate),E${rn}))` };
  w2.getCell(rn, 7).style = { ...calcStyle, numFmt: '"$"#,##0' };
  w2.getCell(rn, 8).value = { formula: `IF(G${rn}="","",G${rn}*(1+FeeRate))` };
  w2.getCell(rn, 8).style = { ...calcBoldStyle, numFmt: '"$"#,##0' };

  // data validation for G&A applied
  w2.getCell(rn, 6).dataValidation = {
    type: 'list', allowBlank: true, formulae: ['"Yes,No"'],
    showErrorMessage: true, errorStyle: 'warning',
    error: 'Use Yes or No', errorTitle: 'G&A flag',
  };
  // data validation for ODC category
  w2.getCell(rn, 2).dataValidation = {
    type: 'list', allowBlank: true, formulae: ['"Materials,Travel,Sub,Equipment,Software,Other"'],
    showErrorMessage: true, errorStyle: 'warning',
    error: 'Pick a category', errorTitle: 'ODC category',
  };
});

// ODC totals
const odcTot = ODC_END + 1;
w2.getCell(odcTot, 1).value = 'ODC TOTAL';
w2.mergeCells(odcTot, 1, odcTot, 6);
w2.getCell(odcTot, 1).style = { font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } }, alignment: { vertical: 'middle', horizontal: 'left', indent: 1 } };
w2.getCell(odcTot, 7).value = { formula: `SUM(G${ODC_START}:G${ODC_END})` };
w2.getCell(odcTot, 7).style = { ...calcBoldStyle, numFmt: '"$"#,##0', font: { ...calcBoldStyle.font, color: { argb: EMERALD_DARK } } };
w2.getCell(odcTot, 8).value = { formula: `SUM(H${ODC_START}:H${ODC_END})` };
w2.getCell(odcTot, 8).style = { ...calcBoldStyle, numFmt: '"$"#,##0', font: { ...calcBoldStyle.font, color: { argb: EMERALD_DARK } } };
wb.definedNames.add(`'Cost Buildup'!$G$${odcTot}`, 'TotalODCCost');
wb.definedNames.add(`'Cost Buildup'!$H$${odcTot}`, 'TotalODCRevenue');

// --- Grand Total ---
const grandRow = odcTot + 2;
w2.mergeCells(`A${grandRow}:O${grandRow}`);
w2.getCell(`A${grandRow}`).value = 'YOUR PROPOSED COST + PRICE  (Period of Performance total)';
w2.getCell(`A${grandRow}`).style = sectionStyle;

const totals = [
  ['Total Direct Labor Cost (loaded, no fee)', `=TotalLaborCost`, '"$"#,##0'],
  ['Total ODC Cost', `=TotalODCCost`, '"$"#,##0'],
  ['Total Cost', `=TotalLaborCost+TotalODCCost`, '"$"#,##0'],
  ['Total Fee', `=(TotalLaborCost+TotalODCCost)*FeeRate`, '"$"#,##0'],
  ['Your Proposed Price', `=TotalLaborRevenue+TotalODCRevenue`, '"$"#,##0'],
  ['Effective Profit Margin', `=IF((TotalLaborRevenue+TotalODCRevenue)=0,0,((TotalLaborRevenue+TotalODCRevenue)-(TotalLaborCost+TotalODCCost))/(TotalLaborRevenue+TotalODCRevenue))`, '0.0%'],
];
totals.forEach((t, i) => {
  const rn = grandRow + 1 + i;
  w2.getCell(rn, 1).value = t[0];
  w2.mergeCells(rn, 1, rn, 4);
  w2.getCell(rn, 1).style = labelStyle;
  w2.getCell(rn, 5).value = { formula: t[1].slice(1) };
  w2.mergeCells(rn, 5, rn, 7);
  w2.getCell(rn, 5).style = { ...calcBoldStyle, numFmt: t[2], font: { ...calcBoldStyle.font, color: { argb: EMERALD_DARK } } };
});

wb.definedNames.add(`'Cost Buildup'!$E$${grandRow + 5}`, 'YourProposedPrice');
wb.definedNames.add(`'Cost Buildup'!$E$${grandRow + 3}`, 'YourTotalCost');

// Data validation for clearance column (DL rows)
for (let rn = DL_START; rn <= DL_END; rn++) {
  w2.getCell(rn, 2).dataValidation = {
    type: 'list', allowBlank: true, formulae: ['"None,Public Trust,Secret,Top Secret,TS/SCI,TS/SCI w/ Poly"'],
    showErrorMessage: true, errorStyle: 'warning',
    error: 'Use one of the standard clearance levels', errorTitle: 'Clearance',
  };
}

// Conditional formatting on variance column
w2.addConditionalFormatting({
  ref: `O${DL_START}:O${DL_END}`,
  rules: [
    { type: 'cellIs', operator: 'greaterThan', formulae: ['0.2'], priority: 1,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } }, font: { color: { argb: 'FF991B1B' }, bold: true } } },
    { type: 'cellIs', operator: 'lessThan', formulae: ['-0.2'], priority: 2,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } }, font: { color: { argb: 'FF991B1B' }, bold: true } } },
    { type: 'cellIs', operator: 'between', formulae: ['-0.2', '0.2'], priority: 3,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_OK } }, font: { color: { argb: 'FF065F46' } } } },
  ],
});

// Conditional formatting on wrap rate cell
w2.addConditionalFormatting({
  ref: `B9`,
  rules: [
    { type: 'cellIs', operator: 'greaterThan', formulae: ['2.5'], priority: 1,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } }, font: { color: { argb: 'FF991B1B' }, bold: true } } },
    { type: 'cellIs', operator: 'between', formulae: ['1.7', '2.2'], priority: 2,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_OK } }, font: { color: { argb: 'FF065F46' }, bold: true } } },
  ],
});

// =========================================================================
// SHEET 4 — COMPETITOR ANALYSIS
// =========================================================================
const w4 = wb.addWorksheet('Competitor Analysis', {
  views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  properties: { tabColor: { argb: EMERALD } },
});
printSetup(w4);

w4.columns = [
  { width: 26 }, // A Competitor
  { width: 10 }, // B Size
  { width: 14 }, // C Set-aside
  { width: 14 }, // D Est. Wrap Rate
  { width: 14 }, // E Est. Fee
  { width: 14 }, // F Est. Bill Rate ($/hr)
  { width: 14 }, // G Est. Total Hours
  { width: 16 }, // H Est. Total Price
  { width: 14 }, // I Win History
  { width: 14 }, // J Threat Score (1-5)
  { width: 30 }, // K Notes / source
];

w4.mergeCells('A1:K1');
w4.getCell('A1').value = 'COMPETITOR ANALYSIS — Estimated Cost and Price Position';
w4.getCell('A1').style = titleStyle;
w4.getRow(1).height = 28;

w4.mergeCells('A2:K2');
w4.getCell('A2').value = "List three to five firms you expect to compete against. Pull wrap and bill rates from CALC, GSA Advantage, and USASpending awards. Total Hours should roughly match what's in your Cost Buildup (B11 PoP × your headcount estimate of their team). The model summarizes the range on the Price-to-Win tab.";
w4.getCell('A2').style = subtitleStyle;
w4.getRow(2).height = 44;

['Competitor', 'Size', 'Set-Aside', 'Est. Wrap Rate', 'Est. Fee %', 'Est. Bill $/hr', 'Est. Total Hours', 'Est. Total Price', 'Recent Wins (24mo)', 'Threat Score (1-5)', 'Notes / Source'].forEach((h, i) => {
  const c = w4.getCell(4, i + 1);
  c.value = h;
  c.style = headerStyle;
});
w4.getRow(4).height = 30;

const compSeed = [
  ['Lockheed Martin', 'Large', 'Full & Open', 2.35, 0.10, 0, 50000, 0, 12, 5, 'Incumbent on prior contract. Pulled from USASpending FY24 award.'],
  ['Booz Allen Hamilton', 'Large', 'Full & Open', 2.28, 0.09, 0, 50000, 0, 8, 4, 'CALC FY26 median for similar mix.'],
  ['Mid-tier 8(a) firm', 'Small', '8(a)', 1.85, 0.08, 0, 50000, 0, 5, 4, 'Lower wrap due to smaller G&A. Typical aggressive bid.'],
  ['Local SDVOSB', 'Small', 'SDVOSB', 1.92, 0.07, 0, 50000, 0, 3, 3, 'Won 2 of last 4 SDVOSB set-asides at this agency.'],
  ['', '', '', '', '', 0, '', '', '', '', ''],
];
const CMP_START = 5;
const CMP_END = CMP_START + compSeed.length - 1;

compSeed.forEach((row, i) => {
  const rn = CMP_START + i;
  w4.getCell(rn, 1).value = row[0]; w4.getCell(rn, 1).style = inputTextStyle;
  w4.getCell(rn, 2).value = row[1]; w4.getCell(rn, 2).style = { ...inputTextStyle, alignment: { vertical: 'middle', horizontal: 'center' } };
  w4.getCell(rn, 3).value = row[2]; w4.getCell(rn, 3).style = { ...inputTextStyle, alignment: { vertical: 'middle', horizontal: 'center' } };
  w4.getCell(rn, 4).value = row[3] || ''; w4.getCell(rn, 4).style = { ...inputStyle, numFmt: '0.000' };
  w4.getCell(rn, 5).value = row[4] || ''; w4.getCell(rn, 5).style = { ...inputStyle, numFmt: '0.0%' };
  // F bill rate: if user typed one, use it; else derive
  w4.getCell(rn, 6).value = { formula: `IF(OR(D${rn}="",E${rn}=""),"",80*D${rn}*(1+E${rn}))` };
  w4.getCell(rn, 6).style = { ...calcStyle, numFmt: '"$"#,##0.00' };
  w4.getCell(rn, 7).value = row[6] || ''; w4.getCell(rn, 7).style = { ...inputStyle, numFmt: '#,##0' };
  // H Estimated total price = bill rate * hours
  w4.getCell(rn, 8).value = { formula: `IF(OR(F${rn}="",G${rn}=""),"",F${rn}*G${rn})` };
  w4.getCell(rn, 8).style = { ...calcBoldStyle, numFmt: '"$"#,##0' };
  w4.getCell(rn, 9).value = row[8] || ''; w4.getCell(rn, 9).style = { ...inputStyle, numFmt: '0' };
  w4.getCell(rn, 10).value = row[9] || ''; w4.getCell(rn, 10).style = { ...inputStyle, numFmt: '0' };
  w4.getCell(rn, 11).value = row[10]; w4.getCell(rn, 11).style = { ...inputTextStyle, font: { ...inputTextStyle.font, italic: true } };

  w4.getCell(rn, 2).dataValidation = {
    type: 'list', allowBlank: true, formulae: ['"Large,Small,Mid-Size,Unknown"'],
    showErrorMessage: true, errorStyle: 'warning',
  };
  w4.getCell(rn, 3).dataValidation = {
    type: 'list', allowBlank: true, formulae: ['"Full & Open,Small Business,8(a),HUBZone,WOSB,EDWOSB,SDVOSB,VOSB"'],
    showErrorMessage: true, errorStyle: 'warning',
  };
  w4.getCell(rn, 10).dataValidation = {
    type: 'whole', operator: 'between', formulae: [1, 5],
    showErrorMessage: true, errorStyle: 'warning',
    error: 'Threat score must be 1-5', errorTitle: 'Threat',
  };
});

// Competitor summary stats row
const cmpSum = CMP_END + 2;
w4.getCell(cmpSum, 1).value = 'COMPETITOR PRICE STATISTICS';
w4.mergeCells(cmpSum, 1, cmpSum, 11);
w4.getCell(cmpSum, 1).style = sectionStyle;

const cmpStats = [
  ['Lowest Bid (Conservative win threshold)', `=IFERROR(MIN(H${CMP_START}:H${CMP_END}),0)`],
  ['Highest Bid (Aggressive ceiling)', `=IFERROR(MAX(H${CMP_START}:H${CMP_END}),0)`],
  ['Median Bid (Likely award zone)', `=IFERROR(MEDIAN(H${CMP_START}:H${CMP_END}),0)`],
  ['Average Bid', `=IFERROR(AVERAGE(H${CMP_START}:H${CMP_END}),0)`],
  ['Average Wrap Rate', `=IFERROR(AVERAGE(D${CMP_START}:D${CMP_END}),0)`],
  ['Count of Competitors', `=COUNTA(A${CMP_START}:A${CMP_END})`],
];
cmpStats.forEach((s, i) => {
  const rn = cmpSum + 1 + i;
  w4.getCell(rn, 1).value = s[0];
  w4.mergeCells(rn, 1, rn, 7);
  w4.getCell(rn, 1).style = labelStyle;
  w4.getCell(rn, 8).value = { formula: s[1].slice(1) };
  w4.mergeCells(rn, 8, rn, 9);
  w4.getCell(rn, 8).style = { ...calcBoldStyle, numFmt: i >= 4 ? (i === 5 ? '0' : '0.000') : '"$"#,##0' };
});
wb.definedNames.add(`'Competitor Analysis'!$H$${cmpSum + 1}`, 'CompMin');
wb.definedNames.add(`'Competitor Analysis'!$H$${cmpSum + 2}`, 'CompMax');
wb.definedNames.add(`'Competitor Analysis'!$H$${cmpSum + 3}`, 'CompMedian');
wb.definedNames.add(`'Competitor Analysis'!$H$${cmpSum + 4}`, 'CompAvg');

// =========================================================================
// SHEET 5 — PRICE-TO-WIN
// =========================================================================
const w5 = wb.addWorksheet('Price-to-Win', {
  views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  properties: { tabColor: { argb: EMERALD_DARK } },
});
printSetup(w5);

w5.columns = [
  { width: 4 },
  { width: 38 },
  { width: 22 },
  { width: 22 },
  { width: 22 },
  { width: 38 },
];

w5.mergeCells('A1:F1');
w5.getCell('A1').value = 'PRICE-TO-WIN — Recommendation';
w5.getCell('A1').style = titleStyle;
w5.getRow(1).height = 28;

w5.mergeCells('A2:F2');
w5.getCell('A2').value = "Three scenarios. Conservative cuts price to undercut the lowest competitor. Base matches median. Aggressive holds full margin and bets on technical score. Pick a target, write down why, and put the chosen price on your proposal cover sheet.";
w5.getCell('A2').style = subtitleStyle;
w5.getRow(2).height = 36;

// Scenario assumptions
w5.mergeCells('B4:F4');
w5.getCell('B4').value = 'EVALUATION + PRICING INPUTS';
w5.getCell('B4').style = sectionStyle;

const scInputs = [
  ['Evaluation Type', 'Best Value', 'Affects PTW logic'],
  ['Technical Score (your est., 0-100)', 85, 'Self-assessed score on technical volume'],
  ['Competitor Avg Technical Score', 78, 'Best guess from past performance'],
  ['Target Win Probability (PWin)', 0.55, 'Your honest PWin estimate at base price'],
  ['Minimum Acceptable Fee %', 0.06, 'Walk-away floor on margin'],
  ['Conservative Price Discount vs Base', 0.08, 'How much to drop below base price'],
  ['Aggressive Price Premium vs Base', 0.05, 'How much above base if you have technical edge'],
];
const SC_START = 5;
scInputs.forEach((row, i) => {
  const rn = SC_START + i;
  w5.getCell(rn, 2).value = row[0]; w5.getCell(rn, 2).style = labelStyle;
  w5.getCell(rn, 3).value = row[1];
  if (typeof row[1] === 'number' && row[1] < 1) {
    w5.getCell(rn, 3).style = { ...inputStyle, numFmt: '0.0%' };
  } else if (typeof row[1] === 'number') {
    w5.getCell(rn, 3).style = { ...inputStyle, numFmt: '0' };
  } else {
    w5.getCell(rn, 3).style = { ...inputTextStyle, alignment: { vertical: 'middle', horizontal: 'center' } };
  }
  w5.mergeCells(rn, 4, rn, 6);
  w5.getCell(rn, 4).value = row[2];
  w5.getCell(rn, 4).style = { font: { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }, alignment: { vertical: 'middle', horizontal: 'left', indent: 1 } };
});

w5.getCell('C5').dataValidation = {
  type: 'list', allowBlank: false, formulae: ['"LPTA,Best Value,Tradeoff"'],
  showErrorMessage: true,
};

wb.definedNames.add(`'Price-to-Win'!$C$5`, 'EvalType');
wb.definedNames.add(`'Price-to-Win'!$C$6`, 'YourTechScore');
wb.definedNames.add(`'Price-to-Win'!$C$7`, 'CompTechScore');
wb.definedNames.add(`'Price-to-Win'!$C$8`, 'TargetPWin');
wb.definedNames.add(`'Price-to-Win'!$C$9`, 'MinFee');
wb.definedNames.add(`'Price-to-Win'!$C$10`, 'ConsDiscount');
wb.definedNames.add(`'Price-to-Win'!$C$11`, 'AggrPremium');

// Scenario table
const SCEN_HEADER_ROW = 14;
w5.mergeCells(`B${SCEN_HEADER_ROW - 1}:F${SCEN_HEADER_ROW - 1}`);
w5.getCell(`B${SCEN_HEADER_ROW - 1}`).value = 'THREE-SCENARIO PRICE MODEL';
w5.getCell(`B${SCEN_HEADER_ROW - 1}`).style = sectionStyle;

['Scenario', 'Conservative', 'Base', 'Aggressive', 'Notes'].forEach((h, i) => {
  const c = w5.getCell(SCEN_HEADER_ROW, i + 2);
  c.value = h;
  c.style = headerStyle;
});
w5.getRow(SCEN_HEADER_ROW).height = 24;

const scenarioRows = [
  {
    label: 'Total Price',
    cons: '=YourProposedPrice*(1-ConsDiscount)',
    base: '=YourProposedPrice',
    aggr: '=YourProposedPrice*(1+AggrPremium)',
    note: 'Built from Cost Buildup proposed price',
    fmt: '"$"#,##0',
  },
  {
    label: 'vs Competitor Median',
    cons: '=IF(CompMedian=0,"",(C15-CompMedian)/CompMedian)',
    base: '=IF(CompMedian=0,"",(D15-CompMedian)/CompMedian)',
    aggr: '=IF(CompMedian=0,"",(E15-CompMedian)/CompMedian)',
    note: 'Negative = below median (better on LPTA)',
    fmt: '0.0%',
  },
  {
    label: 'vs Competitor Min (lowest)',
    cons: '=IF(CompMin=0,"",(C15-CompMin)/CompMin)',
    base: '=IF(CompMin=0,"",(D15-CompMin)/CompMin)',
    aggr: '=IF(CompMin=0,"",(E15-CompMin)/CompMin)',
    note: 'Positive = above the lowest bidder',
    fmt: '0.0%',
  },
  {
    label: 'Effective Margin %',
    cons: '=IF(C15=0,0,(C15-YourTotalCost)/C15)',
    base: '=IF(D15=0,0,(D15-YourTotalCost)/D15)',
    aggr: '=IF(E15=0,0,(E15-YourTotalCost)/E15)',
    note: 'Walk-away floor: see MinFee input above',
    fmt: '0.0%',
  },
  {
    label: 'Dollar Profit (PoP)',
    cons: '=C15-YourTotalCost',
    base: '=D15-YourTotalCost',
    aggr: '=E15-YourTotalCost',
    note: 'Absolute fee dollars at this price',
    fmt: '"$"#,##0',
  },
  {
    label: 'Est. PWin (Best Value adj)',
    cons: '=MIN(0.95,MAX(0.05,TargetPWin+0.15+IF(EvalType="Best Value",(YourTechScore-CompTechScore)/200,0)))',
    base: '=MIN(0.95,MAX(0.05,TargetPWin+IF(EvalType="Best Value",(YourTechScore-CompTechScore)/200,0)))',
    aggr: '=MIN(0.95,MAX(0.05,TargetPWin-0.12+IF(EvalType="Best Value",(YourTechScore-CompTechScore)/100,0)))',
    note: 'Bounded 5-95%. Best Value lifts you when tech > competition',
    fmt: '0.0%',
  },
  {
    label: 'Expected Value (Profit × PWin)',
    cons: '=(C15-YourTotalCost)*C20',
    base: '=(D15-YourTotalCost)*D20',
    aggr: '=(E15-YourTotalCost)*E20',
    note: 'The scenario with the highest expected value wins. Usually.',
    fmt: '"$"#,##0',
  },
];

scenarioRows.forEach((s, i) => {
  const rn = SCEN_HEADER_ROW + 1 + i;
  w5.getCell(rn, 2).value = s.label;
  w5.getCell(rn, 2).style = labelStyle;
  ['cons', 'base', 'aggr'].forEach((k, ci) => {
    const cell = w5.getCell(rn, 3 + ci);
    cell.value = { formula: s[k].slice(1) };
    cell.style = { ...calcBoldStyle, numFmt: s.fmt };
  });
  w5.getCell(rn, 6).value = s.note;
  w5.getCell(rn, 6).style = { font: { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }, alignment: { vertical: 'middle', wrapText: true } };
  w5.getRow(rn).height = 22;
});

// Highlight rows: row 15 prices, row 18 margin (red if < MinFee), row 21 EV (green on max)
const PRICE_ROW = SCEN_HEADER_ROW + 1; // 15
const MARGIN_ROW = SCEN_HEADER_ROW + 4; // 18
const EV_ROW = SCEN_HEADER_ROW + 7; // 21

w5.addConditionalFormatting({
  ref: `C${MARGIN_ROW}:E${MARGIN_ROW}`,
  rules: [
    { type: 'cellIs', operator: 'lessThan', formulae: ['MinFee'], priority: 1,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } }, font: { color: { argb: 'FF991B1B' }, bold: true } } },
    { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: ['MinFee'], priority: 2,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_OK } }, font: { color: { argb: 'FF065F46' }, bold: true } } },
  ],
});

// Highlight max EV scenario
w5.addConditionalFormatting({
  ref: `C${EV_ROW}:E${EV_ROW}`,
  rules: [
    { type: 'expression', formulae: [`C${EV_ROW}=MAX($C$${EV_ROW}:$E$${EV_ROW})`], priority: 1,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_OK } }, font: { color: { argb: 'FF065F46' }, bold: true } } },
  ],
});

// Recommendation block
const RECO_ROW = EV_ROW + 3;
w5.mergeCells(`B${RECO_ROW - 1}:F${RECO_ROW - 1}`);
w5.getCell(`B${RECO_ROW - 1}`).value = 'RECOMMENDATION';
w5.getCell(`B${RECO_ROW - 1}`).style = sectionStyle;

w5.getCell(`B${RECO_ROW}`).value = 'Recommended Scenario';
w5.getCell(`B${RECO_ROW}`).style = labelStyle;
w5.getCell(`C${RECO_ROW}`).value = {
  formula: `IF(C${EV_ROW}=MAX(C${EV_ROW}:E${EV_ROW}),"Conservative",IF(D${EV_ROW}=MAX(C${EV_ROW}:E${EV_ROW}),"Base","Aggressive"))`,
};
w5.mergeCells(RECO_ROW, 3, RECO_ROW, 5);
w5.getCell(`C${RECO_ROW}`).style = {
  font: { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } },
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: inputStyle.border,
};
w5.getRow(RECO_ROW).height = 28;

w5.getCell(`B${RECO_ROW + 1}`).value = 'Recommended Price';
w5.getCell(`B${RECO_ROW + 1}`).style = labelStyle;
w5.getCell(`C${RECO_ROW + 1}`).value = {
  formula: `IF(C${RECO_ROW}="Conservative",C${PRICE_ROW},IF(C${RECO_ROW}="Base",D${PRICE_ROW},E${PRICE_ROW}))`,
};
w5.mergeCells(RECO_ROW + 1, 3, RECO_ROW + 1, 5);
w5.getCell(`C${RECO_ROW + 1}`).style = {
  font: { name: 'Calibri', size: 14, bold: true, color: { argb: EMERALD_DARK } },
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: inputStyle.border,
  numFmt: '"$"#,##0',
};
w5.getRow(RECO_ROW + 1).height = 28;

// Risk flags
w5.mergeCells(`B${RECO_ROW + 3}:F${RECO_ROW + 3}`);
w5.getCell(`B${RECO_ROW + 3}`).value = 'RISK FLAGS';
w5.getCell(`B${RECO_ROW + 3}`).style = sectionStyle;

const flags = [
  ['Wrap Rate above 2.5 (cost-uncompetitive)', `=IF(WrapRate>2.5,"FLAG — your wrap exceeds 2.50. Cut overhead before bidding.","OK")`],
  ['Effective Margin below MinFee on Base', `=IF(D${MARGIN_ROW}<MinFee,"FLAG — base scenario violates your walk-away margin.","OK")`],
  ['Your Base Price more than 20% above Competitor Min', `=IF(CompMin=0,"No competitor data yet",IF((D${PRICE_ROW}-CompMin)/CompMin>0.2,"FLAG — you're 20%+ above lowest bidder. LPTA loss likely.","OK"))`],
  ['No competitors entered', `=IF(COUNTA('Competitor Analysis'!A${CMP_START}:A${CMP_END})=0,"FLAG — fill out Competitor Analysis tab.","OK")`],
  ['Bench variance >20% on any labor row', `=IF(COUNTIF('Cost Buildup'!O${DL_START}:O${DL_END},">0.2")+COUNTIF('Cost Buildup'!O${DL_START}:O${DL_END},"<-0.2")>0,"FLAG — at least one labor category is outside the bench band.","OK")`],
];
flags.forEach((f, i) => {
  const rn = RECO_ROW + 4 + i;
  w5.getCell(rn, 2).value = f[0];
  w5.mergeCells(rn, 2, rn, 3);
  w5.getCell(rn, 2).style = labelStyle;
  w5.getCell(rn, 4).value = { formula: f[1].slice(1) };
  w5.mergeCells(rn, 4, rn, 6);
  w5.getCell(rn, 4).style = { font: { name: 'Calibri', size: 10, color: { argb: SLATE } }, alignment: { vertical: 'middle', horizontal: 'left', indent: 1 }, border: inputStyle.border };
  w5.getRow(rn).height = 22;

  // Conditional formatting on flag value
  w5.addConditionalFormatting({
    ref: `D${rn}:F${rn}`,
    rules: [
      { type: 'containsText', operator: 'containsText', text: 'FLAG', priority: 1,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } }, font: { color: { argb: 'FF991B1B' }, bold: true } } },
      { type: 'containsText', operator: 'containsText', text: 'OK', priority: 2,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_OK } }, font: { color: { argb: 'FF065F46' } } } },
    ],
  });
});

// Footer note
const noteRow = RECO_ROW + 4 + flags.length + 2;
w5.mergeCells(`B${noteRow}:F${noteRow}`);
w5.getCell(`B${noteRow}`).value = "Final check before submission: walk this page with your capture lead. The model is a starting point, not a final answer. If the recommendation feels wrong, the inputs are usually the problem — challenge them.";
w5.getCell(`B${noteRow}`).style = { font: { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }, alignment: { vertical: 'middle', wrapText: true } };
w5.getRow(noteRow).height = 40;

// =========================================================================
// Save
// =========================================================================
await wb.xlsx.writeFile(OUT);
console.log('Wrote', OUT);
