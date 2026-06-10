// Build script: FLK_11_Quality_Assurance_Plan_Template.docx
// Run: node assets/starter-pack/rebuilt/quality-assurance-plan-template-docx.build.mjs
// Produces a ~3-page editable Quality Assurance Surveillance Plan (QASP) template
// covering: Scope, Quality Standards, Performance Indicators table,
// Corrective Action Process, Reporting Cadence, Inspection Checklist.

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
} from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/docx/dist/index.mjs';
import { writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, 'FLK_11_Quality_Assurance_Plan_Template.docx');
const DEPLOY_DIR = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/11_Post_Award_Compliance';
const DEPLOY = `${DEPLOY_DIR}/FLK_11_Quality_Assurance_Plan_Template.docx`;

// --- Brand palette -----------------------------------------------------------
const EMERALD      = '10b981';
const EMERALD_DARK = '047857';
const INK          = '0f172a';
const SLATE        = '475569';
const SLATE_LIGHT  = '94a3b8';
const PAPER        = 'ffffff';
const ROW_ALT      = 'f8fafc';
const ROW_STRIPE   = 'ecfdf5'; // light emerald tint for alternating data rows

// --- Fonts & sizes -----------------------------------------------------------
const BODY_FONT = 'Calibri';
const MONO_FONT = 'Consolas';

// Sizes are in half-points (docx convention):
// 8pt=16, 9pt=18, 10pt=20, 11pt=22, 14pt=28, 16pt=32, 18pt=36
const SZ_TINY  = 16;  // 8pt  — footnotes, kicker labels
const SZ_BODY  = 20;  // 10pt — body text
const SZ_SMALL = 18;  // 9pt  — table cells
const SZ_H3    = 22;  // 11pt — section sub-heads
const SZ_H2    = 28;  // 14pt — section headings
const SZ_H1    = 36;  // 18pt — document title

// --- Page geometry -----------------------------------------------------------
// Letter (8.5 × 11 in), 0.9 in side margins → usable = 6.7 in = 9648 twips
const USABLE = 9648;
const MARGIN_TOP    = convertInchesToTwip(0.9);
const MARGIN_SIDE   = convertInchesToTwip(0.9);
const MARGIN_BOTTOM = convertInchesToTwip(0.9);

// --- Border helpers ----------------------------------------------------------
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = {
  top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
  insideHorizontal: noBorder, insideVertical: noBorder,
};
const hairline = { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0' };
const hairlines = {
  top: hairline, bottom: hairline, left: hairline, right: hairline,
  insideHorizontal: hairline, insideVertical: hairline,
};
const thickTop = { ...hairline, size: 12, color: EMERALD_DARK };

// --- Text helpers ------------------------------------------------------------
function run(text, opts = {}) {
  return new TextRun({
    text,
    font:    opts.font    || BODY_FONT,
    size:    opts.size    || SZ_BODY,
    color:   opts.color   || INK,
    bold:    !!opts.bold,
    italics: !!opts.italics,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: {
      before: opts.before ?? 0,
      after:  opts.after  ?? 80,
      line:   opts.line   ?? 276,   // ~1.15 line spacing
    },
    indent:    opts.indent,
    keepNext:  opts.keepNext  ?? false,
    keepLines: opts.keepLines ?? true,
    children:  Array.isArray(children) ? children : [children],
  });
}

// Section heading (dark INK background, white text)
function sectionHeading(label) {
  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [USABLE],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: USABLE, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: INK, color: 'auto' },
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            borders: noBorders,
            children: [
              para([run(label.toUpperCase(), { font: MONO_FONT, size: SZ_H3, bold: true, color: 'ffffff' })],
                { after: 0, line: 240 }),
            ],
          }),
        ],
      }),
    ],
  });
}

// Subsection kicker label (emerald mono text above content)
function kicker(label) {
  return para([run(label.toUpperCase(), { font: MONO_FONT, size: SZ_TINY, bold: true, color: EMERALD_DARK })],
    { before: 160, after: 40, keepNext: true, line: 220 });
}

// Body paragraph with placeholder
function bodyPara(text, opts = {}) {
  return para([run(text, { size: SZ_BODY, color: opts.muted ? SLATE : INK, italics: !!opts.italics })],
    { before: opts.before ?? 0, after: opts.after ?? 80, line: 276 });
}

// Bullet
function bullet(text, opts = {}) {
  return para([
    run('•  ', { size: SZ_BODY, bold: true, color: EMERALD_DARK }),
    run(text, { size: SZ_BODY, color: opts.muted ? SLATE : INK, italics: !!opts.italics }),
  ], { before: 0, after: 40, line: 260, indent: { left: 200, hanging: 200 } });
}

// Checkbox item
function checkbox(label, checked = false) {
  return para([
    run(checked ? '☑  ' : '☐  ', { size: SZ_BODY, bold: true, color: EMERALD_DARK }),
    run(label, { size: SZ_BODY, color: INK }),
  ], { before: 0, after: 40, line: 260, indent: { left: 200, hanging: 200 } });
}

// Numbered step
function numbered(n, text) {
  return para([
    run(`${n}.  `, { size: SZ_BODY, bold: true, color: EMERALD_DARK }),
    run(text, { size: SZ_BODY, color: INK }),
  ], { before: 0, after: 60, line: 276, indent: { left: 280, hanging: 280 } });
}

// Horizontal rule (single-cell table with thick top border)
function hr() {
  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [USABLE],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: USABLE, type: WidthType.DXA },
            borders: { top: thickTop, bottom: noBorder, left: noBorder, right: noBorder },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [para([run('')], { after: 0, line: 80 })],
          }),
        ],
      }),
    ],
  });
}

// Spacer paragraph
function spacer(pts = 80) {
  return para([run('', { size: 4 })], { after: pts, line: 80 });
}

// --- Table cell builder (generic) -------------------------------------------
function tcell({ children, width, shading, colspan, valign = 'top', pad, borders }) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: colspan,
    shading: shading ? { type: ShadingType.CLEAR, fill: shading, color: 'auto' } : undefined,
    verticalAlign: valign,
    margins: pad || { top: 60, bottom: 60, left: 100, right: 100 },
    borders: borders || hairlines,
    children: Array.isArray(children) ? children : [children],
  });
}

// Header cell (emerald background)
function hcell(label, width) {
  return tcell({
    width,
    shading: EMERALD,
    pad: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [para([run(label, { font: MONO_FONT, size: SZ_TINY, bold: true, color: 'ffffff' })],
      { after: 0, line: 200 })],
  });
}

// Alt-shaded data cell
function dcell(text, width, alt) {
  return tcell({
    width,
    shading: alt ? ROW_STRIPE : PAPER,
    children: [para([run(text, { size: SZ_SMALL, color: INK })], { after: 0, line: 220 })],
  });
}

// Placeholder data cell (muted text, italic)
function pcell(placeholder, width, alt) {
  return tcell({
    width,
    shading: alt ? ROW_STRIPE : PAPER,
    children: [para([run(placeholder, { size: SZ_SMALL, color: SLATE, italics: true })],
      { after: 0, line: 220 })],
  });
}

// =============================================================================
// SECTION 1 — Title Strip
// =============================================================================
function titleStrip() {
  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [USABLE],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: USABLE, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: INK, color: 'auto' },
            margins: { top: 200, bottom: 200, left: 200, right: 200 },
            borders: noBorders,
            children: [
              para([run('QUALITY ASSURANCE SURVEILLANCE PLAN', { size: SZ_H1, bold: true, color: 'ffffff' })],
                { after: 40, line: 300, keepNext: true }),
              para([
                run('{{CONTRACT NUMBER}}', { size: SZ_H3, bold: true, color: EMERALD }),
                run('   ·   ', { size: SZ_H3, color: SLATE_LIGHT }),
                run('{{AGENCY / PROGRAM OFFICE}}', { size: SZ_BODY, color: 'ffffff' }),
              ], { after: 20, line: 240 }),
              para([
                run('Contractor: ', { size: SZ_BODY, bold: true, color: SLATE_LIGHT }),
                run('{{CONTRACTOR NAME}}', { size: SZ_BODY, color: 'ffffff' }),
                run('   ·   Period of Performance: ', { size: SZ_BODY, color: SLATE_LIGHT }),
                run('{{MM/DD/YYYY – MM/DD/YYYY}}', { size: SZ_BODY, color: 'ffffff' }),
              ], { after: 0, line: 220 }),
            ],
          }),
        ],
      }),
    ],
  });
}

// =============================================================================
// SECTION 2 — Admin metadata strip (2-col)
// =============================================================================
function metaStrip() {
  const half = Math.floor(USABLE / 2);
  const cells = (items, shade) => items.map(([k, v]) => [
    para([run(k, { font: MONO_FONT, size: SZ_TINY, bold: true, color: EMERALD_DARK })], { after: 10, line: 180, keepNext: true }),
    para([run(v, { size: SZ_BODY, color: INK })], { after: 30, line: 220 }),
  ]).flat();

  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [half, USABLE - half],
    borders: hairlines,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: half, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: PAPER, color: 'auto' },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            borders: hairlines,
            children: cells([
              ['Contracting Officer (CO)', '{{CO Name · Email · Phone}}'],
              ['COR / ACOR', '{{COR Name · Email · Phone}}'],
            ]),
          }),
          new TableCell({
            width: { size: USABLE - half, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: ROW_ALT, color: 'auto' },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            borders: hairlines,
            children: cells([
              ['Contract Type', '{{FFP / T&M / CPFF / IDIQ — Task Order}}'],
              ['QASP Version / Date', '{{v1.0 · MM/DD/YYYY}}'],
            ]),
          }),
        ],
      }),
    ],
  });
}

// =============================================================================
// SECTION 3 — Scope
// =============================================================================
function scopeSection() {
  return [
    spacer(100),
    sectionHeading('1. Scope'),
    spacer(60),
    kicker('Purpose'),
    bodyPara('This QASP establishes the surveillance methods the government will use to confirm that {{CONTRACTOR NAME}} meets the performance standards defined in the Performance Work Statement (PWS) and contract SOW. It isn\'t a how-to-do-it guide for the contractor — it documents how the government verifies what got done.'),
    kicker('Contract Scope Summary'),
    bodyPara('[Briefly describe the work — e.g., "Provide IT help-desk support (Tier 1–3) for approximately 2,400 users across five USAF installations under a firm-fixed-price task order under ITES-3S, NAICS 541512."] FAR 46.401 requires the contracting officer to establish a quality assurance program for every contract above the micro-purchase threshold unless the CO determines it isn\'t appropriate.'),
    kicker('QASP Authority'),
    bullet('FAR 46.401 — Government Contract Quality Assurance'),
    bullet('FAR 46.4 — Government Contract Quality Assurance Procedures'),
    bullet('FAR 52.246-4 / 52.246-5 / 52.246-6 (select applicable clause)'),
    bullet('DFARS 246.401 (if DoD contract)'),
    bullet('Agency-specific supplement: {{e.g., AFARS Part 5146, NMCARS 5246, HSAR Part 3046}}'),
  ];
}

// =============================================================================
// SECTION 4 — Quality Standards
// =============================================================================
function standardsSection() {
  return [
    spacer(80),
    sectionHeading('2. Quality Standards'),
    spacer(60),
    kicker('Applicable Standards'),
    bodyPara('The following frameworks set the baseline against which contractor performance is measured. The contractor must maintain certifications current throughout the period of performance and provide updated certificates within 10 business days of renewal or lapse.'),
    // Standards table: Standard | Requirement | Verification Artifact
    new Table({
      width: { size: USABLE, type: WidthType.DXA },
      columnWidths: [2600, 3948, 3100],
      borders: hairlines,
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            hcell('Standard / Framework', 2600),
            hcell('Contractor Requirement', 3948),
            hcell('Verification Artifact', 3100),
          ],
        }),
        ...([
          ['ISO 9001:2015', 'Maintain certified QMS; internal audits ≥ 1/year; management review ≥ 2/year', 'Certificate of Registration + last audit report'],
          ['CMMI-SVC v2.0 (if applicable)', 'Maintain appraisal level cited in PWS (L2 or L3); notify CO within 5 days of status change', 'CMMI Institute appraisal result letter'],
          ['NIST SP 800-53 / 800-171', 'Score ≥ 110 on SPRS at task-order award; notify CO within 72 hrs of any change ≥ –5 pts', 'SPRS score snapshot + SSP excerpt'],
          ['Agency-Specific Standard', '{{e.g., CMS TRM v7, DHS ISD, VA Directive 6500}} — describe requirement here', 'Evidence type specified in PWS §{{X.X}}'],
          ['[Add row or delete]', '—', '—'],
        ]).map(([std, req, art], i) =>
          new TableRow({
            cantSplit: true,
            children: [
              dcell(std,  2600, i % 2 === 1),
              pcell(req,  3948, i % 2 === 1),
              pcell(art,  3100, i % 2 === 1),
            ],
          })
        ),
      ],
    }),
  ];
}

// =============================================================================
// SECTION 5 — Performance Indicators table
// =============================================================================
function performanceSection() {
  // Column widths: Deliverable | Std | AQL | Surveillance | Frequency
  // Total = USABLE = 9648
  const cols = [2000, 2000, 1400, 2400, 1848];

  return [
    spacer(80),
    sectionHeading('3. Performance Indicators'),
    spacer(60),
    bodyPara('For each deliverable below, the government will apply the surveillance method at the stated frequency. Failure to meet the Acceptable Quality Level (AQL) triggers the corrective action process in Section 4. Adjust rows to match your actual PWS deliverables — delete placeholder rows not applicable to your contract.', { after: 80 }),
    new Table({
      width: { size: USABLE, type: WidthType.DXA },
      columnWidths: cols,
      borders: hairlines,
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            hcell('Deliverable / Service', cols[0]),
            hcell('Performance Standard', cols[1]),
            hcell('AQL', cols[2]),
            hcell('Surveillance Method', cols[3]),
            hcell('Frequency', cols[4]),
          ],
        }),
        ...([
          [
            'Help Desk — Tier 1 Ticket Resolution',
            '≥ 90% of Tier 1 tickets resolved within 4 business hours',
            '90% / period',
            'Automated report pull from {{ServiceNow / Remedy}} + 5% random sample review by COR',
            'Monthly',
          ],
          [
            'Monthly Status Report',
            'Delivered by 5th calendar day of following month; contains all required sections per PWS §{{X.X}}',
            '100% on-time; 0 missing sections',
            'COR document review checklist (Appendix A)',
            'Monthly',
          ],
          [
            'SLA Uptime — Network Monitoring',
            '99.5% uptime, measured 24/7 excluding approved maintenance windows',
            '99.5% / month',
            'System-generated uptime log + COR spot review',
            'Monthly; annual deep-dive',
          ],
          [
            'Key Personnel Staffing',
            'All key positions filled; replacements submitted to CO within 30 days of vacancy per FAR 52.237-3',
            '100% fill rate; 0 vacancies > 30 days',
            'Personnel roster submitted with each status report; COR verifies against approved list',
            'Monthly',
          ],
          [
            'Security Incident Notification',
            'Verbal notification to ISSO within 1 hour; written within 8 hours per NIST SP 800-61',
            '100% compliance',
            'Incident log review + after-action report',
            'Per-event; monthly log audit',
          ],
          [
            '[Add row for your deliverable]',
            '[Define the standard — measurable, time-bound]',
            '[Target %]',
            '[How will the government check? Random sampling, 100% inspection, periodic report, observation]',
            '[Daily / Weekly / Monthly / Per-event]',
          ],
        ]).map(([deliv, std, aql, method, freq], i) =>
          new TableRow({
            cantSplit: false,
            children: [
              dcell(deliv, cols[0], i % 2 === 1),
              pcell(std,   cols[1], i % 2 === 1),
              dcell(aql,   cols[2], i % 2 === 1),
              pcell(method,cols[3], i % 2 === 1),
              dcell(freq,  cols[4], i % 2 === 1),
            ],
          })
        ),
      ],
    }),
  ];
}

// =============================================================================
// SECTION 6 — Corrective Action Process
// =============================================================================
function correctiveSection() {
  return [
    spacer(80),
    sectionHeading('4. Corrective Action Process'),
    spacer(60),
    kicker('Step-by-Step'),
    numbered(1, 'Identify deficiency — COR or designated inspector detects a missed AQL. Document in the Surveillance Activity Checklist (SAC) with date, deliverable, actual vs. required performance.'),
    numbered(2, 'Informal notice — COR contacts contractor POC verbally or by email within 2 business days. Minor first-time deficiencies may be resolved informally; COR documents outcome in the SAC.'),
    numbered(3, 'Cure Notice / Show Cause — If the deficiency isn\'t corrected or recurs, COR recommends issuance of a Cure Notice per FAR 49.607 (FFP) or Show Cause Letter (T&M/cost-plus). CO issues notice. Contractor has {{10 / 15 / 30}} calendar days to respond with a corrective action plan (CAP).'),
    numbered(4, 'CAP review — CO and COR evaluate the CAP within 5 business days of receipt. An inadequate or missing CAP may escalate to termination for default (FFP) or convenience (cost-type) per FAR 52.249-8 or 52.249-6.'),
    numbered(5, 'Negative CPARS entry — COR initiates a Past Performance assessment update in CPARS reflecting any cure notice or sustained deficiency. See FAR 42.1503 and DFARS 242.1503 for DoD contracts.'),
    numbered(6, 'Resolution & close-out — Once the deficiency is corrected to the CO\'s satisfaction, COR updates the SAC with closure date. Close-out is required before the CO signs off on the final invoice.'),
    spacer(60),
    kicker('Deductions / Remedies (FFP contracts)'),
    bodyPara('If the contract includes a Service Level Agreement (SLA) with deduction schedule, the CO may issue a unilateral modification to reduce the invoice under FAR 52.246-4 (Fixed-Price) for work not performed to standard. Deduction amounts must be documented in writing and communicated to the contractor before invoice adjustment.', { muted: false }),
  ];
}

// =============================================================================
// SECTION 7 — Performance Reporting Cadence
// =============================================================================
function reportingSection() {
  const cols = [2400, 3000, 2200, 2048];
  return [
    spacer(80),
    sectionHeading('5. Performance Reporting Cadence'),
    spacer(60),
    bodyPara('The table below lists every recurring report the contractor must deliver. The COR\'s surveillance notes feed the quarterly CPARS narratives — keep records current.', { after: 80 }),
    new Table({
      width: { size: USABLE, type: WidthType.DXA },
      columnWidths: cols,
      borders: hairlines,
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            hcell('Report / Deliverable', cols[0]),
            hcell('Content Requirements', cols[1]),
            hcell('Due Date', cols[2]),
            hcell('Submit To', cols[3]),
          ],
        }),
        ...([
          ['Monthly Status Report', 'Progress against PWS milestones; staffing roster; open issues log; financial summary (T&M only)', '5th calendar day of following month', 'COR + CO (email + contract file)'],
          ['Quarterly Performance Self-Assessment', 'Contractor\'s own evaluation against AQLs; root-cause analysis for any missed metric; improvement actions', '10th calendar day after end of each quarter', 'CO via CPARS supplemental (or email if CPARS N/A)'],
          ['Annual Summary Report', 'Year-in-review: all metrics vs. standards; key personnel changes; subcontract plan progress (if applicable, FAR 52.219-9)', '30 days before option period anniversary', 'CO + Program Manager'],
          ['Incident / Issue Notification', 'Verbal + written notice per PWS §{{X.X}}; draft after-action within 5 business days', 'Per-event (see Section 3)', 'CO + COR + ISSO (security incidents)'],
          ['[Add custom report]', '{{Describe content per PWS}}', '{{Date / cadence}}', '{{Recipient}}'],
        ]).map(([rpt, content, due, to], i) =>
          new TableRow({
            cantSplit: false,
            children: [
              dcell(rpt,    cols[0], i % 2 === 1),
              pcell(content,cols[1], i % 2 === 1),
              pcell(due,    cols[2], i % 2 === 1),
              pcell(to,     cols[3], i % 2 === 1),
            ],
          })
        ),
      ],
    }),
  ];
}

// =============================================================================
// SECTION 8 — Sample Inspection Checklist
// =============================================================================
function checklistSection() {
  return [
    spacer(80),
    sectionHeading('6. Sample Inspection Checklist (Appendix A)'),
    spacer(60),
    bodyPara('Use this checklist at each surveillance event. Make a copy, fill in the header, check each item, and file the signed copy in the contract administration record. Keep at least three years post-closeout per FAR 4.805.'),
    spacer(40),
    // Checklist header
    new Table({
      width: { size: USABLE, type: WidthType.DXA },
      columnWidths: [Math.floor(USABLE / 3), Math.floor(USABLE / 3), USABLE - 2 * Math.floor(USABLE / 3)],
      borders: hairlines,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            tcell({ width: Math.floor(USABLE / 3), shading: ROW_ALT, children: [
              para([run('DATE OF INSPECTION', { font: MONO_FONT, size: SZ_TINY, bold: true, color: EMERALD_DARK })], { after: 10, line: 180, keepNext: true }),
              para([run('{{MM/DD/YYYY}}', { size: SZ_BODY, color: INK })], { after: 0, line: 220 }),
            ]}),
            tcell({ width: Math.floor(USABLE / 3), shading: PAPER, children: [
              para([run('INSPECTOR (COR / ACOR)', { font: MONO_FONT, size: SZ_TINY, bold: true, color: EMERALD_DARK })], { after: 10, line: 180, keepNext: true }),
              para([run('{{Name · Title}}', { size: SZ_BODY, color: INK })], { after: 0, line: 220 }),
            ]}),
            tcell({ width: USABLE - 2 * Math.floor(USABLE / 3), shading: ROW_ALT, children: [
              para([run('PERIOD COVERED', { font: MONO_FONT, size: SZ_TINY, bold: true, color: EMERALD_DARK })], { after: 10, line: 180, keepNext: true }),
              para([run('{{MM/DD/YYYY – MM/DD/YYYY}}', { size: SZ_BODY, color: INK })], { after: 0, line: 220 }),
            ]}),
          ],
        }),
      ],
    }),
    spacer(60),
    kicker('Deliverables & Reporting'),
    checkbox('All scheduled deliverables received on or before due dates listed in Section 5'),
    checkbox('Monthly Status Report contains all required sections per PWS §{{X.X}}'),
    checkbox('Key personnel roster submitted and matches CO-approved list'),
    checkbox('No key-personnel vacancies outstanding > 30 calendar days'),
    checkbox('Subcontractor utilization report attached (if SB subcontracting plan applies — FAR 52.219-9)'),
    spacer(40),
    kicker('Quality & Compliance'),
    checkbox('Contractor AQL performance at or above thresholds in Section 3 for all metrics'),
    checkbox('No open cure notices / show-cause letters from prior period'),
    checkbox('ISO 9001 / CMMI certificate current (verify expiry date: {{expiry}})'),
    checkbox('SPRS score current and on file with CO'),
    checkbox('Any NIST SP 800-171 score change ≥ −5 pts reported within 72 hours'),
    spacer(40),
    kicker('Security & Incident Management'),
    checkbox('No unresolved security incidents from prior period (verify incident log)'),
    checkbox('ISSO/ISSM system access reviews completed per schedule'),
    checkbox('All contractor personnel hold required clearances / suitability at required level'),
    spacer(40),
    kicker('Financial (T&M / Cost-Plus Only)'),
    checkbox('Burn rate within ±10% of approved spend plan for this period'),
    checkbox('Invoices submitted through {{IPP / OB10 / Agency portal}} with supporting labor/ODC detail'),
    checkbox('No unsupported charges identified in random invoice sample'),
    spacer(40),
    kicker('Notes / Deficiencies Found'),
    bodyPara('[Describe any deficiency in detail — deliverable name, date, deviation from standard, impact. Reference the applicable AQL row in Section 3. Leave blank if no deficiencies.]', { italics: true, muted: true }),
    spacer(40),
    kicker('Inspector Signature & Date'),
    new Table({
      width: { size: USABLE, type: WidthType.DXA },
      columnWidths: [Math.floor(USABLE * 0.55), USABLE - Math.floor(USABLE * 0.55)],
      borders: hairlines,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            tcell({ width: Math.floor(USABLE * 0.55), shading: PAPER, children: [
              para([run('Signature: ___________________________________', { size: SZ_BODY, color: INK })], { after: 0, line: 220 }),
            ]}),
            tcell({ width: USABLE - Math.floor(USABLE * 0.55), shading: ROW_ALT, children: [
              para([run('Date: _____________________', { size: SZ_BODY, color: INK })], { after: 0, line: 220 }),
            ]}),
          ],
        }),
      ],
    }),
    spacer(80),
    // Footer
    para([
      run('capturepilot.com', { font: MONO_FONT, size: SZ_TINY, color: SLATE }),
      run('  ·  Federal Lead Kit v1.5 · Quality Assurance Surveillance Plan Template · FAR 46.401', {
        size: SZ_TINY, color: SLATE_LIGHT,
      }),
    ], { before: 120, after: 0, align: AlignmentType.CENTER, line: 200 }),
  ];
}

// =============================================================================
// Assemble the document
// =============================================================================
function buildContent() {
  return [
    titleStrip(),
    spacer(80),
    metaStrip(),
    ...scopeSection(),
    ...standardsSection(),
    ...performanceSection(),
    ...correctiveSection(),
    ...reportingSection(),
    ...checklistSection(),
  ];
}

const doc = new Document({
  creator: 'CapturePilot',
  title: 'Quality Assurance Surveillance Plan (QASP) Template',
  description: 'Federal Lead Kit v1.5 · Post-Award Compliance · Editable QASP Word template',
  styles: {
    default: {
      document: {
        run: { font: BODY_FONT, size: SZ_BODY, color: INK },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
          margin: {
            top:    MARGIN_TOP,
            right:  MARGIN_SIDE,
            bottom: MARGIN_BOTTOM,
            left:   MARGIN_SIDE,
            header: convertInchesToTwip(0.4),
            footer: convertInchesToTwip(0.4),
          },
        },
      },
      children: buildContent(),
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(OUTPUT, buffer);
console.log('Wrote', OUTPUT, '— bytes:', buffer.length);

if (!existsSync(DEPLOY_DIR)) {
  mkdirSync(DEPLOY_DIR, { recursive: true });
}

try {
  copyFileSync(OUTPUT, DEPLOY);
  console.log('Deployed ->', DEPLOY);
} catch (err) {
  console.error('Deploy copy failed:', err.message);
  process.exit(1);
}
