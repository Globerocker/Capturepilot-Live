// SAM.gov Pre-Registration Checklist - rebuild script
// Produces FLK_01_SAM_PreReg_Checklist.xlsx with live formulas, validation, dashboards.
// Run: node sam-prereg-checklist.build.mjs

import ExcelJS from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'FLK_01_SAM_PreReg_Checklist.xlsx');

// ---------- Brand ----------
const C = {
  navy:    'FF0B2A4A',
  emerald: 'FF10B981',
  emeraldSoft: 'FFD1FAE5',
  amber:   'FFF59E0B',
  amberSoft: 'FFFEF3C7',
  red:     'FFDC2626',
  redSoft: 'FFFEE2E2',
  ink:     'FF111827',
  mute:    'FF6B7280',
  line:    'FFE5E7EB',
  zebra:   'FFF9FAFB',
  white:   'FFFFFFFF',
  paper:   'FFFAFAF9',
};

const wb = new ExcelJS.Workbook();
wb.creator = 'CapturePilot';
wb.company = 'CapturePilot';
wb.created = new Date();
wb.title = 'SAM.gov Pre-Registration Checklist';
wb.subject = 'Federal Launch Kit Doc 01-B';

// ---------- helpers ----------
const thinBorder = {
  top:    { style: 'thin', color: { argb: C.line } },
  bottom: { style: 'thin', color: { argb: C.line } },
  left:   { style: 'thin', color: { argb: C.line } },
  right:  { style: 'thin', color: { argb: C.line } },
};
const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
const accentFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.emerald } };
const zebraFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };

function brandHeader(ws, title, subtitle) {
  ws.mergeCells('A1:F1');
  const r1 = ws.getCell('A1');
  r1.value = `CAPTUREPILOT  ·  ${title}`;
  r1.font = { name: 'Calibri', size: 16, bold: true, color: { argb: C.white } };
  r1.fill = headFill;
  r1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:F2');
  const r2 = ws.getCell('A2');
  r2.value = subtitle;
  r2.font = { name: 'Calibri', size: 10, italic: true, color: { argb: C.white } };
  r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ink } };
  r2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 18;
}

function brandFooter(ws) {
  ws.headerFooter.oddFooter =
    '&L&"Calibri"&9&K6B7280CapturePilot Federal Launch Kit · Doc 01-B' +
    '&C&"Calibri"&9&K6B7280capturepilot.com' +
    '&R&"Calibri"&9&K6B7280Page &P of &N';
  ws.pageSetup = {
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9, // Letter
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    printTitlesRow: '1:4',
  };
}

function sectionRow(ws, rowNum, label) {
  ws.mergeCells(`A${rowNum}:F${rowNum}`);
  const c = ws.getCell(`A${rowNum}`);
  c.value = label;
  c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } };
  c.fill = accentFill;
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(rowNum).height = 22;
}

// ============================================================
// TAB 1 — DASHBOARD (summary view)
// ============================================================
const dash = wb.addWorksheet('Dashboard', {
  properties: { tabColor: { argb: C.emerald } },
  views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
});
dash.columns = [
  { width: 4 }, { width: 28 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
];

brandHeader(dash, 'SAM Pre-Reg Dashboard', 'Live readiness score · auto-calculated from your Checklist tab');

dash.mergeCells('A4:F4');
dash.getCell('A4').value = 'Update statuses on the Checklist tab. This page recalculates instantly.';
dash.getCell('A4').font = { name: 'Calibri', size: 10, italic: true, color: { argb: C.mute } };
dash.getCell('A4').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

// KPI cards (rows 6-9)
function kpiCard(rowStart, col, label, formula, fillArgb, valFmt) {
  const labelCell = dash.getCell(rowStart, col);
  const valCell   = dash.getCell(rowStart + 1, col);
  labelCell.value = label;
  labelCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.white } };
  labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
  labelCell.alignment = { vertical: 'middle', horizontal: 'center' };
  labelCell.border = thinBorder;
  valCell.value = { formula };
  valCell.numFmt = valFmt;
  valCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: C.ink } };
  valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.white } };
  valCell.alignment = { vertical: 'middle', horizontal: 'center' };
  valCell.border = thinBorder;
  dash.getRow(rowStart).height = 18;
  dash.getRow(rowStart + 1).height = 36;
}

kpiCard(6, 2, 'TOTAL ITEMS',         'COUNTA(Checklist!D6:D45)',                                 C.ink, '0');
kpiCard(6, 3, 'DONE',                'COUNTIF(Checklist!E6:E45,"Done")',                         C.emerald, '0');
kpiCard(6, 4, 'TO GET',              'COUNTIF(Checklist!E6:E45,"Need to get")',                  C.amber, '0');
kpiCard(6, 5, 'BLOCKED / N/A',       'COUNTIF(Checklist!E6:E45,"N/A")',                          C.mute, '0');
kpiCard(6, 6, 'READINESS',           'IFERROR(COUNTIF(Checklist!E6:E45,"Done")/COUNTA(Checklist!D6:D45),0)', C.navy, '0%');

// Required-only completion (row 10-11)
dash.mergeCells('B10:F10');
dash.getCell('B10').value = 'REQUIRED-ONLY COMPLETION (excludes optional + if-applicable rows)';
dash.getCell('B10').font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.white } };
dash.getCell('B10').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
dash.getCell('B10').alignment = { vertical: 'middle', horizontal: 'center' };

dash.mergeCells('B11:F11');
const reqCell = dash.getCell('B11');
reqCell.value = { formula: 'IFERROR(COUNTIFS(Checklist!D6:D45,"Required",Checklist!E6:E45,"Done")/COUNTIF(Checklist!D6:D45,"Required"),0)' };
reqCell.numFmt = '0%';
reqCell.font = { name: 'Calibri', size: 28, bold: true, color: { argb: C.emerald } };
reqCell.alignment = { vertical: 'middle', horizontal: 'center' };
reqCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.emeraldSoft } };
dash.getRow(10).height = 16;
dash.getRow(11).height = 40;

// Section breakdown header
dash.mergeCells('B13:F13');
dash.getCell('B13').value = 'PER-SECTION BREAKDOWN';
dash.getCell('B13').font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } };
dash.getCell('B13').fill = accentFill;
dash.getCell('B13').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
dash.getRow(13).height = 20;

const sectionRows = [
  { name: '1. Legal & Business Identity',  range: 'F6:F12'  },
  { name: '2. Points of Contact',           range: 'F13:F17' },
  { name: '3. NAICS Codes',                 range: 'F18:F21' },
  { name: '4. Banking & Payment (EFT)',     range: 'F22:F26' },
  { name: '5. Set-Aside Certifications',    range: 'F27:F31' },
  { name: '6. login.gov Account',           range: 'F32:F36' },
  { name: '7. Notarized Letter',            range: 'F37:F41' },
  { name: '8. Optional / Products Sellers', range: 'F42:F45' },
];

// header
dash.getCell('B14').value = 'Section';
dash.getCell('C14').value = 'Items';
dash.getCell('D14').value = 'Done';
dash.getCell('E14').value = 'Remaining';
dash.getCell('F14').value = '% Complete';
['B14','C14','D14','E14','F14'].forEach(addr => {
  const c = dash.getCell(addr);
  c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ink } };
  c.alignment = { vertical: 'middle', horizontal: 'center' };
  c.border = thinBorder;
});

// Section ranges in Checklist tab (column E holds status). Map to actual rows:
const checklistSections = [
  { name: '1. Legal & Business Identity',  start: 6,  end: 12 },
  { name: '2. Points of Contact',           start: 14, end: 17 },
  { name: '3. NAICS Codes',                 start: 19, end: 21 },
  { name: '4. Banking & Payment (EFT)',     start: 23, end: 26 },
  { name: '5. Set-Aside Certifications',    start: 28, end: 31 },
  { name: '6. login.gov Account',           start: 33, end: 36 },
  { name: '7. Notarized Letter',            start: 38, end: 41 },
  { name: '8. Optional / Products Sellers', start: 43, end: 45 },
];

checklistSections.forEach((s, i) => {
  const r = 15 + i;
  const rng = `Checklist!E${s.start}:E${s.end}`;
  dash.getCell(`B${r}`).value = s.name;
  dash.getCell(`B${r}`).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  dash.getCell(`C${r}`).value = { formula: `COUNTA(Checklist!D${s.start}:D${s.end})` };
  dash.getCell(`D${r}`).value = { formula: `COUNTIF(${rng},"Done")` };
  dash.getCell(`E${r}`).value = { formula: `COUNTIF(${rng},"Need to get")` };
  dash.getCell(`F${r}`).value = { formula: `IFERROR(COUNTIF(${rng},"Done")/COUNTA(Checklist!D${s.start}:D${s.end}),0)` };
  dash.getCell(`F${r}`).numFmt = '0%';
  ['C','D','E','F'].forEach(col => {
    dash.getCell(`${col}${r}`).alignment = { vertical: 'middle', horizontal: 'center' };
  });
  ['B','C','D','E','F'].forEach(col => {
    dash.getCell(`${col}${r}`).border = thinBorder;
    if (i % 2 === 1) dash.getCell(`${col}${r}`).fill = zebraFill;
  });
  dash.getRow(r).height = 18;
});

// Conditional formatting on Dashboard F column (per-section %)
dash.addConditionalFormatting({
  ref: `F15:F${15 + checklistSections.length - 1}`,
  rules: [
    { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [1], priority: 1,
      style: { font: { bold: true, color: { argb: C.emerald } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.emeraldSoft } } } },
    { type: 'cellIs', operator: 'between', formulae: [0.5, 0.999], priority: 2,
      style: { font: { bold: true, color: { argb: C.amber } } } },
    { type: 'cellIs', operator: 'lessThan', formulae: [0.5], priority: 3,
      style: { font: { bold: true, color: { argb: C.red } } } },
  ],
});

// Big readiness status (row 24+)
const statusRow = 16 + checklistSections.length;
dash.mergeCells(`B${statusRow}:F${statusRow}`);
dash.getCell(`B${statusRow}`).value = 'OVERALL STATUS';
dash.getCell(`B${statusRow}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } };
dash.getCell(`B${statusRow}`).fill = accentFill;
dash.getCell(`B${statusRow}`).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
dash.getRow(statusRow).height = 20;

dash.mergeCells(`B${statusRow + 1}:F${statusRow + 1}`);
const status = dash.getCell(`B${statusRow + 1}`);
status.value = {
  formula:
    'IF(COUNTIFS(Checklist!D6:D45,"Required",Checklist!E6:E45,"Done")=COUNTIF(Checklist!D6:D45,"Required"),' +
    '"READY — open sam.gov and start your registration",' +
    'IF(COUNTIFS(Checklist!D6:D45,"Required",Checklist!E6:E45,"Done")/COUNTIF(Checklist!D6:D45,"Required")>=0.7,' +
    '"ALMOST THERE — finish the last few required items first",' +
    '"NOT YET — keep collecting documents. Do not start SAM.gov until required items are Done."))',
};
status.font = { name: 'Calibri', size: 14, bold: true, color: { argb: C.ink } };
status.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
status.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.paper } };
dash.getRow(statusRow + 1).height = 46;

dash.addConditionalFormatting({
  ref: `B${statusRow + 1}:F${statusRow + 1}`,
  rules: [
    { type: 'containsText', operator: 'containsText', text: 'READY —', priority: 1,
      style: { font: { bold: true, color: { argb: C.emerald } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.emeraldSoft } } } },
    { type: 'containsText', operator: 'containsText', text: 'ALMOST', priority: 2,
      style: { font: { bold: true, color: { argb: C.amber } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.amberSoft } } } },
    { type: 'containsText', operator: 'containsText', text: 'NOT YET', priority: 3,
      style: { font: { bold: true, color: { argb: C.red } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.redSoft } } } },
  ],
});

brandFooter(dash);

// ============================================================
// TAB 2 — CHECKLIST (the working sheet)
// ============================================================
const ws = wb.addWorksheet('Checklist', {
  properties: { tabColor: { argb: C.navy } },
  views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
});
ws.columns = [
  { width: 4  },   // A index
  { width: 38 },   // B item
  { width: 46 },   // C notes
  { width: 16 },   // D required
  { width: 16 },   // E status
  { width: 28 },   // F owner / due
];

brandHeader(ws, 'SAM.gov Pre-Registration Checklist',
  'Gather everything below BEFORE opening SAM.gov  ·  Federal Launch Kit Doc 01-B  ·  capturepilot.com');

// Warning band row 3
ws.mergeCells('A3:F3');
const warn = ws.getCell('A3');
warn.value = 'Heads up: SAM.gov registration is free. Never pay a third party. Starting without these documents causes mid-registration errors that lose your session.';
warn.font = { name: 'Calibri', size: 10, italic: true, color: { argb: C.ink } };
warn.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.amberSoft } };
warn.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
ws.getRow(3).height = 30;

// Table header row 5
const headers = ['#', 'Item to Gather', 'Where to Find It · Notes', 'Required?', 'My Status', 'Owner / Due Date'];
headers.forEach((h, i) => {
  const c = ws.getCell(5, i + 1);
  c.value = h;
  c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ink } };
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  c.border = thinBorder;
});
ws.getRow(5).height = 22;

// Items array. Each entry is [item, notes, required] OR { section: 'name' } for a section divider.
const items = [
  { section: '  SECTION 1 — Legal & Business Identity' },
  ['Exact legal business name from IRS records',     'Pull from IRS Letter CP 575 or 147C. Copy character-for-character including commas, periods, spacing.', 'Required'],
  ['EIN / TIN (Employer Identification Number)',     'From your IRS EIN confirmation letter. Call IRS at 1-800-829-4933 if you need a copy (Letter 147C).', 'Required'],
  ['Business start date (legal formation date)',     'The date on your Secretary of State incorporation documents. NOT the date you started operations.', 'Required'],
  ['Physical business street address',               'PO Boxes are not accepted. Use a registered agent address if you need privacy protection.', 'Required'],
  ['Fiscal year end date',                            'Usually December 31. Must match your tax year end.', 'Required'],
  ['Business entity type',                            'LLC, S-Corp, C-Corp, Sole Proprietor, Partnership, Nonprofit, etc.', 'Required'],
  ['State of incorporation / formation',              'Found on your Secretary of State registration documents.', 'Required'],

  { section: '  SECTION 2 — Points of Contact (3 Required)' },
  ['Entity Administrator: name and email',           'Person managing the SAM.gov account. Must match the email on your login.gov account. Use a monitored inbox.', 'Required'],
  ['Government Business POC: name, title, phone, email', 'Primary contracting contact. Appears publicly in your registration. Contracting Officers will reach you here.', 'Required'],
  ['Electronic Business POC: name, title, phone, email', 'Contact for invoicing and electronic transactions. Can be the same person as the Government Business POC.', 'Required'],
  ['Accounts Receivable POC: name, title, phone, email', 'Payment processing contact. For small businesses, all three POC roles can be the same person.', 'Required'],

  { section: '  SECTION 3 — NAICS Codes (Industry Classification)' },
  ['Primary NAICS code (6-digit)',                    'The code for your main line of business. Look up at census.gov/naics or use CapturePilot NAICS Picker (Doc 01-C).', 'Required'],
  ['SBA size standard for your primary NAICS',        'Check sba.gov/size-standards. Determines if you qualify as Small. Based on revenue or employees depending on industry.', 'Required'],
  ['Additional NAICS codes for other services',       'Add every relevant code. Agencies filter by NAICS when searching vendors. More codes mean more visibility.', 'Recommended'],

  { section: '  SECTION 4 — Banking & Payment (EFT)' },
  ['Bank routing number (9-digit ABA number)',        'Found on your checks (first 9 digits at the bottom). Read each digit back before entering.', 'Required'],
  ['Bank account number',                             'Business checking or savings account. Errors cause payment failures after award.', 'Required'],
  ['Account type (checking or savings)',              'Typically checking for business accounts.', 'Required'],
  ['Bank name, full address, and phone number',       'Legal bank name and branch address. Not just "Chase" — the full entity name.', 'Required'],

  { section: '  SECTION 5 — Set-Aside Certifications (If Applicable)' },
  ['8(a) certification letter (SBA-issued)',          'Only if you already have active 8(a) status. Apply at certify.sba.gov after SAM activation if you qualify.', 'If applicable'],
  ['HUBZone certification letter (SBA-issued)',       'SBA-certified only. Verify your office and employees are in a HUBZone at certify.sba.gov.', 'If applicable'],
  ['WOSB / EDWOSB certification letter (SBA-issued)', 'Women-owned. SBA certification required since 2020 — self-certification is no longer accepted.', 'If applicable'],
  ['VOSB / SDVOSB VA CVE verification letter',        'Veteran-owned or service-disabled veteran-owned. CVE verified at veteransmallbizce.va.gov.', 'If applicable'],

  { section: '  SECTION 6 — login.gov Account (Complete Before SAM.gov)' },
  ['login.gov account created',                       'Use your Entity Administrator email. Same address that will own your SAM.gov account.', 'Required'],
  ['2-Factor Authentication (2FA) enabled',           'Use an authenticator app (Google Authenticator or Authy). Not SMS, which can fail mid-registration.', 'Required'],
  ['Identity verification completed on login.gov',    'Requires a government-issued photo ID (driver\'s license or passport). Takes about 10 minutes.', 'Required'],
  ['Backup codes downloaded and stored safely',       'If you lose your 2FA device, backup codes are your only recovery option. Store offline.', 'Required'],

  { section: '  SECTION 7 — Notarized Entity Administrator Letter' },
  ['GSA Notarized Letter template downloaded',        'Search "Entity Registration Notarized Letter" at fsd.gov. Only the official GSA template is accepted.', 'Required'],
  ['Company letterhead prepared (logo + address)',    'The letter must be on official company letterhead. Create one in Word or Canva if you do not have one.', 'Required'],
  ['Notary public arranged (in-person or RON)',       'Use a local bank, UPS Store, or Remote Online Notarization service. RON accepted as of 2026.', 'Required'],
  ['High-quality scanner or camera ready',            'Scan at 300 DPI minimum. Notary seal must be fully legible — blurry seals are the top rejection reason.', 'Required'],

  { section: '  SECTION 8 — Optional / Products Sellers Only' },
  ['PSC Codes (Product Service Codes)',               'Required only if selling physical products. Service businesses skip this. Look up at acquisition.gov/psc-manual.', 'If applicable'],
  ['GSA Schedule contract number',                    'If you already have a GSA Schedule contract, enter the number in Core Data.', 'If applicable'],
  ['Prior CAGE Code (if you were registered before)', 'Your CAGE code persists across re-registrations. Find it at sam.gov entity search.', 'If applicable'],
];

let row = 6;
let idx = 1;
items.forEach((it) => {
  if (it.section) {
    sectionRow(ws, row, it.section);
    row++;
    return;
  }
  const [item, notes, required] = it;
  ws.getCell(`A${row}`).value = idx;
  ws.getCell(`A${row}`).font = { name: 'Calibri', size: 9, color: { argb: C.mute } };
  ws.getCell(`A${row}`).alignment = { vertical: 'middle', horizontal: 'center' };

  ws.getCell(`B${row}`).value = item;
  ws.getCell(`B${row}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.ink } };
  ws.getCell(`B${row}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

  ws.getCell(`C${row}`).value = notes;
  ws.getCell(`C${row}`).font = { name: 'Calibri', size: 10, color: { argb: C.ink } };
  ws.getCell(`C${row}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

  ws.getCell(`D${row}`).value = required;
  ws.getCell(`D${row}`).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(`D${row}`).alignment = { vertical: 'middle', horizontal: 'center' };

  ws.getCell(`E${row}`).value = '';
  ws.getCell(`E${row}`).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getCell(`E${row}`).font = { name: 'Calibri', size: 10, bold: true };

  ws.getCell(`F${row}`).value = '';
  ws.getCell(`F${row}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
  ws.getCell(`F${row}`).font = { name: 'Calibri', size: 9, color: { argb: C.mute } };

  ['A','B','C','D','E','F'].forEach(col => {
    ws.getCell(`${col}${row}`).border = thinBorder;
    if (idx % 2 === 0) {
      const cur = ws.getCell(`${col}${row}`).fill;
      if (!cur || cur.type !== 'pattern' || cur.fgColor?.argb !== C.emerald) {
        ws.getCell(`${col}${row}`).fill = zebraFill;
      }
    }
  });
  ws.getRow(row).height = 34;
  row++;
  idx++;
});

// Final ready-to-launch banner
ws.mergeCells(`A${row + 1}:F${row + 1}`);
const launch = ws.getCell(`A${row + 1}`);
launch.value = 'When all required items show "Done" — go to sam.gov  >  Register Your Entity  >  Get Started';
launch.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } };
launch.fill = accentFill;
launch.alignment = { vertical: 'middle', horizontal: 'center' };
ws.getRow(row + 1).height = 26;

// Data validation: status column (E) for every data row
ws.dataValidations.add(`E6:E45`, {
  type: 'list',
  allowBlank: true,
  formulae: ['"Done,Need to get,N/A"'],
  showErrorMessage: true,
  errorStyle: 'warning',
  errorTitle: 'Pick from the list',
  error: 'Use Done, Need to get, or N/A.',
});

// Data validation: Required column (D)
ws.dataValidations.add(`D6:D45`, {
  type: 'list',
  allowBlank: true,
  formulae: ['"Required,Recommended,If applicable,Optional"'],
});

// Conditional formatting on Status column (E)
ws.addConditionalFormatting({
  ref: 'E6:E45',
  rules: [
    { type: 'containsText', operator: 'containsText', text: 'Done', priority: 1,
      style: { font: { bold: true, color: { argb: C.emerald } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.emeraldSoft } } } },
    { type: 'containsText', operator: 'containsText', text: 'Need to get', priority: 2,
      style: { font: { bold: true, color: { argb: C.amber } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.amberSoft } } } },
    { type: 'containsText', operator: 'containsText', text: 'N/A', priority: 3,
      style: { font: { color: { argb: C.mute } } } },
  ],
});

// Conditional formatting on Required column (D)
ws.addConditionalFormatting({
  ref: 'D6:D45',
  rules: [
    { type: 'containsText', operator: 'containsText', text: 'Required', priority: 1,
      style: { font: { color: { argb: C.red }, bold: true } } },
    { type: 'containsText', operator: 'containsText', text: 'Recommended', priority: 2,
      style: { font: { color: { argb: C.amber }, bold: true } } },
    { type: 'containsText', operator: 'containsText', text: 'If applicable', priority: 3,
      style: { font: { color: { argb: C.mute }, italic: true } } },
  ],
});

// Named ranges (cleaner formulas in Excel and Sheets)
wb.definedNames.add('Checklist!$E$6:$E$45', 'StatusRange');
wb.definedNames.add('Checklist!$D$6:$D$45', 'RequiredRange');

brandFooter(ws);

// ============================================================
// TAB 3 — QUICK REFERENCE
// ============================================================
const ref = wb.addWorksheet('Quick Reference', {
  properties: { tabColor: { argb: C.amber } },
  views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
});
ref.columns = [
  { width: 4 }, { width: 32 }, { width: 60 }, { width: 6 },
];

brandHeader(ref, 'Quick Reference', 'Key facts, contacts, and links · keep this tab open while you register');

let rr = 5;
function refSection(title) {
  ref.mergeCells(`A${rr}:D${rr}`);
  const c = ref.getCell(`A${rr}`);
  c.value = title;
  c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } };
  c.fill = accentFill;
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ref.getRow(rr).height = 22;
  rr++;
}
function refRow(label, value, zebra) {
  ref.getCell(`B${rr}`).value = label;
  ref.getCell(`B${rr}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.ink } };
  ref.getCell(`B${rr}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
  ref.getCell(`C${rr}`).value = value;
  ref.getCell(`C${rr}`).font = { name: 'Calibri', size: 10, color: { argb: C.ink } };
  ref.getCell(`C${rr}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
  ['B','C'].forEach(col => {
    ref.getCell(`${col}${rr}`).border = thinBorder;
    if (zebra) ref.getCell(`${col}${rr}`).fill = zebraFill;
  });
  ref.getRow(rr).height = 22;
  rr++;
}

refSection('KEY FACTS');
[
  ['Cost', '$0 — registration is always free. Never pay a third party.'],
  ['UEI format', '12-character alphanumeric (e.g. A1B2C3D4E5F6)'],
  ['CAGE code', 'Assigned automatically for U.S. entities within 3-5 business days'],
  ['Activation timeline', '10-14 business days after complete submission + notarized letter'],
  ['Registration validity', '365 days — must renew annually'],
  ['Renewal window', 'Opens 60 days before expiration. Renew early.'],
  ['Notarized letter', 'Submit to FSD.gov the same day you register. Do not wait for a reminder.'],
  ['2FA method', 'Use authenticator app, not SMS text messages'],
  ['Address requirement', 'Physical street address only. PO Boxes are rejected.'],
  ['IRS name match', 'Must match IRS records exactly including commas and punctuation'],
].forEach(([l, v], i) => refRow(l, v, i % 2 === 1));

refSection('CONTACTS & LINKS');
[
  ['SAM.gov registration', 'sam.gov/content/entity-registration'],
  ['Federal Service Desk',  'fsd.gov   ·   Phone: 866-606-8220   ·   M-F 8 AM to 8 PM ET'],
  ['login.gov',             'login.gov/create-an-account'],
  ['IRS Letter 147C',       'Call 1-800-829-4933  >  Option 1  >  Option 3'],
  ['SBA size standards',    'sba.gov/federal-contracting/contracting-guide/size-standards'],
  ['SBA Certify (8a, HUBZone, WOSB)', 'certify.sba.gov'],
  ['VA CVE (SDVOSB)',       'veteransmallbizce.va.gov'],
  ['NAICS code lookup',     'census.gov/naics'],
  ['PSC manual',            'acquisition.gov/psc-manual'],
  ['CapturePilot daily matches', 'capturepilot.com'],
].forEach(([l, v], i) => refRow(l, v, i % 2 === 1));

refSection('REGISTRATION STATUS GUIDE');
[
  ['Draft',            'You started but have not submitted. Session expires in 30 days.'],
  ['Submitted',        'In review queue. Do not bid on contracts yet.'],
  ['Work in Progress', 'A reviewer flagged an issue. Check your email immediately.'],
  ['Active',           'Registration complete. You can now bid on federal contracts.'],
  ['Expired',          'Renewal overdue. Renew immediately. Active contracts may be paused.'],
].forEach(([l, v], i) => refRow(l, v, i % 2 === 1));

brandFooter(ref);

// ============================================================
// TAB 4 — TIMELINE
// ============================================================
const tl = wb.addWorksheet('Timeline', {
  properties: { tabColor: { argb: C.red } },
  views: [{ state: 'frozen', ySplit: 6, showGridLines: false }],
});
tl.columns = [
  { width: 4 }, { width: 16 }, { width: 44 }, { width: 16 }, { width: 16 }, { width: 36 },
];

brandHeader(tl, 'Registration Timeline — 10 to 14 Business Days',
  'Track your progress · check sam.gov daily until status shows ACTIVE');

// Input row: registration start date
tl.mergeCells('B4:F4');
tl.getCell('B4').value = 'Set your kickoff date below. Estimated dates auto-calculate from it.';
tl.getCell('B4').font = { name: 'Calibri', size: 10, italic: true, color: { argb: C.mute } };

tl.getCell('B5').value = 'Kickoff date:';
tl.getCell('B5').font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.ink } };
tl.getCell('B5').alignment = { vertical: 'middle', horizontal: 'right' };
tl.getCell('C5').value = new Date();
tl.getCell('C5').numFmt = 'yyyy-mm-dd';
tl.getCell('C5').font = { name: 'Calibri', size: 12, bold: true, color: { argb: C.emerald } };
tl.getCell('C5').alignment = { vertical: 'middle', horizontal: 'left' };
tl.getCell('C5').border = thinBorder;
tl.getCell('C5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.emeraldSoft } };
wb.definedNames.add('Timeline!$C$5', 'KickoffDate');

// Table header
const tlHeaders = ['#', 'Phase', 'Action', 'Est. Time', 'Est. Date', 'Notes / What to Watch For'];
tlHeaders.forEach((h, i) => {
  const c = tl.getCell(6, i + 1);
  c.value = h;
  c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ink } };
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  c.border = thinBorder;
});
tl.getRow(6).height = 22;

// Timeline rows. offset = business days after kickoff (negative = before).
const phases = [
  ['Before Day 1', 'Gather all documents from Pre-Registration Checklist', '60-90 min', -7, 'Complete the Checklist tab fully before opening SAM.gov.'],
  ['Before Day 1', 'Create login.gov account, enable 2FA, verify identity', '30-60 min', -5, 'Use authenticator app for 2FA. Have your photo ID ready.'],
  ['Before Day 1', 'Download Notarized Letter template from FSD.gov',       '15 min',    -3, 'Download fresh each time — only use the current official template.'],
  ['Day 1',       'Start entity registration at sam.gov',                    '45-90 min',  0, 'Save progress frequently. The session times out after inactivity.'],
  ['Day 1',       'UEI auto-generated after EIN validates',                  'Same day',   0, 'Save your UEI immediately. Use it on all proposals going forward.'],
  ['Day 1',       'Complete and notarize Entity Administrator Letter',       '1-3 hours',  1, 'RON (Remote Online Notarization) accepted as of 2026.'],
  ['Day 1',       'Submit Notarized Letter to FSD.gov as a case',            '15 min',     1, 'Save your FSD case number. This is your tracking ID.'],
  ['Days 1-2',    'IRS validates EIN against legal business name',            '1-2 biz days', 2, 'If rejected, check name match against IRS Letter 147C exactly.'],
  ['Days 3-5',    'CAGE Code assigned automatically by DLA',                  '3-5 biz days', 5, 'No action needed. Happens in the background.'],
  ['Days 3-7',    'FSD reviews and processes Notarized Letter',               '3-7 biz days', 7, 'Call 866-606-8220 with your case number if no update after 7 days.'],
  ['Days 7-14',   'Federal review and final activation processing',           '7-10 biz days', 11, 'Check sam.gov daily. Status changes to ACTIVE when complete.'],
  ['Day 10-14',   'Status changes to ACTIVE — registration complete',         'Done!',      14, 'You can now respond to opportunities and receive contract awards.'],
  ['Day 14+',     'Set annual renewal reminder on your calendar',              '5 min',      15, 'Renewal window opens 60 days before your expiration date.'],
];

let tr = 7;
phases.forEach((p, i) => {
  const [phase, action, est, offset, notes] = p;
  tl.getCell(`A${tr}`).value = i + 1;
  tl.getCell(`A${tr}`).font = { name: 'Calibri', size: 9, color: { argb: C.mute } };
  tl.getCell(`A${tr}`).alignment = { vertical: 'middle', horizontal: 'center' };

  tl.getCell(`B${tr}`).value = phase;
  tl.getCell(`B${tr}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.navy } };
  tl.getCell(`B${tr}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

  tl.getCell(`C${tr}`).value = action;
  tl.getCell(`C${tr}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.ink } };
  tl.getCell(`C${tr}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

  tl.getCell(`D${tr}`).value = est;
  tl.getCell(`D${tr}`).font = { name: 'Calibri', size: 10, color: { argb: C.ink } };
  tl.getCell(`D${tr}`).alignment = { vertical: 'middle', horizontal: 'center' };

  // Est. Date = WORKDAY(KickoffDate, offset) — works in Excel and Sheets
  tl.getCell(`E${tr}`).value = { formula: `WORKDAY(KickoffDate, ${offset})` };
  tl.getCell(`E${tr}`).numFmt = 'yyyy-mm-dd';
  tl.getCell(`E${tr}`).font = { name: 'Calibri', size: 10, color: { argb: C.ink } };
  tl.getCell(`E${tr}`).alignment = { vertical: 'middle', horizontal: 'center' };

  tl.getCell(`F${tr}`).value = notes;
  tl.getCell(`F${tr}`).font = { name: 'Calibri', size: 9, color: { argb: C.ink } };
  tl.getCell(`F${tr}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

  ['A','B','C','D','E','F'].forEach(col => {
    tl.getCell(`${col}${tr}`).border = thinBorder;
    if (i % 2 === 1) tl.getCell(`${col}${tr}`).fill = zebraFill;
  });
  tl.getRow(tr).height = 30;
  tr++;
});

// Highlight "today vs estimated date" with conditional formatting on column E
tl.addConditionalFormatting({
  ref: `E7:E${tr - 1}`,
  rules: [
    { type: 'expression', formulae: [`E7<TODAY()`], priority: 1,
      style: { font: { color: { argb: C.mute }, italic: true } } },
    { type: 'expression', formulae: [`E7=TODAY()`], priority: 2,
      style: { font: { bold: true, color: { argb: C.emerald } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.emeraldSoft } } } },
  ],
});

brandFooter(tl);

// ============================================================
// TAB 5 — INSTRUCTIONS
// ============================================================
const inst = wb.addWorksheet('Instructions', {
  properties: { tabColor: { argb: C.mute } },
  views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
});
inst.columns = [{ width: 4 }, { width: 100 }];
brandHeader(inst, 'How to use this workbook', 'Five tabs · one job · cuts the SAM.gov error rate in half');

const lines = [
  { kind: 'h', text: 'What this is' },
  { kind: 'p', text: 'A pre-flight checklist for SAM.gov entity registration. You collect everything on the Checklist tab BEFORE opening sam.gov. The Dashboard tab tells you when you are actually ready to start.' },
  { kind: 'h', text: 'The five tabs' },
  { kind: 'p', text: 'Dashboard — auto-calculated readiness score. Updates the moment you change a status on Checklist. Green when every required item is Done.' },
  { kind: 'p', text: 'Checklist — the working surface. 35 items across 8 sections. Set each "My Status" dropdown to Done, Need to get, or N/A.' },
  { kind: 'p', text: 'Quick Reference — every link, phone number, and fact you will need while filling out SAM.gov. Open this tab in a second window during registration.' },
  { kind: 'p', text: 'Timeline — set your kickoff date, the estimated dates for each phase recalculate automatically using WORKDAY (business days only).' },
  { kind: 'p', text: 'Instructions — this tab. Read it once.' },
  { kind: 'h', text: 'Workflow we recommend' },
  { kind: 'p', text: '1. Open the Checklist tab. Walk every row, set status to Done or Need to get. Assign an owner in the rightmost column if you are doing this with a team.' },
  { kind: 'p', text: '2. Check the Dashboard. Aim for 100% on the "Required-Only Completion" gauge before touching sam.gov. Items marked Recommended or If applicable do not block readiness.' },
  { kind: 'p', text: '3. Open Timeline, set your kickoff date in the green cell. The estimated dates show when each phase should complete.' },
  { kind: 'p', text: '4. Open sam.gov, register with the Quick Reference tab pinned in a second window.' },
  { kind: 'h', text: 'Why we built it this way' },
  { kind: 'p', text: 'I ran SAM.gov registrations for small businesses for two years before building CapturePilot. Same rejection reasons every time — EIN name mismatch by one comma, address listed as a PO Box, notary seal too blurry to scan. All preventable with a checklist done first. This is that checklist.' },
  { kind: 'p', text: 'A typical first-time SAM registration takes 10 to 14 business days from submission to ACTIVE. Add another 7 to 10 days if any document gets bounced. Get the documents right on the first try and you save two weeks.' },
  { kind: 'h', text: 'Compatibility' },
  { kind: 'p', text: 'Built to work in Microsoft Excel 2016+, Excel for Mac, Excel Online, and Google Sheets. All formulas avoid LAMBDA, XLOOKUP, and FILTER so older Excel does not choke. Dropdowns and conditional formatting survive both editors.' },
  { kind: 'h', text: 'Need more help' },
  { kind: 'p', text: 'Call the Federal Service Desk at 866-606-8220 (M-F 8 AM to 8 PM ET) or submit a case at fsd.gov. Both are free. For ongoing daily opportunity matches once you are registered, use capturepilot.com.' },
];

let ir = 5;
lines.forEach(l => {
  if (l.kind === 'h') {
    inst.mergeCells(`A${ir}:B${ir}`);
    const c = inst.getCell(`A${ir}`);
    c.value = l.text;
    c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: C.white } };
    c.fill = accentFill;
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    inst.getRow(ir).height = 24;
  } else {
    inst.getCell(`B${ir}`).value = l.text;
    inst.getCell(`B${ir}`).font = { name: 'Calibri', size: 11, color: { argb: C.ink } };
    inst.getCell(`B${ir}`).alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    inst.getRow(ir).height = 40;
  }
  ir++;
});

brandFooter(inst);

// Re-order: Dashboard first, then Checklist, Quick Reference, Timeline, Instructions
wb.worksheets.forEach((sheet, i) => { sheet.orderNo = i; });
// (exceljs writes worksheets in addWorksheet order; we added Dashboard first already.)

// ---------- write ----------
await wb.xlsx.writeFile(OUT);
console.log(`Wrote ${OUT}`);
