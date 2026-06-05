// SAM.gov Pre-Reg Checklist — checkbox patch
// Loads the existing FLK_01_SAM_PreReg_Checklist.xlsx and converts the
// "My Status" column on the Checklist sheet to boolean (TRUE/FALSE) cells.
// - Boolean cells render as native checkboxes in Google Sheets.
// - In Excel 365 they render as TRUE/FALSE dropdowns (right-click > Format
//   Cell > Checkbox to convert to checkbox in newer Excel builds).
// - Adds conditional formatting: green fill + strikethrough on label when TRUE.
// - Locks every other cell so users can only toggle the Done column.
// - Overwrites the original file in place.
//
// Run: node /Users/andreschuler/Caturepilot 2.0/assets/starter-pack/rebuilt/sam-prereg-checklist.checkbox.mjs

import ExcelJS from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/FLK_01_SAM_PreReg_Checklist.xlsx';

const C = {
  doneFill:     'FFD1FAE5', // emerald-100
  doneText:     'FF065F46', // emerald-800
  noteBg:       'FFFEF3C7', // amber-100
  noteBorder:   'FFF59E0B', // amber-500
  ink:          'FF111827',
};

// Range of checklist data rows on the Checklist sheet.
const FIRST_ROW = 6;
const LAST_ROW  = 46; // sheet has rows 6..46 (section bands interspersed)
const STATUS_COL = 'E'; // "My Status" column
const LABEL_COL  = 'B'; // "Item to Gather" column (for strikethrough effect)

// Rows that are actual checklist items (NOT section banner rows).
// Section bands live on rows: 6, 14, 19, 23, 28, 33, 38, 43 — those merge A:F.
const SECTION_ROWS = new Set([6, 14, 19, 23, 28, 33, 38, 43]);

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  const checklist = wb.getWorksheet('Checklist');
  const dashboard = wb.getWorksheet('Dashboard');
  if (!checklist) throw new Error('Checklist sheet missing');
  if (!dashboard) throw new Error('Dashboard sheet missing');

  // ----------------------------------------------------------------
  // 1. Convert "My Status" column to boolean cells with dropdown.
  // ----------------------------------------------------------------
  const itemRows = [];
  for (let r = FIRST_ROW; r <= LAST_ROW; r++) {
    if (SECTION_ROWS.has(r)) continue;
    const labelCell = checklist.getCell(`${LABEL_COL}${r}`);
    if (!labelCell || labelCell.value == null || labelCell.value === '') continue;
    itemRows.push(r);

    const statusCell = checklist.getCell(`${STATUS_COL}${r}`);
    // Set cell to FALSE boolean. ExcelJS will emit type="b" with <v>0</v>.
    statusCell.value = false;
    statusCell.dataValidation = {
      type: 'list',
      allowBlank: false,
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Pick TRUE or FALSE',
      error: 'This cell is a checkbox — set to TRUE when done.',
      formulae: ['"TRUE,FALSE"'],
    };
    statusCell.alignment = { vertical: 'middle', horizontal: 'center' };
    statusCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.ink } };
    statusCell.protection = { locked: false, hidden: false };
  }

  // ----------------------------------------------------------------
  // 2. Strip any leftover "Done,Need to get,N/A" validation from
  //    section banner cells (E6, E14, E19, E23, E28, E33, E38, E43).
  //    Those cells live inside merged A:F bands and should have no DV at all.
  // ----------------------------------------------------------------
  if (checklist.dataValidations && checklist.dataValidations.model) {
    const model = checklist.dataValidations.model;
    for (const key of Object.keys(model)) {
      const dv = model[key];
      if (!dv || !dv.formulae || !dv.formulae[0]) continue;
      if (/Done,Need to get,N\/A/.test(dv.formulae[0])) {
        delete model[key];
      }
    }
  }
  // Belt-and-suspenders: clear per-cell DV on the section rows themselves.
  for (const r of SECTION_ROWS) {
    const c = checklist.getCell(`${STATUS_COL}${r}`);
    if (c) c.dataValidation = null;
  }

  // ----------------------------------------------------------------
  // 3. Conditional formatting on E column: TRUE -> green fill.
  // ----------------------------------------------------------------
  checklist.addConditionalFormatting({
    ref: `${STATUS_COL}${FIRST_ROW}:${STATUS_COL}${LAST_ROW}`,
    rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        priority: 1,
        formulae: ['TRUE'],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.doneFill } },
          font: { color: { argb: C.doneText }, bold: true },
        },
      },
    ],
  });

  // ----------------------------------------------------------------
  // 4. Conditional formatting on Item label (col B) + Notes (col C):
  //    when sibling E is TRUE, apply strikethrough + muted color.
  // ----------------------------------------------------------------
  checklist.addConditionalFormatting({
    ref: `B${FIRST_ROW}:C${LAST_ROW}`,
    rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: [`$${STATUS_COL}${FIRST_ROW}=TRUE`],
        style: {
          font: {
            strike: true,
            color: { argb: 'FF6B7280' },
          },
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.doneFill } },
        },
      },
    ],
  });

  // ----------------------------------------------------------------
  // 5. Update Dashboard formulas: count TRUE booleans instead of "Done" strings.
  //    Old: COUNTIF(Checklist!E6:E45,"Done")  ->  COUNTIF(Checklist!E6:E45,TRUE)
  //    Old: COUNTIF(Checklist!E6:E45,"Need to get") -> drop count (no equivalent
  //         since boolean has no third state) — replaced with FALSE count.
  // ----------------------------------------------------------------
  rewriteDashboardFormulas(dashboard);

  // ----------------------------------------------------------------
  // 6. Add Instructions note at the top of the Checklist tab.
  //    Inject a new row of guidance between row 3 (existing tagline) and row 5
  //    (column headers). Actually rows 4 is blank — write into row 4 cell A4.
  // ----------------------------------------------------------------
  // Row 4 in the Checklist sheet currently has no content; safe to merge + write.
  try {
    checklist.unMergeCells('A4:F4');
  } catch { /* not merged — ignore */ }
  checklist.mergeCells('A4:F4');
  const noteCell = checklist.getCell('A4');
  noteCell.value =
    'Done column = checkbox. Google Sheets renders as a native checkbox. ' +
    'Excel 365: shows TRUE/FALSE — right-click > Format Cell > Checkbox to convert. ' +
    'Older Excel: pick TRUE or FALSE from the dropdown.';
  noteCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF92400E' } };
  noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.noteBg } };
  noteCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
  noteCell.border = {
    top:    { style: 'thin', color: { argb: C.noteBorder } },
    bottom: { style: 'thin', color: { argb: C.noteBorder } },
    left:   { style: 'thin', color: { argb: C.noteBorder } },
    right:  { style: 'thin', color: { argb: C.noteBorder } },
  };
  checklist.getRow(4).height = 32;

  // ----------------------------------------------------------------
  // 7. Lock every cell EXCEPT the Done column on the Checklist sheet.
  //    Default: workbook cells are locked when protection is enabled.
  //    We've already set locked: false on every E cell above.
  // ----------------------------------------------------------------
  // Defensive: explicitly mark every other cell in the data range as locked.
  for (let r = 1; r <= 50; r++) {
    for (const col of ['A','B','C','D','E','F']) {
      const cell = checklist.getCell(`${col}${r}`);
      if (col === STATUS_COL && itemRows.includes(r)) continue; // already unlocked
      // Don't crash on merged cells — protection just gets ignored.
      try {
        cell.protection = { ...(cell.protection || {}), locked: true };
      } catch { /* ignore */ }
    }
  }

  await checklist.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  });

  await wb.xlsx.writeFile(FILE);
  console.log(`Wrote ${FILE}`);
  console.log(`Checkbox cells: ${STATUS_COL}${FIRST_ROW}..${STATUS_COL}${LAST_ROW} (${itemRows.length} item rows)`);
}

function rewriteDashboardFormulas(dash) {
  // Walk every cell on Dashboard; rewrite any formula that references
  // the old string state "Done" / "Need to get" on the Checklist E column.
  dash.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const f = cell.formula || (cell.value && cell.value.formula);
      if (!f) return;
      const orig = f;
      let next = f
        // COUNTIF(Checklist!E?:E?,"Done") -> COUNTIF(...,TRUE)
        .replace(/COUNTIF\(\s*Checklist!E(\d+):E(\d+)\s*,\s*"Done"\s*\)/g,
                 'COUNTIF(Checklist!E$1:E$2,TRUE)')
        // COUNTIF(...,"Need to get") -> COUNTIF(...,FALSE)
        .replace(/COUNTIF\(\s*Checklist!E(\d+):E(\d+)\s*,\s*"Need to get"\s*\)/g,
                 'COUNTIF(Checklist!E$1:E$2,FALSE)')
        // COUNTIF(...,"N/A") -> always 0 now (boolean has no third state)
        .replace(/COUNTIF\(\s*Checklist!E(\d+):E(\d+)\s*,\s*"N\/A"\s*\)/g, '0')
        // COUNTIFS(Checklist!D?:D?,"Required",Checklist!E?:E?,"Done") -> swap "Done" -> TRUE
        .replace(/COUNTIFS\(\s*Checklist!D(\d+):D(\d+)\s*,\s*"Required"\s*,\s*Checklist!E(\d+):E(\d+)\s*,\s*"Done"\s*\)/g,
                 'COUNTIFS(Checklist!D$1:D$2,"Required",Checklist!E$3:E$4,TRUE)');

      if (next !== orig) {
        // Use object-form value so ExcelJS rewrites the formula.
        cell.value = { formula: next, result: undefined };
      }
    });
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
