// Convert FLK_05_WOSB_EDWOSB_Self_Cert.xlsx checklist cells to true boolean checkboxes.
// Works in Google Sheets (renders as native checkboxes) and Excel 365 (boolean dropdown -> convert to checkbox).
//
// Sheets touched:
//   - "WOSB Eligibility": D5:D31 (24 Y/N/? cells) -> boolean TRUE/FALSE + green fill on TRUE
//   - "Document Checklist": F5:F32 (23 Have/Need/N/A cells) -> boolean TRUE/FALSE + green fill on TRUE
//   - "Instructions": prepend a "How checkboxes work" note row
// Recomputes the COUNTIF formulas to count TRUE/FALSE booleans.
// Locks every cell on the touched sheets EXCEPT the checkbox columns so users can only toggle.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ExcelJS = require('/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs');

const FILE = '/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/FLK_05_WOSB_EDWOSB_Self_Cert.xlsx';

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);

const CHECKBOX_GREEN = 'FFD1FAE5'; // ARGB for #d1fae5
const HEADER_NOTE =
  'CHECKBOXES — Google Sheets: cells render as native checkboxes. Excel 365: cells render as boolean dropdowns; right-click > Format Cell > Checkbox to convert. Older Excel: cells show as TRUE/FALSE dropdowns.';

// ---------- helpers ----------

function setBooleanCell(cell, value = false) {
  cell.value = value;
  cell.dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: ['"TRUE,FALSE"'],
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Pick TRUE or FALSE',
    error: 'Use the dropdown to toggle this checkbox.',
  };
  cell.protection = { locked: false };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.font = { name: 'Helvetica', size: 11, bold: true };
}

function addCheckboxConditionalFormat(sheet, range) {
  // Green fill when TRUE
  const existing = sheet.conditionalFormattings ?? [];
  existing.push({
    ref: range,
    rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: [`${range.split(':')[0]}=TRUE`],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: CHECKBOX_GREEN }, fgColor: { argb: CHECKBOX_GREEN } },
          font: { bold: true, color: { argb: 'FF065F46' } },
        },
      },
    ],
  });
  sheet.conditionalFormattings = existing;
}

function addRowLabelStrikethroughCF(sheet, labelCol, booleanCol, firstRow, lastRow) {
  // Strikethrough + muted label when corresponding boolean cell is TRUE
  const labelRange = `${labelCol}${firstRow}:${labelCol}${lastRow}`;
  const existing = sheet.conditionalFormattings ?? [];
  existing.push({
    ref: labelRange,
    rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: [`$${booleanCol}${firstRow}=TRUE`],
        style: {
          font: { strike: true, color: { argb: 'FF6B7280' }, italic: true },
        },
      },
    ],
  });
  sheet.conditionalFormattings = existing;
}

function lockAllExcept(sheet, unlockedRanges) {
  // Mark every existing cell as locked, then unlock specific ranges.
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      const prev = cell.protection ?? {};
      cell.protection = { ...prev, locked: true };
    });
  });
  for (const range of unlockedRanges) {
    const [start, end] = range.split(':');
    const startMatch = start.match(/^([A-Z]+)(\d+)$/);
    const endMatch = end.match(/^([A-Z]+)(\d+)$/);
    if (!startMatch || !endMatch) continue;
    const col = startMatch[1];
    const startRow = parseInt(startMatch[2], 10);
    const endRow = parseInt(endMatch[2], 10);
    for (let r = startRow; r <= endRow; r++) {
      const cell = sheet.getCell(`${col}${r}`);
      const prev = cell.protection ?? {};
      cell.protection = { ...prev, locked: false };
    }
  }
}

function clearDataValidations(sheet, ranges) {
  // Remove any inherited Y/N/? list validations on the boolean ranges.
  const dv = sheet.dataValidations;
  if (!dv || !dv.model) return;
  for (const ref of Object.keys(dv.model)) {
    for (const target of ranges) {
      if (ref === target || ref.includes(target.split(':')[0])) {
        delete dv.model[ref];
      }
    }
  }
}

// ---------- 1. Instructions sheet: prepend checkbox guidance ----------

const instructions = wb.getWorksheet('Instructions');
if (instructions) {
  // Insert a callout row between the existing title (row 1) and subtitle (row 2)
  instructions.spliceRows(2, 0, [HEADER_NOTE]);
  const noteRow = instructions.getRow(2);
  noteRow.height = 48;
  const noteCell = instructions.getCell('A2');
  noteCell.value = HEADER_NOTE;
  noteCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };
  noteCell.font = { name: 'Helvetica', size: 11, bold: true, color: { argb: 'FF065F46' } };
  noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CHECKBOX_GREEN } };
  // Merge across the same span the existing rows use (A:F)
  try {
    instructions.mergeCells('A2:F2');
  } catch {
    // already merged elsewhere — ignore
  }
}

// ---------- 2. WOSB Eligibility — convert D5:D31 to booleans ----------

const wosb = wb.getWorksheet('WOSB Eligibility');
if (wosb) {
  clearDataValidations(wosb, ['D5:D13', 'D15:D20', 'D22:D26', 'D28:D31', 'D5:D31']);

  // Update column header (D3) so users understand it's a checkbox now
  const headerCell = wosb.getCell('D3');
  headerCell.value = 'DONE';
  headerCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const rows = [5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28, 29, 30, 31];
  for (const r of rows) {
    setBooleanCell(wosb.getCell(`D${r}`), false);
  }

  // Conditional formatting: green checkmark style on TRUE
  addCheckboxConditionalFormat(wosb, 'D5:D31');
  // Strikethrough the criteria label (column C) when the checkbox is TRUE
  addRowLabelStrikethroughCF(wosb, 'C', 'D', 5, 31);

  // Recompute the count formulas to count TRUE booleans (was COUNTIF("Y"))
  wosb.getCell('D33').value = { formula: 'COUNTIF(D5:D13,TRUE)&" of 9"', result: '' };
  wosb.getCell('D34').value = { formula: 'COUNTIF(D15:D20,TRUE)&" of 6"', result: '' };
  wosb.getCell('D35').value = { formula: 'COUNTIF(D22:D26,TRUE)&" of 5"', result: '' };
  wosb.getCell('D36').value = { formula: 'COUNTIF(D28:D31,TRUE)&" of 4"', result: '' };
  wosb.getCell('D37').value = {
    formula: 'COUNTIF(D5:D31,TRUE)&" of 24 met, "&COUNTIF(D5:D31,FALSE)&" open"',
    result: '',
  };
  wosb.getCell('D39').value = {
    formula:
      'IF(COUNTIF(D5:D13,TRUE)=9,IF(COUNTIF(D15:D20,TRUE)>=5,"LIKELY ELIGIBLE — Self-certify on SAM.gov","REVIEW CONTROL TESTS — 5+ of 6 should be checked before certifying"),"GAPS IN CORE REQUIREMENTS — Do not self-certify yet")',
    result: '',
  };
  wosb.getCell('D40').value = {
    formula:
      'IF(COUNTIF(D22:D26,TRUE)=5,IF(COUNTIF(D5:D13,TRUE)=9,"LIKELY ELIGIBLE for EDWOSB","Confirm WOSB core first"),"EDWOSB GAPS — Check Net Worth tab for exact numbers")',
    result: '',
  };

  // Notes column F stays user-editable; everything else is locked.
  lockAllExcept(wosb, ['D5:D31', 'F5:F31']);
  wosb.protect('', {
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
}

// ---------- 3. Document Checklist — convert F5:F32 to booleans ----------

const docs = wb.getWorksheet('Document Checklist');
if (docs) {
  clearDataValidations(docs, ['F5:F9', 'F11:F13', 'F15:F19', 'F21:F24', 'F26:F29', 'F31:F32', 'F5:F32']);

  const headerCell = docs.getCell('F3');
  headerCell.value = 'DONE';
  headerCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const rows = [
    5, 6, 7, 8, 9,
    11, 12, 13,
    15, 16, 17, 18, 19,
    21, 22, 23, 24,
    26, 27, 28, 29,
    31, 32,
  ];
  for (const r of rows) {
    setBooleanCell(docs.getCell(`F${r}`), false);
  }

  addCheckboxConditionalFormat(docs, 'F5:F32');
  addRowLabelStrikethroughCF(docs, 'C', 'F', 5, 32);

  // Recompute the count formulas to count TRUE booleans (was COUNTIF("Have"))
  docs.getCell('F34').value = { formula: 'COUNTIF(F5:F32,TRUE)&" of 23"', result: '' };
  docs.getCell('F35').value = { formula: 'COUNTIF(F5:F32,FALSE)&" missing"', result: '' };
  docs.getCell('F36').value = { formula: 'ROUND(COUNTIF(F5:F32,TRUE)/23*100,0)&"%"', result: '' };

  // Notes column G stays user-editable.
  lockAllExcept(docs, ['F5:F32', 'G5:G32']);
  docs.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
  });
}

// ---------- 4. Save ----------

await wb.xlsx.writeFile(FILE);
console.log('OK — wrote', FILE);
