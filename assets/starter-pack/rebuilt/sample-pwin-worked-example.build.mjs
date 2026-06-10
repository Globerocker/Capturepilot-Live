// FLK_04_Sample_Filled_PWin_Worked_Example.xlsx
// Worked example of the PWin Calculator — filled-in for a hypothetical
// $1.2M IT modernization opportunity at the VA. Buyers copy this to see
// how a real scoring session looks.

import ExcelJS from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js';

const OUT = '/Users/andreschuler/Caturepilot 2.0/assets/starter-pack/rebuilt/FLK_04_Sample_Filled_PWin_Worked_Example.xlsx';
const DEPLOY = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/04_Bid_No_Bid_Decision_Toolkit/FLK_04_Sample_Filled_PWin_Worked_Example.xlsx';

const EMERALD = 'FF10B981';
const EMERALD_DARK = 'FF047857';
const SLATE_900 = 'FF0F172A';
const SLATE_100 = 'FFF1F5F9';
const SLATE_200 = 'FFE2E8F0';
const WHITE = 'FFFFFFFF';
const AMBER = 'FFF59E0B';
const RED = 'FFDC2626';
const GREEN_LIGHT = 'FFD1FAE5';

const wb = new ExcelJS.Workbook();
wb.creator = 'CapturePilot';
wb.created = new Date('2026-06-09T00:00:00Z');
wb.modified = new Date('2026-06-09T00:00:00Z');
wb.company = 'CapturePilot';

// ──────────────────────────────────────────────────────────────────────
// Shared "Lists" tab for cross-compat dropdowns (Excel + Google Sheets)
// ──────────────────────────────────────────────────────────────────────
function buildListsSheet(wb, lists) {
    let wsLists = wb.getWorksheet('Lists');
    if (!wsLists) wsLists = wb.addWorksheet('Lists', { views: [{ showGridLines: false }] });
    wsLists.columns = lists.map(() => ({ width: 28 }));
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
    });
    wsLists.state = 'veryHidden';
}

buildListsSheet(wb, [
    { name: 'ScoreZeroToTen', title: 'Score 0-10', items: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
    { name: 'WeightPriority', title: 'Weight Priority', items: ['Low', 'Medium', 'High', 'Critical'] },
]);

// ──────────────────────────────────────────────────────────────────────
// Sheet 1 — Opportunity Snapshot (filled in)
// ──────────────────────────────────────────────────────────────────────
const wsOpp = wb.addWorksheet('Opportunity', { views: [{ showGridLines: false }] });
wsOpp.columns = [{ width: 32 }, { width: 60 }];

function titleRow(ws, row, text, span = 'A1:B1') {
    ws.mergeCells(span);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { name: 'Calibri', bold: true, size: 16, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(row).height = 32;
}

function sectionHeader(ws, row, text, span) {
    ws.mergeCells(span);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { name: 'Calibri', bold: true, size: 11, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(row).height = 22;
}

function kv(ws, row, k, v, bold = false) {
    const a = ws.getCell(row, 1);
    a.value = k;
    a.font = { name: 'Calibri', bold: true, size: 10, color: { argb: SLATE_900 } };
    a.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_100 } };
    const b = ws.getCell(row, 2);
    b.value = v;
    b.font = { name: 'Calibri', size: 10, bold, color: { argb: SLATE_900 } };
    b.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
}

titleRow(wsOpp, 1, 'WORKED EXAMPLE — VA IT Modernization');
sectionHeader(wsOpp, 2, 'OPPORTUNITY SNAPSHOT', 'A2:B2');
kv(wsOpp, 3, 'Title', 'Enterprise Help Desk Modernization — Phoenix VAMC');
kv(wsOpp, 4, 'Agency', 'Department of Veterans Affairs (VA)');
kv(wsOpp, 5, 'Sub-agency', 'Veterans Health Administration / Phoenix VA Medical Center');
kv(wsOpp, 6, 'Notice ID', '36C26224R0145 (hypothetical)');
kv(wsOpp, 7, 'Notice Type', 'RFP — Sources Sought issued 90 days prior');
kv(wsOpp, 8, 'NAICS', '541512 — Computer Systems Design Services');
kv(wsOpp, 9, 'PSC', 'D310 — IT and Telecom Help Desk Services');
kv(wsOpp, 10, 'Set-Aside', 'SDVOSB sole-source under SAP threshold extended');
kv(wsOpp, 11, 'Contract Type', 'FFP — Firm Fixed Price');
kv(wsOpp, 12, 'Value', '$1,200,000 (base + 4 option years)');
kv(wsOpp, 13, 'Period of Performance', '12 months base + 4 × 12-month options', true);
kv(wsOpp, 14, 'Place of Performance', 'Phoenix VAMC + 3 community-based outpatient clinics');
kv(wsOpp, 15, 'Submission Due', '2026-08-15 11:59 PM ET');
kv(wsOpp, 16, 'Pre-Proposal Conference', '2026-07-22 (virtual)');
sectionHeader(wsOpp, 18, 'INCUMBENT INTEL', 'A18:B18');
kv(wsOpp, 19, 'Incumbent', 'Generic IT Services LLC (large business)');
kv(wsOpp, 20, 'Incumbent contract value', '$980k over prior 24 months');
kv(wsOpp, 21, 'Known issues', 'CPARS Marginal on Quality 2024; staffing turnover 40% in 2025');
kv(wsOpp, 22, 'Why this is re-competing now', 'Mandatory SDVOSB set-aside — incumbent not eligible');

// ──────────────────────────────────────────────────────────────────────
// Sheet 2 — PWin Scoring (filled in across 12 factors)
// ──────────────────────────────────────────────────────────────────────
const wsScore = wb.addWorksheet('PWin Scoring', { views: [{ showGridLines: false }] });
wsScore.columns = [
    { width: 4 }, { width: 26 }, { width: 10 }, { width: 8 }, { width: 10 }, { width: 50 },
];

titleRow(wsScore, 1, 'PWin SCORING — 12 FACTORS', 'A1:F1');

function scoreHeader(ws, row) {
    const headers = ['#', 'Factor', 'Weight %', 'Score 0-10', 'Weighted', 'Justification (filled in)'];
    headers.forEach((h, i) => {
        const c = ws.getCell(row, i + 1);
        c.value = h;
        c.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD } };
        c.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    ws.getRow(row).height = 22;
}

scoreHeader(wsScore, 2);

// 12-factor scoring (sample values for the worked example)
const factors = [
    { num: 1, name: 'Customer Relationship', w: 12, s: 8, just: 'CEO has met CO twice at SDVOSB Industry Day; submitted Sources Sought response that was cited verbatim in the draft RFP.' },
    { num: 2, name: 'Competitive Position', w: 10, s: 9, just: 'Incumbent ineligible (large biz). Only 3 known SDVOSB competitors; our team has 2 of their key personnel as references.' },
    { num: 3, name: 'Technical Fit', w: 15, s: 8, just: 'We hold 8(a)/SDVOSB + ITIL v4 + ISO 9001:2015. Existing ServiceNow practice. Solution PowerPoint already vetted by CO.' },
    { num: 4, name: 'Past Performance', w: 12, s: 7, just: '3 relevant federal IT past performance refs (DoD), all CPARS Very Good or Exceptional. None at VA — minor gap.' },
    { num: 5, name: 'Key Personnel', w: 10, s: 9, just: 'Locked in incumbent program manager + 2 of their lead engineers via letter of intent. Resumes 100% aligned to L.3 minimums.' },
    { num: 6, name: 'Price-to-Win', w: 15, s: 7, just: 'Independent rate research: $97/hr LCAT 3 vs. our $89/hr loaded. Headroom for 8% fee. Risk: option-year escalation.' },
    { num: 7, name: 'Teaming', w: 8, s: 9, just: 'Teamed with a HUBZone subcontractor for 30% workshare → satisfies subcontracting plan + scores well on small biz participation eval factor.' },
    { num: 8, name: 'Compliance / Risk', w: 10, s: 9, just: 'No FAR Part 9 issues. Active facility clearance not needed. DCAA-compliant accounting system established 2024.' },
    { num: 9, name: 'Capture Maturity', w: 8, s: 8, just: 'Pursuit log started 6 months ago. 4 customer touches documented. Win themes finalized. Color team reviews scheduled.' },
    { num: 10, name: 'Operational Readiness', w: 10, s: 8, just: 'Have 6 trained help-desk techs on bench within 30 miles. Can ramp to full staffing within 14 days of award per ramp plan.' },
    { num: 11, name: 'Schedule Feasibility', w: 5, s: 9, just: '60-day proposal window. Compliance matrix built. Draft outlines in place. Internal Pink Team scheduled 2 weeks before due date.' },
    { num: 12, name: 'Strategic Value (beyond $)', w: 5, s: 7, just: 'First VA win opens VA-wide eligibility + qualifies for VA SAC contract vehicle long-term. Strategic priority for 2026.' },
];

const factorStartRow = 3;
factors.forEach((f, i) => {
    const row = factorStartRow + i;
    wsScore.getCell(row, 1).value = f.num;
    wsScore.getCell(row, 2).value = f.name;
    wsScore.getCell(row, 3).value = f.w / 100;
    wsScore.getCell(row, 3).numFmt = '0%';
    wsScore.getCell(row, 4).value = f.s;
    wsScore.getCell(row, 4).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['ScoreZeroToTen'],
        showErrorMessage: true,
        errorTitle: 'Invalid',
        error: 'Pick 0-10',
    };
    wsScore.getCell(row, 5).value = { formula: `C${row}*D${row}*10`, result: f.w * f.s / 10 };
    wsScore.getCell(row, 5).numFmt = '0.0';
    wsScore.getCell(row, 6).value = f.just;
    for (let col = 1; col <= 6; col++) {
        const c = wsScore.getCell(row, col);
        c.font = { name: 'Calibri', size: 10, color: { argb: SLATE_900 } };
        c.alignment = { vertical: 'middle', horizontal: col === 6 ? 'left' : 'center', wrapText: col === 6, indent: col === 6 ? 1 : 0 };
        c.border = {
            top: { style: 'thin', color: { argb: SLATE_200 } },
            bottom: { style: 'thin', color: { argb: SLATE_200 } },
        };
    }
    wsScore.getRow(row).height = Math.max(28, Math.ceil(f.just.length / 60) * 14);
});

// Totals row
const totalRow = factorStartRow + factors.length;
wsScore.getCell(totalRow, 2).value = 'TOTAL PWin';
wsScore.getCell(totalRow, 5).value = { formula: `SUMPRODUCT(C${factorStartRow}:C${totalRow - 1},D${factorStartRow}:D${totalRow - 1})*10`, result: factors.reduce((s, f) => s + f.w * f.s / 10, 0) };
wsScore.getCell(totalRow, 5).numFmt = '0.0';
for (let col = 1; col <= 6; col++) {
    const c = wsScore.getCell(totalRow, col);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_DARK } };
    c.font = { name: 'Calibri', bold: true, size: 12, color: { argb: WHITE } };
    c.alignment = { vertical: 'middle', horizontal: col === 5 ? 'center' : 'left', indent: 1 };
}
wsScore.getRow(totalRow).height = 32;

// PWin band reading
const bandRow = totalRow + 2;
wsScore.mergeCells(`A${bandRow}:F${bandRow}`);
const bc = wsScore.getCell(bandRow, 1);
bc.value = 'PWin BANDS: ≥70 = bid (high confidence) · 50-69 = conditional bid (close the gaps) · <50 = no-bid OR de-scope';
bc.font = { name: 'Calibri', italic: true, size: 10, color: { argb: SLATE_900 } };
bc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
bc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_100 } };
wsScore.getRow(bandRow).height = 22;

// ──────────────────────────────────────────────────────────────────────
// Sheet 3 — Notes & Sources
// ──────────────────────────────────────────────────────────────────────
const wsNotes = wb.addWorksheet('Notes & Sources', { views: [{ showGridLines: false }] });
wsNotes.columns = [{ width: 32 }, { width: 60 }];

titleRow(wsNotes, 1, 'NOTES & SOURCES');

const notes = [
    ['Sources Sought response (date)', '2026-04-12 — uploaded 8-page response; CO replied within 7 days asking 2 clarifying questions (signal of interest)'],
    ['Industry Day attended', '2026-04-22 — VHA SDVOSB Industry Day, Phoenix VAMC. Met CO + COR. Asked 3 targeted questions.'],
    ['Incumbent intel sources', 'USAspending.gov (prior obligations), CPARS (past performance ratings), LinkedIn (staff turnover), FOIA (final eval debrief from 2022 award)'],
    ['Rate research sources', 'GSA CALC tool, OPM federal pay tables, 2 local recruiter rate sheets, NDIA labor cost benchmarks FY2025'],
    ['Teaming partner LOI signed', '2026-05-30 — HUBZone sub for 30% workshare on tier-1 + tier-2 helpdesk roles'],
    ['Key personnel LOIs signed', '2026-05-15 — incumbent PM (5-year tenure), 2 senior tier-3 engineers'],
    ['Compliance matrix built', '2026-06-01 — every Section L/M shall, will, must mapped to proposal section'],
    ['Internal review schedule', 'Pink Team 2026-07-15 · Red Team 2026-07-28 · Gold Team 2026-08-08'],
    ['Decision', 'BID — PWin score 78.5 / 100 puts this in the "high confidence" band. Approved by CEO 2026-06-05.'],
];

notes.forEach((n, i) => kv(wsNotes, 3 + i, n[0], n[1]));

// Title for the worked example
wsNotes.mergeCells('A12:B12');
const footer = wsNotes.getCell(12, 1);
footer.value = 'This is a worked example showing what a real PWin scoring session looks like. Replace these values with your own opportunity to compute your own PWin.';
footer.font = { name: 'Calibri', italic: true, size: 10, color: { argb: SLATE_900 } };
footer.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
footer.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_100 } };
wsNotes.getRow(12).height = 40;

// ──────────────────────────────────────────────────────────────────────
// Brand footer on every sheet
// ──────────────────────────────────────────────────────────────────────
[wsOpp, wsScore, wsNotes].forEach((ws) => {
    ws.headerFooter.oddFooter = '&LCapturePilot · Federal Launch Kit&Ccapturepilot.com&R04 — PWin Worked Example';
    ws.pageSetup.orientation = 'portrait';
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 0;
    ws.pageSetup.margins = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };
});

// Move Opportunity tab to be first
wb.views = [{ activeTab: 0 }];

await wb.xlsx.writeFile(OUT);
console.log(`✓ Wrote ${OUT} (${(await import('node:fs')).statSync(OUT).size / 1024 | 0} KB)`);

(await import('node:fs')).copyFileSync(OUT, DEPLOY);
console.log(`✓ Deployed to ${DEPLOY}`);
