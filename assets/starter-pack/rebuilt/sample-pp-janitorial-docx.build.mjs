// Build script: FLK_06_Sample_Past_Performance_Janitorial.docx
// Run: node assets/starter-pack/rebuilt/sample-pp-janitorial-docx.build.mjs
// Produces a ~2-page filled-in past performance reference for a
// janitorial SDVOSB on a VA medical center custodial contract.

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
const OUTPUT = join(__dirname, 'FLK_06_Sample_Past_Performance_Janitorial.docx');
const DEPLOY = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/06_Past_Performance_Reference_Templates/FLK_06_Sample_Past_Performance_Janitorial.docx';

// --- Brand ------------------------------------------------------------------
const EMERALD      = '10b981';
const EMERALD_DARK = '047857';
const FOREST       = '064e3b';
const INK          = '0f172a';
const SLATE        = '475569';
const SLATE_LIGHT  = '94a3b8';
const PAPER        = 'ffffff';
const ROW_ALT      = 'f0fdf4';   // very light mint — green-tinted alt rows
const BAND_BG      = 'ecfdf5';   // section header band

const BODY_FONT  = 'Calibri';
const MONO_FONT  = 'Consolas';

// Letter, 1-in margins → usable 6.5 in = 9360 twips
const PAGE_W   = convertInchesToTwip(8.5);
const PAGE_H   = convertInchesToTwip(11);
const MARGIN   = convertInchesToTwip(1.0);
const USABLE   = 9360; // twips

// Font sizes (half-points)
const SZ_TINY  = 16; // 8pt
const SZ_BODY  = 18; // 9pt
const SZ_LEAD  = 20; // 10pt
const SZ_H3    = 22; // 11pt
const SZ_H2    = 28; // 14pt
const SZ_H1    = 36; // 18pt

// --- Border helpers ---------------------------------------------------------
const noBorder  = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = {
  top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
  insideHorizontal: noBorder, insideVertical: noBorder,
};
const thin  = { style: BorderStyle.SINGLE, size: 4, color: 'a7f3d0' };
const thinB = {
  top: thin, bottom: thin, left: thin, right: thin,
  insideHorizontal: thin, insideVertical: thin,
};
const midGray  = { style: BorderStyle.SINGLE, size: 4, color: 'cbd5e1' };
const midBorders = {
  top: midGray, bottom: midGray, left: midGray, right: midGray,
  insideHorizontal: midGray, insideVertical: midGray,
};

// --- Text helpers -----------------------------------------------------------
function run(text, opts = {}) {
  return new TextRun({
    text,
    font: opts.font || BODY_FONT,
    size: opts.size || SZ_BODY,
    color: opts.color || INK,
    bold: !!opts.bold,
    italics: !!opts.italics,
    underline: opts.underline,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    alignment: opts.alignment || AlignmentType.LEFT,
    spacing: {
      before: opts.before ?? 0,
      after:  opts.after  ?? 60,
      line:   opts.line   ?? 260,
    },
    indent:    opts.indent,
    keepNext:  opts.keepNext  ?? false,
    keepLines: opts.keepLines ?? true,
    children:  Array.isArray(children) ? children : [children],
  });
}

function cell({ children, width, shading, colspan, rowspan, valign = 'top', padding, borders }) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: colspan,
    rowSpan: rowspan,
    shading: shading ? { type: ShadingType.CLEAR, fill: shading, color: 'auto' } : undefined,
    verticalAlign: valign,
    margins: padding || { top: 60, bottom: 60, left: 100, right: 100 },
    borders,
    children: Array.isArray(children) ? children : [children],
  });
}

// Bullet
function bullet(text, opts = {}) {
  return para([
    run('•  ', { size: SZ_BODY, bold: true, color: EMERALD_DARK }),
    run(text, { size: SZ_BODY, color: INK, bold: opts.bold }),
  ], { after: 40, line: 240, indent: { left: 200, hanging: 200 } });
}

// Section banner (full-width dark green strip)
function sectionBanner(label) {
  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [USABLE],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: USABLE,
            shading: FOREST,
            valign: 'center',
            padding: { top: 80, bottom: 80, left: 160, right: 160 },
            borders: noBorders,
            children: [
              para([
                run(label.toUpperCase(), {
                  font: MONO_FONT, size: SZ_H3, bold: true, color: 'ffffff',
                }),
              ], { after: 0, line: 220 }),
            ],
          }),
        ],
      }),
    ],
  });
}

// Two-column KV table (label | value pairs)
function kvTable(rows) {
  // label col 2500, value col 6860
  const L = 2500, V = USABLE - L;
  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [L, V],
    borders: midBorders,
    rows: rows.map(([label, value], i) =>
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: L,
            shading: i % 2 === 0 ? BAND_BG : ROW_ALT,
            valign: 'top',
            padding: { top: 60, bottom: 60, left: 120, right: 80 },
            children: [para([run(label, { size: SZ_BODY, bold: true, color: FOREST })], { after: 0, line: 220 })],
          }),
          cell({
            width: V,
            shading: PAPER,
            valign: 'top',
            padding: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [para([run(value, { size: SZ_BODY, color: INK })], { after: 0, line: 220 })],
          }),
        ],
      })
    ),
  });
}

// Full-width single-cell "note" box
function noteBox(text, shade = BAND_BG) {
  return new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [USABLE],
    borders: thinB,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: USABLE,
            shading: shade,
            valign: 'top',
            padding: { top: 80, bottom: 80, left: 140, right: 140 },
            borders: thinB,
            children: [para([run(text, { size: SZ_BODY, color: INK })], { after: 0, line: 240 })],
          }),
        ],
      }),
    ],
  });
}

function spacer(pt = 6) {
  return para([run('', { size: pt * 2 })], { after: pt * 2, line: 80 });
}

// --- Page builder -----------------------------------------------------------
function buildDoc() {
  const children = [];

  // ── COVER HEADER ──────────────────────────────────────────────────────────
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [USABLE],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: USABLE,
            shading: FOREST,
            valign: 'center',
            padding: { top: 200, bottom: 200, left: 220, right: 220 },
            borders: noBorders,
            children: [
              para([
                run('PAST PERFORMANCE REFERENCE', {
                  font: MONO_FONT, size: SZ_TINY, bold: true, color: 'a7f3d0',
                }),
              ], { after: 40, line: 200, keepNext: true }),
              para([
                run('Federal Lead Kit — Janitorial Services  ·  VA Medical Center Custodial Contract', {
                  size: SZ_H2, bold: true, color: 'ffffff',
                }),
              ], { after: 50, line: 280, keepNext: true }),
              para([
                run('Apex Custodial Solutions, LLC  ·  SDVOSB  ·  NAICS 561720  ·  CAGE 7RXV2  ·  UEI AXCS56172089VA', {
                  size: SZ_LEAD, color: 'a7f3d0',
                }),
              ], { after: 0, line: 240 }),
            ],
          }),
        ],
      }),
    ],
  }));

  children.push(spacer(10));

  // ── SECTION 1: CONTRACT OVERVIEW ─────────────────────────────────────────
  children.push(sectionBanner('Section 1 — Contract Overview'));
  children.push(spacer(4));
  children.push(kvTable([
    ['Contract Number',       'VA258-19-C-0047'],
    ['Contract Title',        'Custodial Services — VA Phoenix Health Care System (Main Campus + 4 CBOCs)'],
    ['Agency / Customer',     'Department of Veterans Affairs — Phoenix Health Care System (VISN 18)'],
    ['Contracting Office',    'VA Phoenix HCS, Network Contracting Office 18, 650 E. Indian School Rd, Phoenix AZ 85012'],
    ['NAICS Code',            '561720 — Janitorial Services'],
    ['PSC Code',              'S201 — Custodial Janitorial Services'],
    ['Set-Aside Type',        'SDVOSB Sole-Source (FAR 19.1406 — below SAP threshold, extended via modifications)'],
    ['Base Contract Value',   '$1,950,000 (3-year base: Oct 2019 – Sep 2022)'],
    ['Total w/ Modifications','$2,400,000 (Mod P00001 added CBOC #4, Mod P00002 extended 12 months through Sep 2023)'],
    ['Period of Performance', 'October 1, 2019 – September 30, 2024 (base + 2 option years exercised via IGCE review)'],
    ['Contract Type',         'Firm-Fixed-Price (FFP), performance-based statement of work'],
    ['Clearances Required',   'Background Investigation (BI) / Tier 1 — all custodial staff; contractor PM held PIV card'],
  ]));

  children.push(spacer(10));

  // ── SECTION 2: SCOPE OF WORK ──────────────────────────────────────────────
  children.push(sectionBanner('Section 2 — Scope of Work'));
  children.push(spacer(4));
  children.push(noteBox(
    'Apex Custodial Solutions provided comprehensive custodial and infection-control services across ' +
    '420,000 sq ft of clinical, administrative, and patient-care space at the VA Phoenix HCS main ' +
    'campus and four Community-Based Outpatient Clinics (CBOCs) in Mesa, Peoria, Sun City, and ' +
    'Surprise, AZ. Work was performed 365 days/year under a Performance Work Statement (PWS) ' +
    'aligned with VA Handbook 7610 (Housekeeping) and CDC environmental infection-control guidelines.'
  ));
  children.push(spacer(6));

  // deliverables table
  const delCols = [1600, 2500, 2600, 2660];
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: delCols,
    borders: midBorders,
    rows: [
      // header
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          ...['Schedule', 'Deliverable / Task', 'Performance Standard', 'FAR / VA Reference'].map(
            (h, i) => cell({
              width: delCols[i],
              shading: EMERALD_DARK,
              valign: 'center',
              padding: { top: 60, bottom: 60, left: 100, right: 80 },
              children: [para([run(h, { size: SZ_TINY, bold: true, color: 'ffffff', font: MONO_FONT })], { after: 0, line: 200 })],
            })
          ),
        ],
      }),
      // data rows
      ...[
        ['Daily',    'High-touch surface disinfection (doorknobs, light switches, handrails, elevator buttons); restroom sanitation; trash removal; mopping all patient-care corridors',       'Zero Critical (Class C) findings per monthly QAE inspection; AQL 95%',              'VA PWS §3.2.1 / CDC 2019 Environmental Guidelines'],
        ['Weekly',   'Deep-scrub of all hard-floor surfaces (surgical corridors + waiting areas); burnishing; restroom grout treatment; HEPA-vacuum all soft furnishings',                   'No repeat findings across 2 consecutive monthly inspections; AQL 90%',              'VA PWS §3.2.2 / APPA Level 2 standard'],
        ['Monthly',  'Carpet extraction (all CBOC waiting areas); high-dusting above 7 ft (lights, vents, ledges); log submission to COR via VetsPro CMMS within 3 business days',         'Written completion log delivered NLT 3 business days after last workday of month',   'VA PWS §3.2.3 / FAR 52.246-4 (Inspection of Services)'],
        ['Annual',   'Strip-and-wax of all VCT floors; window cleaning (exterior + interior) including ladder-access zones; annual deep-clean report submitted to Facility Manager',       'Written report with pre/post photos delivered NLT Oct 15 each contract year',        'VA PWS §3.2.4 / VA Handbook 7610 §8.3'],
      ].map(([sched, task, std, ref], i) =>
        new TableRow({
          cantSplit: true,
          children: [
            cell({ width: delCols[0], shading: i % 2 === 0 ? BAND_BG : ROW_ALT, padding: { top: 60, bottom: 60, left: 100, right: 80 }, children: [para([run(sched, { size: SZ_TINY, bold: true, color: FOREST })], { after: 0, line: 220 })] }),
            cell({ width: delCols[1], shading: PAPER, padding: { top: 60, bottom: 60, left: 100, right: 80 }, children: [para([run(task, { size: SZ_TINY })], { after: 0, line: 220 })] }),
            cell({ width: delCols[2], shading: PAPER, padding: { top: 60, bottom: 60, left: 100, right: 80 }, children: [para([run(std, { size: SZ_TINY })], { after: 0, line: 220 })] }),
            cell({ width: delCols[3], shading: PAPER, padding: { top: 60, bottom: 60, left: 100, right: 80 }, children: [para([run(ref, { size: SZ_TINY, color: SLATE })], { after: 0, line: 220 })] }),
          ],
        })
      ),
    ],
  }));

  children.push(spacer(10));

  // ── SECTION 3: CERTIFICATIONS & PROTOCOLS ────────────────────────────────
  children.push(sectionBanner('Section 3 — Certifications & Infection-Control Protocols'));
  children.push(spacer(4));

  const certCols = [USABLE / 2, USABLE / 2];
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: certCols,
    borders: midBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: certCols[0],
            shading: BAND_BG,
            valign: 'top',
            padding: { top: 100, bottom: 100, left: 140, right: 80 },
            children: [
              para([run('Green-Cleaning Certifications', { size: SZ_H3, bold: true, color: FOREST })], { after: 60, line: 240, keepNext: true }),
              bullet('ISSA CIMS-GB Certification (Cleaning Industry Management Standard – Green Building), cert no. CIMS-23-0088, valid through Dec 2025'),
              bullet('EPA Safer Choice compliant products — full product list on file with VA COR (no quat-ammonium compounds in patient-care areas)'),
              bullet('GS-42-certified floor care products; GS-37-certified bathroom cleaners throughout all patient-care zones'),
              bullet('Green Seal–registered disinfectants meeting CDC kill-time thresholds for C. diff, MRSA, and VRE'),
            ],
          }),
          cell({
            width: certCols[1],
            shading: ROW_ALT,
            valign: 'top',
            padding: { top: 100, bottom: 100, left: 80, right: 140 },
            children: [
              para([run('Infection-Control Protocols', { size: SZ_H3, bold: true, color: FOREST })], { after: 60, line: 240, keepNext: true }),
              bullet('ICRA (Infection Control Risk Assessment) training completed by all staff before initial period of performance; refresher annually'),
              bullet('CDC 2019 Environmental Infection Control Guidelines followed for terminal cleans of isolation rooms; two-person team with observer'),
              bullet('Fluorescent marker and ATP bioluminescence audits conducted quarterly by PM; results shared with COR within 48 hours'),
              bullet('Color-coded microfiber system (red=restroom, yellow=patient care, blue=admin, green=food) enforced 100% of operating shifts'),
            ],
          }),
        ],
      }),
    ],
  }));

  children.push(spacer(10));

  // ── SECTION 4: KEY PERSONNEL ──────────────────────────────────────────────
  children.push(sectionBanner('Section 4 — Key Personnel'));
  children.push(spacer(4));
  children.push(kvTable([
    ['Contract Manager (PM)',    'Maria T. Sandoval — RBSM, CIMS; 15+ years federal custodial management; held PIV card entire PoP'],
    ['Site Supervisor (Phoenix)','José A. Hernandez — ISSA Cleaning Management Institute Level II; on-site daily'],
    ['FTE at Peak',              '22 direct FTE (14 day-shift, 8 evening-shift) + 3 part-time CBOC leads'],
    ['Turnover Rate',            '11% annually (below VA-tracked industry median of 38% for services contracts in VISN 18)'],
    ['Security Clearances',      'All 22 FTE completed Tier 1 BI prior to site access; zero access revocations during PoP'],
    ['Subcontractors',           'None — 100% self-performed (Prime, sole-source SDVOSB)'],
  ]));

  children.push(spacer(10));

  // ── SECTION 5: PERFORMANCE RECORD ────────────────────────────────────────
  children.push(sectionBanner('Section 5 — Performance Record'));
  children.push(spacer(4));
  children.push(kvTable([
    ['CPARS Rating (FY2020)',     'Exceptional — "Contractor consistently exceeded all PWS requirements; zero critical deficiencies recorded" — CO Kim Wheeler'],
    ['CPARS Rating (FY2021)',     'Exceptional — "Rapid response to COVID-19 terminal clean protocol changes; no healthcare-associated event linked to custodial areas"'],
    ['CPARS Rating (FY2022)',     'Very Good — Site supervisor turnover in Q2 caused 2 minor findings; corrective action closed within 5 business days'],
    ['CPARS Rating (FY2023)',     'Exceptional — All option-year metrics met or exceeded; facility satisfaction survey 4.7/5.0'],
    ['Deductions / Penalties',   'None — no deductions or cure notices issued during the 5-year PoP'],
    ['Complaints / Grievances',  'Zero formal grievances filed; one informal concern (odor in C-wing stairwell, Oct 2021) resolved same day'],
    ['Option Years Exercised',   '2 of 2 — VA exercised both options without gap; sole-source justification renewed under FAR 6.302-5 each time'],
  ]));

  children.push(spacer(10));

  // ── SECTION 6: AGENCY POC (VERIFIABLE) ───────────────────────────────────
  children.push(sectionBanner('Section 6 — Agency Point of Contact'));
  children.push(spacer(4));
  children.push(kvTable([
    ['Contracting Officer (CO)',        'Kim A. Wheeler, Contracting Officer, VA NCO 18'],
    ['CO Phone',                        '(602) 277-5551 ext. 7042'],
    ['CO Email',                        'kim.wheeler2@va.gov'],
    ['Contracting Officer Rep (COR)',   'Lt. Col. (Ret.) David R. Okafor, COR, Facilities Management, VA Phoenix HCS'],
    ['COR Phone',                       '(602) 277-5551 ext. 4291'],
    ['COR Email',                       'david.okafor@va.gov'],
    ['Facility Manager (secondary POC)','Sandra M. Tran, Chief, Facilities Operations, VA Phoenix HCS'],
    ['Facility Manager Phone',          '(602) 277-5551 ext. 3305'],
  ]));

  children.push(spacer(10));

  // ── SECTION 7: DIFFERENTIATORS / QUICK SUMMARY ────────────────────────────
  children.push(sectionBanner('Section 7 — Differentiators for Similar Procurements'));
  children.push(spacer(4));
  children.push(noteBox(
    'Use this section when submitting this reference in response to a Sources Sought, RFI, or solicitation. ' +
    'Tailor the two or three bullets most relevant to the agency\'s stated evaluation factors.',
    ROW_ALT
  ));
  children.push(spacer(6));
  children.push(
    bullet('5 consecutive years, zero contract deductions — the VA measured us against AQL 95% on high-touch surface disinfection every single month. We hit it every time.'),
    bullet('ISSA CIMS-GB certified — not "pursuing" — which means our QA system, chemical inventory, and employee training all meet a third-party verified standard before we ever walk onto a federal campus.'),
    bullet('SDVOSB, self-performed — no pass-through risk, no subcontractor coordination gap, and the VA\'s small-business credit stays with a firm whose owner actually served.'),
    bullet('COVID-era track record: when VA changed the terminal-clean protocol to CDC\'s enhanced COVID-19 guidance in April 2020, we retrained 22 FTE and stood up the new protocol within 72 hours of the modification — without a stop-work or cure notice.'),
    bullet('Scalable — from a single CBOC (6,000 sq ft) to a 420,000 sq ft full-service medical center campus on the same contract vehicle.'),
  );

  children.push(spacer(10));

  // ── FOOTER ────────────────────────────────────────────────────────────────
  children.push(new Table({
    width: { size: USABLE, type: WidthType.DXA },
    columnWidths: [USABLE],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: USABLE,
            shading: FOREST,
            valign: 'center',
            padding: { top: 80, bottom: 80, left: 140, right: 140 },
            borders: noBorders,
            children: [
              para([
                run('capturepilot.com', { font: MONO_FONT, size: SZ_TINY, bold: true, color: 'a7f3d0' }),
                run('  ·  Federal Lead Kit — Past Performance Reference Templates  ·  FLK_06_Sample_Past_Performance_Janitorial', {
                  size: SZ_TINY, color: 'ffffff',
                }),
              ], { after: 0, line: 200, alignment: AlignmentType.CENTER }),
            ],
          }),
        ],
      }),
    ],
  }));

  return children;
}

// --- Build ------------------------------------------------------------------
const doc = new Document({
  creator: 'CapturePilot',
  title: 'Sample Past Performance — VA Medical Center Janitorial Contract',
  description: 'Federal Lead Kit · FLK_06 · Apex Custodial Solutions SDVOSB — VA Phoenix HCS',
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
          size: { width: PAGE_W, height: PAGE_H },
          margin: {
            top:    MARGIN,
            right:  MARGIN,
            bottom: MARGIN,
            left:   MARGIN,
            header: convertInchesToTwip(0.3),
            footer: convertInchesToTwip(0.3),
          },
        },
      },
      children: buildDoc(),
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(OUTPUT, buffer);
console.log('Wrote', OUTPUT, '— bytes:', buffer.length);

// Deploy
try {
  const deployDir = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/06_Past_Performance_Reference_Templates';
  if (!existsSync(deployDir)) mkdirSync(deployDir, { recursive: true });
  copyFileSync(OUTPUT, DEPLOY);
  console.log('Deployed ->', DEPLOY);
} catch (err) {
  console.error('Deploy copy failed:', err.message);
  process.exit(1);
}
