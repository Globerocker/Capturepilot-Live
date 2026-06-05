// Build a Past-Performance Reference Template (.docx) using the `docx` package.
// Output: FLK_06_Past_Performance_Reference_Template.docx
// Layout: tables only (no columns / no frames) for cross-tool compatibility.
//
// Pagination strategy:
//   - One page per reference (3 blank reference pages + 1 instructions page).
//   - pageBreakBefore on each reference page so it always starts at top.
//   - keepNext on every heading so headings never orphan from following content.
//   - keepLines on every heading + first body paragraph (no mid-heading break).
//   - cantSplit on every table row so rows never break mid-page.
//   - Body 10pt, H3 12pt, H2 13pt, H1 18pt — tight enough to fit one reference per page.

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
  PageBreak,
  Header,
  Footer,
  PageNumber,
  ShadingType,
  LevelFormat,
  convertInchesToTwip,
} from "/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/docx/dist/index.mjs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// --- Brand tokens -----------------------------------------------------------
const EMERALD = "10B981";
const EMERALD_DARK = "059669";
const INK = "0F172A";        // near-black body text
const SLATE = "475569";      // muted
const SLATE_LIGHT = "94A3B8";
const HAIRLINE = "E2E8F0";
const FILL_TINT = "F0FDF4";  // emerald-50
const FILL_HEAD = "10B981";  // emerald table header
const FILL_ROW = "F8FAFC";   // slate-50 zebra
const FONT = "Calibri";      // Inter substitute; cross-tool safe
const FONT_MONO = "Consolas";

// Page geometry (Letter, 0.75 in margins for more vertical room per page)
const PAGE = {
  width: convertInchesToTwip(8.5),
  height: convertInchesToTwip(11),
  margins: {
    top: convertInchesToTwip(0.75),
    right: convertInchesToTwip(0.75),
    bottom: convertInchesToTwip(0.75),
    left: convertInchesToTwip(0.75),
  },
};

// Total usable width = 8.5 - 1.5 = 7 in = 10080 twips
const TABLE_TOTAL = 10080;

// --- Helpers ---------------------------------------------------------------
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = {
  top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
  insideHorizontal: noBorder, insideVertical: noBorder,
};
const hair = { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE };
const hairBorders = {
  top: hair, bottom: hair, left: hair, right: hair,
  insideHorizontal: hair, insideVertical: hair,
};

function run(text, opts = {}) {
  return new TextRun({
    text,
    font: opts.font || FONT,
    size: opts.size || 20,         // half-points (20 = 10pt)
    bold: opts.bold || false,
    italics: opts.italics || false,
    color: opts.color || INK,
    allCaps: opts.allCaps || false,
    break: opts.break || 0,
  });
}

function p(children, opts = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    spacing: opts.spacing || { before: 60, after: 60 },
    alignment: opts.alignment,
    heading: opts.heading,
    indent: opts.indent,
    shading: opts.shading,
    border: opts.border,
    pageBreakBefore: opts.pageBreakBefore || false,
    keepNext: opts.keepNext || false,
    keepLines: opts.keepLines || false,
  });
}

function blank(size = 60) {
  return new Paragraph({ children: [run("")], spacing: { before: size, after: size } });
}

function h1(text, opts = {}) {
  return new Paragraph({
    children: [run(text, { size: 36, bold: true, color: INK })],
    spacing: { before: 120, after: 60 },
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    keepLines: true,
    pageBreakBefore: opts.pageBreakBefore || false,
  });
}

function h2(text) {
  return new Paragraph({
    children: [run(text, { size: 26, bold: true, color: INK })],
    spacing: { before: 200, after: 60 },
    heading: HeadingLevel.HEADING_2,
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
    spacing: { before: 140, after: 40 },
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    keepLines: true,
  });
}

function eyebrow(text) {
  return new Paragraph({
    children: [run(text, { size: 16, bold: true, color: EMERALD_DARK, font: FONT_MONO, allCaps: true })],
    spacing: { before: 80, after: 40 },
    keepNext: true,
    keepLines: true,
  });
}

function muted(text, opts = {}) {
  return new Paragraph({
    children: [run(text, { size: opts.size || 18, color: SLATE, italics: opts.italics || false })],
    spacing: { before: 40, after: 40 },
    alignment: opts.alignment,
    keepLines: true,
    keepNext: opts.keepNext || false,
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    children: [run(text, { size: opts.size || 20, color: INK, bold: opts.bold || false })],
    spacing: { before: 40, after: 40 },
    keepLines: opts.keepLines !== false,
    keepNext: opts.keepNext || false,
  });
}

function bullet(text, opts = {}) {
  return new Paragraph({
    children: [run(text, { size: 20, color: INK })],
    bullet: { level: opts.level || 0 },
    spacing: { before: 40, after: 40 },
    keepLines: true,
  });
}

// Callout: tinted single-cell table
function callout(text, opts = {}) {
  const fill = opts.fill || FILL_TINT;
  const border = {
    top: { style: BorderStyle.SINGLE, size: 6, color: EMERALD },
    bottom: { style: BorderStyle.SINGLE, size: 6, color: EMERALD },
    left: { style: BorderStyle.SINGLE, size: 6, color: EMERALD },
    right: { style: BorderStyle.SINGLE, size: 6, color: EMERALD },
  };
  return new Table({
    width: { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [TABLE_TOTAL],
    borders: { ...border, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: TABLE_TOTAL, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill, color: "auto" },
            margins: { top: 120, bottom: 120, left: 180, right: 180 },
            children: Array.isArray(text)
              ? text.map((line) => body(line, { size: opts.size || 18 }))
              : [body(text, { size: opts.size || 18 })],
          }),
        ],
      }),
    ],
  });
}

// Label / value two-column row helper
function lvRow(label, value, opts = {}) {
  const labelW = opts.labelW || 2600;
  const valueW = opts.valueW || TABLE_TOTAL - labelW;
  return new TableRow({
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: labelW, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: FILL_ROW, color: "auto" },
        margins: { top: 90, bottom: 90, left: 140, right: 100 },
        children: [body(label, { bold: true, size: 18 })],
      }),
      new TableCell({
        width: { size: valueW, type: WidthType.DXA },
        margins: { top: 90, bottom: 90, left: 140, right: 140 },
        children: [body(value, { size: 18, ...opts.valueOpts })],
      }),
    ],
  });
}

// Four-column key-value table (label | value | label | value)
function quadTable(rows) {
  const col1 = 2000;
  const col2 = 3040;
  const col3 = 2000;
  const col4 = TABLE_TOTAL - col1 - col2 - col3;
  return new Table({
    width: { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [col1, col2, col3, col4],
    borders: hairBorders,
    rows: rows.map(([l1, v1, l2, v2]) =>
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: col1, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: FILL_ROW, color: "auto" },
            margins: { top: 80, bottom: 80, left: 120, right: 90 },
            children: [body(l1, { bold: true, size: 16 })],
          }),
          new TableCell({
            width: { size: col2, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [body(v1, { size: 16 })],
          }),
          new TableCell({
            width: { size: col3, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: FILL_ROW, color: "auto" },
            margins: { top: 80, bottom: 80, left: 120, right: 90 },
            children: [body(l2, { bold: true, size: 16 })],
          }),
          new TableCell({
            width: { size: col4, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [body(v2, { size: 16 })],
          }),
        ],
      })
    ),
  });
}

// Two-col label-value table
function lvTable(rows, labelW = 2600) {
  return new Table({
    width: { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [labelW, TABLE_TOTAL - labelW],
    borders: hairBorders,
    rows: rows.map(([l, v, opts = {}]) => lvRow(l, v, { labelW, ...opts })),
  });
}

// Ratings table with header row
function ratingsTable() {
  const cCat = 2600;
  const cRate = 5480;
  const cNotes = TABLE_TOTAL - cCat - cRate;
  const headerCell = (text, width) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: FILL_HEAD, color: "auto" },
      margins: { top: 90, bottom: 90, left: 140, right: 140 },
      children: [
        new Paragraph({
          children: [run(text, { bold: true, color: "FFFFFF", size: 18 })],
          keepLines: true,
        }),
      ],
    });

  const dataRow = (cat, rating) =>
    new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: cCat, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: FILL_ROW, color: "auto" },
          margins: { top: 90, bottom: 90, left: 140, right: 100 },
          children: [body(cat, { bold: true, size: 16 })],
        }),
        new TableCell({
          width: { size: cRate, type: WidthType.DXA },
          margins: { top: 90, bottom: 90, left: 140, right: 140 },
          children: [body(rating, { size: 16 })],
        }),
        new TableCell({
          width: { size: cNotes, type: WidthType.DXA },
          margins: { top: 90, bottom: 90, left: 140, right: 140 },
          children: [body("{{NOTES}}", { size: 16 })],
        }),
      ],
    });

  return new Table({
    width: { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [cCat, cRate, cNotes],
    borders: hairBorders,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          headerCell("Category", cCat),
          headerCell("Rating", cRate),
          headerCell("Notes", cNotes),
        ],
      }),
      dataRow(
        "Technical Performance",
        "[ ] Exceptional   [ ] Very Good   [ ] Satisfactory   [ ] Marginal   [ ] Unsat"
      ),
      dataRow(
        "Schedule / Delivery",
        "[ ] Exceptional   [ ] Very Good   [ ] Satisfactory   [ ] Marginal   [ ] Unsat"
      ),
      dataRow(
        "Management",
        "[ ] Exceptional   [ ] Very Good   [ ] Satisfactory   [ ] Marginal   [ ] Unsat"
      ),
      dataRow(
        "Cost Control (if cost-type)",
        "[ ] Exceptional   [ ] Very Good   [ ] Satisfactory   [ ] N/A"
      ),
      dataRow(
        "Small Business Subcontracting",
        "[ ] Exceptional   [ ] Very Good   [ ] Satisfactory   [ ] N/A"
      ),
    ],
  });
}

// Header bar: emerald top stripe + brand mark
function buildHeader(label) {
  const stripe = new Table({
    width: { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [TABLE_TOTAL],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        height: { value: 80, rule: "exact" },
        children: [
          new TableCell({
            width: { size: TABLE_TOTAL, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: EMERALD, color: "auto" },
            children: [new Paragraph({ children: [run("")] })],
          }),
        ],
      }),
    ],
  });

  const brandColW = Math.floor(TABLE_TOTAL / 2);
  const brandRow = new Table({
    width: { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [brandColW, TABLE_TOTAL - brandColW],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: brandColW, type: WidthType.DXA },
            margins: { top: 60, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                children: [
                  run("CAPTUREPILOT", {
                    font: FONT_MONO, size: 16, bold: true, color: EMERALD_DARK, allCaps: true,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: TABLE_TOTAL - brandColW, type: WidthType.DXA },
            margins: { top: 60, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  run(label, { font: FONT_MONO, size: 14, color: SLATE, allCaps: true }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  return new Header({ children: [stripe, brandRow] });
}

function buildFooter() {
  const footColW = Math.floor(TABLE_TOTAL / 3);
  const row = new Table({
    width: { size: TABLE_TOTAL, type: WidthType.DXA },
    columnWidths: [footColW, footColW, TABLE_TOTAL - footColW * 2],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE },
      bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: noBorder,
    },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: footColW, type: WidthType.DXA },
            margins: { top: 100, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                children: [
                  run("CAPTUREPILOT", { font: FONT_MONO, size: 14, bold: true, color: EMERALD_DARK, allCaps: true }),
                  run("  ·  Federal Lead Kit", { font: FONT_MONO, size: 14, color: SLATE }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: footColW, type: WidthType.DXA },
            margins: { top: 100, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run("Past-Performance Reference Template", { font: FONT_MONO, size: 14, color: SLATE, allCaps: true }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: TABLE_TOTAL - footColW * 2, type: WidthType.DXA },
            margins: { top: 100, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  run("Page ", { font: FONT_MONO, size: 14, color: SLATE }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT_MONO, size: 14, color: SLATE_LIGHT }),
                  run(" of ", { font: FONT_MONO, size: 14, color: SLATE }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT_MONO, size: 14, color: SLATE_LIGHT }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
  return new Footer({ children: [row] });
}

// --- Page builders ---------------------------------------------------------

function instructionsPage() {
  return [
    eyebrow("06 · Past-Performance Reference Templates"),
    h1("Past-Performance Reference Template"),
    muted("Federal-grade documentation of your completed work — the format evaluators expect.", { keepNext: true }),
    blank(40),

    callout([
      "Use this template to document one past contract per page. Federal evaluators score your past performance on technical fit, schedule, management, and cost. Build the file once, reuse it for every proposal.",
    ]),

    h2("How to use this template"),
    body("There are three blank reference pages after this one. Duplicate any of them in Word (right-click the page, copy, paste) for additional references. Most agencies ask for three to five references on a single bid.", { keepNext: true }),

    h3("1. Replace the placeholders"),
    body("Anything wrapped in double curly braces, like {{COMPANY_NAME}} or {{CONTRACT_VALUE}}, is a fillable field. Use Word's Find & Replace (Ctrl+H on Windows, Cmd+Shift+H on Mac) to swap the same placeholder across every reference at once."),

    h3("2. Verify your POC before listing them"),
    body("Call or email your contracting officer (or COR) before you submit a proposal. Confirm they are still in role, still at that phone number, and still willing to be contacted. Federal evaluators do call. A reference that goes to voicemail or a wrong number can sink an otherwise winning bid."),

    h3("3. Be specific in the Scope of Work"),
    body("Don't copy the original SOW. Describe what you actually delivered: technologies used, number of staff, locations supported, square footage covered, mission outcome. Three to five sentences minimum, with real numbers."),

    h3("4. Quantify the outcome"),
    body("Evaluators reward precision. Write \"reduced incident response time from 14 minutes to 6 minutes over 18 months\" instead of \"improved response time.\" Write \"$2.3M saved across 47 facilities\" instead of \"significant cost savings.\""),

    h3("5. CPARS or self-reported ratings"),
    body("If you have a CPARS rating from the contract, transcribe it exactly. If the contract was commercial or sub-CPARS-threshold, mark the ratings as self-reported and keep them honest — most agencies will ask the POC to confirm."),

    blank(60),
    callout([
      "Tip: Save a master copy of this file with every past contract you've delivered, even ones outside government. You'll pull from it for every bid for the next ten years.",
    ], { fill: "FEF3C7" }),
  ];
}

function referencePage(refNumber) {
  return [
    // Force a fresh page for each reference
    new Paragraph({
      children: [run("")],
      pageBreakBefore: true,
      spacing: { before: 0, after: 0 },
    }),
    eyebrow(`Reference ${refNumber} of 3`),
    h1("Past-Performance Reference"),
    muted("Complete one template per contract. Verify your POC before submitting.", { keepNext: true }),
    blank(20),

    h2("Contract Identification"),
    quadTable([
      ["Agency / Client:",     "{{AGENCY_OR_CLIENT}}",   "Contract Type:",  "{{FFP_TM_COSTPLUS_IDIQ}}"],
      ["Contract Number:",     "{{PIID_OR_PO_NUMBER}}",  "Delivery Order #:", "{{DELIVERY_ORDER}}"],
      ["Program / Project:",   "{{PROGRAM_NAME}}",       "NAICS Code:",     "{{NAICS_CODE}}"],
      ["Contract Value:",      "{{TOTAL_VALUE}}",        "Your Share:",     "{{YOUR_SHARE_IF_SUB}}"],
      ["Period of Performance:", "{{START_DATE}} – {{END_DATE}}", "Option Years:", "{{OPTIONS_EXERCISED}}"],
      ["Set-Aside Type:",      "{{SET_ASIDE_TYPE}}",     "Small Bus. Role:", "{{PRIME_SUB_JV}}"],
    ]),

    h2("Reference Contact (Must Be Current)"),
    lvTable([
      ["Contracting Officer / COR:", "{{POC_FULL_NAME}}, {{POC_TITLE}}"],
      ["Phone (direct):",            "{{POC_PHONE}}"],
      ["Email:",                     "{{POC_EMAIL}}"],
      ["Last contacted / verified:", "{{DATE_YOU_LAST_CONFIRMED_POC}}"],
    ]),

    h2("Scope of Work Performed"),
    callout([
      "{{SCOPE_OF_WORK}}",
      "",
      "Describe what your company actually did. Include technologies used, staff deployed, locations, square footage, mission outcome. Three to five sentences minimum. Don't copy the original SOW.",
    ], { fill: FILL_ROW, size: 16 }),

    h2("Relevance to Target Requirement"),
    callout([
      "{{RELEVANCE_TO_TARGET}}",
      "",
      "Explain how this past performance maps to the specific contract you're bidding. Match scope, agency type, complexity, and technical domain.",
    ], { fill: FILL_ROW, size: 16 }),

    h2("Outcome and Quantified Results"),
    callout([
      "{{OUTCOME_WITH_METRICS}}",
      "",
      "Use real numbers: hours saved, dollars returned, square feet maintained, on-time percentage, incident counts, customer satisfaction scores.",
    ], { fill: FILL_ROW, size: 16 }),

    h2("Performance Ratings (CPARS or Self-Reported)"),
    ratingsTable(),

    blank(20),
    muted("Source: {{CPARS_OR_SELF_REPORTED}}   ·   Date of rating: {{RATING_DATE}}", { italics: true }),
  ];
}

// --- Assemble document -----------------------------------------------------

const doc = new Document({
  creator: "CapturePilot",
  title: "Past-Performance Reference Template",
  description: "Federal Lead Kit · Past-Performance Reference Template (editable)",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 20, color: INK },
        paragraph: { spacing: { line: 280 } },
      },
      heading1: {
        run: { font: FONT, size: 36, bold: true, color: INK },
        paragraph: { spacing: { before: 120, after: 60 }, keepNext: true, keepLines: true },
      },
      heading2: {
        run: { font: FONT, size: 26, bold: true, color: INK },
        paragraph: { spacing: { before: 200, after: 60 }, keepNext: true, keepLines: true },
      },
      heading3: {
        run: { font: FONT, size: 22, bold: true, color: INK },
        paragraph: { spacing: { before: 140, after: 40 }, keepNext: true, keepLines: true },
      },
    },
  },
  numbering: {
    config: [
      {
        reference: "default-bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
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
          size: { width: PAGE.width, height: PAGE.height },
          margin: PAGE.margins,
        },
      },
      headers: { default: buildHeader("Federal Lead Kit · 06") },
      footers: { default: buildFooter() },
      children: [
        ...instructionsPage(),
        ...referencePage(1),
        ...referencePage(2),
        ...referencePage(3),
      ],
    },
  ],
});

const outPath = resolve(
  "/Users/andreschuler/Caturepilot 2.0/assets/starter-pack/rebuilt/FLK_06_Past_Performance_Reference_Template.docx"
);

const buffer = await Packer.toBuffer(doc);
writeFileSync(outPath, buffer);
console.log(`OK  wrote ${outPath}  (${buffer.length} bytes)`);
