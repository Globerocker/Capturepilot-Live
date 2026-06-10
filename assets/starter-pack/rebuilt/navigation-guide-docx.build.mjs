// Build script for FLK_00 Navigation & Start-Here Guide (.docx)
// Buyer-facing overview of the Federal Launch Kit: cover + how-to-use +
// what's-in-each-folder + suggested order + quick-reference cheatsheet.
//
// DESIGN DECISIONS:
//   - NO hyperlinks. When buyers "Make a copy" of the Drive folder, all
//     file IDs change → hardcoded URLs would break. Instead this doc names
//     every file by exact filename + folder prefix. Drive's natural folder
//     browser becomes the navigation.
//   - Single-column flow (no multi-col tables) — renders identically in
//     Word + Apple Pages + Google Docs.
//   - Where tables are used, columnWidths is set explicitly to avoid the
//     Google-Docs-renders-100-twip-default bug.
//   - Buyer puts this at the TOP of their Drive folder as the first file
//     they should open.
//
// Run: cd /Users/andreschuler/Caturepilot\ 2.0 && node assets/starter-pack/rebuilt/navigation-guide-docx.build.mjs
// Output: assets/starter-pack/rebuilt/FLK_00_Navigation_Guide.docx
// then copies into dashboard/public/starter-pack/.

import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  HeadingLevel, ShadingType,
} from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/docx/dist/index.mjs';
import { writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, 'FLK_00_Navigation_Guide.docx');
const DEPLOY = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/FLK_00_Navigation_Guide.docx';

// Brand
const EMERALD = '10b981';
const EMERALD_DARK = '047857';
const INK = '0f172a';
const SLATE = '475569';
const SLATE_LIGHT = '94a3b8';
const PAPER = 'ffffff';

const BODY_FONT = 'Calibri';
const MONO_FONT = 'Consolas';

// Letter @ 0.75" margins → usable 7.0in = 10080 twips
const USABLE_TWIPS = 10080;

// Sizes (half-points)
const SIZE_TINY = 16; // 8pt
const SIZE_BODY = 22; // 11pt
const SIZE_LEAD = 24; // 12pt
const SIZE_H3 = 26;   // 13pt
const SIZE_H2 = 32;   // 16pt
const SIZE_H1 = 48;   // 24pt
const SIZE_HERO = 64; // 32pt

// Helpers --------------------------------------------------------------
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = {
  top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
  insideHorizontal: noBorder, insideVertical: noBorder,
};

function run(text, opts = {}) {
  return new TextRun({
    text,
    font: opts.font || BODY_FONT,
    size: opts.size || SIZE_BODY,
    bold: opts.bold || false,
    italics: opts.italic || false,
    color: opts.color || INK,
    break: opts.break || 0,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment: opts.alignment,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 80, line: opts.line ?? 280 },
    heading: opts.heading,
  });
}

function h1(text) {
  return para([run(text, { size: SIZE_H1, bold: true, color: EMERALD_DARK })],
    { before: 200, after: 100, line: 300 });
}

function h2(text) {
  return para([run(text, { size: SIZE_H2, bold: true, color: INK })],
    { before: 240, after: 80, line: 300 });
}

function h3(text) {
  return para([run(text, { size: SIZE_H3, bold: true, color: EMERALD_DARK })],
    { before: 160, after: 60, line: 280 });
}

function bullet(text) {
  return new Paragraph({
    children: [run(text)],
    bullet: { level: 0 },
    spacing: { before: 0, after: 40, line: 260 },
  });
}

function mono(text, opts = {}) {
  return run(text, { ...opts, font: MONO_FONT, size: opts.size || SIZE_TINY });
}

// File entry: "FLK_03_RFP_Response_Playbook.pdf" + 1-line description
function fileEntry(filename, desc) {
  return new Paragraph({
    children: [
      mono(filename, { size: 18, color: EMERALD_DARK, bold: true }),
      run('  '),
      run(desc, { size: 20, color: SLATE }),
    ],
    spacing: { before: 0, after: 40, line: 250 },
    indent: { left: 220 },
  });
}

// ---- Build document content ----

const children = [];

// HERO COVER
children.push(para([run('FEDERAL', { size: SIZE_HERO, bold: true, color: EMERALD_DARK, font: BODY_FONT })],
  { before: 800, after: 0, alignment: AlignmentType.CENTER, line: 320 }));
children.push(para([run('LAUNCH KIT', { size: SIZE_HERO, bold: true, color: INK, font: BODY_FONT })],
  { before: 0, after: 200, alignment: AlignmentType.CENTER, line: 320 }));
children.push(para([run('Navigation & Start-Here Guide', { size: SIZE_H2, italic: true, color: SLATE })],
  { before: 0, after: 100, alignment: AlignmentType.CENTER, line: 300 }));
children.push(para([
  mono('CapturePilot · 38 files · 10 categories', { color: SLATE_LIGHT, size: 18 }),
], { before: 0, after: 600, alignment: AlignmentType.CENTER, line: 300 }));

// What this is
children.push(h1('What this kit is'));
children.push(para([run(
  'Everything you need to register, qualify, find, and win your first federal contract. Built by federal-contracting practitioners for small business owners who don\'t want to spend $10k on a consultant to learn the basics.',
  { size: SIZE_LEAD })], { after: 120, line: 300 }));
children.push(para([run(
  'Every file works in the tool you already have — Microsoft Word/Excel, Apple Pages/Numbers, or Google Docs/Sheets. No subscriptions, no logins, no upgrades. Open it, fill it in, use it.',
  { size: SIZE_LEAD })], { after: 200, line: 300 }));

// How to use this kit
children.push(h1('How to use this kit'));
children.push(para([
  run('Read this guide first (you\'re doing it). Then work the folders in numbered order — they\'re ordered the way a real capture cycle runs:',
    { size: SIZE_LEAD })], { after: 120 }));

children.push(bullet('Folder 01 → get registered on sam.gov'));
children.push(bullet('Folder 02 → build your capability statement'));
children.push(bullet('Folder 03 → learn the 6 solicitation types you\'ll see on sam.gov'));
children.push(bullet('Folder 04 → score every opportunity before chasing it'));
children.push(bullet('Folder 05 → confirm which set-asides you qualify for'));
children.push(bullet('Folder 06 → format your past performance the way evaluators expect'));
children.push(bullet('Folder 07 → start outreach to contracting officers'));
children.push(bullet('Folder 08 → set a winning price'));
children.push(bullet('Folder 09 → run reviews + manage compliance'));
children.push(bullet('Folder 10 → book your founder onboarding call when ready'));

children.push(para([], { after: 200 }));

// What's in each folder
children.push(h1('What\'s in each folder'));
children.push(para([
  run(
    'File names include the folder prefix (e.g. FLK_03_…) so you can always tell which category a file belongs to. Filenames stay the same even if you copy or move the folder — no broken links.',
    { size: SIZE_BODY, color: SLATE, italic: true })],
  { after: 200 }));

// Per-folder breakdown
function folder(name, blurb, files) {
  children.push(h2(name));
  children.push(para([run(blurb, { size: SIZE_BODY, color: SLATE })], { after: 80 }));
  files.forEach(([fn, desc]) => children.push(fileEntry(fn, desc)));
}

folder('01 · SAM Registration Kit',
  'Get your business registered + renewed on sam.gov without losing a week to it.', [
  ['FLK_01_SAM_Registration_Walkthrough.pdf', 'Every screen of the registration flow, in order.'],
  ['FLK_01_SAM_Renewal_Kit.pdf', 'What changes every year + the 60-day renewal checklist.'],
  ['FLK_01_NAICS_Code_Picker.pdf', 'Pick the right 3-7 NAICS codes for your work.'],
  ['FLK_01_SAM_PreReg_Checklist.xlsx', 'Every document + login + number you need before you start.'],
]);

folder('02 · Capability Statement Kit',
  'Build the one-pager federal buyers expect to see.', [
  ['FLK_02_How_to_Write_Capability_Statement.pdf', 'The federal version (different from commercial).'],
  ['FLK_02_Capability_Statement_Template.docx', 'Fill-in-the-blank Word template.'],
  ['FLK_02_Capability_Statement_Template.pdf', 'Print-ready PDF reference.'],
  ['FLK_02_Capability_Statement_Canva_Kit.pdf', 'Design-your-own walkthrough with brand guidance.'],
]);

folder('03 · Solicitation Playbooks',
  'Six playbooks — one per notice type you\'ll see on sam.gov.', [
  ['FLK_03_Sources_Sought_RFI_Playbook.pdf', 'How to respond to Sources Sought + RFI notices.'],
  ['FLK_03_Pre_Solicitation_Playbook.pdf', 'What to do during the pre-solicitation window.'],
  ['FLK_03_RFP_Response_Playbook.pdf', 'Full RFP response strategy + checklist.'],
  ['FLK_03_RFQ_Playbook.pdf', 'Quoting under the SAP threshold ($250k).'],
  ['FLK_03_IDIQ_GWAC_Task_Order_Playbook.pdf', 'Multi-award vehicle bids + task order chasing.'],
  ['FLK_03_Market_Research_Playbook.pdf', 'How to do market research a contracting officer would respect.'],
]);

folder('04 · Bid/No-Bid Decision Toolkit',
  'Score every opportunity in 10 minutes before you commit.', [
  ['FLK_04_Bid_No_Bid_Decision_Matrix.xlsx', 'Decision matrix with weighted criteria.'],
  ['FLK_04_PWin_Calculator.xlsx', 'Probability-of-win across 12 factors.'],
  ['FLK_04_Competitive_Bid_Analysis.xlsx', 'Head-to-head against incumbents + known competitors.'],
]);

folder('05 · Certification Eligibility Worksheets',
  'Confirm which set-asides you can use to bid as a small business.', [
  ['FLK_05_VOSB_SDVOSB_CVE_Guide.pdf', 'What counts as VOSB / SDVOSB. How to apply.'],
  ['FLK_05_8a_Certification_Self_Assessment.xlsx', 'Am I eligible? Am I ready?'],
  ['FLK_05_WOSB_EDWOSB_Self_Cert.xlsx', 'DIY self-certification walkthrough.'],
  ['FLK_05_HUBZone_Eligibility_Worksheet.xlsx', 'Address + employee + revenue tests.'],
]);

folder('06 · Past Performance Reference Templates',
  'Document past work in the format evaluators expect.', [
  ['FLK_06_Past_Performance_Reference_Template.docx', 'Word template — one contract per page.'],
  ['FLK_06_Past_Performance_Reference_Template.pdf', 'Printable reference.'],
  ['FLK_06_Commercial_to_Federal_Past_Performance.pdf', 'Translating commercial work into the language proposals want.'],
]);

folder('07 · Contracting Officer Outreach Library',
  'Get on the right CO\'s radar before the RFP drops.', [
  ['FLK_07_CO_Email_Templates.pdf', '12 email templates for every stage of the relationship.'],
  ['FLK_07_LinkedIn_Outreach_Scripts.pdf', '8 ways to start a useful LinkedIn conversation.'],
  ['FLK_07_Industry_Day_Playbook.pdf', 'How to actually get value out of an industry day.'],
  ['FLK_07_COR_PM_Conversation_Scripts.pdf', 'Once you win, how to keep building.'],
]);

folder('08 · Price-to-Win Toolkit',
  'Set a price the government will pay AND your firm can deliver on.', [
  ['FLK_08_Federal_Labor_Rate_Benchmarks_FY2026.pdf', 'Government-published comparable rates.'],
  ['FLK_08_Price_to_Win_Worksheet.xlsx', 'Work backwards from the agency budget.'],
  ['FLK_08_Indirect_Rate_Calculator.xlsx', 'Calculate your true loaded cost.'],
]);

folder('09 · Internal Best-Practice Library',
  'Tools the proposal team uses every cycle.', [
  ['FLK_09_FAR_Clause_Quick_Reference_Decoder.pdf', 'The 50 most-cited FAR clauses, in plain English.'],
  ['FLK_09_Color_Team_Review_Templates.pdf', 'Red / Pink / Gold team reviews — what each catches.'],
  ['FLK_09_Teaming_Agreement_Template.docx', 'Prime-sub agreement you negotiate before the bid.'],
  ['FLK_09_Teaming_Agreement_Template.pdf', 'Printable reference.'],
  ['FLK_09_Capture_Maturity_Self_Audit.xlsx', 'Score your capture process maturity.'],
  ['FLK_09_Compliance_Matrix_Template.xlsx', 'Section-by-section RFP compliance tracking.'],
]);

folder('10 · Bonus · Founder Onboarding Call',
  'Stuck somewhere? Book a 30-minute call.', [
  ['FLK_10_Founder_Onboarding_Call.pdf', 'How to book + what to bring + what we\'ll cover.'],
]);

// Tools-that-pair-well section
children.push(h1('Tools that pair well together'));
children.push(para([run('A few combos that compound:', { size: SIZE_LEAD })], { after: 120 }));

children.push(h3('Setup combo'));
children.push(bullet('FLK_01_SAM_PreReg_Checklist + FLK_01_SAM_Registration_Walkthrough — checklist while you do the walkthrough.'));

children.push(h3('Capability statement combo'));
children.push(bullet('FLK_02_How_to_Write_Capability_Statement + FLK_02_Capability_Statement_Template.docx + FLK_02_Capability_Statement_Canva_Kit — read first, fill the Word template, then design in Canva if you want a custom look.'));

children.push(h3('Bid decision combo'));
children.push(bullet('FLK_04_Bid_No_Bid_Decision_Matrix + FLK_04_PWin_Calculator + FLK_04_Competitive_Bid_Analysis — run all 3 on any opportunity ≥ $250k. Takes 30 minutes total.'));

children.push(h3('Pricing combo'));
children.push(bullet('FLK_08_Federal_Labor_Rate_Benchmarks + FLK_08_Indirect_Rate_Calculator + FLK_08_Price_to_Win_Worksheet — read the benchmarks, calculate your loaded cost, then back into the price.'));

// Cheatsheet section
children.push(h1('Quick-reference cheatsheet'));
children.push(para([run('Things you\'ll want to look up fast:', { size: SIZE_LEAD })], { after: 120 }));

children.push(h3('Where do I…'));
children.push(bullet('Register on sam.gov? → Folder 01, SAM_Registration_Walkthrough.pdf'));
children.push(bullet('Pick my NAICS codes? → Folder 01, NAICS_Code_Picker.pdf'));
children.push(bullet('Find my UEI? → sam.gov/profile (it\'s on your Entity Management page)'));
children.push(bullet('Apply for 8(a)? → Folder 05, 8a_Certification_Self_Assessment.xlsx (check eligibility first)'));
children.push(bullet('Find federal contract opportunities? → sam.gov/opportunities (the search bar)'));
children.push(bullet('Look up FAR clauses? → Folder 09, FAR_Clause_Quick_Reference_Decoder.pdf'));
children.push(bullet('See past awards? → usaspending.gov + fpds.gov'));

children.push(h3('What do these abbreviations mean'));
children.push(bullet('SAM = System for Award Management (where you register + search opportunities)'));
children.push(bullet('UEI = Unique Entity Identifier (12-character ID assigned at SAM registration)'));
children.push(bullet('CAGE = Commercial and Government Entity code (5-character ID from DLA)'));
children.push(bullet('NAICS = North American Industry Classification System (6-digit industry codes)'));
children.push(bullet('PSC = Product Service Code (4-character codes for what\'s being bought)'));
children.push(bullet('RFP / RFQ / RFI / IFB = Request for Proposal / Quote / Information / Invitation for Bid'));
children.push(bullet('GWAC = Government-Wide Acquisition Contract'));
children.push(bullet('IDIQ = Indefinite Delivery / Indefinite Quantity contract vehicle'));
children.push(bullet('FAR / DFARS = Federal Acquisition Regulation / DoD supplement'));
children.push(bullet('SAP = Simplified Acquisition Procedures ($250k threshold)'));
children.push(bullet('CO = Contracting Officer (the person with signature authority)'));
children.push(bullet('COR = Contracting Officer Representative (your day-to-day technical POC)'));

// Footer
children.push(para([], { before: 400 }));
children.push(para([
  mono('CapturePilot · Federal Launch Kit · Navigation Guide', { color: SLATE, size: 18 }),
], { before: 200, after: 0, alignment: AlignmentType.CENTER }));
children.push(para([
  mono('capturepilot.com', { color: SLATE_LIGHT, size: 16 }),
], { before: 40, after: 0, alignment: AlignmentType.CENTER }));

// --- Build ---
const doc = new Document({
  creator: 'CapturePilot',
  title: 'Federal Launch Kit Navigation Guide',
  description: 'Start-here guide for the CapturePilot Federal Launch Kit',
  styles: {
    default: {
      document: {
        run: { font: BODY_FONT, size: SIZE_BODY, color: INK },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840, orientation: 'portrait' },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080, header: 720, footer: 720 },
      },
    },
    children,
  }],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(OUTPUT, buffer);
console.log(`✓ Wrote ${OUTPUT} (${(buffer.length / 1024).toFixed(0)} KB)`);

copyFileSync(OUTPUT, DEPLOY);
console.log(`✓ Deployed to ${DEPLOY}`);
