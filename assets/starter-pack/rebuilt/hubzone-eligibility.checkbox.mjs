// HUBZone Eligibility Worksheet — checkbox upgrade
// Loads FLK_05_HUBZone_Eligibility_Worksheet.xlsx, converts the
// "Met? (Y/N/?)" column on the Eligibility Checklist sheet into
// boolean TRUE/FALSE cells with list validation, conditional
// formatting (green fill + strikethrough on row label when TRUE),
// and worksheet protection that only allows toggling the Done column.
//
// Output: overwrites the original XLSX in dashboard/public/starter-pack.

import ExcelJS from '/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js';

const XLSX_PATH =
  '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/FLK_05_HUBZone_Eligibility_Worksheet.xlsx';

const GREEN_FILL = 'FFD1FAE5';
const SLATE_500 = 'FF64748B';

// The Eligibility Checklist has criterion rows interspersed with
// section header rows. These are the rows where column D ("Met?")
// should become a boolean checkbox.
const CHECKBOX_ROWS = [
  5, 6, 7,        // BUSINESS TYPE & OWNERSHIP
  9, 10, 11, 12,  // PRINCIPAL OFFICE LOCATION
  14, 15, 16, 17, // EMPLOYEE RESIDENCY — 35% RULE
  19, 20, 21,     // EMPLOYEE COUNT & DEFINITION
  23, 24, 25, 26, // CERTIFICATION & MAINTENANCE
  28, 29, 30,     // SPECIAL CASES — HUBZONE TYPES
];

const INSTRUCTIONS_TEXT =
  'How to check items: Google Sheets renders these cells as native checkboxes. ' +
  'Excel 365 shows boolean dropdowns; right-click a Done cell and choose ' +
  'Format Cell > Checkbox to convert. Older Excel versions display TRUE/FALSE ' +
  'dropdowns. Toggling to TRUE turns the row green and strikes through the criterion.';

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);

  const ws = wb.getWorksheet('Eligibility Checklist');
  if (!ws) throw new Error('Eligibility Checklist sheet not found');

  // ---- 1. Insert an Instructions banner at the top of the sheet ----
  // Row 2 is currently empty; we'll write the instructions there inside
  // the merged A2:F2 area without disturbing existing rows or formulas.
  // Merge defensively (skip if already merged so the script is idempotent).
  try {
    ws.mergeCells('A2:F2');
  } catch (err) {
    if (!/already merged/i.test(String(err && err.message))) throw err;
  }
  const banner = ws.getCell('A2');
  banner.value = INSTRUCTIONS_TEXT;
  banner.font = {
    name: 'Calibri',
    size: 10,
    italic: true,
    color: { argb: SLATE_500 },
  };
  banner.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  banner.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' },
  };
  ws.getRow(2).height = 42;

  // ---- 2. Convert each criterion's Done cell to boolean + add validation ----
  for (const r of CHECKBOX_ROWS) {
    const doneCell = ws.getCell(`D${r}`);

    // Remove any pre-existing formula (some rows had formulas that
    // mirrored Inputs values — incompatible with a true boolean).
    doneCell.value = false;

    // Force the cell type to "b" so Excel + Sheets read it as boolean.
    // ExcelJS infers boolean from JS `true`/`false`, which serializes
    // as `<c t="b"><v>0</v></c>` in sheet XML.
    doneCell.dataValidation = {
      type: 'list',
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Pick one',
      error: 'TRUE or FALSE only.',
      formulae: ['"TRUE,FALSE"'],
    };

    doneCell.alignment = { horizontal: 'center', vertical: 'middle' };
    doneCell.protection = { locked: false };
    doneCell.font = { name: 'Calibri', size: 11, bold: true };
  }

  // ---- 3. Conditional formatting on the Done cells (green when TRUE) ----
  // Excel's `cellIs` rule with operator `equal` to TRUE() turns the cell
  // green; Google Sheets honors the same rule on import.
  ws.addConditionalFormatting({
    ref: CHECKBOX_ROWS.map((r) => `D${r}`).join(' '),
    rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        priority: 1,
        formulae: ['TRUE'],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: GREEN_FILL },
          },
          font: { color: { argb: 'FF047857' }, bold: true },
        },
      },
    ],
  });

  // Strike through the criterion text in column C when the matching D
  // cell is TRUE. Uses a formula-type rule per row so the relative
  // reference resolves correctly in both Excel and Sheets.
  for (const r of CHECKBOX_ROWS) {
    ws.addConditionalFormatting({
      ref: `C${r}`,
      rules: [
        {
          type: 'expression',
          formulae: [`$D$${r}=TRUE`],
          priority: 2,
          style: {
            font: {
              strike: true,
              color: { argb: SLATE_500 },
            },
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: GREEN_FILL },
            },
          },
        },
      ],
    });
  }

  // ---- 4. Lock the entire sheet, keep only the Done column editable ----
  // Walk every used cell and mark it locked. The Done cells were
  // already set to `locked: false` above, so they stay editable.
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const isDoneCell = CHECKBOX_ROWS.includes(Number(cell.row)) && cell.col === 4;
      if (!isDoneCell) {
        cell.protection = { ...(cell.protection || {}), locked: true };
      }
    });
  });

  await ws.protect('', {
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

  // ---- 5. Overwrite the original file ----
  await wb.xlsx.writeFile(XLSX_PATH);

  console.log(`Updated ${XLSX_PATH}`);
  console.log(`Converted ${CHECKBOX_ROWS.length} criterion cells to boolean checkboxes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
