// Build script for FLK_06_Sample_Past_Performance_IT_Services.docx
// Run: node sample-pp-it-services-docx.build.mjs
//
// SPEC: Filled-in example past-performance reference for an IT services firm.
//   - Realistic 4-year DoD enterprise IT modernization, $4.8M prime contract
//   - Agency: US Army CECOM (Communications-Electronics Command), Aberdeen Proving Ground, MD
//   - CPARS: Exceptional across all categories
//   - 3 named deliverables, 2 technical innovations, 1 problem-solved narrative
//   - ~2 pages of content (after cover page)
//   - Buyers copy + adapt the structure
//
// Cross-tool: Opens in Word, Google Docs, LibreOffice.
// CRITICAL: every new Table() gets columnWidths so Google Docs doesn't collapse columns.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageNumber,
  ShadingType,
  LevelFormat,
  Header,
  Footer,
  convertInchesToTwip,
} from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/docx/dist/index.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEPLOY_DIR = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/06_Past_Performance_Reference_Templates';
const DEPLOY = `${DEPLOY_DIR}/FLK_06_Sample_Past_Performance_IT_Services.docx`;

// --- Brand tokens -----------------------------------------------------------
const EMERALD      = '10B981';
const EMERALD_DARK = '059669';
const INK          = '0F172A';
const SLATE        = '475569';
const SLATE_LIGHT  = '94A3B8';
const HAIRLINE     = 'E2E8F0';
const FILL_TINT    = 'F0FDF4';   // emerald-50 tint
const FILL_HEAD    = '10B981';   // emerald header
const FILL_ROW     = 'F8FAFC';   // slate-50 zebra
const AMBER_TINT   = 'FFFBEB';   // tip/note highlight
const FONT         = 'Calibri';
const FONT_MONO    = 'Consolas';

// Page geometry — Letter, 0.75 in margins → 7 in usable = 10080 twips
const PAGE = {
  width:   convertInchesToTwip(8.5),
  height:  convertInchesToTwip(11),
  margins: {
    top:    convertInchesToTwip(0.75),
    right:  convertInchesToTwip(0.75),
    bottom: convertInchesToTwip(0.75),
    left:   convertInchesToTwip(0.75),
  },
};
const TABLE_TOTAL = 10080;

// --- Border helpers ---------------------------------------------------------
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = {
  top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
  insideHorizontal: noBorder, insideVertical: noBorder,
};
const hair = { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE };
const hairBorders = {
  top: hair, bottom: hair, left: hair, right: hair,
  insideHorizontal: hair, insideVertical: hair,
};
const accentBorder = {
  top:    { style: BorderStyle.SINGLE, size: 6, color: EMERALD },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: EMERALD },
  left:   { style: BorderStyle.SINGLE, size: 6, color: EMERALD },
  right:  { style: BorderStyle.SINGLE, size: 6, color: EMERALD },
};

// --- Text helpers -----------------------------------------------------------
function run(text, opts = {}) {
  return new TextRun({
    text,
    font:    opts.font    || FONT,
    size:    opts.size    || 20,    // half-points; 20 = 10pt
    bold:    opts.bold    || false,
    italics: opts.italics || false,
    color:   opts.color   || INK,
    allCaps: opts.allCaps || false,
  });
}

function p(children, opts = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    spacing:        opts.spacing || { before: 60, after: 60 },
    alignment:      opts.alignment,
    pageBreakBefore: opts.pageBreakBefore || false,
    keepNext:       opts.keepNext  || false,
    keepLines:      opts.keepLines || false,
    shading:        opts.shading,
    border:         opts.border,
  });
}

function blank(size = 60) {
  return new Paragraph({ children: [run('')], spacing: { before: size, after: size } });
}

function h1(text, opts = {}) {
  return new Paragraph({
    children: [run(text, { size: 36, bold: true, color: INK })],
    spacing:        { before: 120, after: 60 },
    heading:        HeadingLevel.HEADING_1,
    keepNext:       true,
    keepLines:      true,
    pageBreakBefore: opts.pageBreakBefore || false,
  });
}

function h2(text) {
  return new Paragraph({
    children: [run(text, { size: 26, bold: true, color: INK })],
    spacing:  { before: 200, after: 60 },
    heading:  HeadingLevel.HEADING_2,
    keepNext: true,
    keepLines: true,
    border: {
      bottom: { color: EMERALD, space: 4, size: 12, style: BorderStyle.SINGLE },
    },
  });
}

function h3(text) {
  return new Paragraph({
    children: [run(text, { size: 22, bold: true, color: INK })],
    spacing:  { before: 140, after: 40 },
    heading:  HeadingLevel.HEADING_3,
    keepNext: true,
    keepLines: true,
  });
}

function eyebrow(text) {
  return new Paragraph({
    children: [run(text, { size: 16, bold: true, color: EMERALD_DARK, font: FONT_MONO, allCaps: true })],
    spacing:  { before: 80, after: 40 },
    keepNext: true,
    keepLines: true,
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    children: [run(text, { size: opts.size || 20, color: opts.color || INK, bold: opts.bold || false, italics: opts.italics || false })],
    spacing:  { before: 40, after: 40 },
    keepLines: opts.keepLines !== false,
    keepNext:  opts.keepNext || false,
  });
}

function muted(text, opts = {}) {
  return new Paragraph({
    children: [run(text, { size: opts.size || 18, color: SLATE, italics: opts.italics || false })],
    spacing:  { before: 40, after: 40 },
    alignment: opts.alignment,
    keepLines: true,
  });
}

function bullet(text) {
  return new Paragraph({
    children: [run(text, { size: 20, color: INK })],
    bullet:   { level: 0 },
    spacing:  { before: 40, after: 40 },
    keepLines: true,
  });
}

// Single-cell callout box
function callout(lines, opts = {}) {
  const fill   = opts.fill || FILL_TINT;
  const border = opts.accent ? accentBorder : hairBorders;
  return new Table({
    width:        { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [TABLE_TOTAL],
    borders:      { ...border, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width:    { size: TABLE_TOTAL, type: WidthType.DXA },
            shading:  { type: ShadingType.CLEAR, fill, color: 'auto' },
            margins:  { top: 120, bottom: 120, left: 180, right: 180 },
            children: (Array.isArray(lines) ? lines : [lines]).map(l =>
              new Paragraph({
                children: [run(l, { size: opts.size || 18, color: opts.color || INK, italics: opts.italics || false })],
                spacing:  { before: 40, after: 40 },
                keepLines: true,
              })
            ),
          }),
        ],
      }),
    ],
  });
}

// Two-column label/value row
function lvRow(label, value, opts = {}) {
  const labelW = opts.labelW || 2800;
  const valueW = TABLE_TOTAL - labelW;
  return new TableRow({
    cantSplit: true,
    children: [
      new TableCell({
        width:   { size: labelW, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: FILL_ROW, color: 'auto' },
        margins: { top: 90, bottom: 90, left: 140, right: 100 },
        children: [body(label, { bold: true, size: 18 })],
      }),
      new TableCell({
        width:   { size: valueW, type: WidthType.DXA },
        margins: { top: 90, bottom: 90, left: 140, right: 140 },
        children: [body(value, { size: 18, ...opts.valueOpts })],
      }),
    ],
  });
}

function lvTable(rows, labelW = 2800) {
  return new Table({
    width:        { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [labelW, TABLE_TOTAL - labelW],
    borders:      hairBorders,
    rows:         rows.map(([l, v, rowOpts = {}]) => lvRow(l, v, { labelW, ...rowOpts })),
  });
}

// Four-column quad table
function quadTable(rows) {
  const c1 = 2000, c2 = 3040, c3 = 2000, c4 = TABLE_TOTAL - c1 - c2 - c3;
  return new Table({
    width:        { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [c1, c2, c3, c4],
    borders:      hairBorders,
    rows: rows.map(([l1, v1, l2, v2]) =>
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width:   { size: c1, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: FILL_ROW, color: 'auto' },
            margins: { top: 80, bottom: 80, left: 120, right: 90 },
            children: [body(l1, { bold: true, size: 16 })],
          }),
          new TableCell({
            width:   { size: c2, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [body(v1, { size: 16 })],
          }),
          new TableCell({
            width:   { size: c3, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: FILL_ROW, color: 'auto' },
            margins: { top: 80, bottom: 80, left: 120, right: 90 },
            children: [body(l2, { bold: true, size: 16 })],
          }),
          new TableCell({
            width:   { size: TABLE_TOTAL - c1 - c2 - c3, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [body(v2, { size: 16 })],
          }),
        ],
      })
    ),
  });
}

// CPARS ratings table
function cparsTable(rows) {
  const cCat  = 2800;
  const cRate = 3080;
  const cNot  = TABLE_TOTAL - cCat - cRate;

  const headerCell = (text, width) =>
    new TableCell({
      width:   { size: width, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: FILL_HEAD, color: 'auto' },
      margins: { top: 90, bottom: 90, left: 140, right: 140 },
      children: [
        new Paragraph({
          children: [run(text, { bold: true, color: 'FFFFFF', size: 18 })],
          keepLines: true,
        }),
      ],
    });

  const dataRow = (cat, rating, note) =>
    new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width:   { size: cCat, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: FILL_ROW, color: 'auto' },
          margins: { top: 90, bottom: 90, left: 140, right: 100 },
          children: [body(cat, { bold: true, size: 16 })],
        }),
        new TableCell({
          width:   { size: cRate, type: WidthType.DXA },
          margins: { top: 90, bottom: 90, left: 140, right: 140 },
          children: [body(rating, { size: 16, color: EMERALD_DARK, bold: true })],
        }),
        new TableCell({
          width:   { size: cNot, type: WidthType.DXA },
          margins: { top: 90, bottom: 90, left: 140, right: 140 },
          children: [body(note, { size: 16, italics: true, color: SLATE })],
        }),
      ],
    });

  return new Table({
    width:        { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [cCat, cRate, cNot],
    borders:      hairBorders,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit:   true,
        children: [
          headerCell('Category', cCat),
          headerCell('Rating', cRate),
          headerCell('Notes from CPARS', cNot),
        ],
      }),
      ...rows.map(([cat, rating, note]) => dataRow(cat, rating, note)),
    ],
  });
}

// Header / footer
function buildHeader() {
  const stripe = new Table({
    width:        { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [TABLE_TOTAL],
    borders:      noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        height:   { value: 80, rule: 'exact' },
        children: [
          new TableCell({
            width:   { size: TABLE_TOTAL, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: EMERALD, color: 'auto' },
            children: [new Paragraph({ children: [run('')] })],
          }),
        ],
      }),
    ],
  });

  const half = Math.floor(TABLE_TOTAL / 2);
  const brand = new Table({
    width:        { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [half, TABLE_TOTAL - half],
    borders:      noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width:   { size: half, type: WidthType.DXA },
            margins: { top: 60, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                children: [
                  run('CAPTUREPILOT', { font: FONT_MONO, size: 16, bold: true, color: EMERALD_DARK, allCaps: true }),
                ],
              }),
            ],
          }),
          new TableCell({
            width:   { size: TABLE_TOTAL - half, type: WidthType.DXA },
            margins: { top: 60, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  run('Sample Past-Performance Reference · IT Services', { font: FONT_MONO, size: 14, color: SLATE }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  return new Header({ children: [stripe, brand] });
}

function buildFooter() {
  const third = Math.floor(TABLE_TOTAL / 3);
  return new Footer({
    children: [
      new Table({
        width:        { size: TABLE_TOTAL, type: WidthType.DXA },
        columnWidths: [third, third, TABLE_TOTAL - third * 2],
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE },
          bottom: noBorder, left: noBorder, right: noBorder,
          insideHorizontal: noBorder, insideVertical: noBorder,
        },
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width:   { size: third, type: WidthType.DXA },
                margins: { top: 100, bottom: 0, left: 0, right: 0 },
                children: [
                  new Paragraph({
                    children: [
                      run('CAPTUREPILOT', { font: FONT_MONO, size: 14, bold: true, color: EMERALD_DARK }),
                      run('  ·  Federal Lead Kit', { font: FONT_MONO, size: 14, color: SLATE }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width:   { size: third, type: WidthType.DXA },
                margins: { top: 100, bottom: 0, left: 0, right: 0 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      run('FLK-06 · Sample Past-Performance Reference', { font: FONT_MONO, size: 14, color: SLATE }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width:   { size: TABLE_TOTAL - third * 2, type: WidthType.DXA },
                margins: { top: 100, bottom: 0, left: 0, right: 0 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      run('Page ', { font: FONT_MONO, size: 14, color: SLATE }),
                      new TextRun({ children: [PageNumber.CURRENT], font: FONT_MONO, size: 14, color: SLATE_LIGHT }),
                      run(' of ', { font: FONT_MONO, size: 14, color: SLATE }),
                      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT_MONO, size: 14, color: SLATE_LIGHT }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ============================================================================
// PAGE 1 — How to read this example
// ============================================================================
function introPage() {
  return [
    eyebrow('06 · Past-Performance Reference Templates — Filled Example'),
    h1('Sample Past-Performance Reference'),
    muted('IT Services / DoD Enterprise Modernization — US Army CECOM, Aberdeen Proving Ground MD'),
    blank(20),

    callout([
      'This is a completed example, not a template. Every field is filled with realistic — but fictional — data.',
      'Use it to understand the depth and specificity evaluators expect, then adapt the structure to your own contracts.',
      'The blank, fillable template is in FLK_06_Past_Performance_Reference_Template.docx.',
    ], { accent: true }),

    blank(20),
    h2('What makes this reference strong'),
    body("Most past-performance writeups die in evaluation because they're vague. \"Delivered IT services to a DoD client\" tells an evaluator nothing. The example below shows what \"specific\" actually looks like across five dimensions:", { keepNext: true }),
    blank(10),
    bullet('Dollar amounts + period of performance, not just "multi-year."'),
    bullet('Named deliverables with measurable acceptance criteria, not just deliverable categories.'),
    bullet('A concrete problem + root cause + fix + metric — not "resolved challenges."'),
    bullet('CPARS verbatim language with the actual rating word (Exceptional, not "exceeded expectations").'),
    bullet('POC last verified date — evaluators call; a stale reference is a red flag.'),
    blank(20),

    callout([
      'Tip: Once you draft your own version, save it as a permanent record — even if you don\'t win the bid.',
      'Past-performance writeups compound. A reference you write today is worth more on your 50th bid than your 5th.',
    ], { fill: AMBER_TINT }),
  ];
}

// ============================================================================
// PAGE 2 — Filled reference
// ============================================================================
function filledReferencePage() {
  return [
    new Paragraph({
      children: [run('')],
      pageBreakBefore: true,
      spacing: { before: 0, after: 0 },
    }),

    eyebrow('Completed Reference — Copy and Adapt'),
    h1('Past-Performance Reference'),
    muted('US Army CECOM · Enterprise IT Modernization · Prime Contractor · CPARS Exceptional'),
    blank(20),

    // --- Contract ID block ---
    h2('Contract Identification'),
    quadTable([
      ['Agency / Client:',        'US Army CECOM (Communications-Electronics Command), Aberdeen Proving Ground, MD',
       'Contract Type:',          'Firm-Fixed-Price (FFP) with Award Fee'],
      ['Contract Number:',        'W15P7T-20-C-0042',
       'Delivery Order #:',       'N/A — Standalone Contract'],
      ['Program / Project:',      'Lifecycle Enterprise Network Modernization (LENM) Program',
       'NAICS Code:',             '541512 — Computer Systems Design Services'],
      ['Contract Value:',         '$4,823,400 (base + 3 option years all exercised)',
       'Your Share:',             '100% — Prime Contractor (no subs)'],
      ['Period of Performance:',  'May 15, 2020 – May 14, 2024 (4 years, all options exercised)',
       'Option Years:',           'Base + 3 options; all exercised on time'],
      ['Set-Aside Type:',         '8(a) Small Business Set-Aside (SBA)',
       'Small Bus. Role:',        'Prime Contractor'],
    ]),

    blank(10),

    // --- POC block ---
    h2('Reference Contact (Verified May 2024)'),
    lvTable([
      ['Contracting Officer:',    'COL (ret.) Margaret T. Holloway, Program Manager, CECOM Life Cycle Management Command'],
      ['Phone (direct):',         '(443) 395-7214'],
      ['Email:',                  'margaret.t.holloway@army.mil'],
      ['COR / Technical POC:',    'Mr. David R. Patel, GS-14, Senior IT Program Manager, Network Enterprise Center'],
      ['COR Phone:',              '(443) 395-6088'],
      ['Last Verified:',          'May 20, 2024 — spoke by phone; both contacts confirmed active and willing to be referenced'],
    ], 2800),

    blank(10),

    // --- Scope ---
    h2('Scope of Work Performed'),
    callout([
      'Meridian Federal Solutions LLC modernized the enterprise network infrastructure across 14 CECOM tenant buildings at Aberdeen Proving Ground — approximately 2,400 workstations, 380 managed switches, and 47 server racks under a single SOW.',
      '',
      'Work included: (1) full network topology redesign from legacy flat-architecture to a segmented, DISA STIG-compliant IPv4/IPv6 dual-stack environment; (2) decommission of 11 end-of-life Cisco Catalyst 2960 switch stacks and replacement with Cisco Catalyst 9300 series; (3) deployment of a zero-trust network access (ZTNA) overlay using Palo Alto Prisma Access integrated with existing CAC-based identity management; (4) migration of 38 VMware vSphere 6.5 clusters to vSphere 8.0 with NSX-T micro-segmentation enabled; and (5) full documentation and knowledge transfer to the 12-person government network operations team.',
      '',
      'All work performed under DoD 8500.01 Information Assurance Policy and NIST SP 800-53 Rev 5 controls. ATO maintained throughout — no lapse.',
    ], { fill: FILL_ROW, size: 18 }),

    blank(10),

    // --- Three named deliverables ---
    h2('Key Deliverables (Named)'),
    body('The following three deliverables were formally accepted by the Contracting Officer\'s Representative under CDRL A001–A003:', { keepNext: true }),
    blank(10),

    lvTable([
      ['CDRL A001 — Network Architecture Design Package',
       'Comprehensive as-built documentation covering all 14 buildings: physical and logical diagrams, IP address management (IPAM) export, VLAN scheme, security zone mapping, and STIG checklist. Delivered 6 days ahead of CD-1 milestone. CO acceptance letter on file.'],
      ['CDRL A002 — ZTNA Integration Playbook',
       'Step-by-step runbook for Palo Alto Prisma Access configuration, CAC integration test procedures, and rollback plan. Accepted at CDR with zero Category-I comments. Government network ops team used this document to onboard two additional buildings post-contract.'],
      ['CDRL A003 — Migration Completion Report + Lessons Learned',
       'Post-migration validation report covering VMware cluster health checks, micro-segmentation rule validation, and NSX-T policy audit. Includes 14-page lessons-learned annex. Submitted 12 days early to accommodate the government\'s FY end close-out schedule.'],
    ], 2400),

    blank(10),

    // --- Technical innovations ---
    h2('Technical Innovations'),
    h3('Innovation 1 — Automated STIG Compliance Pipeline'),
    body('Rather than manually running individual STIG checklists (the standard approach on prior CECOM contracts), the team built a PowerShell + Ansible pipeline that auto-applied 94% of applicable DISA STIG controls on each newly provisioned switch and VM. This reduced the post-deployment compliance remediation cycle from an estimated 6 weeks to 9 days — validated by the government\'s IA team at final ATO renewal.'),

    blank(10),
    h3('Innovation 2 — Non-Disruptive Parallel Cutover Methodology'),
    body('The program\'s original cutover plan called for three maintenance-window outages (12 hours each) across the 14 buildings. Meridian proposed and executed a parallel-stack approach: new switches were cabled and configured live alongside the legacy stacks, with traffic migrated building-by-building during low-utilization windows. Total end-user downtime: 47 minutes cumulative across all 14 buildings over the 4-year program, against a 36-hour contractual downtime budget.'),

    blank(10),

    // --- Problem-solved narrative ---
    h2('Problem Solved — Root Cause + Fix + Measured Outcome'),
    callout([
      'The Problem: In Month 14, a VMware cluster migration failed during the Building 7 cutover window. The NSX-T distributed firewall pushed a misconfigured policy that blackholed traffic between the classified and unclassified VLANs. Three mission-critical applications (GCSS-Army, AESIP, and a locally hosted JWICS gateway) went down at 02:30 on a Tuesday.',
      '',
      'Root Cause: The NSX-T policy export from the lab environment included a hard-coded IP range that overlapped with Building 7\'s production subnet — an environment-specific variable the migration checklist hadn\'t flagged.',
      '',
      'The Fix: Meridian\'s on-call network engineer was on-site within 40 minutes. The misconfigured rule was identified via NSX-T flow-log analysis, corrected, and redeployed in 22 minutes. All three applications were back online 62 minutes after the initial alert.',
      '',
      'Process Change: Meridian redesigned the migration playbook to replace all hard-coded IPs with environment-variable references, and added a pre-migration automated diff check against the target subnet table. Zero recurrences across the remaining 13 buildings and 3 years of the contract.',
      '',
      'Measurable Outcome: Mean time to restore (MTTR) across all incidents over the 4-year contract: 34 minutes, against a contract SLA of 4 hours. Total unplanned downtime: 4.2 hours across the entire program life — 95% below the 90-hour allowable in the PWS.',
    ], { fill: FILL_TINT, accent: true, size: 18 }),

    blank(10),

    // --- CPARS ratings ---
    h2('Performance Ratings (CPARS — Official)'),
    muted('Source: CPARS official record, Contract W15P7T-20-C-0042, Final Assessment, May 2024. Reproduced verbatim.', { italics: true }),
    blank(10),
    cparsTable([
      ['Technical Performance',
       'Exceptional',
       '"Contractor exceeded all technical requirements. Zero ATO lapses. STIG pipeline innovation materially reduced IA workload."'],
      ['Schedule / Delivery',
       'Exceptional',
       '"All 47 CDRLs delivered on or before contractual due dates. CDDs for all three option years exercised without delay."'],
      ['Management',
       'Exceptional',
       '"Program manager maintained proactive communication throughout. Staffing changes were transparent and managed without performance impact."'],
      ['Cost Control',
       'Exceptional',
       '"Came in 2.3% under obligated ceiling across base + all options. No REAs filed. One unilateral mod for descope — no claim."'],
      ['Small Business Subcontracting',
       'N/A',
       'Prime was 8(a) entity; no subcontracting plan required. All work self-performed.'],
    ]),

    blank(20),

    // --- Closing tip ---
    callout([
      'How to adapt this to your contract: Replace the scope narrative with your actual deliverables and technology stack.',
      'Keep the specificity: named CDRLs, named tools, real downtime numbers, actual CPARS verbatim language.',
      'If your contract didn\'t have CPARS (commercial work, sub-threshold award), mark ratings as self-reported and expect your POC to be called.',
    ], { fill: AMBER_TINT }),

    blank(20),
    muted('© CapturePilot · Federal Lead Kit · FLK-06 · capturepilot.com', { italics: true, alignment: AlignmentType.CENTER }),
  ];
}

// ============================================================================
// Document assembly
// ============================================================================
const doc = new Document({
  creator:     'CapturePilot',
  title:       'Sample Past-Performance Reference — IT Services',
  description: 'Federal Lead Kit FLK-06 · Filled example for DoD enterprise IT modernization',
  styles: {
    default: {
      document: {
        run:       { font: FONT, size: 20, color: INK },
        paragraph: { spacing: { line: 280 } },
      },
      heading1: {
        run:       { font: FONT, size: 36, bold: true, color: INK },
        paragraph: { spacing: { before: 120, after: 60 }, keepNext: true, keepLines: true },
      },
      heading2: {
        run:       { font: FONT, size: 26, bold: true, color: INK },
        paragraph: { spacing: { before: 200, after: 60 }, keepNext: true, keepLines: true },
      },
      heading3: {
        run:       { font: FONT, size: 22, bold: true, color: INK },
        paragraph: { spacing: { before: 140, after: 40 }, keepNext: true, keepLines: true },
      },
    },
  },
  numbering: {
    config: [
      {
        reference: 'default-bullets',
        levels: [
          {
            level:     0,
            format:    LevelFormat.BULLET,
            text:      '•',
            alignment: AlignmentType.LEFT,
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size:   { width: PAGE.width, height: PAGE.height },
          margin: PAGE.margins,
        },
      },
      headers: { default: buildHeader() },
      footers: { default: buildFooter() },
      children: [
        ...introPage(),
        ...filledReferencePage(),
      ],
    },
  ],
});

// Write output
if (!existsSync(DEPLOY_DIR)) {
  mkdirSync(DEPLOY_DIR, { recursive: true });
}

const buffer = await Packer.toBuffer(doc);
writeFileSync(DEPLOY, buffer);
console.log(`OK  wrote ${DEPLOY}  (${buffer.length} bytes)`);
