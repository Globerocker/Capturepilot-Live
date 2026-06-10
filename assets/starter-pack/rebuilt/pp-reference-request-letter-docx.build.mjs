// Builder: FLK_06_Past_Performance_Reference_Request_Letter.docx
// Run: node assets/starter-pack/rebuilt/pp-reference-request-letter-docx.build.mjs
//
// SPEC: 1-page Word letter a contractor sends to a past client asking them to
// serve as a past performance reference. Includes:
//   - Salutation + opening ask
//   - Three specific details to verify (role, contract value, period of performance)
//   - "What they might be asked" preview paragraph
//   - Polite closing + reply-by date
//   - Placeholders: {{CONTRACT_TITLE}}, {{POC_NAME}}, {{COMPANY_NAME}},
//     {{SENDER_NAME}}, {{SENDER_TITLE}}, {{SENDER_PHONE}}, {{SENDER_EMAIL}},
//     {{CONTRACT_VALUE}}, {{POP_START}}, {{POP_END}}, {{SOLICITATION_AGENCY}},
//     {{REPLY_BY_DATE}}

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
  convertInchesToTwip,
} from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/docx/dist/index.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEPLOY_DIR = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/06_Past_Performance_Reference_Templates';
const DEPLOY = join(DEPLOY_DIR, 'FLK_06_Past_Performance_Reference_Request_Letter.docx');

// --- Brand --------------------------------------------------------------------
const EMERALD      = '10b981';
const EMERALD_DARK = '047857';
const INK          = '0f172a';
const SLATE        = '475569';
const SLATE_LIGHT  = '94a3b8';
const PAPER        = 'ffffff';
const RULE_GRAY    = 'e2e8f0';

const BODY_FONT  = 'Calibri';
const MONO_FONT  = 'Consolas';

// Font sizes in half-points
const SIZE_TINY = 16;  //  8pt
const SIZE_BODY = 22;  // 11pt — letter body
const SIZE_LEAD = 24;  // 12pt — slightly bigger
const SIZE_H3   = 22;  // 11pt kicker
const SIZE_H2   = 28;  // 14pt section head
const SIZE_H1   = 36;  // 18pt page title

// Letter: 8.5 × 11 in. Margins: 1 in each side. Usable = 6.5 in = 9360 twips.
const USABLE = 9360;

// --- Border helpers -----------------------------------------------------------
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = {
  top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
  insideHorizontal: noBorder, insideVertical: noBorder,
};
const hairline = { style: BorderStyle.SINGLE, size: 4, color: RULE_GRAY };
const hairlineBorders = {
  top: hairline, bottom: hairline, left: hairline, right: hairline,
  insideHorizontal: hairline, insideVertical: hairline,
};

// --- Text helpers -------------------------------------------------------------
function run(text, opts = {}) {
  return new TextRun({
    text,
    font:    opts.font    || BODY_FONT,
    size:    opts.size    || SIZE_BODY,
    color:   opts.color   || INK,
    bold:    !!opts.bold,
    italics: !!opts.italics,
  });
}

function ph(text) {
  // Renders a placeholder in emerald so it's visually obvious in the template
  return run(text, { color: EMERALD_DARK, bold: true });
}

function para(children, opts = {}) {
  return new Paragraph({
    alignment: opts.alignment || AlignmentType.LEFT,
    spacing: {
      before: opts.before ?? 0,
      after:  opts.after  ?? 160,
      line:   opts.line   ?? 276, // ~1.15 line spacing — standard letter
    },
    indent:    opts.indent,
    keepNext:  opts.keepNext  ?? false,
    keepLines: opts.keepLines ?? true,
    children:  Array.isArray(children) ? children : [children],
  });
}

function cell({ children, width, shading, colspan, borders, padding }) {
  return new TableCell({
    width:        { size: width, type: WidthType.DXA },
    columnSpan:   colspan,
    shading:      shading ? { type: ShadingType.CLEAR, fill: shading, color: 'auto' } : undefined,
    margins:      padding || { top: 60, bottom: 60, left: 0, right: 0 },
    borders,
    children:     Array.isArray(children) ? children : [children],
  });
}

// A thin horizontal rule (1-row table with a bottom border)
function rule() {
  return new Table({
    columnWidths: [USABLE],
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          cell({
            width: USABLE,
            borders: {
              ...noBorders,
              bottom: { style: BorderStyle.SINGLE, size: 6, color: EMERALD },
            },
            children: [para([run('')], { after: 0 })],
          }),
        ],
      }),
    ],
  });
}

// --- Document sections --------------------------------------------------------

// Header bar: sender company name on the left, "REFERENCE REQUEST" label on right
function headerTable() {
  const LEFT = Math.floor(USABLE * 0.6);
  const RIGHT = USABLE - LEFT;
  return new Table({
    columnWidths: [LEFT, RIGHT],
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          cell({
            width: LEFT,
            borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 10, color: EMERALD_DARK } },
            padding: { top: 0, bottom: 80, left: 0, right: 80 },
            children: [
              para([
                run('{{COMPANY_NAME}}', { font: BODY_FONT, size: SIZE_LEAD, bold: true, color: EMERALD_DARK }),
              ], { after: 0, line: 240 }),
            ],
          }),
          cell({
            width: RIGHT,
            borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 10, color: EMERALD_DARK } },
            padding: { top: 0, bottom: 80, left: 80, right: 0 },
            children: [
              para([
                run('PAST PERFORMANCE REFERENCE REQUEST', {
                  font: MONO_FONT, size: SIZE_TINY, bold: true, color: SLATE_LIGHT,
                }),
              ], { after: 0, line: 240, alignment: AlignmentType.RIGHT }),
            ],
          }),
        ],
      }),
    ],
  });
}

// Sender block (date + from address)
function senderBlock() {
  return [
    para([run('')], { after: 80 }),  // spacer
    para([run('[Date]', { color: SLATE })], { after: 60 }),
    para([run('')], { after: 80 }),
    para([ph('{{SENDER_NAME}}'), run(', ', { color: INK }), ph('{{SENDER_TITLE}}')], { after: 30 }),
    para([ph('{{COMPANY_NAME}}')], { after: 30 }),
    para([ph('{{SENDER_PHONE}}'), run('  |  ', { color: SLATE_LIGHT }), ph('{{SENDER_EMAIL}}')], { after: 80 }),
  ];
}

// "To" / recipient line
function recipientBlock() {
  return [
    para([run('To:', { bold: true, color: SLATE }), run('  '), ph('{{POC_NAME}}')], { after: 30 }),
    para([run('')], { after: 60 }),
    para([
      run('Re: ', { bold: true }),
      run('Past Performance Reference — '),
      ph('{{CONTRACT_TITLE}}'),
      run(' / '),
      ph('{{SOLICITATION_AGENCY}}'),
    ], { after: 60 }),
  ];
}

// Subject / salutation
function salutation() {
  return [
    para([run('Dear '), ph('{{POC_NAME}}'), run(',')], { after: 120 }),
  ];
}

// Opening paragraph
function openingPara() {
  return [
    para([
      run("We're currently pursuing a federal contract with "),
      ph('{{SOLICITATION_AGENCY}}'),
      run(', and our work together on '),
      ph('{{CONTRACT_TITLE}}'),
      run(" is exactly the kind of past performance that makes that pursuit credible. I'd be grateful if you'd be willing to serve as a reference for that contract — either by speaking with a contracting officer if they reach out, or by providing a written past performance assessment via the government's CPARS system (or a separate reference form, depending on the solicitation format)."),
    ], { after: 120 }),
  ];
}

// Verification details table
function detailsTable() {
  const COL_LABEL = Math.floor(USABLE * 0.32);
  const COL_VALUE = USABLE - COL_LABEL;

  function detailRow(label, placeholder) {
    return new TableRow({
      children: [
        cell({
          width: COL_LABEL,
          shading: 'f8fafc',
          borders: hairlineBorders,
          padding: { top: 80, bottom: 80, left: 120, right: 80 },
          children: [
            para([run(label, { bold: true, size: SIZE_BODY - 2, color: SLATE })], { after: 0, line: 240 }),
          ],
        }),
        cell({
          width: COL_VALUE,
          borders: hairlineBorders,
          padding: { top: 80, bottom: 80, left: 120, right: 80 },
          children: [
            para([ph(placeholder)], { after: 0, line: 240 }),
          ],
        }),
      ],
    });
  }

  return [
    para([
      run("Before you agree, I want to make sure these details match your records. If any of them are off, please let me know — I'd rather correct the record before it reaches a CO:"),
    ], { after: 80, keepNext: true }),
    new Table({
      columnWidths: [COL_LABEL, COL_VALUE],
      borders: noBorders,
      rows: [
        detailRow('Contract / project title',  '{{CONTRACT_TITLE}}'),
        detailRow('Your role at the time',      '[e.g., Contracting Officer, Project Manager]'),
        detailRow('Approximate contract value', '{{CONTRACT_VALUE}}'),
        detailRow('Period of performance',      '{{POP_START}} – {{POP_END}}'),
      ],
    }),
    para([run('')], { after: 60 }),
  ];
}

// "What you might be asked" preview
function previewPara() {
  return [
    para([
      run('What you might be asked. ', { bold: true }),
      run("If a contracting officer contacts you, they'll typically use a standard past performance questionnaire — either a CPARS evaluation or a short form attached to the solicitation. Questions usually cover: (1) our technical performance and quality of deliverables, (2) schedule — did we meet milestones and respond to changes, (3) management — how we communicated, handled problems, and managed the team, and (4) overall satisfaction. You won't need to memorize anything; honest answers about what it was actually like to work with us are what matters to evaluators."),
    ], { after: 120 }),
  ];
}

// Closing ask
function closingPara() {
  return [
    para([
      run("If you're willing to serve as a reference, please reply by "),
      ph('{{REPLY_BY_DATE}}'),
      run(" — even a quick \"yes, go ahead\" is enough. If you have any questions about the opportunity or what you'd be asked, don't hesitate to call or email me directly. I genuinely appreciate it."),
    ], { after: 120 }),
    para([run('Respectfully,')], { after: 80 }),
    para([run('')], { after: 80 }),
    para([ph('{{SENDER_NAME}}')], { after: 30 }),
    para([ph('{{SENDER_TITLE}}'), run(', '), ph('{{COMPANY_NAME}}')], { after: 30 }),
    para([ph('{{SENDER_PHONE}}')], { after: 30 }),
    para([ph('{{SENDER_EMAIL}}')], { after: 60 }),
  ];
}

// Footer bar
function footerTable() {
  return new Table({
    columnWidths: [USABLE],
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          cell({
            width: USABLE,
            borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 6, color: RULE_GRAY } },
            padding: { top: 60, bottom: 0, left: 0, right: 0 },
            children: [
              para([
                run('This letter is confidential and intended solely for the use of the individual named above. Questions? Contact ', { size: SIZE_TINY, color: SLATE_LIGHT }),
                ph('{{SENDER_EMAIL}}'),
                run('.', { size: SIZE_TINY, color: SLATE_LIGHT }),
              ], { after: 0, line: 240, alignment: AlignmentType.CENTER }),
            ],
          }),
        ],
      }),
    ],
  });
}

// --- Assemble -----------------------------------------------------------------

const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left:   convertInchesToTwip(1),
            right:  convertInchesToTwip(1),
          },
        },
      },
      children: [
        headerTable(),
        ...senderBlock(),
        ...recipientBlock(),
        ...salutation(),
        ...openingPara(),
        ...detailsTable(),
        ...previewPara(),
        ...closingPara(),
        footerTable(),
      ],
    },
  ],
});

// --- Write --------------------------------------------------------------------

if (!existsSync(DEPLOY_DIR)) {
  mkdirSync(DEPLOY_DIR, { recursive: true });
}

const buffer = await Packer.toBuffer(doc);
writeFileSync(DEPLOY, buffer);
console.log(`Written: ${DEPLOY} (${Math.round(buffer.length / 1024)} KB)`);
