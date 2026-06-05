#!/usr/bin/env node
/**
 * Convert the Capture Maturity Self-Audit XLSX into a checkbox-driven workbook.
 *
 * Original layout (Self-Audit tab):
 *   Col B = Practice text
 *   Col C = Score (0-4)   <-- becomes boolean Done?
 *   Col D = Max (4)       <-- becomes 1 (one checkbox per practice)
 *   Col E = % (C/D)
 *   Col F = Tier label
 *   Col G = Priority hint
 *   Col H = Notes
 *
 * Behaviour we want:
 *   - Col C becomes a boolean cell (XLSX type "b")
 *   - List-style data validation with formulae ["TRUE","FALSE"] so users can
 *     toggle in Excel; Google Sheets auto-promotes these to native checkboxes
 *   - Conditional formatting: when TRUE, fill green (#d1fae5) and strike-through
 *     across the practice label (col B)
 *   - All cells locked EXCEPT col C (Done) and col H (Notes) — sheet.protect()
 *   - Instructions row added at the top of the Self-Audit sheet that explains
 *     how the boolean cells render in Excel vs Google Sheets
 *
 * Domain-total rows keep their SUM(C..:C..) formula — boolean TRUE coerces to 1,
 * FALSE to 0, so the existing math still produces a score (with new Max = 1
 * per practice, so % = checked / total).
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ExcelJS = require('/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs');
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET = path.resolve(
  __dirname,
  '../../../dashboard/public/starter-pack/FLK_09_Capture_Maturity_Self_Audit.xlsx'
);

const GREEN_FILL = 'FFD1FAE5';
const GREEN_FONT = 'FF065F46';

// Row numbers in sheet "Self-Audit" that hold a practice (checkable).
// Derived from the XML peek: scoreable rows have C=0 numeric and D=4 numeric.
// Domain header rows: 4, 12, 20, 28, 36, 44, 52
// Domain total rows:  11, 19, 27, 35, 43, 51, 57
// Everything else in [5..57] minus totals/headers is a practice.
const DOMAIN_HEADER_ROWS = new Set([4, 12, 20, 28, 36, 44, 52]);
const DOMAIN_TOTAL_ROWS = new Set([11, 19, 27, 35, 43, 51, 57]);
const SCORING_NOTE_ROW = 58;
const FIRST_PRACTICE_ROW = 5;
const LAST_PRACTICE_ROW = 57;

function isPracticeRow(r) {
  if (r < FIRST_PRACTICE_ROW || r > LAST_PRACTICE_ROW) return false;
  if (DOMAIN_HEADER_ROWS.has(r)) return false;
  if (DOMAIN_TOTAL_ROWS.has(r)) return false;
  return true;
}

async function main() {
  console.log('[capture-maturity] loading', TARGET);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TARGET);

  const sheet = wb.getWorksheet('Self-Audit');
  if (!sheet) throw new Error('Self-Audit sheet not found');

  // 1. Replace the existing instructions row (row 2) with checkbox guidance.
  //    The original "score 0..4" instruction no longer applies.
  const instructionRow = sheet.getRow(2);
  instructionRow.getCell('B').value =
    'Check the box in the Done column when a practice is in place and you can show evidence. ' +
    'Google Sheets renders these as native checkboxes. Excel 365: right-click > Format Cell > Checkbox to convert. ' +
    'Older Excel shows them as TRUE/FALSE dropdowns — same result. Each checkbox counts 1 point toward the domain total.';
  instructionRow.height = 48;
  instructionRow.getCell('B').alignment = { wrapText: true, vertical: 'middle' };

  // 2. Update the header row (row 3) — col C label changes Score(0-4) -> Done?, col D becomes Points.
  const headerRow = sheet.getRow(3);
  headerRow.getCell('C').value = 'Done?';
  headerRow.getCell('D').value = 'Pts';

  // 3. Walk every practice row, convert C to boolean FALSE, set D to 1 (each
  //    checked practice = 1 point), keep E/F/G formulas, leave H (Notes) editable.
  const practiceRows = [];
  for (let r = FIRST_PRACTICE_ROW; r <= LAST_PRACTICE_ROW; r++) {
    if (!isPracticeRow(r)) continue;
    practiceRows.push(r);

    const row = sheet.getRow(r);
    const cScore = row.getCell('C');
    const dMax = row.getCell('D');
    const eRatio = row.getCell('E');
    const fTier = row.getCell('F');
    const gPriority = row.getCell('G');

    // Boolean cell (TRUE/FALSE). exceljs writes type="b" when value is bool.
    cScore.value = false;
    cScore.dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"TRUE,FALSE"'],
      showErrorMessage: false,
    };
    cScore.alignment = { horizontal: 'center', vertical: 'middle' };

    // Each practice now worth 1 point (was 4).
    dMax.value = 1;
    dMax.alignment = { horizontal: 'center', vertical: 'middle' };

    // Per-practice % becomes the boolean coerced to 1/0.
    eRatio.value = { formula: `IFERROR(--C${r}/D${r},0)`, result: 0 };
    eRatio.numFmt = '0%';

    // Tier label adapts to boolean.
    fTier.value = {
      formula: `IF(C${r}=TRUE,"In place","Not yet")`,
      result: 'Not yet',
    };

    // Priority is FIX when not in place.
    gPriority.value = {
      formula: `IF(C${r}=TRUE,"","FIX")`,
      result: 'FIX',
    };

    // Conditional formatting: when C{r}=TRUE → green fill across the row
    //   and strike-through on the practice label in col B.
    sheet.addConditionalFormatting({
      ref: `B${r}:H${r}`,
      rules: [
        {
          type: 'expression',
          formulae: [`$C${r}=TRUE`],
          priority: 1,
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: GREEN_FILL },
              fgColor: { argb: GREEN_FILL },
            },
            font: { color: { argb: GREEN_FONT }, strike: true },
          },
        },
      ],
    });
  }

  // 4. Domain-total rows: SUM(C..:C..) still works (TRUE coerces to 1),
  //    but max formula needs the new D=1 per practice. We leave them — exceljs
  //    preserves the formula text — and recalc result lazily by clearing it.
  for (const tr of DOMAIN_TOTAL_ROWS) {
    const row = sheet.getRow(tr);
    // E (%) formula already computes C{tr}/D{tr}, which now equals checked/total.
    // Force exceljs to recompute by clearing the cached result.
    const e = row.getCell('E');
    if (e.value && typeof e.value === 'object' && 'formula' in e.value) {
      delete e.value.result;
    }
    const c = row.getCell('C');
    if (c.value && typeof c.value === 'object' && 'formula' in c.value) {
      delete c.value.result;
    }
    const d = row.getCell('D');
    if (d.value && typeof d.value === 'object' && 'formula' in d.value) {
      delete d.value.result;
    }
  }

  // 5. Lock everything except the Done column (C) and Notes (H) on practice rows.
  //    First mark every cell as locked, then unlock the editable ones.
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.protection = { locked: true };
    });
  });
  for (const r of practiceRows) {
    sheet.getCell(`C${r}`).protection = { locked: false };
    sheet.getCell(`H${r}`).protection = { locked: false };
  }

  // 6. Drop sheet protection with a known-empty password so toggling works
  //    without prompting (Excel still respects the lock flags).
  await sheet.protect('', {
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

  // 7. Save in place.
  await wb.xlsx.writeFile(TARGET);

  console.log('[capture-maturity] wrote', practiceRows.length, 'checkbox rows');
  console.log('[capture-maturity] saved', TARGET);
}

main().catch((err) => {
  console.error('[capture-maturity] FAILED', err);
  process.exit(1);
});
