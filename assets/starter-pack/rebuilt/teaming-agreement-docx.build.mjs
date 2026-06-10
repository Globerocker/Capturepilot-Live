// Build script: Teaming Agreement Template (Editable Word)
// Output: FLK_09_Teaming_Agreement_Template.docx
// Run: node teaming-agreement-docx.build.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const docxPkg = require("/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/docx/dist/index.cjs");
const {
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
  ShadingType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  LevelFormat,
  convertInchesToTwip,
  TabStopType,
  TabStopPosition,
} = docxPkg;
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(
  __dirname,
  "FLK_09_Teaming_Agreement_Template.docx",
);

// ----- Brand tokens -----
const EMERALD = "10B981";
const EMERALD_DARK = "047857";
const INK = "0F172A";
const SLATE = "475569";
const MUTED = "94A3B8";
const PAPER = "F8FAFC";
const RED = "B91C1C";
const RED_BG = "FEE2E2";
const RULE = "E2E8F0";
const FONT = "Calibri"; // Inter not safe for cross-tool DOCX; Calibri ships with Word

// ----- Helpers -----
const inch = (n) => convertInchesToTwip(n);
const PAGE_W = inch(8.5);
const MARGIN = inch(1);
const CONTENT_W = PAGE_W - MARGIN * 2; // 9360 twips usable

function run(text, opts = {}) {
  return new TextRun({
    text,
    font: opts.font || FONT,
    size: opts.size ?? 22, // half-points; 22 = 11pt
    bold: !!opts.bold,
    italics: !!opts.italics,
    color: opts.color || INK,
    break: opts.break,
  });
}

function p(children, opts = {}) {
  const runs = Array.isArray(children)
    ? children.map((c) => (typeof c === "string" ? run(c, opts) : c))
    : [typeof children === "string" ? run(children, opts) : children];
  return new Paragraph({
    children: runs,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 120, line: opts.line ?? 300 },
    alignment: opts.align,
    heading: opts.heading,
    indent: opts.indent,
    keepNext: opts.keepNext,
    keepLines: opts.keepLines,
  });
}

function h1(text) {
  return new Paragraph({
    children: [run(text, { size: 36, bold: true, color: EMERALD_DARK })],
    spacing: { before: 0, after: 200, line: 320 },
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    keepLines: true,
  });
}

function h2(text) {
  return new Paragraph({
    children: [run(text, { size: 28, bold: true, color: INK })],
    spacing: { before: 280, after: 140, line: 300 },
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    keepLines: true,
    border: {
      bottom: { color: EMERALD, space: 4, style: BorderStyle.SINGLE, size: 12 },
    },
  });
}

function h3(text) {
  return new Paragraph({
    children: [run(text, { size: 24, bold: true, color: EMERALD_DARK })],
    spacing: { before: 220, after: 100, line: 280 },
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    keepLines: true,
  });
}

function body(text, opts = {}) {
  return p(text, { size: 22, color: INK, after: 140, ...opts });
}

function small(text, opts = {}) {
  return p(text, { size: 18, color: SLATE, after: 100, ...opts });
}

function spacer(after = 200) {
  return new Paragraph({ children: [run("")], spacing: { after } });
}

function bullet(text, opts = {}) {
  return new Paragraph({
    children: [
      run("•  ", { color: EMERALD_DARK, bold: true }),
      run(text, { color: INK, ...opts }),
    ],
    spacing: { after: 80, line: 280 },
    indent: { left: 360 },
  });
}

function checkbox(text) {
  return new Paragraph({
    children: [
      run("☐  ", { color: EMERALD_DARK, bold: true, size: 24 }),
      run(text, { color: INK }),
    ],
    spacing: { after: 100, line: 280 },
    indent: { left: 360 },
  });
}

// Plain cell
function cell(text, opts = {}) {
  const width = opts.width || 3120;
  const isHeader = !!opts.header;
  const shading = opts.shading;
  const para = new Paragraph({
    children: [
      run(text, {
        bold: isHeader || opts.bold,
        color: isHeader ? "FFFFFF" : opts.color || INK,
        size: opts.size ?? 20,
      }),
    ],
    spacing: { before: 60, after: 60, line: 260 },
    alignment: opts.align,
  });
  return new TableCell({
    children: [para],
    width: { size: width, type: WidthType.DXA },
    shading: shading
      ? { type: ShadingType.CLEAR, color: "auto", fill: shading }
      : isHeader
        ? { type: ShadingType.CLEAR, color: "auto", fill: EMERALD }
        : undefined,
    margins: { top: 120, bottom: 120, left: 160, right: 160 },
  });
}

// Cell that accepts an array of paragraphs (for multi-line / fillable areas)
function multiCell(paragraphs, opts = {}) {
  const width = opts.width || 3120;
  return new TableCell({
    children: paragraphs,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shading
      ? { type: ShadingType.CLEAR, color: "auto", fill: opts.shading }
      : undefined,
    margins: { top: 140, bottom: 140, left: 180, right: 180 },
  });
}

function thinBorders() {
  return {
    top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  };
}

// ----- Red disclaimer box (single-cell table) -----
function disclaimerBox(text) {
  const cellEl = new TableCell({
    children: [
      new Paragraph({
        children: [
          run("LEGAL NOTICE  ", { bold: true, color: RED, size: 22 }),
          run(text, { color: INK, size: 20 }),
        ],
        spacing: { before: 80, after: 80, line: 280 },
      }),
    ],
    width: { size: CONTENT_W, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: RED_BG },
    margins: { top: 200, bottom: 200, left: 240, right: 240 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 12, color: RED },
      bottom: { style: BorderStyle.SINGLE, size: 12, color: RED },
      left: { style: BorderStyle.SINGLE, size: 24, color: RED },
      right: { style: BorderStyle.SINGLE, size: 12, color: RED },
    },
  });
  return new Table({
    rows: [new TableRow({ children: [cellEl], cantSplit: true })],
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    borders: thinBorders(),
  });
}

// ----- Emerald accent rule -----
function accentRule() {
  return new Paragraph({
    children: [run("")],
    spacing: { before: 60, after: 200 },
    border: {
      bottom: { color: EMERALD, space: 1, style: BorderStyle.SINGLE, size: 18 },
    },
  });
}

// ----- Header & Footer -----
function makeHeader() {
  return new Header({
    children: [
      new Paragraph({
        children: [
          run("CAPTUREPILOT", { bold: true, color: EMERALD_DARK, size: 18 }),
          new TextRun({
            text: "\tFEDERAL LEAD KIT  09 · INTERNAL BEST-PRACTICE LIBRARY",
            font: FONT,
            size: 16,
            color: SLATE,
          }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
        spacing: { after: 80 },
        border: {
          bottom: { color: EMERALD, space: 6, style: BorderStyle.SINGLE, size: 8 },
        },
      }),
    ],
  });
}

function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          run("CAPTUREPILOT · FEDERAL LEAD KIT", { color: EMERALD_DARK, size: 16, bold: true }),
          new TextRun({
            text: "\tTEAMING AGREEMENT TEMPLATE\t",
            font: FONT,
            size: 16,
            color: SLATE,
          }),
          new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: SLATE }),
        ],
        tabStops: [
          { type: TabStopType.CENTER, position: CONTENT_W / 2 },
          { type: TabStopType.RIGHT, position: CONTENT_W },
        ],
        border: {
          top: { color: RULE, space: 6, style: BorderStyle.SINGLE, size: 6 },
        },
      }),
    ],
  });
}

// ----- COVER / INSTRUCTIONS PAGE -----
const coverChildren = [
  // Logo placeholder block
  new Table({
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [run("[ YOUR LOGO HERE ]", { color: MUTED, size: 18, bold: true })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 240, after: 240 },
              }),
            ],
            width: { size: CONTENT_W, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: PAPER },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 6, color: RULE },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE },
              left: { style: BorderStyle.SINGLE, size: 6, color: RULE },
              right: { style: BorderStyle.SINGLE, size: 6, color: RULE },
            },
          }),
        ],
      }),
    ],
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
  }),
  spacer(240),

  new Paragraph({
    children: [run("09 · INTERNAL BEST-PRACTICE LIBRARY", { color: EMERALD_DARK, bold: true, size: 18 })],
    spacing: { after: 120 },
  }),
  h1("Teaming Agreement Template"),
  body("An editable Word template you fill in clause by clause. Built for the prime-to-sub relationship you negotiate before an RFP is won.", {
    color: SLATE,
    after: 320,
  }),

  accentRule(),

  disclaimerBox(
    "This template is a starting point, not legal advice. Have a qualified attorney review any teaming agreement before either party signs, especially the exclusivity, IP, and indemnification clauses. State law varies. Federal contracting rules add another layer. Don't skip the lawyer.",
  ),
  spacer(280),

  h2("How to use this template"),
  body("This is a fill-in-the-blanks teaming agreement (TA) between a prime contractor and a subcontractor for a specific federal opportunity. Replace every double-brace placeholder (like {{PRIME_NAME}}) with your information. The placeholders are case-sensitive on purpose so a find-and-replace pass catches them all."),
  spacer(120),
  h3("Three-step process"),
  body("1. Open this file in Word, Google Docs, or LibreOffice. The table layout holds together in all three."),
  body("2. Use Find & Replace (Ctrl/Cmd+H) to swap each {{PLACEHOLDER}} with your real values. The placeholder list below tells you what each one means."),
  body("3. Send the redlined draft to your attorney before you send it to the other party. Plan for two rounds of revisions."),

  spacer(160),
  h3("Placeholders you'll fill in"),
  small("{{PRIME_NAME}}, {{PRIME_ADDRESS}}, {{PRIME_STATE_OF_FORMATION}}", { after: 80 }),
  small("{{SUB_NAME}}, {{SUB_ADDRESS}}, {{SUB_STATE_OF_FORMATION}}", { after: 80 }),
  small("{{EFFECTIVE_DATE}}, {{PROJECT_NAME}}, {{AGENCY_NAME}}, {{SOLICITATION_NUMBER}}, {{NAICS_CODE}}", { after: 80 }),
  small("{{SCOPE_OF_SUB_WORK}}, {{WORK_SPLIT_PRIME_PCT}}, {{WORK_SPLIT_SUB_PCT}}", { after: 80 }),
  small("{{PRICING_MODEL}}, {{NDA_TERM_YEARS}}, {{GOVERNING_LAW_STATE}}", { after: 80 }),
  small("{{PRIME_POC_NAME}}, {{PRIME_POC_TITLE}}, {{PRIME_POC_EMAIL}}", { after: 80 }),
  small("{{SUB_POC_NAME}}, {{SUB_POC_TITLE}}, {{SUB_POC_EMAIL}}", { after: 80 }),
  small("{{PRIME_SIGNATORY_NAME}}, {{PRIME_SIGNATORY_TITLE}}", { after: 80 }),
  small("{{SUB_SIGNATORY_NAME}}, {{SUB_SIGNATORY_TITLE}}", { after: 120 }),

  spacer(120),
  h3("What this template does not cover"),
  body("This is a teaming agreement, not a subcontract. The actual subcontract gets executed after the prime wins the award. You'll need a separate document for that, and it should reference this TA."),
  body("This template assumes a single solicitation. If you're forming a long-term teaming relationship that covers multiple bids, you need a Master Teaming Agreement instead. Talk to your attorney about that structure."),

  new Paragraph({ children: [new PageBreak()] }),
];

// ----- KEY CLAUSES OVERVIEW TABLE -----
const clauseRows = [
  ["Clause", "Purpose", "Negotiation Points"],
  ["Opportunity Identification", "Defines the specific solicitation this TA covers", "Be specific. Broad TAs create problems on other bids."],
  ["Teaming Roles", "Defines prime vs. sub, work split, each party's scope", "Nail down percent work allocation and specific task areas."],
  ["Exclusivity", "Whether either party can team with competitors on this bid", "Mutual exclusivity is standard. Define exceptions carefully."],
  ["Confidentiality / NDA", "Protects proprietary information shared during bid prep", "Define 'Confidential Information' precisely. Set term (2-5 years)."],
  ["Cost and Pricing", "Who prepares what portions of the price proposal", "Agree on rates and markups before the proposal is due."],
  ["Subcontract Commitment", "Prime's obligation to award the sub agreed work upon win", "'Shall' is enforceable. 'Will use best efforts' is not."],
  ["IP and Data Rights", "Who owns technical data, software, approaches developed during the bid", "Background IP vs. foreground IP. Critical for tech companies."],
  ["Governance", "Decision-making process, proposal review, dispute resolution", "Name a specific POC from each party with real authority."],
  ["Term and Termination", "Duration of the TA and exit conditions", "Should survive through the award decision at minimum."],
  ["No Agency", "Confirms neither party can bind the other to third parties", "Standard clause. Non-negotiable."],
];

function buildClauseTable() {
  const colWidths = [2200, 3380, 3780]; // sum = 9360
  const rows = clauseRows.map((row, idx) => {
    if (idx === 0) {
      return new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: row.map((txt, i) => cell(txt, { width: colWidths[i], header: true })),
      });
    }
    return new TableRow({
      cantSplit: true,
      children: row.map((txt, i) =>
        cell(txt, { width: colWidths[i], shading: idx % 2 === 0 ? PAPER : undefined }),
      ),
    });
  });
  return new Table({
    rows,
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [2200, 3380, 3780],
    borders: thinBorders(),
  });
}

// ----- AGREEMENT CLAUSE: section heading + fillable body box -----
function clauseSection(num, title, paragraphs) {
  const headerPara = new Paragraph({
    children: [
      run(`${num}. ${title}`, { bold: true, color: EMERALD_DARK, size: 26 }),
    ],
    spacing: { before: 280, after: 120, line: 300 },
    keepNext: true,
    keepLines: true,
  });
  return [headerPara, ...paragraphs];
}

// Fillable area (gray-bordered cell where user types their own text)
function fillBox(promptText, height = 1) {
  const placeholders = [];
  for (let i = 0; i < height; i += 1) {
    placeholders.push(
      new Paragraph({
        children: [run(i === 0 ? promptText : " ", { color: MUTED, italics: true, size: 20 })],
        spacing: { before: 80, after: 80, line: 280 },
      }),
    );
  }
  const cellEl = new TableCell({
    children: placeholders,
    width: { size: CONTENT_W, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: PAPER },
    margins: { top: 140, bottom: 140, left: 200, right: 200 },
    borders: {
      top: { style: BorderStyle.DASH_SMALL_GAP, size: 6, color: MUTED },
      bottom: { style: BorderStyle.DASH_SMALL_GAP, size: 6, color: MUTED },
      left: { style: BorderStyle.DASH_SMALL_GAP, size: 6, color: MUTED },
      right: { style: BorderStyle.DASH_SMALL_GAP, size: 6, color: MUTED },
    },
  });
  return new Table({
    rows: [new TableRow({ children: [cellEl], cantSplit: true })],
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
  });
}

// ----- AGREEMENT BODY -----
const agreementChildren = [
  h1("Teaming Agreement"),
  body(`This Teaming Agreement ("Agreement") is entered into as of {{EFFECTIVE_DATE}} by and between:`, { after: 200 }),

  // Parties table
  new Table({
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          multiCell(
            [
              p("PRIME", { bold: true, color: EMERALD_DARK, size: 20, after: 80 }),
              p("{{PRIME_NAME}}", { bold: true, size: 22, after: 60 }),
              p("{{PRIME_ADDRESS}}", { size: 20, after: 40 }),
              p(`a {{PRIME_STATE_OF_FORMATION}} entity ("Prime")`, { size: 20, italics: true, color: SLATE }),
            ],
            { width: 4680, shading: PAPER },
          ),
          multiCell(
            [
              p("SUBCONTRACTOR", { bold: true, color: EMERALD_DARK, size: 20, after: 80 }),
              p("{{SUB_NAME}}", { bold: true, size: 22, after: 60 }),
              p("{{SUB_ADDRESS}}", { size: 20, after: 40 }),
              p(`a {{SUB_STATE_OF_FORMATION}} entity ("Subcontractor" or "Sub")`, { size: 20, italics: true, color: SLATE }),
            ],
            { width: 4680, shading: PAPER },
          ),
        ],
      }),
    ],
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    borders: thinBorders(),
  }),
  spacer(200),
  body("Prime and Sub are each referred to as a “Party” and collectively as the “Parties.”"),

  // 1. Project
  ...clauseSection(1, "Project and Opportunity", [
    body("The Parties wish to team for the following federal procurement (the “Project”):"),
    spacer(80),
    new Table({
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell("Project Name", { width: 2400, bold: true, shading: PAPER }),
            cell("{{PROJECT_NAME}}", { width: 6960 }),
          ],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            cell("Agency / Customer", { width: 2400, bold: true, shading: PAPER }),
            cell("{{AGENCY_NAME}}", { width: 6960 }),
          ],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            cell("Solicitation Number", { width: 2400, bold: true, shading: PAPER }),
            cell("{{SOLICITATION_NUMBER}}", { width: 6960 }),
          ],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            cell("NAICS Code", { width: 2400, bold: true, shading: PAPER }),
            cell("{{NAICS_CODE}}", { width: 6960 }),
          ],
        }),
      ],
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [2400, 6960],
      borders: thinBorders(),
    }),
  ]),

  // 2. Roles
  ...clauseSection(2, "Roles and Scope of Work", [
    body("Prime will serve as the prime contractor and Sub will serve as a subcontractor to Prime on the Project."),
    body("Sub's anticipated scope of work is described below. If Prime wins the Project, Prime shall award Sub a subcontract consistent with this scope, subject only to mandatory flowdowns from the prime contract and the Government's consent where required."),
    spacer(40),
    fillBox("[ {{SCOPE_OF_SUB_WORK}} — describe the specific tasks, deliverables, and work areas Sub will perform. Reference solicitation sections (e.g., PWS 3.2, CLINs 0002–0004) where possible. Be specific. ]", 4),
    spacer(120),
    body("Anticipated work allocation:"),
    new Table({
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell("Party", { width: 4680, bold: true, header: true }),
            cell("Approximate Share of Total Effort", { width: 4680, bold: true, header: true }),
          ],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            cell("Prime ({{PRIME_NAME}})", { width: 4680 }),
            cell("{{WORK_SPLIT_PRIME_PCT}}%", { width: 4680 }),
          ],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            cell("Subcontractor ({{SUB_NAME}})", { width: 4680, shading: PAPER }),
            cell("{{WORK_SPLIT_SUB_PCT}}%", { width: 4680, shading: PAPER }),
          ],
        }),
      ],
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [4680, 4680],
      borders: thinBorders(),
    }),
  ]),

  // 3. Exclusivity
  ...clauseSection(3, "Exclusivity", [
    body("From the Effective Date through the earlier of (a) award of the Project to a competing offeror or (b) the termination of this Agreement, each Party agrees that it will not, with respect to the Project:"),
    bullet("Submit a proposal as a prime contractor in competition with the team formed under this Agreement; or"),
    bullet("Participate as a subcontractor, consultant, or teaming partner with any other offeror competing for the Project."),
    body("Carve-outs to this exclusivity, if any, are listed here:"),
    fillBox("[ List any specific carve-outs (e.g., pre-existing teaming arrangements, IDIQ task orders already in flight). Write “None” if there are no exceptions. ]", 3),
  ]),

  // 4. Pricing
  ...clauseSection(4, "Cost and Pricing", [
    body("Each Party shall bear its own bid and proposal costs. Sub will provide pricing inputs for its scope of work to Prime in the format and on the schedule Prime reasonably requests."),
    body("The pricing model for Sub's work under any resulting subcontract will be:"),
    fillBox("[ {{PRICING_MODEL}} — specify: Firm-Fixed-Price, Time & Materials with capped rates, Cost-Plus-Fixed-Fee, etc. Include rate tables or markup ceilings if agreed. ]", 3),
  ]),

  // 5. Subcontract Commitment
  ...clauseSection(5, "Subcontract Commitment", [
    body("If Prime is awarded the Project, Prime shall (not “will use best efforts to”) execute a subcontract with Sub for the scope of work described in Section 2, on commercially reasonable terms consistent with this Agreement, within 30 days of award unless the Parties agree in writing to a different timeline."),
    body("This obligation is subject to: (a) any mandatory Government consent or approval; (b) Sub remaining in good standing on SAM.gov and meeting any responsibility determinations required by the contracting officer; and (c) the absence of a material breach of this Agreement by Sub."),
  ]),

  // 6. Confidentiality
  ...clauseSection(6, "Confidentiality", [
    body("Each Party may share Confidential Information with the other for the purpose of preparing the proposal and performing the Project. “Confidential Information” means non-public technical, business, financial, or pricing information marked confidential or that a reasonable person would understand to be confidential."),
    body(`Each Party shall protect the other's Confidential Information with the same care it uses to protect its own (and in no event less than reasonable care) and shall not disclose it to third parties without prior written consent. This obligation survives for {{NDA_TERM_YEARS}} years after termination of this Agreement.`),
    body("Standard exclusions apply: information that is (a) publicly known through no breach of this Agreement, (b) lawfully received from a third party without confidentiality obligations, (c) independently developed without use of the other Party's Confidential Information, or (d) required to be disclosed by law or court order, provided prompt notice is given where permitted."),
  ]),

  // 7. IP
  ...clauseSection(7, "Intellectual Property and Data Rights", [
    body("Each Party retains all right, title, and interest in its Background IP (IP owned or licensed before the Effective Date, or developed independently of this Agreement)."),
    body("Foreground IP (IP first developed in the performance of the proposal effort or any resulting subcontract) shall be owned as follows:"),
    fillBox("[ Specify ownership of foreground IP. Typical structures: (a) each Party owns what its personnel create; (b) jointly owned with cross-licenses; (c) Prime owns all and grants Sub a non-exclusive license for internal use. This is the single most important clause for tech companies. Get legal review. ]", 4),
    body("Data rights under any resulting prime contract or subcontract will be governed by the applicable FAR/DFARS clauses (typically FAR 52.227 series or DFARS 252.227-7013/7014). Neither Party shall assert greater rights to the other's data than the Government receives."),
  ]),

  // 8. Indemnification
  ...clauseSection(8, "Indemnification", [
    body("Each Party (the “Indemnifying Party”) shall indemnify, defend, and hold harmless the other Party and its officers, directors, employees, and agents from any third-party claims, damages, losses, or expenses (including reasonable attorneys' fees) arising out of (a) the Indemnifying Party's gross negligence or willful misconduct, (b) bodily injury or property damage caused by the Indemnifying Party's personnel, or (c) the Indemnifying Party's material breach of this Agreement."),
    body("Neither Party shall be liable to the other for consequential, incidental, indirect, special, or punitive damages, including lost profits, even if advised of the possibility."),
  ]),

  // 9. Term and Termination
  ...clauseSection(9, "Term and Termination", [
    body("This Agreement begins on the Effective Date and continues until the earliest of: (a) execution of a subcontract for the Project; (b) award of the Project to a competing offeror; (c) the Government's cancellation of the Project; or (d) twelve (12) months after the Effective Date, whichever occurs first."),
    body("Either Party may terminate for material breach with thirty (30) days' written notice and an opportunity to cure. Sections 6 (Confidentiality), 7 (IP), 8 (Indemnification), and 12 (Governing Law) survive termination."),
  ]),

  // 10. Governance
  ...clauseSection(10, "Governance and Points of Contact", [
    body("Each Party designates the following authorized point of contact for proposal coordination, decision-making, and dispute escalation:"),
    new Table({
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell("Role", { width: 2200, bold: true, header: true }),
            cell("Prime", { width: 3580, bold: true, header: true }),
            cell("Subcontractor", { width: 3580, bold: true, header: true }),
          ],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            cell("Name", { width: 2200, shading: PAPER, bold: true }),
            cell("{{PRIME_POC_NAME}}", { width: 3580 }),
            cell("{{SUB_POC_NAME}}", { width: 3580 }),
          ],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            cell("Title", { width: 2200, shading: PAPER, bold: true }),
            cell("{{PRIME_POC_TITLE}}", { width: 3580 }),
            cell("{{SUB_POC_TITLE}}", { width: 3580 }),
          ],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            cell("Email", { width: 2200, shading: PAPER, bold: true }),
            cell("{{PRIME_POC_EMAIL}}", { width: 3580 }),
            cell("{{SUB_POC_EMAIL}}", { width: 3580 }),
          ],
        }),
      ],
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [2200, 3580, 3580],
      borders: thinBorders(),
    }),
  ]),

  // 11. No Agency
  ...clauseSection(11, "No Agency, No Joint Venture", [
    body("This Agreement does not create a joint venture, partnership, employment, or agency relationship. Neither Party has the authority to bind the other to any third-party obligation. Each Party remains an independent contractor."),
  ]),

  // 12. Governing Law
  ...clauseSection(12, "Governing Law and Dispute Resolution", [
    body(`This Agreement is governed by the laws of the State of {{GOVERNING_LAW_STATE}}, without regard to its conflict-of-law principles. The Parties shall first attempt to resolve any dispute through good-faith negotiation between the points of contact named in Section 10. Unresolved disputes shall be submitted to binding arbitration under the Commercial Arbitration Rules of the American Arbitration Association, seated in {{GOVERNING_LAW_STATE}}.`),
  ]),

  // 13. Entire Agreement
  ...clauseSection(13, "Entire Agreement", [
    body("This Agreement is the complete and exclusive statement of the Parties' understanding regarding the Project and supersedes all prior discussions and writings. Any modification must be in writing and signed by both Parties."),
  ]),

  new Paragraph({ children: [new PageBreak()] }),
];

// ----- SIGNATURE BLOCK -----
function signatureTable() {
  const sigCell = (label, name, title) =>
    multiCell(
      [
        p(label, { bold: true, color: EMERALD_DARK, size: 20, after: 120 }),
        p("Signature: ____________________________________", { size: 20, after: 140 }),
        p("Name: " + name, { size: 20, after: 80 }),
        p("Title: " + title, { size: 20, after: 80 }),
        p("Date: ____________________", { size: 20, after: 60 }),
      ],
      { width: 4680 },
    );

  return new Table({
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          sigCell("PRIME", "{{PRIME_SIGNATORY_NAME}}", "{{PRIME_SIGNATORY_TITLE}}"),
          sigCell("SUBCONTRACTOR", "{{SUB_SIGNATORY_NAME}}", "{{SUB_SIGNATORY_TITLE}}"),
        ],
      }),
    ],
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    borders: thinBorders(),
  });
}

const signatureChildren = [
  h1("Signatures"),
  body("Each Party represents that the person signing below is duly authorized to bind that Party to this Agreement. Two-party signature creates an executed copy for each side."),
  spacer(200),
  signatureTable(),
  spacer(280),
  small("Retain a fully executed PDF in your contracts file. The original ink-signed or DocuSign'd version is the controlling copy.", { italics: true }),

  new Paragraph({ children: [new PageBreak()] }),
];

// ----- APPENDIX: Checklist + Mistakes (from source PDF) -----
const appendixChildren = [
  h1("Appendix A — Pre-Signature Checklist"),
  body("Walk through this list with your team before you put a signature on the page. If you can't check every box, you're not ready to sign.", { color: SLATE }),
  spacer(120),
  checkbox("Both parties' full legal names, addresses, and authorized signatories defined"),
  checkbox("Opportunity and solicitation specifically identified (SAM.gov notice number)"),
  checkbox("Work allocation percentages agreed (e.g., Prime 60%, Sub 40%)"),
  checkbox("Exclusivity terms clearly stated and mutually acknowledged"),
  checkbox("NDA provisions adequate for the sensitivity of information being shared"),
  checkbox("Subcontract commitment language uses 'shall' not 'will endeavor to'"),
  checkbox("IP ownership defined for both pre-existing and newly developed materials"),
  checkbox("Governing law and dispute resolution specified"),
  checkbox("Signatures from authorized officers, not just employees, of both parties"),
  checkbox("Executed copies held by both parties"),

  new Paragraph({ children: [new PageBreak()] }),
  h1("Appendix B — Common Mistakes to Avoid"),
  spacer(80),

  p([run("Too many TAs, too little vetting", { bold: true, color: RED, size: 22 })], { after: 80, keepNext: true, keepLines: true }),
  body("Signing TAs with unverified partners is worse than going solo. Vet every partner. Check their SAM registration, past performance rating, and financial stability.", { after: 200, keepLines: true }),

  p([run("'Best efforts' subcontract commitment", { bold: true, color: RED, size: 22 })], { after: 80, keepNext: true, keepLines: true }),
  body("Courts have routinely found 'best efforts' language is unenforceable. Get a 'shall award' commitment in writing.", { after: 200, keepLines: true }),

  p([run("No work allocation in writing", { bold: true, color: RED, size: 22 })], { after: 80, keepNext: true, keepLines: true }),
  body("If the work split isn't in the TA, the prime can give you nothing and it's legal. Be specific. List CLINs, PWS sections, or task areas by name.", { after: 200, keepLines: true }),

  p([run("Missing exclusivity on both sides", { bold: true, color: RED, size: 22 })], { after: 80, keepNext: true, keepLines: true }),
  body("If you sign exclusivity but the prime doesn't, they can team with your competitor and still use your IP. Mutual or nothing.", { after: 200, keepLines: true }),

  p([run("Signed too late", { bold: true, color: RED, size: 22 })], { after: 80, keepNext: true, keepLines: true }),
  body("A TA signed after the proposal is submitted has reduced legal standing. Execute at least two weeks before submission. Earlier is better.", { after: 200, keepLines: true }),

  new Paragraph({ children: [new PageBreak()] }),
  h2("Reference — Key Clauses Overview"),
  body("Quick-reference table for what each section of this template is doing and where the negotiation usually lands.", { keepNext: true }),
  spacer(80),
  buildClauseTable(),
];

// ----- DOCUMENT -----
const doc = new Document({
  creator: "CapturePilot",
  title: "Teaming Agreement Template",
  description: "Editable teaming agreement template for federal sub-to-prime relationships.",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 22, color: INK },
        paragraph: { spacing: { line: 300, after: 120 } },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: inch(11) },
          margin: {
            top: inch(1),
            right: MARGIN,
            bottom: inch(1),
            left: MARGIN,
            header: inch(0.5),
            footer: inch(0.5),
          },
        },
      },
      headers: { default: makeHeader() },
      footers: { default: makeFooter() },
      children: [
        ...coverChildren,
        ...agreementChildren,
        ...signatureChildren,
        ...appendixChildren,
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(OUTPUT_PATH, buffer);
console.log(`Wrote ${OUTPUT_PATH} (${(buffer.length / 1024).toFixed(1)} KB)`);
