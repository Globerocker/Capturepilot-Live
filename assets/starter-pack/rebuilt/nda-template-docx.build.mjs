// Build script for FLK_09 Mutual NDA Template — Editable Word Template (.docx)
// Run: node nda-template-docx.build.mjs
// Produces: FLK_09_NDA_Template.docx alongside this script,
// then deploys to dashboard/public/starter-pack/09_Internal_Best_Practice_Library/.
//
// SPEC: Mutual NDA for federal teaming partners + subs before sharing
// solicitation strategy. Clauses: Confidential Information definition,
// exclusions, 3-year term, permitted disclosures, non-circumvention,
// return/destruction, governing law, no-license, equitable remedies.
// Placeholders: {{PARTY_A_NAME}}, {{PARTY_B_NAME}}, {{DATE}}, {{STATE}}.
// All tables include columnWidths (Google Docs / Word / LibreOffice compat).

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
  PageBreak,
  convertInchesToTwip,
} from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/docx/dist/index.mjs';
import { writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, 'FLK_09_NDA_Template.docx');
const DEPLOY_DIR = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/09_Internal_Best_Practice_Library';
const DEPLOY = join(DEPLOY_DIR, 'FLK_09_NDA_Template.docx');

// --- Brand ----------------------------------------------------------------
const EMERALD       = '10b981';
const EMERALD_DARK  = '047857';
const INK           = '0f172a';
const SLATE         = '475569';
const SLATE_LIGHT   = '94a3b8';
const PAPER         = 'ffffff';
const ROW_ALT       = 'f8fafc';
const WARNING_BG    = 'fef3c7'; // amber-100 — legal notice banner
const WARNING_FG    = '92400e'; // amber-800

const BODY_FONT = 'Calibri';
const MONO_FONT = 'Consolas';

// Letter: 8.5 × 11 in.  Margins: 1 in each side.  Usable = 6.5 in = 9360 twips.
const USABLE_TWIPS = 9360;
const COL_LABEL    = 1440;  // ~1 in label column in signature block
const COL_VALUE    = 7920;  // fills rest in signature block

// Half-points for docx sizes.
const SIZE_TINY  = 16;  // 8pt
const SIZE_SMALL = 18;  // 9pt
const SIZE_BODY  = 20;  // 10pt
const SIZE_H3    = 22;  // 11pt
const SIZE_H2    = 28;  // 14pt
const SIZE_H1    = 36;  // 18pt

// --- Border helpers -------------------------------------------------------
const noBorder  = { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' };
const noBorders = {
  top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
  insideHorizontal: noBorder, insideVertical: noBorder,
};
const hairline  = { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0' };
const hairlines = {
  top: hairline, bottom: hairline, left: hairline, right: hairline,
  insideHorizontal: hairline, insideVertical: hairline,
};
const bottomOnly = {
  top: noBorder, left: noBorder, right: noBorder,
  bottom: { style: BorderStyle.SINGLE, size: 6, color: '94a3b8' },
  insideHorizontal: noBorder, insideVertical: noBorder,
};

// --- Text helpers ---------------------------------------------------------
function run(str, opts = {}) {
  return new TextRun({
    text: str,
    font:    opts.font    ?? BODY_FONT,
    size:    opts.size    ?? SIZE_BODY,
    color:   opts.color   ?? INK,
    bold:    !!opts.bold,
    italics: !!opts.italics,
    underline: opts.underline ? {} : undefined,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    alignment: opts.alignment ?? AlignmentType.LEFT,
    spacing: {
      before: opts.before ?? 0,
      after:  opts.after  ?? 120,
      line:   opts.line   ?? 276, // ~1.15 line spacing — readable legal text
    },
    indent:     opts.indent,
    keepNext:   opts.keepNext   ?? false,
    keepLines:  opts.keepLines  ?? true,
    pageBreakBefore: opts.pageBreak ?? false,
    children: Array.isArray(children) ? children : [children],
  });
}

function cell({ children, width, shading, colspan, valign = 'top', padding, borders }) {
  return new TableCell({
    width:        { size: width, type: WidthType.DXA },
    columnSpan:   colspan,
    shading:      shading ? { type: ShadingType.CLEAR, fill: shading, color: 'auto' } : undefined,
    verticalAlign: valign,
    margins:      padding ?? { top: 80, bottom: 80, left: 120, right: 120 },
    borders,
    children:     Array.isArray(children) ? children : [children],
  });
}

// Heading with emerald left-border accent (visual section separator).
function sectionHeading(number, title) {
  return para(
    [
      run(`${number}.  `, { size: SIZE_H2, bold: true, color: EMERALD_DARK }),
      run(title.toUpperCase(), { size: SIZE_H2, bold: true, color: INK }),
    ],
    { before: 240, after: 80, keepNext: true, line: 280 },
  );
}

// Standard body paragraph with comfortable legal leading.
function bodyPara(text, opts = {}) {
  return para(
    [run(text, { size: SIZE_BODY, color: INK, italics: opts.italics ?? false })],
    { before: 0, after: 120, line: 276, indent: opts.indent },
  );
}

// Sub-list item (lettered or numbered). Indent 360 twips.
function listItem(marker, text) {
  return para(
    [
      run(`${marker}  `, { size: SIZE_BODY, bold: true, color: EMERALD_DARK }),
      run(text, { size: SIZE_BODY, color: INK }),
    ],
    { before: 0, after: 80, line: 276, indent: { left: 360, hanging: 360 } },
  );
}

// Definition line: bold term + body definition.
function defLine(term, definition) {
  return para(
    [
      run(`"${term}"`, { size: SIZE_BODY, bold: true, color: INK }),
      run(` means ${definition}`, { size: SIZE_BODY, color: INK }),
    ],
    { before: 0, after: 100, line: 276, indent: { left: 360 } },
  );
}

// Placeholder badge — visually distinct so users know where to fill in.
function placeholder(text) {
  return run(`{{${text}}}`, { size: SIZE_BODY, bold: true, color: EMERALD_DARK, underline: true });
}

// Signature block row: label | underlined field.
function sigRow(label, fieldHint, colWidths) {
  return new TableRow({
    cantSplit: true,
    children: [
      cell({
        width: colWidths[0],
        borders: noBorders,
        padding: { top: 60, bottom: 60, left: 0, right: 120 },
        children: [para(
          [run(label, { size: SIZE_SMALL, bold: true, color: SLATE })],
          { after: 0, line: 240 },
        )],
      }),
      cell({
        width: colWidths[1],
        borders: bottomOnly,
        padding: { top: 60, bottom: 60, left: 60, right: 0 },
        children: [para(
          [run(fieldHint, { size: SIZE_SMALL, color: SLATE_LIGHT, italics: true })],
          { after: 0, line: 240 },
        )],
      }),
    ],
  });
}

// --- Build sections -------------------------------------------------------

function legalNoticeBanner() {
  // Full-width amber warning box — sits at the very top.
  return new Table({
    width: { size: USABLE_TWIPS, type: WidthType.DXA },
    columnWidths: [USABLE_TWIPS],
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 12, color: 'f59e0b' },
      bottom: { style: BorderStyle.SINGLE, size: 12, color: 'f59e0b' },
      left:   { style: BorderStyle.SINGLE, size: 12, color: 'f59e0b' },
      right:  { style: BorderStyle.SINGLE, size: 12, color: 'f59e0b' },
      insideHorizontal: noBorder, insideVertical: noBorder,
    },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell({
            width: USABLE_TWIPS,
            shading: WARNING_BG,
            valign: 'center',
            padding: { top: 140, bottom: 140, left: 200, right: 200 },
            children: [
              para(
                [run('⚠  LEGAL NOTICE — NOT LEGAL ADVICE', {
                  font: MONO_FONT, size: SIZE_H3, bold: true, color: WARNING_FG,
                })],
                { after: 60, line: 240, keepNext: true },
              ),
              para(
                [run(
                  'This template is provided for informational purposes only by CapturePilot ' +
                  '(capturepilot.com) and does not constitute legal advice. It has not been ' +
                  'reviewed by an attorney licensed in your jurisdiction. Before you execute ' +
                  'this agreement — or share it with a teaming partner — have a qualified ' +
                  'attorney review it. Laws governing NDAs, non-circumvention, and trade ' +
                  'secrets vary by state. Do not rely on this document as a substitute for ' +
                  'professional legal counsel.',
                  { size: SIZE_SMALL, color: WARNING_FG },
                )],
                { after: 0, line: 264 },
              ),
            ],
          }),
        ],
      }),
    ],
  });
}

function coverBlock() {
  return [
    para([run(''), ], { before: 0, after: 60 }), // small gap after banner

    new Table({
      width: { size: USABLE_TWIPS, type: WidthType.DXA },
      columnWidths: [USABLE_TWIPS],
      borders: noBorders,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell({
              width: USABLE_TWIPS,
              shading: INK,
              valign: 'center',
              padding: { top: 240, bottom: 240, left: 280, right: 280 },
              borders: noBorders,
              children: [
                para(
                  [run('MUTUAL NON-DISCLOSURE AGREEMENT', {
                    size: SIZE_H1, bold: true, color: 'ffffff',
                  })],
                  { after: 60, line: 300, keepNext: true, alignment: AlignmentType.CENTER },
                ),
                para(
                  [run('Federal Teaming & Subcontractor Use', {
                    size: SIZE_H3, color: EMERALD, italics: true,
                  })],
                  { after: 120, line: 240, alignment: AlignmentType.CENTER },
                ),
                para(
                  [
                    run('Between ', { size: SIZE_BODY, color: SLATE_LIGHT }),
                    placeholder('PARTY_A_NAME'),
                    run('  and  ', { size: SIZE_BODY, color: SLATE_LIGHT }),
                    placeholder('PARTY_B_NAME'),
                  ],
                  { after: 60, line: 240, alignment: AlignmentType.CENTER },
                ),
                para(
                  [
                    run('Effective Date: ', { size: SIZE_BODY, color: SLATE_LIGHT }),
                    placeholder('DATE'),
                  ],
                  { after: 0, line: 240, alignment: AlignmentType.CENTER },
                ),
              ],
            }),
          ],
        }),
      ],
    }),

    para([run('')], { before: 0, after: 120 }), // gap before body
  ];
}

function recitals() {
  return [
    para(
      [run(
        'WHEREAS, each Party (as defined below) anticipates disclosing Confidential ' +
        'Information (as defined below) to the other Party for the purpose of evaluating ' +
        'a potential teaming arrangement, subcontracting relationship, or joint pursuit of ' +
        'one or more U.S. federal government contract opportunities (the "Purpose"); and',
        { size: SIZE_BODY, color: INK, italics: true },
      )],
      { before: 0, after: 100, line: 276, indent: { left: 0 } },
    ),
    para(
      [run(
        'WHEREAS, each Party is willing to disclose such information only under the ' +
        'conditions set forth herein;',
        { size: SIZE_BODY, color: INK, italics: true },
      )],
      { before: 0, after: 100, line: 276 },
    ),
    para(
      [run(
        'NOW, THEREFORE, in consideration of the mutual covenants and promises herein ' +
        'and other good and valuable consideration, the receipt and sufficiency of which ' +
        'are hereby acknowledged, the Parties agree as follows:',
        { size: SIZE_BODY, color: INK },
      )],
      { before: 0, after: 200, line: 276 },
    ),
  ];
}

function section1() {
  return [
    sectionHeading(1, 'Definitions'),
    bodyPara('As used in this Agreement:'),
    defLine(
      'Party A',
      `${String.fromCharCode(160)}{{PARTY_A_NAME}}, a legal entity organized under the laws of a U.S. state.`,
    ),
    defLine(
      'Party B',
      `${String.fromCharCode(160)}{{PARTY_B_NAME}}, a legal entity organized under the laws of a U.S. state.`,
    ),
    defLine(
      'Parties',
      'Party A and Party B, collectively.',
    ),
    defLine(
      'Confidential Information',
      'any non-public information disclosed by one Party (the "Disclosing Party") to the ' +
      'other Party (the "Receiving Party") — whether orally, in writing, digitally, or by ' +
      'any other means — that is designated as confidential or that reasonably should be ' +
      'understood to be confidential given the nature of the information and the ' +
      'circumstances of disclosure. Without limiting the foregoing, Confidential ' +
      'Information includes: capture strategies, teaming plans, pricing models, bid-and-' +
      'proposal (B&P) data, technical approaches, personnel data, past performance ' +
      'write-ups drafted for a specific opportunity, customer relationship intelligence, ' +
      'and any information related to a specific federal solicitation or agency customer.',
    ),
    defLine(
      'Representative',
      'an employee, officer, director, contractor, or consultant of a Party who (a) has a ' +
      'need to know the Confidential Information for the Purpose and (b) is bound by ' +
      'written confidentiality obligations no less protective than those in this Agreement.',
    ),
  ];
}

function section2() {
  return [
    sectionHeading(2, 'Exclusions from Confidential Information'),
    bodyPara(
      'The obligations of this Agreement do not apply to information that the Receiving ' +
      'Party can demonstrate:',
    ),
    listItem('(a)', 'is or becomes generally available to the public through no act or omission of the Receiving Party;'),
    listItem('(b)', 'was rightfully known to the Receiving Party prior to disclosure by the Disclosing Party, as evidenced by written records predating receipt;'),
    listItem('(c)', 'is rightfully received from a third party without restriction on disclosure;'),
    listItem('(d)', 'is independently developed by the Receiving Party without use of or reference to the Disclosing Party\'s Confidential Information, as evidenced by contemporaneous written records; or'),
    listItem('(e)', 'is required to be disclosed by applicable law, regulation, court order, or government authority, provided that the Receiving Party gives the Disclosing Party prompt written notice (to the extent legally permissible) and reasonably cooperates with the Disclosing Party\'s efforts to obtain a protective order or other appropriate relief.'),
  ];
}

function section3() {
  return [
    sectionHeading(3, 'Obligations of the Receiving Party'),
    bodyPara(
      'The Receiving Party agrees to:',
    ),
    listItem('(a)', 'hold the Confidential Information in strict confidence using at least the same degree of care it uses to protect its own confidential information of like sensitivity, but in no event less than reasonable care;'),
    listItem('(b)', 'not disclose or make available Confidential Information to any person or entity other than its Representatives who have a need to know such information for the Purpose;'),
    listItem('(c)', 'use the Confidential Information solely for the Purpose and for no other purpose whatsoever;'),
    listItem('(d)', 'promptly notify the Disclosing Party in writing upon becoming aware of any unauthorized use or disclosure of Confidential Information; and'),
    listItem('(e)', 'be responsible for any breach of this Agreement by its Representatives to the same extent as if the Receiving Party had committed such breach directly.'),
  ];
}

function section4() {
  return [
    sectionHeading(4, 'Term'),
    bodyPara(
      'This Agreement is effective as of the Effective Date set forth above and ' +
      'continues until terminated by either Party upon thirty (30) days\' written notice. ' +
      'Notwithstanding any such termination, the confidentiality obligations with respect ' +
      'to Confidential Information disclosed prior to the effective date of termination ' +
      'shall survive and remain in full force for a period of three (3) years from the ' +
      'date of each respective disclosure.',
    ),
  ];
}

function section5() {
  return [
    sectionHeading(5, 'Permitted Disclosures'),
    bodyPara(
      'Each Party may disclose Confidential Information to its Representatives solely to ' +
      'the extent necessary to evaluate or advance the Purpose. Each Party shall:',
    ),
    listItem('(a)', 'inform each Representative of the confidential nature of the information before disclosure;'),
    listItem('(b)', 'ensure each Representative is bound by written confidentiality obligations at least as protective as those set forth herein; and'),
    listItem('(c)', 'remain jointly and severally liable with each Representative for any breach of those obligations.'),
    bodyPara(
      'Neither Party may disclose the other Party\'s Confidential Information to any ' +
      'government agency, prime contractor, contracting officer, or other third party ' +
      'without the Disclosing Party\'s prior written consent, except as strictly required ' +
      'by a solicitation response (e.g., a subcontractor disclosure in a Section L ' +
      'teaming exhibit) and only after notifying the Disclosing Party.',
    ),
  ];
}

function section6() {
  return [
    sectionHeading(6, 'Non-Circumvention'),
    bodyPara(
      'This clause is essential for federal teaming arrangements. During the term of ' +
      'this Agreement and for two (2) years following its termination or expiration, ' +
      'neither Party shall, without the prior written consent of the other Party:',
    ),
    listItem('(a)', 'directly or indirectly solicit, contact, or negotiate with any agency customer, contracting officer, program manager, or end-user that was first identified to the other Party in connection with the Purpose;'),
    listItem('(b)', 'circumvent, avoid, bypass, or obviate the other Party\'s participation in any opportunity that arose from or was materially advanced by the Confidential Information shared hereunder;'),
    listItem('(c)', 'submit a proposal or offer — as prime or sub — for any specific federal opportunity disclosed under this Agreement without the other Party\'s written agreement on teaming roles and work share, unless the Parties have formally agreed in a Teaming Agreement or Subcontract to pursue the opportunity without such restrictions; or'),
    listItem('(d)', 'hire or solicit for employment any employee or key personnel of the other Party who was involved in activities related to the Purpose, without written consent.'),
    bodyPara(
      'Nothing in this section prevents either Party from independently pursuing ' +
      'opportunities that were not disclosed under this Agreement and that the Party ' +
      'identified through its own separate efforts.',
    ),
  ];
}

function section7() {
  return [
    sectionHeading(7, 'Return or Destruction of Materials'),
    bodyPara(
      'Upon the earlier of (a) the Disclosing Party\'s written request, (b) termination ' +
      'of this Agreement, or (c) determination by the Parties not to proceed with the ' +
      'Purpose, the Receiving Party shall — at the Disclosing Party\'s election — promptly ' +
      'return or certifiably destroy all tangible materials containing Confidential ' +
      'Information, including all copies, notes, summaries, and electronic files. The ' +
      'Receiving Party shall provide a written certification of destruction within ' +
      'ten (10) business days of such request. Notwithstanding the foregoing, each Party ' +
      'may retain one archival copy of Confidential Information in secure storage solely ' +
      'to the extent required by applicable law, regulation, or document retention ' +
      'policy, subject to the continuing confidentiality obligations herein.',
    ),
  ];
}

function section8() {
  return [
    sectionHeading(8, 'No License; No Obligation to Proceed'),
    bodyPara(
      'Nothing in this Agreement grants either Party any right, title, license, or ' +
      'interest — express or implied — in or to any Confidential Information, patent, ' +
      'copyright, trademark, trade secret, or any other intellectual property of the ' +
      'other Party. The disclosure of Confidential Information does not obligate either ' +
      'Party to enter into any further agreement, teaming arrangement, subcontract, ' +
      'or business relationship. Either Party may decline to pursue the Purpose for any ' +
      'reason or no reason, subject only to the surviving obligations herein.',
    ),
  ];
}

function section9() {
  return [
    sectionHeading(9, 'Governing Law; Dispute Resolution'),
    bodyPara(
      [
        'This Agreement shall be governed by and construed in accordance with the laws of ',
        'the State of ',
        '{{STATE}}',
        ', without regard to its conflict-of-laws principles. Any dispute arising out of ' +
        'or relating to this Agreement shall be brought exclusively in the state or federal ' +
        'courts located in ',
        '{{STATE}}',
        ', and each Party irrevocably submits to the personal jurisdiction of such courts. ' +
        'In any action to enforce this Agreement, the prevailing Party shall be entitled ' +
        'to recover its reasonable attorneys\' fees and costs.',
      ].join(''),
    ),
  ];
}

function section10() {
  return [
    sectionHeading(10, 'Equitable Remedies'),
    bodyPara(
      'The Parties acknowledge that a breach or threatened breach of this Agreement ' +
      'would cause irreparable harm to the Disclosing Party for which monetary damages ' +
      'alone would be an inadequate remedy. Accordingly, each Party agrees that the ' +
      'Disclosing Party shall be entitled to seek injunctive relief, specific performance, ' +
      'or other equitable remedies from a court of competent jurisdiction, in addition to ' +
      'any other remedies available at law or in equity, without the necessity of posting ' +
      'bond or proving actual damages.',
    ),
  ];
}

function section11() {
  return [
    sectionHeading(11, 'General Provisions'),
    listItem('11.1  Entire Agreement.',
      'This Agreement constitutes the entire agreement between the Parties with ' +
      'respect to the subject matter hereof and supersedes all prior and contemporaneous ' +
      'understandings and agreements relating thereto.'),
    listItem('11.2  Amendments.',
      'No amendment or modification of this Agreement shall be valid unless made in ' +
      'writing and signed by both Parties.'),
    listItem('11.3  Waiver.',
      'No waiver of any provision of this Agreement shall be effective unless in ' +
      'writing. A waiver of any breach shall not constitute a waiver of any subsequent ' +
      'breach.'),
    listItem('11.4  Severability.',
      'If any provision of this Agreement is held invalid or unenforceable, the ' +
      'remaining provisions shall continue in full force and effect.'),
    listItem('11.5  Counterparts.',
      'This Agreement may be executed in counterparts, each of which shall be deemed ' +
      'an original, and all of which together shall constitute one and the same instrument. ' +
      'Electronic signatures and PDF copies shall be deemed valid.'),
    listItem('11.6  Notices.',
      'Notices under this Agreement shall be in writing and sent by (a) certified mail, ' +
      'return receipt requested, (b) nationally recognized overnight courier, or ' +
      '(c) email with confirmation of receipt, to the addresses in the signature block ' +
      'below (or such other address as a Party designates in writing).'),
    listItem('11.7  Relationship of the Parties.',
      'Nothing in this Agreement creates a partnership, joint venture, agency, ' +
      'franchise, employment, or fiduciary relationship between the Parties.'),
    listItem('11.8  Export Compliance.',
      'Each Party represents that it will comply with all applicable U.S. export ' +
      'control laws and regulations, including the Export Administration Regulations ' +
      '(EAR) and the International Traffic in Arms Regulations (ITAR), with respect to ' +
      'Confidential Information it receives.'),
  ];
}

function signatureBlock() {
  // Two-column layout: Party A (left) | Party B (right)
  const halfW    = Math.floor(USABLE_TWIPS / 2); // 4680
  const labelW   = 1100;
  const fieldW   = halfW - labelW - 80; // ~3500
  const innerColWidths = [labelW, fieldW];

  function sigSide(partyLabel, partyPlaceholder) {
    return cell({
      width: halfW,
      borders: noBorders,
      padding: { top: 0, bottom: 0, left: 0, right: halfW === 4680 ? 160 : 0 },
      children: [
        para(
          [run(partyLabel, { size: SIZE_H3, bold: true, color: EMERALD_DARK })],
          { after: 120, line: 240, keepNext: true },
        ),
        new Table({
          width: { size: halfW - 160, type: WidthType.DXA },
          columnWidths: innerColWidths,
          borders: noBorders,
          rows: [
            sigRow('Legal Name:',  partyPlaceholder,          innerColWidths),
            sigRow('By:',          'Authorized Signature',    innerColWidths),
            sigRow('Printed Name:', 'Full Legal Name',        innerColWidths),
            sigRow('Title:',       'Title / Role',            innerColWidths),
            sigRow('Date:',        '____________________',    innerColWidths),
            sigRow('Address:',     'Street, City, State, ZIP',innerColWidths),
            sigRow('Email:',       'Email Address',           innerColWidths),
          ],
        }),
      ],
    });
  }

  return [
    para([run('')], { before: 240, after: 60 }), // spacer
    para(
      [run('IN WITNESS WHEREOF, the Parties have executed this Mutual Non-Disclosure ' +
           'Agreement as of the Effective Date first written above.',
           { size: SIZE_BODY, color: INK })],
      { before: 0, after: 200, line: 276 },
    ),
    new Table({
      width: { size: USABLE_TWIPS, type: WidthType.DXA },
      columnWidths: [halfW, halfW],
      borders: noBorders,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            sigSide('PARTY A', '{{PARTY_A_NAME}}'),
            sigSide('PARTY B', '{{PARTY_B_NAME}}'),
          ],
        }),
      ],
    }),
  ];
}

function footerLine() {
  return para(
    [
      run('CapturePilot Federal Lead Kit  ·  Mutual NDA Template  ·  capturepilot.com', {
        font: MONO_FONT, size: SIZE_TINY, color: SLATE_LIGHT,
      }),
      run('  |  Not legal advice — have an attorney review before execution.', {
        size: SIZE_TINY, color: SLATE_LIGHT, italics: true,
      }),
    ],
    { before: 300, after: 0, alignment: AlignmentType.CENTER, line: 200 },
  );
}

// --- Assemble document ----------------------------------------------------

function buildDocument() {
  const children = [
    // Legal notice banner at top
    legalNoticeBanner(),

    // Cover / title block
    ...coverBlock(),

    // Parties / recitals
    ...recitals(),

    // Article sections
    ...section1(),
    ...section2(),
    ...section3(),
    ...section4(),
    ...section5(),
    ...section6(),
    ...section7(),
    ...section8(),
    ...section9(),
    ...section10(),
    ...section11(),

    // Signature block
    ...signatureBlock(),

    // Footer line
    footerLine(),
  ];

  return new Document({
    creator:     'CapturePilot',
    title:       'CapturePilot Mutual NDA Template',
    description: 'Federal Lead Kit · Mutual NDA for teaming partners and subcontractors',
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: SIZE_BODY, color: INK },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width:  convertInchesToTwip(8.5),
              height: convertInchesToTwip(11),
            },
            margin: {
              top:    convertInchesToTwip(1.0),
              right:  convertInchesToTwip(1.0),
              bottom: convertInchesToTwip(1.0),
              left:   convertInchesToTwip(1.0),
              header: convertInchesToTwip(0.5),
              footer: convertInchesToTwip(0.5),
            },
          },
        },
        children,
      },
    ],
  });
}

// --- Run ------------------------------------------------------------------
const doc    = buildDocument();
const buffer = await Packer.toBuffer(doc);
writeFileSync(OUTPUT, buffer);
console.log('Wrote', OUTPUT, '— bytes:', buffer.length);

// Ensure deploy dir exists
if (!existsSync(DEPLOY_DIR)) {
  mkdirSync(DEPLOY_DIR, { recursive: true });
  console.log('Created deploy dir:', DEPLOY_DIR);
}

try {
  copyFileSync(OUTPUT, DEPLOY);
  console.log('Deployed ->', DEPLOY);
} catch (err) {
  console.error('Deploy copy failed:', err.message);
  process.exit(1);
}
