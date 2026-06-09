// FLK_05_WOSB_EDWOSB_Self_Cert — XLSX rebuild
// Builds a working spreadsheet with formulas, dropdowns, conditional formatting,
// and named ranges. Designed for both Microsoft Excel and Google Sheets.
//
// Tabs:
//   1. Instructions       — how to use the workbook, what each tab does
//   2. Business Profile   — company + owner inputs (used by other tabs)
//   3. WOSB Eligibility   — 24-question self-assessment with Y/N/? dropdowns
//   4. EDWOSB Net Worth   — economic-disadvantage calculator (Net Worth, AGI 3yr, Assets)
//   5. Document Checklist — 19 documents tracked by status + location
//   6. Eligible NAICS     — quick-reference list of WOSB-eligible NAICS sectors
//   7. Summary            — single-page rollup with pass/fail signals

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ExcelJS = require('/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs');

const OUTPUT = '/Users/andreschuler/Caturepilot 2.0/assets/starter-pack/rebuilt/FLK_05_WOSB_EDWOSB_Self_Cert.xlsx';

// Brand palette
const EMERALD = 'FF10B981';
const EMERALD_DARK = 'FF065F46';
const EMERALD_TINT = 'FFD1FAE5';
const SLATE = 'FF0F172A';
const SLATE_MID = 'FF475569';
const SLATE_LIGHT = 'FFF1F5F9';
const RED = 'FFDC2626';
const RED_TINT = 'FFFEE2E2';
const AMBER = 'FFF59E0B';
const AMBER_TINT = 'FFFEF3C7';
const GREEN = 'FF16A34A';
const GREEN_TINT = 'FFDCFCE7';
const WHITE = 'FFFFFFFF';

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

// Build Lists sheet first (must be first worksheet)
const lists = buildListsSheet(wb, [
  { name: 'CitizenStatus', title: 'Citizen Status',  items: ['Yes', 'No', 'Naturalized', 'Dual citizen'] },
  { name: 'YesNoMaybe',   title: 'Y / N / ?',        items: ['Y', 'N', '?'] },
  { name: 'DocStatus',    title: 'Document Status',  items: ['Have', 'Need', 'N/A'] },
]);

wb.creator = 'CapturePilot';
wb.company = 'CapturePilot Federal Lead Kit';
wb.title = 'WOSB / EDWOSB Self-Certification Pack';
wb.subject = 'Women-Owned Small Business eligibility self-assessment';
wb.created = new Date();

// ---------- helpers ----------
function fillCell(cell, argb) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
function thinBorder(cell, argb = 'FFE5E7EB') {
  cell.border = {
    top: { style: 'thin', color: { argb } },
    left: { style: 'thin', color: { argb } },
    bottom: { style: 'thin', color: { argb } },
    right: { style: 'thin', color: { argb } },
  };
}
function setPrint(ws, opts = {}) {
  ws.pageSetup = {
    orientation: opts.orientation || 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter = {
    oddHeader: '&L&"Helvetica,Bold"&12CapturePilot &K10B981WOSB / EDWOSB Self-Cert',
    oddFooter: '&LFederal Lead Kit · 05-C&Rcapturepilot.com · Page &P of &N',
  };
}
function brandHeader(ws, title, subtitle) {
  ws.mergeCells('A1:F1');
  const t = ws.getCell('A1');
  t.value = title;
  t.font = { name: 'Helvetica', bold: true, size: 18, color: { argb: WHITE } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fillCell(t, EMERALD_DARK);
  ws.getRow(1).height = 36;

  ws.mergeCells('A2:F2');
  const s = ws.getCell('A2');
  s.value = subtitle;
  s.font = { name: 'Helvetica', italic: true, size: 10, color: { argb: SLATE_MID } };
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  fillCell(s, SLATE_LIGHT);
  ws.getRow(2).height = 22;
}

// ============================================================
// TAB 1: INSTRUCTIONS
// ============================================================
{
  const ws = wb.addWorksheet('Instructions', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 4 },
    { width: 110 },
  ];
  brandHeader(ws, 'WOSB / EDWOSB Self-Certification Pack', 'A working assessment for women-owned firms going after federal set-aside contracts');

  const lines = [
    ['', ''],
    ['', 'WHAT THIS WORKBOOK DOES'],
    ['', 'You self-certify as WOSB (Women-Owned Small Business) or EDWOSB (Economically Disadvantaged WOSB) directly on SAM.gov. No third-party certifier is required, but SBA can examine your file and a competitor can protest. This workbook walks the same checks SBA would run, so you find your own gaps before they do.'],
    ['', ''],
    ['', 'WHO THIS IS FOR'],
    ['', 'A founder who owns at least 51% of her business, runs day-to-day operations, and wants access to the roughly $25 billion in WOSB-eligible federal contracts awarded each year. If you have not yet registered on SAM.gov, do that first (see FLK_01_SAM_Registration_Walkthrough.pdf).'],
    ['', ''],
    ['', 'HOW TO USE IT'],
    ['', '1. Fill in the Business Profile tab. Those values feed every other tab.'],
    ['', '2. Work through the WOSB Eligibility tab. Mark each item Y, N, or ? from the dropdown. Add notes in the right-hand column for anything that needs follow-up.'],
    ['', '3. If you are also claiming EDWOSB, complete the EDWOSB Net Worth tab. Enter your assets, debts, and last 3 years of AGI. The workbook checks you against the three thresholds: under $850,000 net worth, under $400,000 average AGI, under $6.5 million total assets.'],
    ['', '4. Walk the Document Checklist tab. These are the files SBA will ask for during an examination. Track where each one lives so you can produce it within the 30-day window if requested.'],
    ['', '5. Check the Eligible NAICS tab to confirm your primary NAICS code is on the WOSB list. Only firms whose primary NAICS appears in 13 CFR 127.501 can use WOSB set-asides.'],
    ['', '6. Review the Summary tab. It shows pass/fail signals for WOSB, EDWOSB, and document readiness in one view.'],
    ['', ''],
    ['', 'WHAT \'SELF-CERTIFICATION\' ACTUALLY MEANS'],
    ['', 'You check the WOSB or EDWOSB box in Reps & Certs on SAM.gov. That is the certification. There is no application packet to mail in. But you must keep every supporting document on file for at least 6 years, and you must be ready to produce them within 30 days if SBA opens an examination. False certification is a federal crime under 18 U.S.C. 1001, with penalties up to $500,000 and 5 years per count.'],
    ['', ''],
    ['', 'THIRD-PARTY CERTIFICATION (OPTIONAL)'],
    ['', 'You can also pay for third-party certification from WBENC, NWBOC, US Women\'s Chamber of Commerce, or El Paso Hispanic Chamber. Cost runs $350 to $1,250 plus annual fees. SBA accepts these in lieu of self-certification, and prime contractors often prefer them for their own diversity reporting. It usually takes 90 days. Not required for federal contracts.'],
    ['', ''],
    ['', 'WHEN YOU SHOULD TALK TO A LAWYER'],
    ['', 'Anything involving (a) male co-owners with veto rights or unusual voting structures, (b) trusts holding ownership shares, (c) prior ownership transfers within the last 2 years, or (d) joint ventures and mentor-protege agreements. The structural-control rules are where most WOSB protests succeed. A 1-hour consult with a small-business government-contracts attorney runs $300-$500 and is cheaper than losing an awarded contract.'],
    ['', ''],
    ['', 'WHAT GOES WRONG MOST OFTEN'],
    ['', '— A male spouse or co-founder holds a controlling role (CFO, COO) that can override the female owner. This kills WOSB eligibility even if she owns 51%.'],
    ['', '— Operating Agreement has supermajority voting requirements that effectively give a male minority owner veto power.'],
    ['', '— Owner does not actually run daily operations and cannot pass the "operator knowledge test" if SBA asks her to walk through finances, contracts, customers.'],
    ['', '— Primary NAICS in SAM.gov is not on the WOSB-eligible list. Even with everything else right, you cannot use the set-aside.'],
    ['', '— Personal financial statement does not separate primary-residence equity from other assets, inflating apparent net worth above $850K.'],
    ['', ''],
    ['', 'WHEN YOU ARE DONE'],
    ['', 'If the Summary tab shows green for both WOSB and EDWOSB (where applicable) and your document checklist is complete, go to SAM.gov, log in, navigate to Entity Management, choose your entity, and update Representations and Certifications. Set FAR 52.212-3(c)(8) (or the equivalent FAR 52.219-22 representation for WOSB/EDWOSB) to YES. Save and submit.'],
    ['', ''],
  ];

  let r = 3;
  for (const [_, text] of lines) {
    const cell = ws.getCell(`B${r}`);
    cell.value = text;
    if (text === text.toUpperCase() && text.length > 0 && text.length < 60) {
      cell.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: EMERALD_DARK } };
      ws.getRow(r).height = 22;
    } else if (text.length > 0) {
      cell.font = { name: 'Helvetica', size: 10, color: { argb: SLATE } };
      cell.alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r).height = Math.max(18, Math.ceil(text.length / 100) * 16);
    }
    r++;
  }

  ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];
  setPrint(ws);
}

// ============================================================
// TAB 2: BUSINESS PROFILE (Inputs)
// ============================================================
{
  const ws = wb.addWorksheet('Business Profile', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 4 },
    { width: 34 },
    { width: 44 },
    { width: 26 },
    { width: 18 },
    { width: 4 },
  ];
  brandHeader(ws, 'Business Profile', 'Fill these once. They feed the eligibility, EDWOSB, and summary tabs.');

  const fields = [
    ['Business Legal Name', '', 'Match exactly what is on your SAM.gov registration'],
    ['DBA / Trade Name', '', 'If different from legal name'],
    ['UEI (Unique Entity ID)', '', '12-character SAM.gov identifier'],
    ['CAGE Code', '', '5-character assigned during SAM registration'],
    ['Primary NAICS Code', '', '6 digits — check Eligible NAICS tab'],
    ['Entity Type', '', 'LLC, S-Corp, C-Corp, Sole Prop, Partnership'],
    ['State of Formation', '', 'Two-letter state code'],
    ['Year Founded', '', 'YYYY'],
    ['Number of Employees', '', 'Average over last 12 months'],
    ['Average Annual Revenue', '', 'Average of last 3 fiscal years (used for size standard)'],
    ['', '', ''],
    ['Female Owner Name', '', 'The 51%+ owner being certified'],
    ['Female Owner Title', '', 'Must be President, CEO, or Managing Member'],
    ['Female Owner Ownership %', '', 'Must be 51% or higher (enter as 51, not 0.51)'],
    ['U.S. Citizen?', 'Select…', 'Required for WOSB and EDWOSB'],
    ['Date Ownership Acquired', '', 'YYYY-MM-DD'],
    ['', '', ''],
    ['Other Owner(s) Names', '', 'List all other equity holders'],
    ['Combined Female Ownership %', '', 'If multiple women own equity, sum here (still must be 51%+)'],
    ['Highest Non-Female Ownership %', '', 'Largest single male shareholder %'],
    ['', '', ''],
    ['Evaluation Date', '', 'Today'],
    ['Prepared By', '', 'Your name'],
  ];

  const headerRow = 3;
  const hdr = ws.getRow(headerRow);
  hdr.height = 26;
  hdr.getCell(2).value = 'FIELD';
  hdr.getCell(3).value = 'VALUE';
  hdr.getCell(4).value = 'NOTES';
  [2, 3, 4].forEach(c => {
    const cell = hdr.getCell(c);
    cell.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
    fillCell(cell, SLATE);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  });

  let r = 4;
  for (const [label, value, note] of fields) {
    const row = ws.getRow(r);
    row.height = 22;
    if (label === '') {
      // spacer row
      r++;
      continue;
    }
    row.getCell(2).value = label;
    row.getCell(2).font = { name: 'Helvetica', bold: true, size: 10, color: { argb: SLATE } };
    row.getCell(2).alignment = { vertical: 'middle', indent: 1 };
    fillCell(row.getCell(2), SLATE_LIGHT);
    thinBorder(row.getCell(2));

    row.getCell(3).value = value;
    row.getCell(3).font = { name: 'Helvetica', size: 11, color: { argb: SLATE } };
    row.getCell(3).alignment = { vertical: 'middle', indent: 1 };
    fillCell(row.getCell(3), WHITE);
    thinBorder(row.getCell(3));

    row.getCell(4).value = note;
    row.getCell(4).font = { name: 'Helvetica', italic: true, size: 9, color: { argb: SLATE_MID } };
    row.getCell(4).alignment = { vertical: 'middle', wrapText: true };
    r++;
  }

  // Dropdowns
  ws.getCell('C18').dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: [lists.CitizenStatus],
    showErrorMessage: true,
    errorTitle: 'Choose one',
    error: 'Pick from the dropdown',
  };

  // Named ranges for downstream tabs
  wb.definedNames.add(`'Business Profile'!$C$4`, 'BusinessName');
  wb.definedNames.add(`'Business Profile'!$C$8`, 'PrimaryNAICS');
  wb.definedNames.add(`'Business Profile'!$C$13`, 'AvgRevenue');
  wb.definedNames.add(`'Business Profile'!$C$17`, 'FemaleOwnerPct');
  wb.definedNames.add(`'Business Profile'!$C$18`, 'CitizenStatus');
  wb.definedNames.add(`'Business Profile'!$C$22`, 'CombinedFemalePct');
  wb.definedNames.add(`'Business Profile'!$C$23`, 'HighestMalePct');

  ws.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
  setPrint(ws);
}

// ============================================================
// TAB 3: WOSB ELIGIBILITY (24 checks with dropdowns + scoring)
// ============================================================
{
  const ws = wb.addWorksheet('WOSB Eligibility', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 4 },
    { width: 6 },
    { width: 60 },
    { width: 12 },
    { width: 10 },
    { width: 30 },
  ];
  brandHeader(ws, 'WOSB & EDWOSB Eligibility Checks', 'Mark Y / N / ? for each. The summary at the bottom adds up automatically.');

  // Header
  const headerRow = 3;
  const hdr = ws.getRow(headerRow);
  hdr.height = 30;
  const headers = ['', '#', 'ELIGIBILITY REQUIREMENT', 'MET? (Y/N/?)', 'RISK', 'NOTES'];
  headers.forEach((h, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
    fillCell(cell, SLATE);
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    thinBorder(cell, SLATE);
  });

  // Section helper
  function sectionRow(rIdx, label) {
    ws.mergeCells(`B${rIdx}:F${rIdx}`);
    const cell = ws.getCell(`B${rIdx}`);
    cell.value = label;
    cell.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
    fillCell(cell, EMERALD);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(rIdx).height = 22;
  }

  // Data rows
  const checks = [
    // [text, risk]
    ['__SECTION__', 'WOSB CORE REQUIREMENTS (every WOSB applicant)'],
    ['Business qualifies as small under the SBA size standard for its primary NAICS code', 'HIGH'],
    ['At least 51% unconditionally and directly owned by one or more women who are U.S. citizens', 'HIGH'],
    ['One or more women control the management and daily business operations of the firm', 'HIGH'],
    ['A woman holds the highest officer position (President, CEO, or Managing Member)', 'HIGH'],
    ['The woman owner is not a figurehead and participates in day-to-day decisions', 'HIGH'],
    ['No non-female individual holds a position of control that can override the female owner', 'HIGH'],
    ['Business is NOT publicly traded', 'HIGH'],
    ['Business is registered and active on SAM.gov with current reps and certs', 'HIGH'],
    ['Primary NAICS code is on the WOSB-eligible list (13 CFR 127.501)', 'HIGH'],

    ['__SECTION__', 'CONTROL — STRUCTURAL TESTS (where protests usually win)'],
    ['Female owner controls the board if one exists (holds 51%+ of voting rights)', 'HIGH'],
    ['Female owner\'s shares cannot be converted by others without her consent', 'MEDIUM'],
    ['Male co-owner or investor role is advisory only — they cannot override the female owner', 'HIGH'],
    ['Female owner can demonstrate working knowledge of operations, finances, customers', 'MEDIUM'],
    ['Operating Agreement has no supermajority voting rules that give a minority male owner a veto', 'HIGH'],
    ['Female owner devotes full-time effort to the firm during normal business hours', 'MEDIUM'],

    ['__SECTION__', 'EDWOSB ADDITIONAL TESTS (only if also pursuing EDWOSB)'],
    ['Personal net worth of the female owner is under $850,000 (excluding primary-residence equity and the firm itself)', 'HIGH'],
    ['Total assets of the female owner are under $6,500,000', 'HIGH'],
    ['Adjusted gross income averaged under $400,000 over last 3 years', 'HIGH'],
    ['Owner is a U.S. citizen (naturalized counts)', 'HIGH'],
    ['Financial statements support the economic-disadvantage claim if SBA asks', 'MEDIUM'],

    ['__SECTION__', 'DOCUMENTATION & SAM.GOV'],
    ['Operating Agreement / Bylaws confirm female ownership %', 'HIGH'],
    ['Articles of Incorporation or LLC formation docs are current and filed', 'MEDIUM'],
    ['SAM.gov self-certification as WOSB or EDWOSB is current under Reps and Certs', 'HIGH'],
    ['Annual SAM.gov entity renewal completed within last 12 months', 'HIGH'],
  ];

  let r = headerRow + 1;
  let checkNum = 0;
  const checkRows = []; // track rows that contain Y/N/? cells for COUNTIF
  for (const [text, riskOrLabel] of checks) {
    if (text === '__SECTION__') {
      sectionRow(r, riskOrLabel);
      r++;
      continue;
    }
    checkNum++;
    const row = ws.getRow(r);
    row.height = 26;

    row.getCell(2).value = checkNum;
    row.getCell(2).font = { name: 'Helvetica', bold: true, size: 10, color: { argb: SLATE_MID } };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };

    row.getCell(3).value = text;
    row.getCell(3).font = { name: 'Helvetica', size: 10, color: { argb: SLATE } };
    row.getCell(3).alignment = { vertical: 'middle', wrapText: true, indent: 1 };

    row.getCell(4).value = '';
    row.getCell(4).font = { name: 'Helvetica', bold: true, size: 11, color: { argb: SLATE } };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
    fillCell(row.getCell(4), WHITE);
    thinBorder(row.getCell(4));
    row.getCell(4).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [lists.YesNoMaybe],
      showErrorMessage: true,
      errorTitle: 'Choose Y, N, or ?',
      error: 'Pick Y (met), N (not met), or ? (unsure)',
    };

    row.getCell(5).value = riskOrLabel;
    row.getCell(5).font = { name: 'Helvetica', bold: true, size: 9, color: { argb: WHITE } };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
    fillCell(row.getCell(5), riskOrLabel === 'HIGH' ? RED : AMBER);

    row.getCell(6).value = '';
    row.getCell(6).font = { name: 'Helvetica', italic: true, size: 9, color: { argb: SLATE_MID } };
    row.getCell(6).alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    fillCell(row.getCell(6), SLATE_LIGHT);

    [2, 3, 5, 6].forEach(c => thinBorder(row.getCell(c)));

    checkRows.push(r);
    r++;
  }

  // First check row, last check row
  const firstCheck = checkRows[0];
  const lastCheck = checkRows[checkRows.length - 1];
  // WOSB-core checks (questions 1-9) live in first 9 check rows
  const wosbCoreFirst = checkRows[0];
  const wosbCoreLast = checkRows[8];
  // Control checks (questions 10-15) are rows 10..15 (0-indexed 9..14)
  const ctrlFirst = checkRows[9];
  const ctrlLast = checkRows[14];
  // EDWOSB checks (16-20) rows 16..20
  const edFirst = checkRows[15];
  const edLast = checkRows[19];
  // Docs (21-24)
  const docFirst = checkRows[20];
  const docLast = checkRows[23];

  // Spacer
  r++;

  // Summary block
  const sumStart = r;
  function summaryRow(rIdx, label, formula, isTotal = false) {
    ws.mergeCells(`B${rIdx}:C${rIdx}`);
    const lc = ws.getCell(`B${rIdx}`);
    lc.value = label;
    lc.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
    fillCell(lc, isTotal ? EMERALD_DARK : SLATE);
    lc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    const vc = ws.getCell(`D${rIdx}`);
    vc.value = { formula, result: '' };
    vc.font = { name: 'Helvetica', bold: true, size: 12, color: { argb: SLATE } };
    vc.alignment = { vertical: 'middle', horizontal: 'center' };
    fillCell(vc, isTotal ? EMERALD_TINT : SLATE_LIGHT);
    thinBorder(vc);

    ws.getRow(rIdx).height = 24;
  }
  summaryRow(r++, 'WOSB Core Met (Y)', `COUNTIF(D${wosbCoreFirst}:D${wosbCoreLast},"Y")&" of 9"`);
  summaryRow(r++, 'Control Tests Met (Y)', `COUNTIF(D${ctrlFirst}:D${ctrlLast},"Y")&" of 6"`);
  summaryRow(r++, 'EDWOSB Tests Met (Y)', `COUNTIF(D${edFirst}:D${edLast},"Y")&" of 5"`);
  summaryRow(r++, 'Documentation Met (Y)', `COUNTIF(D${docFirst}:D${docLast},"Y")&" of 4"`);
  summaryRow(r++, 'Total Met / Open', `COUNTIF(D${firstCheck}:D${lastCheck},"Y")&" of 24 met, "&(COUNTIF(D${firstCheck}:D${lastCheck},"N")+COUNTIF(D${firstCheck}:D${lastCheck},"?"))&" open"`, true);

  // Verdict row
  r++;
  ws.mergeCells(`B${r}:C${r}`);
  const verdictLabel = ws.getCell(`B${r}`);
  verdictLabel.value = 'WOSB CORE VERDICT';
  verdictLabel.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: WHITE } };
  fillCell(verdictLabel, EMERALD_DARK);
  verdictLabel.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  ws.mergeCells(`D${r}:F${r}`);
  const verdictCell = ws.getCell(`D${r}`);
  verdictCell.value = {
    formula: `IF(COUNTIF(D${wosbCoreFirst}:D${wosbCoreLast},"Y")=9,IF(COUNTIF(D${ctrlFirst}:D${ctrlLast},"Y")>=5,"LIKELY ELIGIBLE — Self-certify on SAM.gov","REVIEW CONTROL TESTS — 5+ of 6 should be Y before certifying"),"GAPS IN CORE REQUIREMENTS — Do not self-certify yet")`,
    result: '',
  };
  verdictCell.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: SLATE } };
  verdictCell.alignment = { vertical: 'middle', horizontal: 'center' };
  fillCell(verdictCell, EMERALD_TINT);
  thinBorder(verdictCell);
  ws.getRow(r).height = 30;

  // EDWOSB verdict
  r++;
  ws.mergeCells(`B${r}:C${r}`);
  const edLabel = ws.getCell(`B${r}`);
  edLabel.value = 'EDWOSB VERDICT';
  edLabel.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: WHITE } };
  fillCell(edLabel, EMERALD_DARK);
  edLabel.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  ws.mergeCells(`D${r}:F${r}`);
  const edVerdict = ws.getCell(`D${r}`);
  edVerdict.value = {
    formula: `IF(COUNTIF(D${edFirst}:D${edLast},"Y")=5,IF(COUNTIF(D${wosbCoreFirst}:D${wosbCoreLast},"Y")=9,"LIKELY ELIGIBLE for EDWOSB","Confirm WOSB core first"),"EDWOSB GAPS — Check Net Worth tab for exact numbers")`,
    result: '',
  };
  edVerdict.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: SLATE } };
  edVerdict.alignment = { vertical: 'middle', horizontal: 'center' };
  fillCell(edVerdict, EMERALD_TINT);
  thinBorder(edVerdict);
  ws.getRow(r).height = 30;

  // Conditional formatting on the Y/N/? column
  ws.addConditionalFormatting({
    ref: `D${firstCheck}:D${lastCheck}`,
    rules: [
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'Y',
        priority: 1,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_TINT } }, font: { color: { argb: GREEN }, bold: true } },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'N',
        priority: 2,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED_TINT } }, font: { color: { argb: RED }, bold: true } },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: '?',
        priority: 3,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: AMBER_TINT } }, font: { color: { argb: AMBER }, bold: true } },
      },
    ],
  });

  // Named ranges for summary tab
  wb.definedNames.add(`'WOSB Eligibility'!$D$${wosbCoreFirst}:$D$${wosbCoreLast}`, 'WOSBCore');
  wb.definedNames.add(`'WOSB Eligibility'!$D$${ctrlFirst}:$D$${ctrlLast}`, 'WOSBControl');
  wb.definedNames.add(`'WOSB Eligibility'!$D$${edFirst}:$D$${edLast}`, 'EDWOSBTests');
  wb.definedNames.add(`'WOSB Eligibility'!$D$${docFirst}:$D$${docLast}`, 'WOSBDocs');
  wb.definedNames.add(`'WOSB Eligibility'!$D$${firstCheck}:$D$${lastCheck}`, 'WOSBAll');

  ws.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
  setPrint(ws);
}

// ============================================================
// TAB 4: EDWOSB NET WORTH CALCULATOR
// ============================================================
{
  const ws = wb.addWorksheet('EDWOSB Net Worth', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 4 },
    { width: 40 },
    { width: 18 },
    { width: 4 },
    { width: 40 },
    { width: 18 },
  ];
  brandHeader(ws, 'EDWOSB Economic Disadvantage Calculator', 'Three thresholds: net worth under $850K, average AGI under $400K, total assets under $6.5M');

  // ASSETS section (left)
  function leftSectionHeader(rIdx, text) {
    ws.mergeCells(`B${rIdx}:C${rIdx}`);
    const cell = ws.getCell(`B${rIdx}`);
    cell.value = text;
    cell.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
    fillCell(cell, EMERALD_DARK);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(rIdx).height = 22;
  }
  function rightSectionHeader(rIdx, text) {
    ws.mergeCells(`E${rIdx}:F${rIdx}`);
    const cell = ws.getCell(`E${rIdx}`);
    cell.value = text;
    cell.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
    fillCell(cell, EMERALD_DARK);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(rIdx).height = 22;
  }
  function inputRow(rIdx, col, label, hint) {
    const labelCol = col;
    const valueCol = String.fromCharCode(col.charCodeAt(0) + 1);
    const row = ws.getRow(rIdx);
    row.height = 22;
    const lc = row.getCell(labelCol);
    lc.value = label;
    lc.font = { name: 'Helvetica', size: 10, color: { argb: SLATE } };
    lc.alignment = { vertical: 'middle', indent: 1 };
    fillCell(lc, SLATE_LIGHT);
    thinBorder(lc);

    const vc = row.getCell(valueCol);
    vc.value = 0;
    vc.numFmt = '"$"#,##0;[Red]-"$"#,##0';
    vc.font = { name: 'Helvetica', size: 11, color: { argb: SLATE } };
    vc.alignment = { vertical: 'middle', horizontal: 'right' };
    fillCell(vc, WHITE);
    thinBorder(vc);

    if (hint) lc.note = hint;
  }
  function totalRow(rIdx, col, label, formula, fmt = '"$"#,##0') {
    const labelCol = col;
    const valueCol = String.fromCharCode(col.charCodeAt(0) + 1);
    const row = ws.getRow(rIdx);
    row.height = 26;
    const lc = row.getCell(labelCol);
    lc.value = label;
    lc.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
    fillCell(lc, SLATE);
    lc.alignment = { vertical: 'middle', indent: 1 };

    const vc = row.getCell(valueCol);
    vc.value = { formula, result: 0 };
    vc.numFmt = fmt;
    vc.font = { name: 'Helvetica', bold: true, size: 12, color: { argb: SLATE } };
    vc.alignment = { vertical: 'middle', horizontal: 'right' };
    fillCell(vc, EMERALD_TINT);
    thinBorder(vc);
  }

  // LEFT: ASSETS
  leftSectionHeader(3, 'PERSONAL ASSETS');
  inputRow(4, 'B', 'Cash and checking accounts', 'All bank balances combined');
  inputRow(5, 'B', 'Savings and money market', '');
  inputRow(6, 'B', 'Retirement accounts (401k, IRA, Roth)', 'Vested balance only');
  inputRow(7, 'B', 'Brokerage / stocks / mutual funds', 'Current market value');
  inputRow(8, 'B', 'Real estate — primary residence (market value)', 'Used for assets total, EXCLUDED from net worth');
  inputRow(9, 'B', 'Real estate — other properties', 'Investment, vacation, rental');
  inputRow(10, 'B', 'Vehicles (market value)', 'KBB or similar');
  inputRow(11, 'B', 'Business equity in the firm being certified', 'EXCLUDED from EDWOSB net worth calculation');
  inputRow(12, 'B', 'Equity in other businesses', '');
  inputRow(13, 'B', 'Personal property (jewelry, art, collectibles)', 'Items over $5,000 each');
  inputRow(14, 'B', 'Other assets', '');
  totalRow(15, 'B', 'TOTAL ASSETS', 'SUM(C4:C14)');

  // LEFT: LIABILITIES
  leftSectionHeader(17, 'PERSONAL LIABILITIES');
  inputRow(18, 'B', 'Mortgage on primary residence', '');
  inputRow(19, 'B', 'Mortgage on other properties', '');
  inputRow(20, 'B', 'Vehicle loans', '');
  inputRow(21, 'B', 'Credit card balances', '');
  inputRow(22, 'B', 'Student loans', '');
  inputRow(23, 'B', 'Personal loans / lines of credit', '');
  inputRow(24, 'B', 'Tax debts owed', '');
  inputRow(25, 'B', 'Other liabilities', '');
  totalRow(26, 'B', 'TOTAL LIABILITIES', 'SUM(C18:C25)');

  // LEFT: NET WORTH CALC
  leftSectionHeader(28, 'NET WORTH FOR EDWOSB');
  // Net worth = total assets - primary residence equity - business equity - liabilities
  // Primary residence equity = C8 - C18 (but not negative)
  // The formula excludes primary residence equity AND business equity per SBA rules
  const row29 = ws.getRow(29);
  row29.height = 22;
  row29.getCell(2).value = 'Total Assets';
  row29.getCell(2).font = { name: 'Helvetica', size: 10, color: { argb: SLATE } };
  row29.getCell(2).alignment = { vertical: 'middle', indent: 1 };
  fillCell(row29.getCell(2), SLATE_LIGHT);
  thinBorder(row29.getCell(2));
  row29.getCell(3).value = { formula: 'C15', result: 0 };
  row29.getCell(3).numFmt = '"$"#,##0';
  row29.getCell(3).font = { name: 'Helvetica', size: 11, color: { argb: SLATE } };
  row29.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
  thinBorder(row29.getCell(3));

  const row30 = ws.getRow(30);
  row30.height = 22;
  row30.getCell(2).value = '— Less: Primary residence equity (capped at $0)';
  row30.getCell(2).font = { name: 'Helvetica', size: 10, color: { argb: SLATE } };
  row30.getCell(2).alignment = { vertical: 'middle', indent: 1 };
  fillCell(row30.getCell(2), SLATE_LIGHT);
  thinBorder(row30.getCell(2));
  row30.getCell(3).value = { formula: 'MAX(0,C8-C18)', result: 0 };
  row30.getCell(3).numFmt = '"$"#,##0';
  row30.getCell(3).font = { name: 'Helvetica', size: 11, color: { argb: SLATE } };
  row30.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
  thinBorder(row30.getCell(3));

  const row31 = ws.getRow(31);
  row31.height = 22;
  row31.getCell(2).value = '— Less: Equity in firm being certified';
  row31.getCell(2).font = { name: 'Helvetica', size: 10, color: { argb: SLATE } };
  row31.getCell(2).alignment = { vertical: 'middle', indent: 1 };
  fillCell(row31.getCell(2), SLATE_LIGHT);
  thinBorder(row31.getCell(2));
  row31.getCell(3).value = { formula: 'C11', result: 0 };
  row31.getCell(3).numFmt = '"$"#,##0';
  row31.getCell(3).font = { name: 'Helvetica', size: 11, color: { argb: SLATE } };
  row31.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
  thinBorder(row31.getCell(3));

  const row32 = ws.getRow(32);
  row32.height = 22;
  row32.getCell(2).value = '— Less: Total liabilities';
  row32.getCell(2).font = { name: 'Helvetica', size: 10, color: { argb: SLATE } };
  row32.getCell(2).alignment = { vertical: 'middle', indent: 1 };
  fillCell(row32.getCell(2), SLATE_LIGHT);
  thinBorder(row32.getCell(2));
  row32.getCell(3).value = { formula: 'C26', result: 0 };
  row32.getCell(3).numFmt = '"$"#,##0';
  row32.getCell(3).font = { name: 'Helvetica', size: 11, color: { argb: SLATE } };
  row32.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
  thinBorder(row32.getCell(3));

  totalRow(33, 'B', 'NET WORTH (EDWOSB DEFINITION)', 'C15-MAX(0,C8-C18)-C11-C26');

  // Threshold check
  const row34 = ws.getRow(34);
  row34.height = 28;
  row34.getCell(2).value = 'Threshold: $850,000';
  row34.getCell(2).font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
  fillCell(row34.getCell(2), SLATE);
  row34.getCell(2).alignment = { vertical: 'middle', indent: 1 };
  row34.getCell(3).value = { formula: 'IF(C33<850000,"PASS","FAIL — over $850K")', result: '' };
  row34.getCell(3).font = { name: 'Helvetica', bold: true, size: 11, color: { argb: SLATE } };
  row34.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
  fillCell(row34.getCell(3), AMBER_TINT);
  thinBorder(row34.getCell(3));

  // RIGHT: AGI 3-YEAR AVERAGE
  rightSectionHeader(3, 'ADJUSTED GROSS INCOME (3-YEAR AVERAGE)');
  inputRow(4, 'E', 'Year 1 AGI (Form 1040 line 11)', 'Most recent tax year');
  inputRow(5, 'E', 'Year 2 AGI', 'Prior year');
  inputRow(6, 'E', 'Year 3 AGI', 'Two years prior');
  totalRow(7, 'E', 'AVERAGE AGI (3-YEAR)', 'AVERAGE(F4:F6)');
  const row8 = ws.getRow(8);
  row8.height = 28;
  row8.getCell(5).value = 'Threshold: $400,000 average';
  row8.getCell(5).font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
  fillCell(row8.getCell(5), SLATE);
  row8.getCell(5).alignment = { vertical: 'middle', indent: 1 };
  row8.getCell(6).value = { formula: 'IF(F7<400000,"PASS","FAIL — over $400K")', result: '' };
  row8.getCell(6).font = { name: 'Helvetica', bold: true, size: 11, color: { argb: SLATE } };
  row8.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
  fillCell(row8.getCell(6), AMBER_TINT);
  thinBorder(row8.getCell(6));

  // RIGHT: TOTAL ASSETS THRESHOLD
  rightSectionHeader(10, 'TOTAL ASSETS THRESHOLD');
  const row11 = ws.getRow(11);
  row11.height = 22;
  row11.getCell(5).value = 'Total Assets (from left column)';
  row11.getCell(5).font = { name: 'Helvetica', size: 10, color: { argb: SLATE } };
  row11.getCell(5).alignment = { vertical: 'middle', indent: 1 };
  fillCell(row11.getCell(5), SLATE_LIGHT);
  thinBorder(row11.getCell(5));
  row11.getCell(6).value = { formula: 'C15', result: 0 };
  row11.getCell(6).numFmt = '"$"#,##0';
  row11.getCell(6).font = { name: 'Helvetica', size: 11, color: { argb: SLATE } };
  row11.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
  thinBorder(row11.getCell(6));

  const row12 = ws.getRow(12);
  row12.height = 28;
  row12.getCell(5).value = 'Threshold: $6,500,000';
  row12.getCell(5).font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
  fillCell(row12.getCell(5), SLATE);
  row12.getCell(5).alignment = { vertical: 'middle', indent: 1 };
  row12.getCell(6).value = { formula: 'IF(F11<6500000,"PASS","FAIL — over $6.5M")', result: '' };
  row12.getCell(6).font = { name: 'Helvetica', bold: true, size: 11, color: { argb: SLATE } };
  row12.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
  fillCell(row12.getCell(6), AMBER_TINT);
  thinBorder(row12.getCell(6));

  // RIGHT: COMBINED VERDICT
  rightSectionHeader(15, 'COMBINED EDWOSB VERDICT');
  const row16 = ws.getRow(16);
  row16.height = 36;
  row16.getCell(5).value = 'EDWOSB Economic Disadvantage';
  row16.getCell(5).font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
  fillCell(row16.getCell(5), EMERALD_DARK);
  row16.getCell(5).alignment = { vertical: 'middle', indent: 1 };
  row16.getCell(6).value = {
    formula: 'IF(AND(C33<850000,F7<400000,F11<6500000),"PASS all 3 thresholds","FAIL — see thresholds above")',
    result: '',
  };
  row16.getCell(6).font = { name: 'Helvetica', bold: true, size: 12, color: { argb: SLATE } };
  row16.getCell(6).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  fillCell(row16.getCell(6), EMERALD_TINT);
  thinBorder(row16.getCell(6));

  // Conditional formatting for PASS/FAIL cells
  const passFailRefs = ['C34', 'F8', 'F12', 'F16'];
  passFailRefs.forEach(ref => {
    ws.addConditionalFormatting({
      ref,
      rules: [
        {
          type: 'containsText',
          operator: 'containsText',
          text: 'PASS',
          priority: 1,
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_TINT } }, font: { color: { argb: GREEN }, bold: true } },
        },
        {
          type: 'containsText',
          operator: 'containsText',
          text: 'FAIL',
          priority: 2,
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED_TINT } }, font: { color: { argb: RED }, bold: true } },
        },
      ],
    });
  });

  // Help notes at the bottom
  ws.mergeCells('B36:F36');
  const helpHdr = ws.getCell('B36');
  helpHdr.value = 'WHAT THE SBA EXCLUDES FROM YOUR NET WORTH';
  helpHdr.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
  fillCell(helpHdr, SLATE);
  helpHdr.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(36).height = 22;

  ws.mergeCells('B37:F37');
  ws.getCell('B37').value = '1) Equity in your primary residence is excluded. If your house is worth $700,000 and you owe $300,000, that $400,000 of equity does not count against the $850K cap. Only your residence — not vacation homes or rentals.';
  ws.getCell('B37').font = { name: 'Helvetica', size: 9, color: { argb: SLATE } };
  ws.getCell('B37').alignment = { vertical: 'top', wrapText: true, indent: 1 };
  ws.getRow(37).height = 32;

  ws.mergeCells('B38:F38');
  ws.getCell('B38').value = '2) Equity in the business being certified is excluded. So if your firm is worth $3M and you own 51%, the $1.53M is excluded from this calc.';
  ws.getCell('B38').font = { name: 'Helvetica', size: 9, color: { argb: SLATE } };
  ws.getCell('B38').alignment = { vertical: 'top', wrapText: true, indent: 1 };
  ws.getRow(38).height = 28;

  ws.mergeCells('B39:F39');
  ws.getCell('B39').value = '3) Retirement accounts (401k, IRA) ARE included in net worth — there is no exclusion for these. This catches a lot of founders by surprise.';
  ws.getCell('B39').font = { name: 'Helvetica', size: 9, color: { argb: SLATE } };
  ws.getCell('B39').alignment = { vertical: 'top', wrapText: true, indent: 1 };
  ws.getRow(39).height = 28;

  ws.mergeCells('B40:F40');
  ws.getCell('B40').value = '4) AGI is averaged over the 3 most recent tax years. A single big year does not disqualify you if the average stays under $400K. Income reinvested into the business via S-Corp passthrough still counts as AGI.';
  ws.getCell('B40').font = { name: 'Helvetica', size: 9, color: { argb: SLATE } };
  ws.getCell('B40').alignment = { vertical: 'top', wrapText: true, indent: 1 };
  ws.getRow(40).height = 32;

  ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];
  setPrint(ws, { orientation: 'landscape' });
}

// ============================================================
// TAB 5: DOCUMENT CHECKLIST
// ============================================================
{
  const ws = wb.addWorksheet('Document Checklist', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 4 },
    { width: 6 },
    { width: 50 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 32 },
  ];
  brandHeader(ws, 'Document Preparation Checklist', 'These are the files SBA can ask for during an examination. Track each one\'s status and location.');

  // Header
  const headerRow = 3;
  const hdr = ws.getRow(headerRow);
  hdr.height = 32;
  const headers = ['', '#', 'DOCUMENT', 'WOSB', 'EDWOSB', 'STATUS', 'LOCATION / NOTES'];
  headers.forEach((h, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
    fillCell(cell, SLATE);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    thinBorder(cell, SLATE);
  });

  function sectionRow(rIdx, label) {
    ws.mergeCells(`B${rIdx}:G${rIdx}`);
    const cell = ws.getCell(`B${rIdx}`);
    cell.value = label;
    cell.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
    fillCell(cell, EMERALD);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(rIdx).height = 22;
  }

  const docs = [
    ['__SECTION__', 'CORPORATE FORMATION', null, null],
    ['Articles of Incorporation or LLC Certificate of Organization', 'YES', 'YES'],
    ['Operating Agreement or Bylaws (must show female ownership % and control)', 'YES', 'YES'],
    ['Corporate resolution or statement confirming current officer titles', 'YES', 'YES'],
    ['Stock ledger or membership-interest schedule showing ownership %s', 'YES', 'YES'],
    ['Minutes of most recent board or member meeting', 'YES', 'YES'],

    ['__SECTION__', 'OWNER IDENTITY & CITIZENSHIP', null, null],
    ['Copy of female owner\'s U.S. passport or birth certificate', 'YES', 'YES'],
    ['Naturalization certificate (if applicable)', 'IF APPL', 'IF APPL'],
    ['Government-issued photo ID for each owner listed in formation docs', 'YES', 'YES'],

    ['__SECTION__', 'TAX & FINANCIAL', null, null],
    ['Business federal tax returns — last 3 years (1065, 1120, or 1120S)', 'YES', 'YES'],
    ['Personal federal tax returns — female owner\'s last 3 years (Form 1040)', 'NO', 'YES'],
    ['Personal Financial Statement (PFS) — SBA Form 413 or equivalent', 'NO', 'YES'],
    ['Most recent business balance sheet and income statement', 'YES', 'YES'],
    ['Bank statements for owner — 3 most recent months', 'NO', 'YES'],

    ['__SECTION__', 'CONTROL EVIDENCE', null, null],
    ['Signature authority documents (who signs contracts, checks, leases)', 'YES', 'YES'],
    ['Documentation that female owner controls hiring/firing decisions', 'YES', 'YES'],
    ['Org chart showing female owner at top of management', 'YES', 'YES'],
    ['Payroll records showing female owner is full-time and highest-compensated', 'YES', 'YES'],

    ['__SECTION__', 'SAM.GOV & CERTIFICATION', null, null],
    ['Active SAM.gov registration with current address and NAICS codes', 'YES', 'YES'],
    ['Reps & Certs updated: WOSB checked YES under set-aside certifications', 'YES', 'YES'],
    ['EDWOSB checked YES in Reps & Certs (in addition to WOSB)', 'NO', 'YES'],
    ['Annual SAM.gov renewal complete (within last 12 months)', 'YES', 'YES'],

    ['__SECTION__', 'OPTIONAL', null, null],
    ['Third-party WOSB certification from NWBOC, WBENC, or US Women\'s Chamber', 'OPTIONAL', 'OPTIONAL'],
    ['SBA Mentor-Protege Agreement (if applicable)', 'OPTIONAL', 'OPTIONAL'],
  ];

  let r = headerRow + 1;
  let docNum = 0;
  const docStatusRows = [];

  for (const item of docs) {
    if (item[0] === '__SECTION__') {
      sectionRow(r, item[1]);
      r++;
      continue;
    }
    docNum++;
    const [text, wosbReq, edReq] = item;
    const row = ws.getRow(r);
    row.height = 24;

    row.getCell(2).value = docNum;
    row.getCell(2).font = { name: 'Helvetica', bold: true, size: 10, color: { argb: SLATE_MID } };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };

    row.getCell(3).value = text;
    row.getCell(3).font = { name: 'Helvetica', size: 10, color: { argb: SLATE } };
    row.getCell(3).alignment = { vertical: 'middle', wrapText: true, indent: 1 };

    // WOSB / EDWOSB columns
    [['D', wosbReq], ['E', edReq]].forEach(([col, val]) => {
      const c = row.getCell(col);
      c.value = val;
      c.font = { name: 'Helvetica', bold: true, size: 9, color: { argb: WHITE } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
      const bg = val === 'YES' ? GREEN : val === 'NO' ? SLATE_MID : val === 'OPTIONAL' ? AMBER : AMBER;
      fillCell(c, bg);
      thinBorder(c);
    });

    // Status dropdown
    row.getCell(6).value = '';
    row.getCell(6).font = { name: 'Helvetica', bold: true, size: 10, color: { argb: SLATE } };
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
    fillCell(row.getCell(6), WHITE);
    thinBorder(row.getCell(6));
    row.getCell(6).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [lists.DocStatus],
      showErrorMessage: true,
      errorTitle: 'Choose status',
      error: 'Pick Have, Need, or N/A',
    };

    row.getCell(7).value = '';
    row.getCell(7).font = { name: 'Helvetica', italic: true, size: 9, color: { argb: SLATE_MID } };
    row.getCell(7).alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    fillCell(row.getCell(7), SLATE_LIGHT);

    [2, 3, 7].forEach(c => thinBorder(row.getCell(c)));

    docStatusRows.push(r);
    r++;
  }

  // Summary
  r++;
  const firstDoc = docStatusRows[0];
  const lastDoc = docStatusRows[docStatusRows.length - 1];

  function docSummary(rIdx, label, formula, isTotal = false) {
    ws.mergeCells(`B${rIdx}:E${rIdx}`);
    const lc = ws.getCell(`B${rIdx}`);
    lc.value = label;
    lc.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
    fillCell(lc, isTotal ? EMERALD_DARK : SLATE);
    lc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    ws.mergeCells(`F${rIdx}:G${rIdx}`);
    const vc = ws.getCell(`F${rIdx}`);
    vc.value = { formula, result: '' };
    vc.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: SLATE } };
    vc.alignment = { vertical: 'middle', horizontal: 'center' };
    fillCell(vc, isTotal ? EMERALD_TINT : SLATE_LIGHT);
    thinBorder(vc);
    ws.getRow(rIdx).height = 24;
  }
  docSummary(r++, 'Documents on file ("Have")', `COUNTIF(F${firstDoc}:F${lastDoc},"Have")&" of ${docStatusRows.length}"`);
  docSummary(r++, 'Still needed ("Need")', `COUNTIF(F${firstDoc}:F${lastDoc},"Need")&" missing"`);
  docSummary(r++, 'Readiness Score', `ROUND(COUNTIF(F${firstDoc}:F${lastDoc},"Have")/${docStatusRows.length}*100,0)&"%"`, true);

  // Conditional formatting on status
  ws.addConditionalFormatting({
    ref: `F${firstDoc}:F${lastDoc}`,
    rules: [
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'Have',
        priority: 1,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_TINT } }, font: { color: { argb: GREEN }, bold: true } },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'Need',
        priority: 2,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED_TINT } }, font: { color: { argb: RED }, bold: true } },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'N/A',
        priority: 3,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: SLATE_LIGHT } }, font: { color: { argb: SLATE_MID } } },
      },
    ],
  });

  wb.definedNames.add(`'Document Checklist'!$F$${firstDoc}:$F$${lastDoc}`, 'DocStatus');

  ws.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
  setPrint(ws);
}

// ============================================================
// TAB 6: ELIGIBLE NAICS REFERENCE
// ============================================================
{
  const ws = wb.addWorksheet('Eligible NAICS', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 4 },
    { width: 10 },
    { width: 38 },
    { width: 56 },
    { width: 4 },
  ];
  brandHeader(ws, 'WOSB Eligible NAICS Sectors', 'WOSB set-asides only apply to NAICS where women are statistically underrepresented (13 CFR 127.501)');

  const headerRow = 3;
  const hdr = ws.getRow(headerRow);
  hdr.height = 26;
  ['', 'SECTOR', 'INDUSTRY GROUP', 'NOTES FOR WOSB FIRMS'].forEach((h, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
    fillCell(cell, SLATE);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    thinBorder(cell, SLATE);
  });

  const sectors = [
    ['11', 'Agriculture, Forestry, Fishing & Hunting', 'Most NAICS in this sector are eligible — farming, logging, fishing'],
    ['21', 'Mining, Quarrying, Oil & Gas Extraction', 'Mining operations, quarrying, oil and gas extraction'],
    ['22', 'Utilities', 'Electric power, natural gas, water, sewage systems'],
    ['23', 'Construction', 'Building construction, specialty trade contractors, heavy / civil engineering'],
    ['31-33', 'Manufacturing', 'Food, beverage, textile, apparel, chemical, metal, machinery, electronics'],
    ['42', 'Wholesale Trade', 'Durable and non-durable goods wholesale distribution'],
    ['44-45', 'Retail Trade', 'Motor vehicle dealers, food stores, general merchandise, electronics'],
    ['48-49', 'Transportation & Warehousing', 'Air, rail, water, truck, pipeline transport — warehousing — couriers'],
    ['51', 'Information', 'Publishing, broadcasting, telecommunications, data processing'],
    ['52', 'Finance & Insurance', 'Banking, securities, insurance — selected NAICS only'],
    ['53', 'Real Estate & Rental and Leasing', 'Real estate, equipment rental and leasing'],
    ['54', 'Professional, Scientific & Technical Services', 'Legal, accounting, architecture, engineering, consulting, R&D — MAJOR federal sector'],
    ['56', 'Admin & Support, Waste Management', 'Facilities support, staffing, security, cleaning, pest control'],
    ['61', 'Educational Services', 'Schools, tutoring, language instruction, technical training'],
    ['62', 'Health Care & Social Assistance', 'Hospitals, physician offices, nursing, home health, child care'],
    ['71', 'Arts, Entertainment & Recreation', 'Performing arts, spectator sports, museums, recreation'],
    ['72', 'Accommodation & Food Services', 'Hotels, motels, restaurants, catering'],
    ['81', 'Other Services', 'Repair, maintenance, personal care, laundry, religious / civic'],
  ];

  let r = headerRow + 1;
  for (const [sector, name, notes] of sectors) {
    const row = ws.getRow(r);
    row.height = 24;
    row.getCell(2).value = sector;
    row.getCell(2).font = { name: 'Menlo', bold: true, size: 11, color: { argb: EMERALD_DARK } };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    fillCell(row.getCell(2), EMERALD_TINT);

    row.getCell(3).value = name;
    row.getCell(3).font = { name: 'Helvetica', bold: true, size: 10, color: { argb: SLATE } };
    row.getCell(3).alignment = { vertical: 'middle', wrapText: true, indent: 1 };

    row.getCell(4).value = notes;
    row.getCell(4).font = { name: 'Helvetica', size: 9, color: { argb: SLATE_MID } };
    row.getCell(4).alignment = { vertical: 'middle', wrapText: true, indent: 1 };

    [2, 3, 4].forEach(c => thinBorder(row.getCell(c)));
    r++;
  }

  // Reality-check footer
  r++;
  ws.mergeCells(`B${r}:D${r}`);
  const note = ws.getCell(`B${r}`);
  note.value = 'NOT EVERY NAICS IN THESE SECTORS IS ELIGIBLE. SBA maintains the precise list at 13 CFR Part 127 Subpart E and updates it after each underrepresentation study (most recent: 2020). Before pursuing a WOSB set-aside, search your specific 6-digit code on sba.gov/contracting/government-contracting-programs/women-owned-small-business-federal-contract-program — or check the SAM.gov opportunity listing itself, which flags WOSB-eligible solicitations.';
  note.font = { name: 'Helvetica', italic: true, size: 9, color: { argb: SLATE } };
  note.alignment = { vertical: 'top', wrapText: true, indent: 1 };
  fillCell(note, AMBER_TINT);
  thinBorder(note);
  ws.getRow(r).height = 80;

  ws.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
  setPrint(ws);
}

// ============================================================
// TAB 7: SUMMARY (Output rollup)
// ============================================================
{
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 4 },
    { width: 36 },
    { width: 22 },
    { width: 36 },
    { width: 4 },
  ];
  brandHeader(ws, 'Self-Certification Summary', 'One-page rollup. Print this. If everything is green, go update SAM.gov reps and certs.');

  function section(rIdx, label) {
    ws.mergeCells(`B${rIdx}:D${rIdx}`);
    const cell = ws.getCell(`B${rIdx}`);
    cell.value = label;
    cell.font = { name: 'Helvetica', bold: true, size: 11, color: { argb: WHITE } };
    fillCell(cell, EMERALD_DARK);
    cell.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(rIdx).height = 26;
  }
  function kpiRow(rIdx, label, formula, hint) {
    const row = ws.getRow(rIdx);
    row.height = 26;
    row.getCell(2).value = label;
    row.getCell(2).font = { name: 'Helvetica', bold: true, size: 10, color: { argb: SLATE } };
    row.getCell(2).alignment = { vertical: 'middle', indent: 1 };
    fillCell(row.getCell(2), SLATE_LIGHT);
    thinBorder(row.getCell(2));

    row.getCell(3).value = { formula, result: '' };
    row.getCell(3).font = { name: 'Helvetica', bold: true, size: 12, color: { argb: SLATE } };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    fillCell(row.getCell(3), EMERALD_TINT);
    thinBorder(row.getCell(3));

    row.getCell(4).value = hint;
    row.getCell(4).font = { name: 'Helvetica', italic: true, size: 9, color: { argb: SLATE_MID } };
    row.getCell(4).alignment = { vertical: 'middle', wrapText: true, indent: 1 };
  }

  let r = 3;
  section(r++, 'BUSINESS');
  kpiRow(r++, 'Business Name', `IF(BusinessName="","(enter in Business Profile)",BusinessName)`, 'From Business Profile tab');
  kpiRow(r++, 'Primary NAICS', `IF(PrimaryNAICS="","(enter in Business Profile)",PrimaryNAICS)`, 'Must be on WOSB-eligible list');
  kpiRow(r++, 'Female Ownership %', `IF(FemaleOwnerPct="","(enter)",FemaleOwnerPct&"%")`, 'Must be 51% or higher');

  r++;
  section(r++, 'ELIGIBILITY SCORES');
  kpiRow(r++, 'WOSB Core (9 questions)', `COUNTIF(WOSBCore,"Y")&" / 9"`, 'All 9 must be Y');
  kpiRow(r++, 'Control Tests (6 questions)', `COUNTIF(WOSBControl,"Y")&" / 6"`, '5+ recommended before certifying');
  kpiRow(r++, 'EDWOSB Tests (5 questions)', `COUNTIF(EDWOSBTests,"Y")&" / 5"`, 'All 5 must be Y for EDWOSB');
  kpiRow(r++, 'Documentation (4 questions)', `COUNTIF(WOSBDocs,"Y")&" / 4"`, 'Track docs separately on Document Checklist');
  kpiRow(r++, 'Documents on File', `COUNTIF(DocStatus,"Have")&" of "&COUNTA(DocStatus)`, 'From Document Checklist tab');

  r++;
  section(r++, 'EDWOSB FINANCIAL THRESHOLDS');
  kpiRow(r++, 'Net Worth Test', `IF('EDWOSB Net Worth'!C33<850000,"PASS  ($"&TEXT('EDWOSB Net Worth'!C33,"#,##0")&" / $850K)","FAIL  ($"&TEXT('EDWOSB Net Worth'!C33,"#,##0")&" / $850K)")`, 'Excludes residence + firm equity');
  kpiRow(r++, 'Average AGI Test', `IF('EDWOSB Net Worth'!F7<400000,"PASS  ($"&TEXT('EDWOSB Net Worth'!F7,"#,##0")&" avg)","FAIL  ($"&TEXT('EDWOSB Net Worth'!F7,"#,##0")&" avg)")`, '3-year average must be under $400K');
  kpiRow(r++, 'Total Assets Test', `IF('EDWOSB Net Worth'!C15<6500000,"PASS  ($"&TEXT('EDWOSB Net Worth'!C15,"#,##0")&" / $6.5M)","FAIL  ($"&TEXT('EDWOSB Net Worth'!C15,"#,##0")&" / $6.5M)")`, 'Total includes residence value');

  r++;
  section(r++, 'OVERALL VERDICT');
  // WOSB verdict
  const row = ws.getRow(r);
  row.height = 40;
  row.getCell(2).value = 'WOSB Self-Cert Ready?';
  row.getCell(2).font = { name: 'Helvetica', bold: true, size: 11, color: { argb: WHITE } };
  fillCell(row.getCell(2), SLATE);
  row.getCell(2).alignment = { vertical: 'middle', indent: 1 };
  ws.mergeCells(`C${r}:D${r}`);
  row.getCell(3).value = {
    formula: 'IF(AND(COUNTIF(WOSBCore,"Y")=9,COUNTIF(WOSBControl,"Y")>=5),"READY — Go update SAM.gov reps & certs","NOT READY — Resolve gaps in WOSB Eligibility tab first")',
    result: '',
  };
  row.getCell(3).font = { name: 'Helvetica', bold: true, size: 12, color: { argb: SLATE } };
  row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  fillCell(row.getCell(3), EMERALD_TINT);
  thinBorder(row.getCell(3));
  r++;

  // EDWOSB verdict
  const row2 = ws.getRow(r);
  row2.height = 40;
  row2.getCell(2).value = 'EDWOSB Self-Cert Ready?';
  row2.getCell(2).font = { name: 'Helvetica', bold: true, size: 11, color: { argb: WHITE } };
  fillCell(row2.getCell(2), SLATE);
  row2.getCell(2).alignment = { vertical: 'middle', indent: 1 };
  ws.mergeCells(`C${r}:D${r}`);
  row2.getCell(3).value = {
    formula: `IF(AND(COUNTIF(WOSBCore,"Y")=9,COUNTIF(EDWOSBTests,"Y")=5,'EDWOSB Net Worth'!C33<850000,'EDWOSB Net Worth'!F7<400000,'EDWOSB Net Worth'!C15<6500000),"READY — Self-certify EDWOSB on SAM.gov","NOT READY — Check Net Worth tab + EDWOSB section above")`,
    result: '',
  };
  row2.getCell(3).font = { name: 'Helvetica', bold: true, size: 12, color: { argb: SLATE } };
  row2.getCell(3).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  fillCell(row2.getCell(3), EMERALD_TINT);
  thinBorder(row2.getCell(3));
  r++;

  r++;
  ws.mergeCells(`B${r}:D${r}`);
  const next = ws.getCell(`B${r}`);
  next.value = 'NEXT STEPS IF YOU ARE READY';
  next.font = { name: 'Helvetica', bold: true, size: 10, color: { argb: WHITE } };
  fillCell(next, SLATE);
  next.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(r).height = 22;
  r++;

  const steps = [
    '1. Log into SAM.gov with your Entity Administrator account.',
    '2. Go to Entity Management, select your entity, click Update.',
    '3. Navigate to Section 3: Representations and Certifications.',
    '4. Find FAR 52.219-22 (Small Business Status) and the WOSB / EDWOSB representations under FAR 52.212-3(c)(8).',
    '5. Mark Yes for WOSB. If your EDWOSB verdict is READY, also mark Yes for EDWOSB.',
    '6. Save and submit. The certification takes effect within 24 hours.',
    '7. Keep every document on the Document Checklist tab on file for at least 6 years.',
    '8. Add a calendar reminder to renew SAM.gov registration annually — lapsed registrations void the cert.',
  ];
  for (const step of steps) {
    ws.mergeCells(`B${r}:D${r}`);
    const c = ws.getCell(`B${r}`);
    c.value = step;
    c.font = { name: 'Helvetica', size: 9, color: { argb: SLATE } };
    c.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    ws.getRow(r).height = 20;
    r++;
  }

  // Conditional formatting for verdict cells (search wider range to catch them)
  // The verdict cells contain "READY" or "NOT READY"
  ws.addConditionalFormatting({
    ref: `C${r - 16}:D${r}`,
    rules: [
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'NOT READY',
        priority: 1,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED_TINT } }, font: { color: { argb: RED }, bold: true } },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'READY',
        priority: 2,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_TINT } }, font: { color: { argb: GREEN }, bold: true } },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'FAIL',
        priority: 3,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED_TINT } }, font: { color: { argb: RED }, bold: true } },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'PASS',
        priority: 4,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_TINT } }, font: { color: { argb: GREEN }, bold: true } },
      },
    ],
  });

  ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];
  setPrint(ws);
}

// ============================================================
// SAVE
// ============================================================
await wb.xlsx.writeFile(OUTPUT);
console.log(`Wrote ${OUTPUT}`);
