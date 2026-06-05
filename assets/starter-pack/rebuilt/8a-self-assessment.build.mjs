// Build: FLK_05_8a_Certification_Self_Assessment.xlsx
// SBA 8(a) Business Development program self-assessment workbook.
// Real formulas, dropdown validations, conditional formatting, named ranges.
// Works in Microsoft Excel and Google Sheets.

import ExcelJS from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js';

const OUT = '/Users/andreschuler/Caturepilot 2.0/assets/starter-pack/rebuilt/FLK_05_8a_Certification_Self_Assessment.xlsx';

const BRAND = {
  emerald: 'FF10B981',
  emeraldDark: 'FF047857',
  slate: 'FF1E293B',
  slateMid: 'FF475569',
  slateLight: 'FFF1F5F9',
  paper: 'FFFAFAFA',
  amber: 'FFF59E0B',
  red: 'FFEF4444',
  green: 'FF16A34A',
  gray: 'FF94A3B8',
  white: 'FFFFFFFF',
  bandBlue: 'FFE0F2FE',
};

function setBorder(cell, color = 'FFE2E8F0') {
  cell.border = {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  };
}

function fill(cell, argb) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

async function build() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CapturePilot';
  wb.company = 'CapturePilot';
  wb.created = new Date();
  wb.modified = new Date();
  wb.title = '8(a) Certification Self-Assessment';
  wb.subject = 'SBA 8(a) BD Program eligibility quick-check';

  // ===================================================================
  // SHEET 1: Inputs (Business info + 25-item checklist)
  // ===================================================================
  const wsInputs = wb.addWorksheet('Inputs', {
    views: [{ state: 'frozen', ySplit: 10, showGridLines: false }],
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
      printTitlesRow: '1:10',
    },
    headerFooter: {
      oddHeader: '&L&B&14CapturePilot&R&8Federal Lead Kit — 8(a) Self-Assessment',
      oddFooter: '&Lcapturepilot.com&Cpage &P of &N&R&D',
    },
  });

  // Column widths
  wsInputs.columns = [
    { width: 4 },   // A: row number
    { width: 56 },  // B: requirement
    { width: 14 },  // C: Met? (Y/N/?)
    { width: 12 },  // D: Risk
    { width: 36 },  // E: Notes / evidence
  ];

  // Title row
  wsInputs.getRow(1).height = 36;
  wsInputs.mergeCells('A1:E1');
  const t1 = wsInputs.getCell('A1');
  t1.value = '8(a) BD PROGRAM — CERTIFICATION SELF-ASSESSMENT';
  t1.font = { name: 'Calibri', size: 16, bold: true, color: { argb: BRAND.white } };
  t1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fill(t1, BRAND.emeraldDark);

  // Subtitle row
  wsInputs.getRow(2).height = 18;
  wsInputs.mergeCells('A2:E2');
  const t2 = wsInputs.getCell('A2');
  t2.value = 'CapturePilot · SBA Section 8(a) eligibility quick-check. Not a substitute for legal review or formal SBA decision.';
  t2.font = { name: 'Calibri', size: 10, italic: true, color: { argb: BRAND.slateMid } };
  t2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fill(t2, BRAND.slateLight);

  // Business info block (rows 4-8)
  const infoLabels = [
    ['Business Name', 'BusinessName'],
    ['Owner Name(s)', 'OwnerNames'],
    ['Primary NAICS Code', 'PrimaryNAICS'],
    ['Business Start Date', 'BusinessStart'],
    ['Evaluation Date', 'EvalDate'],
  ];
  let infoRow = 4;
  infoLabels.forEach(([label, defName]) => {
    wsInputs.getRow(infoRow).height = 20;
    const lc = wsInputs.getCell(`B${infoRow}`);
    lc.value = label;
    lc.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.slate } };
    lc.alignment = { vertical: 'middle', horizontal: 'right' };
    fill(lc, BRAND.paper);
    setBorder(lc);

    wsInputs.mergeCells(`C${infoRow}:E${infoRow}`);
    const vc = wsInputs.getCell(`C${infoRow}`);
    vc.value = '';
    vc.font = { name: 'Calibri', size: 11, color: { argb: BRAND.slate } };
    vc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    fill(vc, BRAND.white);
    setBorder(vc);
    wb.definedNames.add(`Inputs!$C$${infoRow}`, defName);
    infoRow++;
  });

  // Spacer
  wsInputs.getRow(9).height = 8;

  // Checklist header (row 10)
  wsInputs.getRow(10).height = 26;
  const headers10 = [
    { col: 'A', val: '#' },
    { col: 'B', val: 'ELIGIBILITY REQUIREMENT' },
    { col: 'C', val: 'MET? (Y/N/?)' },
    { col: 'D', val: 'RISK' },
    { col: 'E', val: 'NOTES / EVIDENCE' },
  ];
  headers10.forEach(({ col, val }) => {
    const c = wsInputs.getCell(`${col}10`);
    c.value = val;
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.white } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    fill(c, BRAND.slate);
    setBorder(c, BRAND.slate);
  });

  // Section bands + 25 items
  // Tuple: [type, text, risk]  where type = 'section' | 'item'
  const checklist = [
    ['section', 'SMALL BUSINESS STATUS'],
    ['item', 'Business qualifies as small under SBA size standards for its primary NAICS code', 'HIGH'],
    ['item', 'Business is at least 51% unconditionally owned by socially + economically disadvantaged individual(s)', 'HIGH'],
    ['item', 'Business is NOT publicly traded (publicly traded companies are ineligible)', 'HIGH'],
    ['item', 'Combined personal net worth of all disadvantaged owners is under $850,000 (excluding equity in primary residence and 8(a) firm)', 'HIGH'],
    ['item', 'Adjusted gross income averaged under $400,000 over the last 3 years', 'HIGH'],
    ['section', 'OWNER ELIGIBILITY — SOCIAL DISADVANTAGE'],
    ['item', 'Owner is a member of a presumed disadvantaged group (Black, Hispanic, Asian Pacific, Subcontinent Asian, or Native American)', 'HIGH'],
    ['item', 'OR owner can demonstrate social disadvantage by a preponderance of evidence (documented chronic racial or ethnic prejudice)', 'HIGH'],
    ['item', 'Owner is a U.S. citizen', 'HIGH'],
    ['section', 'OWNER ELIGIBILITY — ECONOMIC DISADVANTAGE'],
    ['item', 'Total assets of all disadvantaged owners combined are under $6,500,000', 'HIGH'],
    ['item', 'Personal net worth of each disadvantaged owner is under $850,000 at time of application', 'HIGH'],
    ['item', 'Owner has not accumulated wealth inconsistent with a claim of economic disadvantage', 'MEDIUM'],
    ['section', 'MANAGEMENT & DAILY OPERATIONS'],
    ['item', 'A socially and economically disadvantaged owner controls management and daily operations', 'HIGH'],
    ['item', 'Owner holds the highest officer position (President, CEO, or Managing Member)', 'HIGH'],
    ['item', 'No non-disadvantaged individuals hold blocking shares or board seats that can override owner decisions', 'HIGH'],
    ['item', 'Disadvantaged owner is actively involved in the business (not a passive investor)', 'HIGH'],
    ['section', 'BUSINESS POTENTIAL'],
    ['item', 'Business has been in operation for at least 2 years (or owner can show 2+ years of management experience)', 'MEDIUM'],
    ['item', 'Business shows reasonable prospects for success (revenue, contracts, or pipeline)', 'MEDIUM'],
    ['item', 'Business is NOT currently debarred, suspended, or proposed for debarment', 'HIGH'],
    ['item', 'Business has no outstanding federal tax liens or unresolved SBA loan defaults', 'MEDIUM'],
    ['section', '8(a) PROGRAM TERM LIMITS'],
    ['item', 'Business has NOT previously participated in the 8(a) program (one-time, 9-year term)', 'HIGH'],
    ['item', 'Business revenues have NOT exceeded the 8(a) graduation threshold for 4 consecutive years (~$27.5M services)', 'MEDIUM'],
    ['section', 'ADMINISTRATIVE REQUIREMENTS'],
    ['item', 'Business is registered and active on SAM.gov', 'HIGH'],
    ['item', 'All required tax returns have been filed for the last 3 years', 'HIGH'],
    ['item', 'Business bank accounts are in the company name only', 'MEDIUM'],
    ['item', 'No felony convictions or pending criminal matters involving the owner', 'HIGH'],
  ];

  let rowIdx = 11;
  let itemNum = 0;
  const itemRows = []; // track every row that holds an item (for COUNTIFs)

  checklist.forEach((entry) => {
    if (entry[0] === 'section') {
      wsInputs.getRow(rowIdx).height = 22;
      wsInputs.mergeCells(`A${rowIdx}:E${rowIdx}`);
      const c = wsInputs.getCell(`A${rowIdx}`);
      c.value = entry[1];
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.emeraldDark } };
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      fill(c, BRAND.bandBlue);
      setBorder(c, BRAND.gray);
      rowIdx++;
      return;
    }

    itemNum++;
    wsInputs.getRow(rowIdx).height = 28;
    const stripe = itemNum % 2 === 0 ? BRAND.paper : BRAND.white;

    // # column
    const a = wsInputs.getCell(`A${rowIdx}`);
    a.value = itemNum;
    a.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.slateMid } };
    a.alignment = { vertical: 'middle', horizontal: 'center' };
    fill(a, stripe);
    setBorder(a);

    // Requirement text
    const b = wsInputs.getCell(`B${rowIdx}`);
    b.value = entry[1];
    b.font = { name: 'Calibri', size: 10, color: { argb: BRAND.slate } };
    b.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    fill(b, stripe);
    setBorder(b);

    // Met? dropdown
    const c = wsInputs.getCell(`C${rowIdx}`);
    c.value = '';
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.slate } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    fill(c, BRAND.white);
    setBorder(c);
    c.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Y,N,?"'],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Pick one',
      error: 'Choose Y (yes / met), N (no / not met), or ? (unknown).',
    };

    // Risk
    const d = wsInputs.getCell(`D${rowIdx}`);
    d.value = entry[2];
    const riskColor = entry[2] === 'HIGH' ? BRAND.red : entry[2] === 'MEDIUM' ? BRAND.amber : BRAND.gray;
    d.font = { name: 'Calibri', size: 9, bold: true, color: { argb: BRAND.white } };
    d.alignment = { vertical: 'middle', horizontal: 'center' };
    fill(d, riskColor);
    setBorder(d);

    // Notes
    const e = wsInputs.getCell(`E${rowIdx}`);
    e.value = '';
    e.font = { name: 'Calibri', size: 10, color: { argb: BRAND.slate } };
    e.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    fill(e, BRAND.white);
    setBorder(e);

    itemRows.push(rowIdx);
    rowIdx++;
  });

  const firstItemRow = itemRows[0];
  const lastItemRow = itemRows[itemRows.length - 1];

  // Define a named range for the C column over items
  wb.definedNames.add(`Inputs!$C$${firstItemRow}:$C$${lastItemRow}`, 'MetResponses');
  wb.definedNames.add(`Inputs!$D$${firstItemRow}:$D$${lastItemRow}`, 'RiskLevels');

  // Conditional formatting on the Met? column — green Y / red N / amber ?
  wsInputs.addConditionalFormatting({
    ref: `C${firstItemRow}:C${lastItemRow}`,
    rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"Y"'],
        priority: 1,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } },
          font: { color: { argb: 'FF15803D' }, bold: true },
        },
      },
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"N"'],
        priority: 2,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } },
          font: { color: { argb: 'FFB91C1C' }, bold: true },
        },
      },
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"?"'],
        priority: 3,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
          font: { color: { argb: 'FF92400E' }, bold: true },
        },
      },
    ],
  });

  // Spacer + footer disclaimer on inputs
  rowIdx += 1;
  wsInputs.getRow(rowIdx).height = 8;
  rowIdx += 1;
  wsInputs.getRow(rowIdx).height = 50;
  wsInputs.mergeCells(`A${rowIdx}:E${rowIdx}`);
  const disc = wsInputs.getCell(`A${rowIdx}`);
  disc.value =
    'Disclaimer: this checklist is for informational purposes. SBA 8(a) eligibility requires a formal application and review by the SBA District Office. Thresholds change. Verify current limits at sba.gov before applying, and consult a GovCon attorney or SBA Business Opportunity Specialist (BOS) before you submit. The current personal net worth limit is $850,000; total assets cap is $6.5M; 3-year average adjusted gross income limit is $400,000 (all excluding primary residence equity and 8(a) firm value).';
  disc.font = { name: 'Calibri', size: 9, italic: true, color: { argb: BRAND.slateMid } };
  disc.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
  fill(disc, BRAND.slateLight);
  setBorder(disc, BRAND.gray);

  // ===================================================================
  // SHEET 2: Calc (per-item scoring + risk-weighted math)
  // ===================================================================
  const wsCalc = wb.addWorksheet('Calc', {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddHeader: '&L&BCalc — 8(a) Self-Assessment',
      oddFooter: '&Lcapturepilot.com&Rpage &P of &N',
    },
  });

  wsCalc.columns = [
    { width: 4 },   // A: #
    { width: 50 },  // B: requirement (link)
    { width: 12 },  // C: Met?
    { width: 12 },  // D: Risk
    { width: 14 },  // E: Weight
    { width: 14 },  // F: Score
    { width: 14 },  // G: Status
  ];

  // Title
  wsCalc.getRow(1).height = 28;
  wsCalc.mergeCells('A1:G1');
  const ct1 = wsCalc.getCell('A1');
  ct1.value = 'CALCULATION SHEET — Per-item scoring (do not edit)';
  ct1.font = { name: 'Calibri', size: 13, bold: true, color: { argb: BRAND.white } };
  ct1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fill(ct1, BRAND.slate);

  // Header
  wsCalc.getRow(2).height = 22;
  const calcHeaders = ['#', 'Requirement', 'Met?', 'Risk', 'Weight', 'Score', 'Status'];
  calcHeaders.forEach((h, i) => {
    const c = wsCalc.getCell(2, i + 1);
    c.value = h;
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.white } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    fill(c, BRAND.slateMid);
    setBorder(c, BRAND.slateMid);
  });

  // Per-item rows mirror Inputs by formula
  let calcRow = 3;
  itemRows.forEach((srcRow, idx) => {
    wsCalc.getRow(calcRow).height = 18;
    const num = idx + 1;
    const cells = [
      { col: 1, val: num, align: 'center', bold: true, color: BRAND.slateMid },
      { col: 2, val: { formula: `Inputs!B${srcRow}` }, align: 'left' },
      { col: 3, val: { formula: `Inputs!C${srcRow}` }, align: 'center', bold: true },
      { col: 4, val: { formula: `Inputs!D${srcRow}` }, align: 'center' },
      // Weight: HIGH = 3, MEDIUM = 2, LOW = 1
      { col: 5, val: { formula: `IF(D${calcRow}="HIGH",3,IF(D${calcRow}="MEDIUM",2,1))` }, align: 'center' },
      // Score: Y = weight, ? = weight/2, N or blank = 0
      { col: 6, val: { formula: `IF(C${calcRow}="Y",E${calcRow},IF(C${calcRow}="?",E${calcRow}/2,0))` }, align: 'center' },
      // Status: Pass / Risk / Fail / Open
      { col: 7, val: { formula: `IF(C${calcRow}="Y","Pass",IF(C${calcRow}="N",IF(D${calcRow}="HIGH","Fail","Risk"),IF(C${calcRow}="?","Open","—")))` }, align: 'center' },
    ];
    const stripe = num % 2 === 0 ? BRAND.paper : BRAND.white;
    cells.forEach(({ col, val, align, bold, color }) => {
      const c = wsCalc.getCell(calcRow, col);
      c.value = val;
      c.font = { name: 'Calibri', size: 10, bold: bold || false, color: { argb: color || BRAND.slate } };
      c.alignment = { vertical: 'middle', horizontal: align, wrapText: col === 2 };
      fill(c, stripe);
      setBorder(c);
    });
    calcRow++;
  });

  const calcFirst = 3;
  const calcLast = calcRow - 1;

  // Totals row
  const totalsRow = calcRow + 1;
  wsCalc.getRow(totalsRow).height = 24;
  const t = wsCalc.getCell(totalsRow, 1);
  wsCalc.mergeCells(`A${totalsRow}:D${totalsRow}`);
  t.value = 'TOTALS';
  t.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.white } };
  t.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
  fill(t, BRAND.emeraldDark);

  const totWeight = wsCalc.getCell(`E${totalsRow}`);
  totWeight.value = { formula: `SUM(E${calcFirst}:E${calcLast})` };
  totWeight.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.white } };
  totWeight.alignment = { vertical: 'middle', horizontal: 'center' };
  fill(totWeight, BRAND.emeraldDark);

  const totScore = wsCalc.getCell(`F${totalsRow}`);
  totScore.value = { formula: `SUM(F${calcFirst}:F${calcLast})` };
  totScore.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.white } };
  totScore.alignment = { vertical: 'middle', horizontal: 'center' };
  fill(totScore, BRAND.emeraldDark);

  const pctCell = wsCalc.getCell(`G${totalsRow}`);
  pctCell.value = { formula: `IF(E${totalsRow}=0,0,F${totalsRow}/E${totalsRow})` };
  pctCell.numFmt = '0.0%';
  pctCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.white } };
  pctCell.alignment = { vertical: 'middle', horizontal: 'center' };
  fill(pctCell, BRAND.emeraldDark);

  // Named ranges for summary tab
  wb.definedNames.add(`Calc!$E$${totalsRow}`, 'TotalWeight');
  wb.definedNames.add(`Calc!$F$${totalsRow}`, 'TotalScore');
  wb.definedNames.add(`Calc!$G$${totalsRow}`, 'ReadinessPct');

  // ===================================================================
  // SHEET 3: Summary (the answer the user wants)
  // ===================================================================
  const wsSum = wb.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddHeader: '&L&B&14CapturePilot — 8(a) Readiness Summary&R&8&D',
      oddFooter: '&Lcapturepilot.com&Cpage &P of &N',
    },
  });

  wsSum.columns = [
    { width: 4 },   // A
    { width: 38 },  // B
    { width: 22 },  // C
    { width: 22 },  // D
    { width: 14 },  // E
  ];

  // Title
  wsSum.getRow(1).height = 38;
  wsSum.mergeCells('A1:E1');
  const sTitle = wsSum.getCell('A1');
  sTitle.value = '8(a) BD PROGRAM — READINESS SUMMARY';
  sTitle.font = { name: 'Calibri', size: 16, bold: true, color: { argb: BRAND.white } };
  sTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fill(sTitle, BRAND.emeraldDark);

  // Business identity strip
  wsSum.getRow(2).height = 8;
  wsSum.getRow(3).height = 22;
  wsSum.mergeCells('B3:C3');
  const idLbl = wsSum.getCell('B3');
  idLbl.value = 'Business';
  idLbl.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.slateMid } };
  idLbl.alignment = { vertical: 'middle', horizontal: 'left' };

  wsSum.mergeCells('D3:E3');
  const idVal = wsSum.getCell('D3');
  idVal.value = { formula: 'IF(BusinessName="","(not set)",BusinessName)' };
  idVal.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.slate } };
  idVal.alignment = { vertical: 'middle', horizontal: 'left' };

  wsSum.getRow(4).height = 22;
  wsSum.mergeCells('B4:C4');
  const ownLbl = wsSum.getCell('B4');
  ownLbl.value = 'Owner(s)';
  ownLbl.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.slateMid } };
  ownLbl.alignment = { vertical: 'middle', horizontal: 'left' };

  wsSum.mergeCells('D4:E4');
  const ownVal = wsSum.getCell('D4');
  ownVal.value = { formula: 'IF(OwnerNames="","(not set)",OwnerNames)' };
  ownVal.font = { name: 'Calibri', size: 11, color: { argb: BRAND.slate } };
  ownVal.alignment = { vertical: 'middle', horizontal: 'left' };

  wsSum.getRow(5).height = 22;
  wsSum.mergeCells('B5:C5');
  const dtLbl = wsSum.getCell('B5');
  dtLbl.value = 'Evaluated';
  dtLbl.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.slateMid } };
  dtLbl.alignment = { vertical: 'middle', horizontal: 'left' };

  wsSum.mergeCells('D5:E5');
  const dtVal = wsSum.getCell('D5');
  dtVal.value = { formula: 'IF(EvalDate="","(not set)",EvalDate)' };
  dtVal.font = { name: 'Calibri', size: 11, color: { argb: BRAND.slate } };
  dtVal.alignment = { vertical: 'middle', horizontal: 'left' };

  // Counters block
  wsSum.getRow(7).height = 22;
  wsSum.mergeCells('B7:E7');
  const ct = wsSum.getCell('B7');
  ct.value = 'COUNTS';
  ct.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.emeraldDark } };
  ct.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fill(ct, BRAND.bandBlue);
  setBorder(ct, BRAND.gray);

  // Build counter rows
  const counters = [
    ['Requirements met (Y)', `COUNTIF(MetResponses,"Y")`],
    ['Requirements not met (N)', `COUNTIF(MetResponses,"N")`],
    ['Open / unknown (?)', `COUNTIF(MetResponses,"?")`],
    ['Unanswered (blank)', `COUNTBLANK(MetResponses)`],
    ['High-risk fails (N + HIGH)', `SUMPRODUCT((MetResponses="N")*(RiskLevels="HIGH"))`],
    ['Medium-risk fails (N + MEDIUM)', `SUMPRODUCT((MetResponses="N")*(RiskLevels="MEDIUM"))`],
    ['Total items', `COUNTA(RiskLevels)`],
  ];

  let sumRow = 8;
  counters.forEach(([label, formula], i) => {
    wsSum.getRow(sumRow).height = 22;
    const stripe = i % 2 === 0 ? BRAND.white : BRAND.paper;
    wsSum.mergeCells(`B${sumRow}:D${sumRow}`);
    const lc = wsSum.getCell(`B${sumRow}`);
    lc.value = label;
    lc.font = { name: 'Calibri', size: 10, color: { argb: BRAND.slate } };
    lc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    fill(lc, stripe);
    setBorder(lc);

    const vc = wsSum.getCell(`E${sumRow}`);
    vc.value = { formula };
    vc.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.slate } };
    vc.alignment = { vertical: 'middle', horizontal: 'center' };
    fill(vc, stripe);
    setBorder(vc);
    sumRow++;
  });

  // Readiness % gauge
  sumRow += 1;
  wsSum.getRow(sumRow).height = 22;
  wsSum.mergeCells(`B${sumRow}:E${sumRow}`);
  const gh = wsSum.getCell(`B${sumRow}`);
  gh.value = 'WEIGHTED READINESS SCORE';
  gh.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.emeraldDark } };
  gh.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fill(gh, BRAND.bandBlue);
  setBorder(gh, BRAND.gray);
  sumRow++;

  wsSum.getRow(sumRow).height = 40;
  wsSum.mergeCells(`B${sumRow}:D${sumRow}`);
  const rlbl = wsSum.getCell(`B${sumRow}`);
  rlbl.value = 'Readiness (weighted: HIGH=3 / MEDIUM=2 / LOW=1; Y=full, ?=half, N=0)';
  rlbl.font = { name: 'Calibri', size: 10, color: { argb: BRAND.slateMid }, italic: true };
  rlbl.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
  fill(rlbl, BRAND.white);
  setBorder(rlbl);

  const rpct = wsSum.getCell(`E${sumRow}`);
  rpct.value = { formula: 'ReadinessPct' };
  rpct.numFmt = '0.0%';
  rpct.font = { name: 'Calibri', size: 18, bold: true, color: { argb: BRAND.slate } };
  rpct.alignment = { vertical: 'middle', horizontal: 'center' };
  fill(rpct, BRAND.white);
  setBorder(rpct);

  const readinessRow = sumRow;

  // Conditional formatting on readiness %
  wsSum.addConditionalFormatting({
    ref: `E${readinessRow}`,
    rules: [
      {
        type: 'cellIs',
        operator: 'greaterThanOrEqual',
        formulae: ['0.85'],
        priority: 1,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } },
          font: { color: { argb: 'FF166534' }, bold: true, size: 18 },
        },
      },
      {
        type: 'cellIs',
        operator: 'between',
        formulae: ['0.6', '0.8499'],
        priority: 2,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
          font: { color: { argb: 'FF92400E' }, bold: true, size: 18 },
        },
      },
      {
        type: 'cellIs',
        operator: 'lessThan',
        formulae: ['0.6'],
        priority: 3,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } },
          font: { color: { argb: 'FFB91C1C' }, bold: true, size: 18 },
        },
      },
    ],
  });

  // Verdict
  sumRow += 2;
  wsSum.getRow(sumRow).height = 22;
  wsSum.mergeCells(`B${sumRow}:E${sumRow}`);
  const vh = wsSum.getCell(`B${sumRow}`);
  vh.value = 'PRELIMINARY VERDICT';
  vh.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.emeraldDark } };
  vh.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fill(vh, BRAND.bandBlue);
  setBorder(vh, BRAND.gray);
  sumRow++;

  wsSum.getRow(sumRow).height = 58;
  wsSum.mergeCells(`B${sumRow}:E${sumRow}`);
  const vc = wsSum.getCell(`B${sumRow}`);
  // Build the verdict logic:
  //  - Any high-risk N → INELIGIBLE
  //  - More than 2 unknowns (?) → UNCERTAIN
  //  - Readiness < 60% → NOT READY
  //  - Readiness 60-84% → POSSIBLE, address gaps
  //  - Readiness >= 85% → LIKELY ELIGIBLE
  vc.value = {
    formula:
      'IF(SUMPRODUCT((MetResponses="N")*(RiskLevels="HIGH"))>0,' +
      '"INELIGIBLE: one or more high-risk requirements failed. Fix the N + HIGH items on the Inputs tab before applying.",' +
      'IF(COUNTBLANK(MetResponses)+COUNTIF(MetResponses,"?")>5,' +
      '"INCOMPLETE: too many open or unanswered items. Resolve the ? entries first.",' +
      'IF(ReadinessPct>=0.85,' +
      '"LIKELY ELIGIBLE: schedule a free pre-application meeting with your SBA District Office and a GovCon attorney before submitting through certify.sba.gov.",' +
      'IF(ReadinessPct>=0.6,' +
      '"POSSIBLE: you have most pieces in place. Close the N and ? items on the Inputs tab before you start the formal application.",' +
      '"NOT READY: significant gaps. Focus first on small-business status, owner control, and the $850K net worth test."))))',
  };
  vc.font = { name: 'Calibri', size: 12, bold: true, color: { argb: BRAND.slate } };
  vc.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
  fill(vc, BRAND.white);
  setBorder(vc);

  const verdictRow = sumRow;
  wsSum.addConditionalFormatting({
    ref: `B${verdictRow}:E${verdictRow}`,
    rules: [
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'INELIGIBLE',
        priority: 1,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } },
          font: { color: { argb: 'FF991B1B' }, bold: true, size: 12 },
        },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'LIKELY ELIGIBLE',
        priority: 2,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } },
          font: { color: { argb: 'FF14532D' }, bold: true, size: 12 },
        },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'POSSIBLE',
        priority: 3,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
          font: { color: { argb: 'FF78350F' }, bold: true, size: 12 },
        },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'INCOMPLETE',
        priority: 4,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
          font: { color: { argb: 'FF78350F' }, bold: true, size: 12 },
        },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'NOT READY',
        priority: 5,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } },
          font: { color: { argb: 'FF991B1B' }, bold: true, size: 12 },
        },
      },
    ],
  });

  // Next actions block (driven by formulas)
  sumRow += 2;
  wsSum.getRow(sumRow).height = 22;
  wsSum.mergeCells(`B${sumRow}:E${sumRow}`);
  const nh = wsSum.getCell(`B${sumRow}`);
  nh.value = 'NEXT ACTIONS';
  nh.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.emeraldDark } };
  nh.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fill(nh, BRAND.bandBlue);
  setBorder(nh, BRAND.gray);
  sumRow++;

  const nextActions = [
    {
      label: 'High-risk gaps to close',
      formula: 'IF(SUMPRODUCT((MetResponses="N")*(RiskLevels="HIGH"))>0,"Fix every N + HIGH row on the Inputs tab. Most common: net worth above $850K, owner does not control daily operations, or business is not yet 2 years old.","No high-risk gaps. Good.")',
    },
    {
      label: 'Documentation to gather',
      formula: '"3 years of business + personal tax returns; current personal financial statement; operating agreement / bylaws; org chart with titles; SAM.gov registration confirmation; bank statements in firm name."',
    },
    {
      label: 'Submission path',
      formula: '"Create MySBA account at certify.sba.gov. Application review target is 90 days. If declined, request reconsideration within 45 days or appeal to OHA."',
    },
    {
      label: 'Free help available',
      formula: '"Book a pre-application meeting with your SBA District Office Business Opportunity Specialist (BOS). It is free and they will pre-screen your application before you submit."',
    },
  ];

  nextActions.forEach((a, i) => {
    wsSum.getRow(sumRow).height = 36;
    const stripe = i % 2 === 0 ? BRAND.white : BRAND.paper;
    const lc = wsSum.getCell(`B${sumRow}`);
    lc.value = a.label;
    lc.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.slateMid } };
    lc.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    fill(lc, stripe);
    setBorder(lc);

    wsSum.mergeCells(`C${sumRow}:E${sumRow}`);
    const vcA = wsSum.getCell(`C${sumRow}`);
    vcA.value = { formula: a.formula };
    vcA.font = { name: 'Calibri', size: 10, color: { argb: BRAND.slate } };
    vcA.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    fill(vcA, stripe);
    setBorder(vcA);
    sumRow++;
  });

  // Footer disclaimer
  sumRow += 1;
  wsSum.getRow(sumRow).height = 50;
  wsSum.mergeCells(`B${sumRow}:E${sumRow}`);
  const fd = wsSum.getCell(`B${sumRow}`);
  fd.value =
    'This summary uses your inputs only — it is not an official SBA decision. Thresholds change. Verify the personal net worth limit ($850K), total assets cap ($6.5M), and 3-year average AGI limit ($400K) at sba.gov before applying. The 8(a) program is a one-time, 9-year participation. Get a GovCon attorney or your SBA District Office to review before you submit through certify.sba.gov.';
  fd.font = { name: 'Calibri', size: 9, italic: true, color: { argb: BRAND.slateMid } };
  fd.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
  fill(fd, BRAND.slateLight);
  setBorder(fd, BRAND.gray);

  // ===================================================================
  // SHEET 4: Instructions
  // ===================================================================
  const wsIns = wb.addWorksheet('Instructions', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddHeader: '&L&BInstructions — 8(a) Self-Assessment',
      oddFooter: '&Lcapturepilot.com&Rpage &P of &N',
    },
  });

  wsIns.columns = [
    { width: 4 },
    { width: 28 },
    { width: 70 },
  ];

  // Title
  wsIns.getRow(1).height = 36;
  wsIns.mergeCells('A1:C1');
  const it = wsIns.getCell('A1');
  it.value = 'HOW TO USE THIS WORKBOOK';
  it.font = { name: 'Calibri', size: 16, bold: true, color: { argb: BRAND.white } };
  it.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fill(it, BRAND.emeraldDark);

  const insBlocks = [
    {
      head: 'WHAT THIS WORKBOOK DOES',
      body:
        'It walks you through the 25 questions the SBA reviews when deciding if your firm qualifies for the 8(a) Business Development program. Answer each row with Y, N, or ? — the Summary tab gives you a weighted readiness score and a plain-English verdict.',
    },
    {
      head: 'TABS',
      body:
        '1) Inputs — fill in your business info at the top, then mark each requirement Y / N / ? and add notes.\n2) Calc — automatic per-item scoring. Do not edit.\n3) Summary — counts, weighted readiness percentage, verdict, and next actions.\n4) Instructions — this tab.\n5) Program Reference — thresholds, presumed groups, application process.',
    },
    {
      head: 'HOW THE SCORE WORKS',
      body:
        'Each requirement carries a risk weight: HIGH = 3, MEDIUM = 2, LOW = 1. Y earns the full weight; ? earns half; N earns zero. Readiness = total earned / total possible. The verdict adds two hard gates: any N on a HIGH item flips the result to INELIGIBLE, and more than 5 blanks or ? flips it to INCOMPLETE.',
    },
    {
      head: 'THRESHOLDS YOU NEED TO HIT',
      body:
        '• Personal net worth: under $850,000 (excludes primary home equity and 8(a) firm value).\n• Total assets: under $6,500,000 combined for all disadvantaged owners.\n• Adjusted gross income: 3-year average under $400,000.\n• Ownership: at least 51% unconditionally held by socially + economically disadvantaged individual(s).\n• Operation: at least 2 years in business, or owner shows 2+ years of management experience.\n• Citizenship: owner is a U.S. citizen.\n• Track record: business is active on SAM.gov with 3 years of filed tax returns.',
    },
    {
      head: 'BEFORE YOU APPLY',
      body:
        '1) Run this checklist and fix every N on a HIGH-risk row.\n2) Pull 3 years of business and personal tax returns plus current personal financial statements.\n3) Get your operating agreement, org chart, and signature authority docs in one folder.\n4) Confirm SAM.gov is active and the primary NAICS is correct.\n5) Write the social disadvantage narrative if you are not in a presumed group.\n6) Book the free pre-application meeting with your SBA District Office BOS before you submit. They will tell you what is missing.',
    },
    {
      head: 'COMMON REJECTION REASONS',
      body:
        '• Owner does not hold the highest title (President / CEO / Managing Member).\n• Net worth crosses $850K at time of application.\n• Business is younger than 2 years and the owner cannot show qualifying management experience.\n• Non-presumed-group owner files no social disadvantage narrative.\n• Bank accounts or major assets are in the owner\'s name, not the firm\'s.\n• Tax returns and application financials disagree.',
    },
    {
      head: 'WHAT THE 9-YEAR TERM BUYS YOU',
      body:
        '• Sole-source awards up to $4.5M (services) and $7M (manufacturing) without competition.\n• Eligibility for 8(a) set-aside competitions.\n• Mentor-Protégé Program access (a graduated firm can mentor you; you can subcontract on their primes).\n• Priority on certain GWACs (8(a) STARS, OASIS SB).\n• Your SBA District Office BOS as a free coach for the full 9 years.',
    },
    {
      head: 'IF YOU FAIL THIS CHECK',
      body:
        'You are still not out of options. Look at HUBZone (use the HUBZone Eligibility Worksheet in this kit), WOSB / EDWOSB (Sched the WOSB tab), VOSB / SDVOSB (CVE guide PDF), or SDB self-certification on SAM.gov. Several of these stack with each other.',
    },
    {
      head: 'DISCLAIMER',
      body:
        'This worksheet is informational. Thresholds change. The SBA decides eligibility, not this file. Verify at sba.gov before applying and consult a GovCon attorney before you submit through certify.sba.gov.',
    },
  ];

  let insRow = 3;
  insBlocks.forEach((b) => {
    wsIns.getRow(insRow).height = 22;
    wsIns.mergeCells(`B${insRow}:C${insRow}`);
    const h = wsIns.getCell(`B${insRow}`);
    h.value = b.head;
    h.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.emeraldDark } };
    h.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    fill(h, BRAND.bandBlue);
    setBorder(h, BRAND.gray);
    insRow++;

    const lines = b.body.split('\n').length;
    const height = Math.max(40, lines * 16);
    wsIns.getRow(insRow).height = height;
    wsIns.mergeCells(`B${insRow}:C${insRow}`);
    const body = wsIns.getCell(`B${insRow}`);
    body.value = b.body;
    body.font = { name: 'Calibri', size: 10, color: { argb: BRAND.slate } };
    body.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    fill(body, BRAND.white);
    setBorder(body);
    insRow += 2;
  });

  // ===================================================================
  // SHEET 5: Program Reference (preserved from source, lightly edited)
  // ===================================================================
  const wsRef = wb.addWorksheet('Program Reference', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddHeader: '&L&BProgram Reference — SBA 8(a) BD',
      oddFooter: '&Lcapturepilot.com&Rpage &P of &N',
    },
  });

  wsRef.columns = [
    { width: 4 },
    { width: 28 },
    { width: 70 },
  ];

  wsRef.getRow(1).height = 36;
  wsRef.mergeCells('A1:C1');
  const rt = wsRef.getCell('A1');
  rt.value = 'SBA 8(a) BD PROGRAM — KEY FACTS & APPLICATION GUIDE';
  rt.font = { name: 'Calibri', size: 16, bold: true, color: { argb: BRAND.white } };
  rt.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fill(rt, BRAND.emeraldDark);

  const refBlocks = [
    {
      head: 'WHAT IS THE 8(a) PROGRAM?',
      body:
        'The SBA 8(a) Business Development program is a one-time, 9-year program that gives eligible small businesses access to sole-source and set-aside federal contracts. Years 1-4 (Developmental Stage) focus on capacity building. Years 5-9 (Transitional Stage) require an increasing share of competitive (non-sole-source) wins.',
    },
    {
      head: 'KEY THRESHOLDS (current)',
      body:
        '• Personal net worth limit: $850,000 (excludes primary residence and 8(a) firm equity)\n• Total assets limit: $6,500,000\n• Adjusted gross income limit: $400,000 average over 3 years\n• Sole-source award limit: $4.5M (services) / $7M (manufacturing)\n• Competitive threshold: contracts above the sole-source limit must be competed within 8(a)\n• Program term: 9 years total (4 developmental + 5 transitional), one-time only',
    },
    {
      head: 'PRESUMED SOCIALLY DISADVANTAGED GROUPS',
      body:
        '• Black Americans\n• Hispanic Americans\n• Asian Pacific Americans (Japanese, Chinese, Filipino, Korean, Vietnamese, Laotian, Cambodian, Taiwanese, Burmese, Thai, Malaysian, Indonesian, Singaporean)\n• Subcontinent Asian Americans (Indian, Pakistani, Bangladeshi, Sri Lankan, Nepalese, Bhutanese)\n• Native Americans (including Alaska Natives and Native Hawaiians)\n\nOwners outside these groups must submit documented evidence of chronic racial or ethnic prejudice (a social disadvantage narrative).',
    },
    {
      head: 'APPLICATION PROCESS',
      body:
        '1) Register or verify active SAM.gov registration with correct NAICS codes.\n2) Pull 3 years of tax returns (business + personal) and current financial statements.\n3) Prepare ownership and control docs: operating agreement, org chart, signature authority proof.\n4) Create MySBA account at certify.sba.gov and start the online application.\n5) Write a personal social disadvantage narrative (only required if you are not in a presumed group).\n6) Submit. SBA District Office target review is 90 days.\n7) If declined: reconsideration request within 45 days, or appeal to OHA (Office of Hearings and Appeals).',
    },
    {
      head: 'COMMON REJECTION REASONS',
      body:
        '• Owner does not control daily operations or hold the highest title.\n• Net worth crosses $850K at time of application.\n• Business younger than 2 years without qualifying management experience.\n• No social disadvantage evidence (for non-presumed groups).\n• Bank accounts or assets not clearly in the firm\'s name.\n• Tax returns and application financials disagree.',
    },
    {
      head: 'BENEFITS ONCE CERTIFIED',
      body:
        '• Sole-source awards up to $4.5M (services) without competition\n• Priority for 8(a) set-aside competitions\n• Advantages on certain GWAC vehicles (8(a) STARS III, OASIS SB)\n• Access to the SBA Mentor-Protégé Program\n• Business development support from SBA District Offices\n• Tribes, ANCs, and NHOs can award sole-source 8(a) contracts of any size',
    },
    {
      head: 'NEXT STEPS FROM CAPTUREPILOT',
      body:
        '• Use CapturePilot to find 8(a) set-aside opportunities in your NAICS codes\n• Filter Set-Aside Type = 8(a) in the Opportunities view\n• Watch SAM.gov Contracting Opportunities daily for sole-source notices\n• Contact your SBA District Office to book a free pre-application meeting\n• Reference: sba.gov/8a | certify.sba.gov | sam.gov',
    },
  ];

  let refRow = 3;
  refBlocks.forEach((b) => {
    wsRef.getRow(refRow).height = 22;
    wsRef.mergeCells(`B${refRow}:C${refRow}`);
    const h = wsRef.getCell(`B${refRow}`);
    h.value = b.head;
    h.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.emeraldDark } };
    h.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    fill(h, BRAND.bandBlue);
    setBorder(h, BRAND.gray);
    refRow++;

    const lines = b.body.split('\n').length;
    const height = Math.max(40, lines * 16);
    wsRef.getRow(refRow).height = height;
    wsRef.mergeCells(`B${refRow}:C${refRow}`);
    const body = wsRef.getCell(`B${refRow}`);
    body.value = b.body;
    body.font = { name: 'Calibri', size: 10, color: { argb: BRAND.slate } };
    body.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    fill(body, BRAND.white);
    setBorder(body);
    refRow += 2;
  });

  // Save
  await wb.xlsx.writeFile(OUT);
  console.log('Wrote', OUT);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
