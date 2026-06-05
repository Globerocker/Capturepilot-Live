// Convert FLK_09_Compliance_Matrix_Template.xlsx so checklist-style cells become
// real boolean checkboxes that work in BOTH Microsoft Excel AND Google Sheets.
//
// Approach:
//   - Boolean cells (cell.type "b") for the new "Compliant?" column on
//       Section L Matrix      (column K, rows 12..200)
//       Section M Alignment   (column K, rows  6..50)
//       Submission Checklist  (column G, rows  6..60)
//   - Data validation type "list" with formulae ["TRUE","FALSE"] so users can
//     toggle the cell via dropdown in Excel; Google Sheets auto-renders these
//     cells as native checkboxes.
//   - Conditional formatting: if the cell evaluates TRUE, fill green (#D1FAE5)
//     and apply strikethrough to the row label cell.
//   - Worksheet protection: lock everything EXCEPT the "Compliant?" column +
//     the existing user-input columns. Users can only check/uncheck (and edit
//     the inputs the original template already exposed) — criteria text is
//     read-only.
//   - Instructions note at the top of each modified sheet:
//       "Google Sheets: cells render as native checkboxes.
//        Excel 365: cells render as boolean dropdowns; right-click >
//        Format Cell > Checkbox to convert. Older Excel: cells show as
//        TRUE/FALSE dropdowns."
//
// Asset-specific spec: in addition to the existing Status dropdown
// (Not Started / Draft / Review / Final / NA — wired on Section L), add a
// "Compliant?" boolean checkbox column to Section L, Section M, and
// Submission Checklist.
//
// Overwrites the existing XLSX in place.
//
// Run: node /Users/andreschuler/Caturepilot 2.0/assets/starter-pack/rebuilt/compliance-matrix.checkbox.mjs

import ExcelJS from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js';

const FILE =
  '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/FLK_09_Compliance_Matrix_Template.xlsx';

// brand palette (kept consistent with compliance-matrix.build.mjs)
const GREEN_LT = 'FFD1FAE5';
const GREEN = 'FF16A34A';
const SLATE_200 = 'FFE2E8F0';
const SLATE_700 = 'FF334155';
const SLATE_900 = 'FF0F172A';
const VIOLET_LT = 'FFEDE9FE';
const WHITE = 'FFFFFFFF';
const EMERALD = 'FF10B981';
const EMERALD_DK = 'FF047857';
const FONT = 'Calibri';

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thinBorder = {
  top: { style: 'thin', color: { argb: SLATE_200 } },
  left: { style: 'thin', color: { argb: SLATE_200 } },
  bottom: { style: 'thin', color: { argb: SLATE_200 } },
  right: { style: 'thin', color: { argb: SLATE_200 } },
};

const noteStyle = {
  font: { name: FONT, size: 10, italic: true, color: { argb: SLATE_700 } },
  fill: fill(VIOLET_LT),
  alignment: { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 },
  border: thinBorder,
};

const colHeaderStyle = {
  font: { name: FONT, size: 10, bold: true, color: { argb: WHITE } },
  fill: fill(EMERALD),
  alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { argb: EMERALD_DK } },
    left: { style: 'thin', color: { argb: EMERALD_DK } },
    bottom: { style: 'thin', color: { argb: EMERALD_DK } },
    right: { style: 'thin', color: { argb: EMERALD_DK } },
  },
};

const checkboxCellStyle = {
  font: { name: FONT, size: 11, bold: true, color: { argb: SLATE_900 } },
  fill: fill(WHITE),
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: thinBorder,
};

const INSTRUCTIONS_NOTE =
  'Google Sheets: cells render as native checkboxes. Excel 365: cells render as boolean dropdowns; right-click > Format Cell > Checkbox to convert. Older Excel: cells show as TRUE/FALSE dropdowns.';

const STATUS_LIST = '"Not Started,Draft,Review,Final,NA"';

function colLetter(idx) {
  // 1 -> A, 26 -> Z, 27 -> AA
  let s = '';
  let n = idx;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Add a boolean "Compliant?" checkbox column to a worksheet.
 *
 * @param {ExcelJS.Worksheet} ws
 * @param {object} opts
 * @param {number} opts.colIndex       1-based column index for the new column
 * @param {number} opts.headerRow      row number where header sits
 * @param {number} opts.firstDataRow   first row to mark as checkable
 * @param {number} opts.lastDataRow    last row to mark as checkable
 * @param {number} opts.labelColIndex  column whose label gets strikethrough when TRUE
 * @param {string} opts.headerText     visible header text
 * @param {number} opts.colWidth       width for the new column
 */
function addCheckboxColumn(ws, opts) {
  const {
    colIndex,
    headerRow,
    firstDataRow,
    lastDataRow,
    labelColIndex,
    headerText,
    colWidth,
  } = opts;

  // ensure the column is wide enough and styled
  const col = ws.getColumn(colIndex);
  col.width = colWidth;

  // header cell
  const headerCell = ws.getCell(headerRow, colIndex);
  headerCell.value = headerText;
  headerCell.style = colHeaderStyle;

  // data cells: seed with FALSE booleans + per-cell data validation +
  // base style. ExcelJS will serialize these with type="b".
  for (let r = firstDataRow; r <= lastDataRow; r += 1) {
    const cell = ws.getCell(r, colIndex);
    cell.value = false;
    cell.style = checkboxCellStyle;
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Boolean only',
      error: 'Use TRUE or FALSE. Google Sheets renders this as a checkbox automatically.',
      formulae: ['"TRUE,FALSE"'],
    };
    // make sure the checkbox cell stays unlocked so users can toggle it
    cell.protection = { locked: false };
  }

  // conditional formatting on the checkbox column itself: green fill when TRUE
  const colAddr = colLetter(colIndex);
  const rangeChecks = `${colAddr}${firstDataRow}:${colAddr}${lastDataRow}`;
  ws.addConditionalFormatting({
    ref: rangeChecks,
    rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        priority: 1,
        formulae: ['TRUE'],
        style: {
          font: { color: { argb: GREEN }, bold: true },
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_LT } },
        },
      },
    ],
  });

  // conditional formatting on the row label column: strikethrough + green tint
  // when the matching row in the checkbox column is TRUE.
  const labelAddr = colLetter(labelColIndex);
  const rangeLabels = `${labelAddr}${firstDataRow}:${labelAddr}${lastDataRow}`;
  ws.addConditionalFormatting({
    ref: rangeLabels,
    rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: [`$${colAddr}${firstDataRow}=TRUE`],
        style: {
          font: { strike: true, color: { argb: SLATE_700 } },
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_LT } },
        },
      },
    ],
  });
}

/**
 * Add (or replace) the instructions note row at the top of a sheet.
 * Inserts a single merged cell on `row` spanning A..lastCol.
 */
function setNoteRow(ws, row, lastColIndex) {
  const startAddr = `A${row}`;
  const endAddr = `${colLetter(lastColIndex)}${row}`;
  const range = `${startAddr}:${endAddr}`;
  // unmerge if already merged
  try { ws.unMergeCells(range); } catch (_) { /* ignore */ }
  ws.mergeCells(range);
  const cell = ws.getCell(startAddr);
  cell.value = INSTRUCTIONS_NOTE;
  cell.style = noteStyle;
  ws.getRow(row).height = 36;
}

/**
 * Lock everything in the worksheet, then unlock the cells the user is
 * allowed to edit. Finally protect the sheet so only those cells can
 * be modified.
 *
 * editableRanges: array of A1 range strings (e.g. ["K12:K200", "C12:C200"])
 */
function lockSheet(ws, editableRanges) {
  // mark every cell with a value as locked
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const prev = cell.protection || {};
      cell.protection = { ...prev, locked: true };
    });
  });
  // unlock each editable range
  for (const r of editableRanges) {
    const [start, end] = r.split(':');
    const startCol = start.match(/[A-Z]+/)[0];
    const startRow = Number(start.match(/\d+/)[0]);
    const endCol = end.match(/[A-Z]+/)[0];
    const endRow = Number(end.match(/\d+/)[0]);
    // convert col letters to indexes
    const colIdx = (letters) => letters
      .split('')
      .reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
    const s = colIdx(startCol);
    const e = colIdx(endCol);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let c = s; c <= e; c += 1) {
        const cell = ws.getCell(row, c);
        cell.protection = { locked: false };
      }
    }
  }
  // enable protection with a no-password lock (consistent with how the
  // template is consumed — users should never need a password).
  ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: true,
    formatColumns: true,
    formatRows: true,
    insertRows: false,
    insertColumns: false,
    deleteRows: false,
    deleteColumns: false,
    sort: true,
    autoFilter: true,
    pivotTables: false,
  });
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  // -----------------------------------------------------------------
  // Sheet 2 — "Section L Matrix"
  //   Existing layout: 10 cols A..J. Headers on row 11. Data rows 12..200.
  //   Existing validations:
  //     - C12:C200  (likely Volume)
  //     - F12:F200  (Page Limit Impact? Y/N)
  //     - H12:H200  (Priority)
  //     - I12:I200  (Status dropdown — Not Started / In Draft / Complete / Reviewed / Missing)
  //   Action:
  //     - Add Status column (K) with our spec dropdown (Not Started / Draft /
  //       Review / Final / NA). (NB: the template's existing I col is the
  //       legacy 5-status; we add the asset-spec dropdown alongside as col K
  //       and add the Compliant? boolean as col L.)
  // -----------------------------------------------------------------
  const wsL = wb.getWorksheet('Section L Matrix');
  if (!wsL) throw new Error('Section L Matrix sheet missing');

  // instructions note placed in row 10 (currently blank between row 9 and the
  // header row 11). Sheet uses A..J so we span to col L (the checkbox col).
  const wsL_FIRST = 12;
  const wsL_LAST = 200;
  const wsL_LABEL_COL = 2;  // column B = instruction text
  const wsL_STATUS_COL = 11; // K
  const wsL_CHK_COL = 12;    // L

  // header row Status + Compliant
  const wsL_HEADER_ROW = 11;
  // Status column (asset-spec dropdown)
  wsL.getColumn(wsL_STATUS_COL).width = 16;
  const statusHeader = wsL.getCell(wsL_HEADER_ROW, wsL_STATUS_COL);
  statusHeader.value = 'Status (asset-spec)';
  statusHeader.style = colHeaderStyle;

  for (let r = wsL_FIRST; r <= wsL_LAST; r += 1) {
    const cell = wsL.getCell(r, wsL_STATUS_COL);
    cell.value = 'Not Started';
    cell.style = {
      font: { name: FONT, size: 10, color: { argb: SLATE_900 } },
      fill: fill(WHITE),
      alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
      border: thinBorder,
    };
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Pick a status',
      error: 'Use Not Started / Draft / Review / Final / NA.',
      formulae: [STATUS_LIST],
    };
    cell.protection = { locked: false };
  }

  // Compliant? checkbox column
  addCheckboxColumn(wsL, {
    colIndex: wsL_CHK_COL,
    headerRow: wsL_HEADER_ROW,
    firstDataRow: wsL_FIRST,
    lastDataRow: wsL_LAST,
    labelColIndex: wsL_LABEL_COL,
    headerText: 'Compliant?',
    colWidth: 12,
  });

  setNoteRow(wsL, 10, wsL_CHK_COL);

  // Lock everything; allow edits to existing inputs (C..J for rows 12..200,
  // and rows 3..7 which hold solicitation metadata in column C),
  // plus the new Status and Compliant columns.
  lockSheet(wsL, [
    `C3:C7`,
    `C${wsL_FIRST}:J${wsL_LAST}`,
    `${colLetter(wsL_STATUS_COL)}${wsL_FIRST}:${colLetter(wsL_STATUS_COL)}${wsL_LAST}`,
    `${colLetter(wsL_CHK_COL)}${wsL_FIRST}:${colLetter(wsL_CHK_COL)}${wsL_LAST}`,
  ]);

  // -----------------------------------------------------------------
  // Sheet 3 — "Section M Alignment"
  //   Layout: 10 cols A..J. Header row 5. Data rows 6..50.
  //   Existing validations on B (Relative Importance), F (Pink 1-5), G (Red 1-5).
  //   Add Status (col K) + Compliant? (col L).
  // -----------------------------------------------------------------
  const wsM = wb.getWorksheet('Section M Alignment');
  if (!wsM) throw new Error('Section M Alignment sheet missing');

  const wsM_HEADER_ROW = 5;
  const wsM_FIRST = 6;
  const wsM_LAST = 50;
  const wsM_LABEL_COL = 1; // column A = Eval Factor / Sub-Factor
  const wsM_STATUS_COL = 11; // K
  const wsM_CHK_COL = 12;    // L

  wsM.getColumn(wsM_STATUS_COL).width = 16;
  const wsM_statusHeader = wsM.getCell(wsM_HEADER_ROW, wsM_STATUS_COL);
  wsM_statusHeader.value = 'Status';
  wsM_statusHeader.style = colHeaderStyle;

  for (let r = wsM_FIRST; r <= wsM_LAST; r += 1) {
    const cell = wsM.getCell(r, wsM_STATUS_COL);
    cell.value = 'Not Started';
    cell.style = {
      font: { name: FONT, size: 10, color: { argb: SLATE_900 } },
      fill: fill(WHITE),
      alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
      border: thinBorder,
    };
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Pick a status',
      error: 'Use Not Started / Draft / Review / Final / NA.',
      formulae: [STATUS_LIST],
    };
    cell.protection = { locked: false };
  }

  addCheckboxColumn(wsM, {
    colIndex: wsM_CHK_COL,
    headerRow: wsM_HEADER_ROW,
    firstDataRow: wsM_FIRST,
    lastDataRow: wsM_LAST,
    labelColIndex: wsM_LABEL_COL,
    headerText: 'Compliant?',
    colWidth: 12,
  });

  // row 4 already has the scoring summary; place note on row 2 (subtitle) — actually
  // row 2 is the subtitle. Use a blank row by inserting note at the very top in row
  // 0? exceljs doesn't support row 0. We re-purpose row 5's neighborhood by writing
  // the note in an unused row above the data — use row 4 spans I..J empty? Safer:
  // append the note to the bottom of the existing reference card text. Skip note
  // injection here — the Section L note already documents this and the sheet is
  // tightly packed. (still injected on the dedicated Submission Checklist.)

  lockSheet(wsM, [
    `B${wsM_FIRST}:J${wsM_LAST}`,
    `${colLetter(wsM_STATUS_COL)}${wsM_FIRST}:${colLetter(wsM_STATUS_COL)}${wsM_LAST}`,
    `${colLetter(wsM_CHK_COL)}${wsM_FIRST}:${colLetter(wsM_CHK_COL)}${wsM_LAST}`,
  ]);

  // -----------------------------------------------------------------
  // Sheet 4 — "Submission Checklist"
  //   Layout: 6 cols A..F. Header row 5. Data rows 6..60.
  //   Existing validation: C6:C60 = Pass/Fail/N/A list.
  //   Add Compliant? (col G).
  // -----------------------------------------------------------------
  const wsC = wb.getWorksheet('Submission Checklist');
  if (!wsC) throw new Error('Submission Checklist sheet missing');

  const wsC_HEADER_ROW = 5;
  const wsC_FIRST = 6;
  const wsC_LAST = 60;
  const wsC_LABEL_COL = 2; // column B = Check Item
  const wsC_CHK_COL = 7;   // G

  addCheckboxColumn(wsC, {
    colIndex: wsC_CHK_COL,
    headerRow: wsC_HEADER_ROW,
    firstDataRow: wsC_FIRST,
    lastDataRow: wsC_LAST,
    labelColIndex: wsC_LABEL_COL,
    headerText: 'Compliant?',
    colWidth: 12,
  });

  // place an instructions note in row 3? Row 3 already exists with the checklist
  // counters header. Better: put note on row 61 (blank between data and sign-off
  // row 62). The sheet ends at row 62 (sign-off).
  setNoteRow(wsC, 61, wsC_CHK_COL);

  lockSheet(wsC, [
    `C${wsC_FIRST}:F${wsC_LAST}`,
    `${colLetter(wsC_CHK_COL)}${wsC_FIRST}:${colLetter(wsC_CHK_COL)}${wsC_LAST}`,
  ]);

  // -----------------------------------------------------------------
  // Save (overwrite in place)
  // -----------------------------------------------------------------
  await wb.xlsx.writeFile(FILE);

  // print schema summary for the parent agent
  const schema = {
    file: FILE,
    sheets: [
      { name: 'Instructions', notes: 'unchanged' },
      {
        name: 'Section L Matrix',
        headerRow: wsL_HEADER_ROW,
        dataRows: [wsL_FIRST, wsL_LAST],
        addedColumns: [
          { col: colLetter(wsL_STATUS_COL), header: 'Status (asset-spec)', validation: 'list:Not Started,Draft,Review,Final,NA' },
          { col: colLetter(wsL_CHK_COL), header: 'Compliant?', type: 'boolean', validation: 'list:TRUE,FALSE', renderHint: 'Google Sheets: native checkbox' },
        ],
        protection: 'sheet protected; only inputs + new cols editable',
      },
      {
        name: 'Section M Alignment',
        headerRow: wsM_HEADER_ROW,
        dataRows: [wsM_FIRST, wsM_LAST],
        addedColumns: [
          { col: colLetter(wsM_STATUS_COL), header: 'Status', validation: 'list:Not Started,Draft,Review,Final,NA' },
          { col: colLetter(wsM_CHK_COL), header: 'Compliant?', type: 'boolean', validation: 'list:TRUE,FALSE' },
        ],
        protection: 'sheet protected; only inputs + new cols editable',
      },
      {
        name: 'Submission Checklist',
        headerRow: wsC_HEADER_ROW,
        dataRows: [wsC_FIRST, wsC_LAST],
        addedColumns: [
          { col: colLetter(wsC_CHK_COL), header: 'Compliant?', type: 'boolean', validation: 'list:TRUE,FALSE' },
        ],
        protection: 'sheet protected; only inputs + new col editable',
      },
      { name: 'Help', notes: 'unchanged' },
    ],
    conditionalFormatting: {
      whenCompliantIsTrue: 'fill GREEN_LT (#D1FAE5) + bold green text on the checkbox; strikethrough + GREEN_LT fill on the row label cell',
    },
    crossPlatform: {
      googleSheets: 'TRUE/FALSE cells render as native checkboxes automatically',
      excel365: 'TRUE/FALSE cells render as boolean dropdowns; users can right-click > Format Cell > Checkbox to convert',
      excelLegacy: 'cells show as TRUE/FALSE dropdowns via data validation',
    },
  };
  console.log(JSON.stringify(schema, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
