// Build script: FLK_11 Subcontracting Plan Template (FAR 19.704)
// Run: node assets/starter-pack/rebuilt/subcontracting-plan-template-docx.build.mjs
// Produces a ~4-page DOCX with Goals table, SB outreach, recordkeeping,
// plan review cadence, and {{PLACEHOLDER}} set.
// Cross-compat: Word 365, Google Docs, LibreOffice.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  HeightRule,
  convertInchesToTwip,
  PageBreak,
  UnderlineType,
} from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/docx/dist/index.mjs';
import { writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, 'FLK_11_Subcontracting_Plan_Template.docx');
const DEPLOY = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/11_Post_Award_Compliance/FLK_11_Subcontracting_Plan_Template.docx';

// --- Brand -------------------------------------------------------------------
const EMERALD      = '10b981';
const EMERALD_DARK = '047857';
const INK          = '0f172a';
const SLATE        = '475569';
const SLATE_LIGHT  = '94a3b8';
const ROW_ALT      = 'f1f5f9';
const PAPER        = 'ffffff';

const BODY_FONT    = 'Calibri';
const MONO_FONT    = 'Consolas';

// Letter, 1 in margins → usable = 6.5 in = 9360 twips.
const USABLE       = 9360;

// Half-point sizes
const SZ_TINY  = 16; // 8pt
const SZ_SMALL = 18; // 9pt
const SZ_BODY  = 20; // 10pt
const SZ_H3    = 22; // 11pt
const SZ_H2    = 26; // 13pt
const SZ_H1    = 32; // 16pt

// --- Border helpers ----------------------------------------------------------
const none   = { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' };
const hair   = { style: BorderStyle.SINGLE, size: 4, color: 'cbd5e1' };
const thick  = { style: BorderStyle.SINGLE, size: 8, color: EMERALD_DARK };
const noBorders = { top: none, bottom: none, left: none, right: none,
                    insideHorizontal: none, insideVertical: none };
const hairBorders = { top: hair, bottom: hair, left: hair, right: hair,
                      insideHorizontal: hair, insideVertical: hair };
const bottomOnly = { top: none, bottom: hair, left: none, right: none,
                     insideHorizontal: none, insideVertical: none };

// --- Text helpers ------------------------------------------------------------
function run(text, opts = {}) {
  return new TextRun({
    text,
    font:    opts.font    || BODY_FONT,
    size:    opts.size    || SZ_BODY,
    color:   opts.color   || INK,
    bold:    !!opts.bold,
    italics: !!opts.italics,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    alignment: opts.alignment || AlignmentType.LEFT,
    spacing: {
      before: opts.before ?? 0,
      after:  opts.after  ?? 80,
      line:   opts.line   ?? 276,
    },
    indent:    opts.indent,
    keepNext:  opts.keepNext  ?? false,
    keepLines: opts.keepLines ?? true,
    children:  Array.isArray(children) ? children : [children],
    pageBreakBefore: opts.pageBreak ?? false,
  });
}

function cell(children, width, opts = {}) {
  return new TableCell({
    width:    { size: width, type: WidthType.DXA },
    shading:  opts.shading ? { type: ShadingType.CLEAR, fill: opts.shading, color: 'auto' } : undefined,
    verticalAlign: opts.valign || 'top',
    margins:  opts.margins || { top: 80, bottom: 80, left: 120, right: 120 },
    borders:  opts.borders || hairBorders,
    columnSpan: opts.colspan,
    children: Array.isArray(children) ? children : [children],
  });
}

// Heading bar — emerald strip with white label
function sectionHeading(text) {
  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [USABLE],
    borders: noBorders,
    rows: [new TableRow({
      cantSplit: true,
      children: [
        cell(
          [para([run(text.toUpperCase(), { font: MONO_FONT, size: SZ_H3, bold: true, color: 'ffffff' })],
            { after: 0, line: 240 })],
          USABLE,
          { shading: EMERALD_DARK, margins: { top: 100, bottom: 100, left: 160, right: 160 }, borders: noBorders }
        ),
      ],
    })],
  });
}

// Numbered section label (plain paragraph)
function sectionLabel(n, text) {
  return para([
    run(`${n}.  `, { bold: true, color: EMERALD_DARK, size: SZ_BODY }),
    run(text, { bold: true, color: INK, size: SZ_BODY }),
  ], { before: 160, after: 40, keepNext: true });
}

// Body paragraph
function body(text, opts = {}) {
  return para([run(text, { size: SZ_BODY, italics: !!opts.italic, color: opts.color || INK })],
    { before: 0, after: 80, ...opts });
}

// Placeholder line (bold label + slate value)
function field(label, placeholder, opts = {}) {
  return para([
    run(`${label}: `, { bold: true, size: SZ_BODY }),
    run(placeholder, { size: SZ_BODY, color: SLATE }),
  ], { after: 60, ...opts });
}

// Bullet
function bullet(text, indent = 360) {
  return para([
    run('•  ', { bold: true, color: EMERALD_DARK, size: SZ_BODY }),
    run(text, { size: SZ_BODY }),
  ], { after: 50, line: 260, indent: { left: indent, hanging: indent } });
}

// Sub-bullet (em-dash)
function subBullet(text) {
  return para([
    run('–  ', { color: SLATE, size: SZ_SMALL }),
    run(text, { size: SZ_SMALL, color: SLATE }),
  ], { after: 40, line: 240, indent: { left: 640, hanging: 280 } });
}

// Spacer
const spacer = () => para([run('', { size: 6 })], { after: 40, line: 100 });

// --- Goals table (FAR 19.704(a)(1)) -----------------------------------------
function goalsTable() {
  // Cols: Category | $ Goal | % of Total | % of Subcontracts
  const cols = [3200, 1780, 1760, 2620]; // sum = 9360

  function hdrCell(text, width) {
    return cell(
      [para([run(text, { bold: true, size: SZ_SMALL, color: 'ffffff' })], { after: 0, line: 220 })],
      width,
      { shading: EMERALD, margins: { top: 80, bottom: 80, left: 100, right: 100 },
        borders: { top: hair, bottom: hair, left: none, right: hair,
                   insideHorizontal: hair, insideVertical: none } }
    );
  }

  function dataCell(text, width, alt, placeholder = false) {
    return cell(
      [para([run(text, { size: SZ_SMALL, color: placeholder ? SLATE : INK })], { after: 0, line: 220 })],
      width,
      { shading: alt ? ROW_ALT : PAPER, margins: { top: 60, bottom: 60, left: 100, right: 100 },
        borders: { top: hair, bottom: hair, left: none, right: hair,
                   insideHorizontal: hair, insideVertical: none } }
    );
  }

  const categories = [
    'Small Business (SB)',
    'Small Disadvantaged Business (SDB)',
    'Women-Owned Small Business (WOSB)',
    'HUBZone Small Business',
    'Service-Disabled Veteran-Owned Small Business (SDVOSB)',
    'Veteran-Owned Small Business (VOSB)',
    'Historically Black Colleges & Universities / Minority Institutions (HBCU/MI)',
  ];

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      hdrCell('SB Category', cols[0]),
      hdrCell('$ Goal', cols[1]),
      hdrCell('% of Total Contract Value', cols[2]),
      hdrCell('% of Total Subcontract Dollars', cols[3]),
    ],
  });

  const dataRows = categories.map((cat, i) => new TableRow({
    cantSplit: true,
    children: [
      dataCell(cat, cols[0], i % 2 === 1),
      dataCell('$[_______]', cols[1], i % 2 === 1, true),
      dataCell('[  ]%', cols[2], i % 2 === 1, true),
      dataCell('[  ]%', cols[3], i % 2 === 1, true),
    ],
  }));

  // Totals row
  const totalsRow = new TableRow({
    cantSplit: true,
    children: [
      cell(
        [para([run('Total Subcontracting Dollars (all categories)', { bold: true, size: SZ_SMALL })], { after: 0, line: 220 })],
        cols[0], { shading: 'e2e8f0', margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: hairBorders }
      ),
      cell(
        [para([run('$[_______]', { size: SZ_SMALL, color: SLATE })], { after: 0, line: 220 })],
        cols[1], { shading: 'e2e8f0', margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: hairBorders }
      ),
      cell(
        [para([run('[  ]%', { size: SZ_SMALL, color: SLATE })], { after: 0, line: 220 })],
        cols[2], { shading: 'e2e8f0', margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: hairBorders }
      ),
      cell(
        [para([run('[  ]%', { size: SZ_SMALL, color: SLATE })], { after: 0, line: 220 })],
        cols[3], { shading: 'e2e8f0', margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: hairBorders }
      ),
    ],
  });

  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: cols,
    borders: hairBorders,
    rows: [headerRow, ...dataRows, totalsRow],
  });
}

// --- Compliance tracking table (Section 8) -----------------------------------
function recordkeepingTable() {
  const cols = [3600, 5760]; // Record Type | How/Where Kept

  function hCell(text, w) {
    return cell(
      [para([run(text, { bold: true, size: SZ_SMALL, color: 'ffffff' })], { after: 0, line: 220 })],
      w,
      { shading: EMERALD, margins: { top: 80, bottom: 80, left: 100, right: 100 }, borders: hairBorders }
    );
  }

  function dCell(text, w, alt, ph = false) {
    return cell(
      [para([run(text, { size: SZ_SMALL, color: ph ? SLATE : INK })], { after: 0, line: 220 })],
      w,
      { shading: alt ? ROW_ALT : PAPER, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: hairBorders }
    );
  }

  const rows = [
    ['Solicitations sent to SB, SDB, WOSB, HUBZone, SDVOSB, VOSB, HBCU/MI firms', '[ERP / file folder location]'],
    ['Subcontract awards by category (FAR Table 1 data)', '[Contract management system / SharePoint]'],
    ['Correspondence with SBA Procurement Center Representatives (PCRs)', '[Shared drive / email archive]'],
    ['ISR/SSR reports filed with the contracting officer', '[eSRS.gov — transaction IDs logged in tracker]'],
    ['PTAC / SBA outreach attendance logs and contact lists', '[Outreach log, updated quarterly]'],
    ['Mentor-protégé agreements, if applicable', '[Legal folder / USMC/SBA approval docs]'],
    ['Subcontractor performance evaluations', '[CPARS / internal review system]'],
  ];

  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: cols,
    borders: hairBorders,
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: [hCell('Record Type', cols[0]), hCell('How / Where Maintained', cols[1])],
      }),
      ...rows.map(([a, b], i) => new TableRow({
        cantSplit: true,
        children: [dCell(a, cols[0], i % 2 === 1), dCell(b, cols[1], i % 2 === 1, true)],
      })),
    ],
  });
}

// === Build all sections ======================================================

function buildDoc() {
  const children = [];

  // ---- Cover / Header strip ------------------------------------------------
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [USABLE],
    borders: noBorders,
    rows: [new TableRow({
      cantSplit: true,
      children: [cell(
        [
          para([run('SUBCONTRACTING PLAN', { size: SZ_H1, bold: true, color: 'ffffff', font: BODY_FONT })],
            { after: 20, line: 300, keepNext: true }),
          para([
            run('FAR 52.219-9 / FAR 19.704  ·  Contracts over $750,000 (construction $1.5M)', {
              size: SZ_BODY, color: 'ffffff', italics: true }),
          ], { after: 20, line: 260, keepNext: true }),
          para([
            run('Contract No: ', { bold: true, size: SZ_BODY, color: 'ffffff' }),
            run('{{CONTRACT_NUMBER}}', { size: SZ_BODY, color: EMERALD }),
            run('   ·   Company: ', { bold: true, size: SZ_BODY, color: 'ffffff' }),
            run('{{COMPANY_NAME}}', { size: SZ_BODY, color: EMERALD }),
          ], { after: 0, line: 260 }),
        ],
        USABLE,
        { shading: INK, margins: { top: 200, bottom: 200, left: 200, right: 200 }, borders: noBorders }
      )],
    })],
  }));

  children.push(spacer());

  // Basic identification fields
  children.push(field('Total Contract Value',     '{{TOTAL_VALUE}}'));
  children.push(field('Period of Performance',    '[MM/DD/YYYY – MM/DD/YYYY]'));
  children.push(field('Contracting Agency',       '[e.g. U.S. Army Corps of Engineers (USACE)]'));
  children.push(field('Solicitation / Award No.', '{{CONTRACT_NUMBER}}'));
  children.push(field('Subcontracting Plan POC',  '{{POC}} · [Title] · [phone] · [email]'));
  children.push(field('Date of Plan',             '[MM/DD/YYYY]'));
  children.push(field('Date of Last Review',      '[MM/DD/YYYY]'));
  children.push(spacer());

  // ---- Section 1: Goals table ---------------------------------------------
  children.push(sectionHeading('Section 1 — Subcontracting Goals (FAR 19.704(a)(1))'));
  children.push(spacer());
  children.push(body(
    'Goals represent a good-faith effort commitment — not a guarantee. Percentages are calculated against ' +
    'total estimated subcontract dollars, not total contract value. All dollar figures are estimates based on ' +
    'the approved work breakdown structure (WBS) at time of award.',
    { after: 100 }
  ));
  children.push(goalsTable());
  children.push(spacer());
  children.push(body(
    'Note: Per FAR 19.704(a)(1), goals for each SB category must be stated as both a percentage of ' +
    'total contract value and a percentage of total subcontract dollars. Update this table at each plan ' +
    'review cycle or whenever the contract scope changes by ≥10%.',
    { italic: true, color: SLATE }
  ));
  children.push(spacer());

  // ---- Section 2: Products / Services to Be Subcontracted -----------------
  children.push(sectionHeading('Section 2 — Products and Services to Be Subcontracted'));
  children.push(spacer());
  children.push(body(
    '{{COMPANY_NAME}} anticipates subcontracting the following work elements under contract ' +
    '{{CONTRACT_NUMBER}}. This list reflects the current WBS and will be updated if the scope changes.'
  ));
  children.push(bullet('[NAICS 541611] Program management support and administrative services'));
  children.push(bullet('[NAICS 541512] IT integration, network configuration, and helpdesk'));
  children.push(bullet('[NAICS 238210] Electrical installation and specialty trade work'));
  children.push(bullet('[NAICS 561720] Facilities maintenance, cleaning, and grounds services'));
  children.push(bullet('[NAICS 541330] Engineering design and technical review'));
  children.push(bullet('[Add/remove lines to match your actual work breakdown]'));
  children.push(spacer());
  children.push(body(
    'For each line above, {{COMPANY_NAME}} will actively seek qualified small businesses before expanding ' +
    'the search to large businesses. Justification for any award to a large business in a category with ' +
    'an established SB goal will be documented in the contract file.',
    { italic: true, color: SLATE }
  ));
  children.push(spacer());

  // ---- Section 3: Method Used to Develop Goals ----------------------------
  children.push(sectionHeading('Section 3 — Method Used to Develop Goals'));
  children.push(spacer());
  children.push(body(
    '{{COMPANY_NAME}} developed the goals in Section 1 using the following process:'
  ));
  children.push(bullet(
    'Reviewed the WBS and identified every discrete subcontract opportunity with an estimated value ≥$25,000.'
  ));
  children.push(bullet(
    'Searched SAM.gov (System for Award Management) using relevant NAICS codes to identify active small ' +
    'businesses certified under each preference category.'
  ));
  children.push(bullet(
    'Reviewed the SBA Dynamic Small Business Search (DSBS) and SBA\'s HUBZone map for firms matching our ' +
    'geographic work sites and technical scope.'
  ));
  children.push(bullet(
    'Reviewed prior ISR/SSR submissions and past performance data from similar contracts to benchmark ' +
    'achievable subcontracting percentages.'
  ));
  children.push(bullet(
    'Consulted with the SBA Procurement Center Representative (PCR) assigned to [Contracting Office] to ' +
    'validate goal methodology prior to award.'
  ));
  children.push(bullet(
    'Set goals that represent a genuine good-faith effort, accounting for current market conditions, ' +
    'available certifications, and the technical complexity of each subcontract line.'
  ));
  children.push(spacer());

  // ---- Section 4: Indirect Cost Allocation --------------------------------
  children.push(sectionHeading('Section 4 — Indirect Cost Allocation'));
  children.push(spacer());
  children.push(body(
    'Indirect costs — fringe benefits, overhead, G&A — are allocated to subcontract dollars using the ' +
    'following rate structure approved by [DCAA / cognizant federal agency]:'
  ));

  // Simple two-column table for rates
  const ratesCols = [4200, 5160];
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: ratesCols,
    borders: hairBorders,
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: [
          cell([para([run('Cost Pool', { bold: true, size: SZ_SMALL, color: 'ffffff' })], { after: 0, line: 220 })],
            ratesCols[0], { shading: EMERALD, margins: { top: 80, bottom: 80, left: 100, right: 100 }, borders: hairBorders }),
          cell([para([run('Approved Rate / Basis of Allocation', { bold: true, size: SZ_SMALL, color: 'ffffff' })], { after: 0, line: 220 })],
            ratesCols[1], { shading: EMERALD, margins: { top: 80, bottom: 80, left: 100, right: 100 }, borders: hairBorders }),
        ],
      }),
      ...[
        ['Fringe Benefits', '[XX%] of direct labor dollars'],
        ['Overhead', '[XX%] of direct labor + fringe'],
        ['G&A', '[XX%] of total cost input (ex-G&A)'],
        ['Fee / Profit (if cost-plus)', '[XX%] of estimated cost'],
      ].map(([a, b], i) => new TableRow({
        cantSplit: true,
        children: [
          cell([para([run(a, { size: SZ_SMALL })], { after: 0, line: 220 })], ratesCols[0],
            { shading: i % 2 ? ROW_ALT : PAPER, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: hairBorders }),
          cell([para([run(b, { size: SZ_SMALL, color: SLATE })], { after: 0, line: 220 })], ratesCols[1],
            { shading: i % 2 ? ROW_ALT : PAPER, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: hairBorders }),
        ],
      })),
    ],
  }));
  children.push(spacer());
  children.push(body(
    'Indirect costs associated with subcontract management and administration are included in the overhead ' +
    'pool and are not separately tracked as subcontract dollars for goal-reporting purposes.',
    { italic: true, color: SLATE }
  ));
  children.push(spacer());

  // ---- Section 5: SB Inclusion Efforts ------------------------------------
  children.push(sectionHeading('Section 5 — Efforts to Ensure Small Business Inclusion'));
  children.push(spacer());
  children.push(body(
    '{{COMPANY_NAME}} commits to the following outreach and inclusion actions throughout contract performance. ' +
    'These aren\'t check-the-box activities — they\'re how we actually find and develop qualified SB partners.'
  ));

  children.push(para([run('5a.  Source Identification', { bold: true, size: SZ_BODY, color: EMERALD_DARK })], { before: 120, after: 40, keepNext: true }));
  children.push(bullet('SAM.gov entity search using NAICS codes specific to each subcontract opportunity before soliciting large businesses.'));
  children.push(bullet('SBA Dynamic Small Business Search (DSBS) — filtered by certification, NAICS, and proximity to performance site.'));
  children.push(bullet('SBA\'s SUBNet portal to post subcontracting opportunities for SB/SDB/WOSB/HUBZone/SDVOSB firms.'));
  children.push(bullet('State and local PTAC (Procurement Technical Assistance Center) databases — free matchmaking service funded by DoD.'));
  children.push(bullet('APEX Accelerators (formerly PTACs) network for direct referrals to pre-vetted SB firms in our geographic area.'));

  children.push(para([run('5b.  Conferences and Events', { bold: true, size: SZ_BODY, color: EMERALD_DARK })], { before: 120, after: 40, keepNext: true }));
  children.push(bullet('Attend at least [2] agency-hosted small business outreach events or industry days annually.'));
  children.push(bullet('[Agency name] Small Business Program Office matchmaking events, when scheduled.'));
  children.push(bullet('National 8(a) Association, WBENC, NMSDC, or NCMA small business summits, as relevant.'));
  children.push(bullet('HUBZone Council and SDVOSB-focused events (e.g., VA Vendor Information Pages meet-and-greets).'));

  children.push(para([run('5c.  Direct Outreach', { bold: true, size: SZ_BODY, color: EMERALD_DARK })], { before: 120, after: 40, keepNext: true }));
  children.push(bullet('Respond to all SB capability statements and capability briefing requests within 10 business days.'));
  children.push(bullet('Post RFQ/RFP notifications on SBA SUBNet ≥30 days before close when scope allows.'));
  children.push(bullet('Brief our Small Business Liaison Officer (SBLO) on each upcoming subcontract opportunity ≥$100,000 before releasing solicitation.'));
  children.push(bullet('Mentor-protégé program: {{COMPANY_NAME}} [is / is not] currently enrolled. If enrolled, protégé firm: [Name / UEI].'));
  children.push(spacer());

  // ---- Section 6: POC for Subcontracting Program --------------------------
  children.push(sectionHeading('Section 6 — Subcontracting Program Point of Contact'));
  children.push(spacer());
  children.push(body(
    'The following individual is designated as the Small Business Liaison Officer (SBLO) and primary POC ' +
    'for all matters related to this subcontracting plan, including ISR/SSR filing, goal compliance, and ' +
    'small business outreach. Per FAR 52.219-9(d)(10), the SBLO must have authority to negotiate and ' +
    'approve subcontracts.'
  ));
  children.push(spacer());

  const pocCols = [2800, 6560];
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: pocCols,
    borders: hairBorders,
    rows: [
      ...[
        ['Name', '{{POC}}'],
        ['Title / Role', '[e.g. Small Business Liaison Officer / VP of Contracts]'],
        ['Phone', '[Direct phone number]'],
        ['Email', '[Email address]'],
        ['Mailing Address', '[Street · City, State ZIP]'],
        ['Authority Level', '[e.g. Authorized to bind subcontracts up to $[X]]'],
        ['Backup POC', '[Name · Phone · Email — in case primary is unavailable]'],
      ].map(([label, val], i) => new TableRow({
        cantSplit: true,
        children: [
          cell([para([run(label, { bold: true, size: SZ_SMALL })], { after: 0, line: 220 })], pocCols[0],
            { shading: i % 2 ? ROW_ALT : PAPER, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: hairBorders }),
          cell([para([run(val, { size: SZ_SMALL, color: SLATE })], { after: 0, line: 220 })], pocCols[1],
            { shading: i % 2 ? ROW_ALT : PAPER, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: hairBorders }),
        ],
      })),
    ],
  }));
  children.push(spacer());

  // ---- Section 7: Records Kept --------------------------------------------
  children.push(sectionHeading('Section 7 — Records Maintained'));
  children.push(spacer());
  children.push(body(
    '{{COMPANY_NAME}} maintains the following records per FAR 52.219-9(d)(9) and retains them for ' +
    '3 years after final payment on the contract (or longer if required by contract clause):'
  ));
  children.push(spacer());
  children.push(recordkeepingTable());
  children.push(spacer());
  children.push(body(
    'All records are available for inspection by the contracting officer, SBA, or their designee with ' +
    '5 business days\' notice. Electronic records are backed up [daily / weekly] to [location].',
    { italic: true, color: SLATE }
  ));
  children.push(spacer());

  // ---- Section 8: Recordkeeping Confirmation ------------------------------
  children.push(sectionHeading('Section 8 — Reporting Obligations and ISR/SSR Filing'));
  children.push(spacer());
  children.push(body(
    '{{COMPANY_NAME}} will file Individual Subcontract Reports (ISR) and Summary Subcontract Reports ' +
    '(SSR) through the Electronic Subcontracting Reporting System (eSRS) at esrs.gov in accordance ' +
    'with FAR 52.219-9 and DFARS 252.219-7003 (if applicable):'
  ));
  children.push(bullet('ISR: filed semi-annually (April 30 and October 30) and at contract completion.'));
  children.push(bullet('SSR: filed annually (October 30) covering the government fiscal year (Oct 1–Sep 30).'));
  children.push(bullet('Ad-hoc reports: submitted within 30 days of any request from the contracting officer or SBA.'));
  children.push(bullet('Modifications that change subcontracting scope or total contract value by ≥10% require a plan amendment and revised ISR.'));
  children.push(spacer());
  children.push(body(
    'The SBLO named in Section 6 is responsible for ensuring timely, accurate eSRS submissions. ' +
    'Late or missed filings will be documented in the contract file and may affect past performance ratings.',
    { italic: true, color: SLATE }
  ));
  children.push(spacer());

  // ---- Section 9: Plan Review and Update Cadence --------------------------
  children.push(sectionHeading('Section 9 — Plan Review and Update Cadence'));
  children.push(spacer());
  children.push(body(
    '{{COMPANY_NAME}} will review this subcontracting plan at the following intervals and update it ' +
    'whenever material changes occur:'
  ));

  const cadenceCols = [2600, 6760];
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: cadenceCols,
    borders: hairBorders,
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: [
          cell([para([run('Trigger', { bold: true, size: SZ_SMALL, color: 'ffffff' })], { after: 0, line: 220 })],
            cadenceCols[0], { shading: EMERALD, margins: { top: 80, bottom: 80, left: 100, right: 100 }, borders: hairBorders }),
          cell([para([run('Action Required', { bold: true, size: SZ_SMALL, color: 'ffffff' })], { after: 0, line: 220 })],
            cadenceCols[1], { shading: EMERALD, margins: { top: 80, bottom: 80, left: 100, right: 100 }, borders: hairBorders }),
        ],
      }),
      ...[
        ['Annual (each Oct)', 'SBLO reviews actual vs. goal performance; updates goals if variance >5 percentage points; files SSR.'],
        ['Semi-annual (Apr + Oct)', 'SBLO files ISR, reconciles subcontract dollars by category, updates outreach log.'],
        ['Contract modification (≥10% scope or value change)', 'Revise WBS, re-run goal methodology (Section 3), submit amended plan to contracting officer within 30 days.'],
        ['Award of any subcontract ≥$150,000', 'Confirm SB status at time of award in SAM.gov; log in tracking spreadsheet within 5 business days.'],
        ['Subcontractor performance issue or termination', 'Document, identify replacement, prioritize SB replacement if category goal is at risk, notify CO within 10 days.'],
        ['Request by Contracting Officer or SBA PCR', 'Provide updated plan and records within 5 business days.'],
      ].map(([a, b], i) => new TableRow({
        cantSplit: true,
        children: [
          cell([para([run(a, { size: SZ_SMALL, bold: true, color: EMERALD_DARK })], { after: 0, line: 220 })], cadenceCols[0],
            { shading: i % 2 ? ROW_ALT : PAPER, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: hairBorders }),
          cell([para([run(b, { size: SZ_SMALL })], { after: 0, line: 240 })], cadenceCols[1],
            { shading: i % 2 ? ROW_ALT : PAPER, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: hairBorders }),
        ],
      })),
    ],
  }));
  children.push(spacer());

  // ---- Section 10: Certification / Signature block ------------------------
  children.push(sectionHeading('Section 10 — Certification and Signature'));
  children.push(spacer());
  children.push(body(
    'By signing below, the authorized representative of {{COMPANY_NAME}} certifies that:'
  ));
  children.push(bullet(
    'This subcontracting plan was prepared in good faith, reflects a realistic assessment of ' +
    'subcontracting opportunities, and complies with the requirements of FAR 52.219-9 and, where ' +
    'applicable, DFARS 252.219-7003.'
  ));
  children.push(bullet(
    'The company will make a good-faith effort to achieve the goals stated in Section 1 and will ' +
    'implement the outreach actions described in Section 5.'
  ));
  children.push(bullet(
    'Failure to comply in good faith with this plan may result in liquidated damages under FAR 52.219-16 ' +
    'at a rate of $[________] per day, as determined by the contracting officer.'
  ));
  children.push(spacer());

  // Signature table
  const sigCols = [4600, 4760];
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: sigCols,
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              para([run('Authorized Signature', { bold: true, size: SZ_SMALL, color: EMERALD_DARK })], { after: 40 }),
              para([run('_______________________________________', { size: SZ_BODY })], { after: 60 }),
              field('Name', '{{POC}}'),
              field('Title', '[Title]'),
              field('Date', '[MM/DD/YYYY]'),
            ],
            sigCols[0],
            { borders: noBorders, margins: { top: 60, bottom: 60, left: 0, right: 120 } }
          ),
          cell(
            [
              para([run('Contracting Officer Acceptance (Government Use)', { bold: true, size: SZ_SMALL, color: SLATE })], { after: 40 }),
              para([run('_______________________________________', { size: SZ_BODY, color: SLATE_LIGHT })], { after: 60 }),
              para([run('Name: _____________________________', { size: SZ_SMALL, color: SLATE })], { after: 40 }),
              para([run('Title: ______________________________', { size: SZ_SMALL, color: SLATE })], { after: 40 }),
              para([run('Date: ______________________________', { size: SZ_SMALL, color: SLATE })], { after: 40 }),
            ],
            sigCols[1],
            { borders: noBorders, margins: { top: 60, bottom: 60, left: 120, right: 0 } }
          ),
        ],
      }),
    ],
  }));
  children.push(spacer());

  // ---- Footer label -------------------------------------------------------
  children.push(para([
    run('CapturePilot Federal Lead Kit  ·  FLK-11  ·  FAR 52.219-9 Subcontracting Plan Template', {
      font: MONO_FONT, size: SZ_TINY, color: SLATE_LIGHT,
    }),
    run('  ·  Replace all {{PLACEHOLDERS}} before submission  ·  Not legal advice — consult your contracts counsel', {
      size: SZ_TINY, color: SLATE_LIGHT, italics: true,
    }),
  ], { alignment: AlignmentType.CENTER, before: 80, after: 0, line: 200 }));

  return children;
}

// === Assemble and write ======================================================
const doc = new Document({
  creator:     'CapturePilot',
  title:       'FLK-11 Subcontracting Plan Template — FAR 52.219-9',
  description: 'Federal Lead Kit · Post-Award Compliance · Subcontracting Plan (contracts >$750K)',
  styles: {
    default: {
      document: { run: { font: BODY_FONT, size: SZ_BODY, color: INK } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: {
          width:  convertInchesToTwip(8.5),
          height: convertInchesToTwip(11),
        },
        margin: {
          top:    convertInchesToTwip(1),
          right:  convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left:   convertInchesToTwip(1),
          header: convertInchesToTwip(0.4),
          footer: convertInchesToTwip(0.4),
        },
      },
    },
    children: buildDoc(),
  }],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(OUTPUT, buffer);
console.log('Wrote', OUTPUT, 'bytes:', buffer.length);

// Deploy to production path
const deployDir = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/11_Post_Award_Compliance';
if (!existsSync(deployDir)) mkdirSync(deployDir, { recursive: true });
copyFileSync(OUTPUT, DEPLOY);
console.log('Deployed ->', DEPLOY);
