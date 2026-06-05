#!/usr/bin/env node
/**
 * Convert the 8(a) Self-Assessment XLSX to use real boolean checkboxes
 * in the "MET?" column so it renders as a native checkbox in Google Sheets
 * and a boolean dropdown in Excel.
 *
 * - Column C on the "Inputs" tab: was "Y/N/?" text, now TRUE/FALSE boolean
 * - Data validation type=list, formulae=["TRUE","FALSE"]
 * - Conditional format: green fill + strikethrough on row label (col B) when checked
 * - Sheet protected; only the Done column + notes col + the top business-info cells are unlocked
 * - Summary counter at the top counts checked / total
 * - Instructions row added at the very top explaining the dual Excel/Sheets behavior
 *
 * Overwrites the file in place.
 */

import ExcelJS from "/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs/excel.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TARGET = path.resolve(
  __dirname,
  "../../../dashboard/public/starter-pack/FLK_05_8a_Certification_Self_Assessment.xlsx",
);

const INPUT_ROWS_START = 12; // row 12-42 hold the 25 criteria (plus 6 section header rows)
const INPUT_ROWS_END = 42;
const DONE_COL = "C";
const LABEL_COL = "B";
const NOTES_COL = "E";

async function main() {
  console.log(`Loading: ${TARGET}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TARGET);

  const sheet = wb.getWorksheet("Inputs");
  if (!sheet) throw new Error("No 'Inputs' sheet found");

  // ---------- 1. Convert every existing C12:C42 value to boolean FALSE ----------
  // (some rows are section-header rows merged across A:E and have no real value;
  //  we only touch rows that already had a Y/N/? validation. We can detect those
  //  by the fact that their column C cell was a sharedString cell, not a merged label.)
  const criteriaRows = [];
  for (let r = INPUT_ROWS_START; r <= INPUT_ROWS_END; r++) {
    const row = sheet.getRow(r);
    const aCell = row.getCell("A");
    const aVal = aCell.value;
    // Section header rows have a string in A (e.g. "SMALL BUSINESS STATUS") and
    // are merged A:E. Criteria rows have a number in A (1..25).
    const isCriteria = typeof aVal === "number";
    if (!isCriteria) continue;
    criteriaRows.push(r);

    const cCell = row.getCell(DONE_COL);
    cCell.value = false; // boolean — exceljs writes <c t="b"><v>0</v></c>
    cCell.dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"TRUE,FALSE"'],
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "Pick one",
      error: "Check the box to mark this criterion as met.",
    };
    cCell.alignment = { horizontal: "center", vertical: "middle" };
    cCell.protection = { locked: false }; // user CAN edit the checkbox
    // Notes column unlock
    const eCell = row.getCell(NOTES_COL);
    eCell.protection = { locked: false };
  }

  console.log(`Patched ${criteriaRows.length} criteria rows`);

  // ---------- 2. Remove the legacy Y/N/? data validations on column C ----------
  // ExcelJS rewrites validations from the per-cell objects we just set, so the
  // workbook-level definitions in the XML are dropped automatically.

  // ---------- 3. Conditional formatting: TRUE → green fill + strikethrough on B+C ----------
  // Apply to the union of all criteria rows (B and C columns).
  const trueRanges = criteriaRows.map((r) => `B${r}:C${r}`);
  for (const range of trueRanges) {
    sheet.addConditionalFormatting({
      ref: range,
      rules: [
        {
          type: "expression",
          formulae: [`$C${range.split(":")[0].replace(/[A-Z]/g, "")}=TRUE`],
          style: {
            fill: {
              type: "pattern",
              pattern: "solid",
              bgColor: { argb: "FFD1FAE5" },
              fgColor: { argb: "FFD1FAE5" },
            },
            font: {
              strike: true,
              color: { argb: "FF065F46" },
            },
          },
          priority: 1,
        },
      ],
    });
  }

  // ---------- 4. Summary counter row at the very top ----------
  // Re-purpose row 3 (currently blank between the title and the business-info block)
  // to show "Checked: X / Y" using COUNTIF.
  const counterRow = sheet.getRow(3);
  counterRow.height = 22;
  const countFormula = `COUNTIF(${DONE_COL}${INPUT_ROWS_START}:${DONE_COL}${INPUT_ROWS_END},TRUE)`;
  const totalFormula = String(criteriaRows.length);
  const counterCell = counterRow.getCell("B");
  counterCell.value = {
    formula: `"Checked: "&${countFormula}&" of ${totalFormula}  ·  Tip: Google Sheets shows these as checkboxes; Excel shows TRUE/FALSE dropdowns (right-click → Format Cell → Checkbox in Excel 365)."`,
    result: `Checked: 0 of ${totalFormula}  ·  Tip: Google Sheets shows these as checkboxes; Excel shows TRUE/FALSE dropdowns (right-click → Format Cell → Checkbox in Excel 365).`,
  };
  counterCell.font = { italic: true, size: 10, color: { argb: "FF374151" } };
  counterCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  // Merge B3:E3 only if not already merged (script must be idempotent)
  try {
    sheet.mergeCells("B3:E3");
  } catch (err) {
    if (!/already merged/i.test(String(err?.message))) throw err;
  }

  // ---------- 5. Unlock the top business-info cells so users can still fill them in ----------
  for (const r of [4, 5, 6, 7, 8]) {
    const cell = sheet.getRow(r).getCell("C");
    cell.protection = { locked: false };
  }

  // ---------- 6. Protect the sheet (must come AFTER per-cell .protection assignments) ----------
  await sheet.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertRows: false,
    insertColumns: false,
    insertHyperlinks: false,
    deleteRows: false,
    deleteColumns: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  });

  // ---------- 7. Update the MET? column header to reflect new semantics ----------
  const headerRow = sheet.getRow(10);
  headerRow.getCell("C").value = "DONE?";

  // ---------- 8. Save (overwrite in place) ----------
  await wb.xlsx.writeFile(TARGET);
  console.log(`Wrote: ${TARGET}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
