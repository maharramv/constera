import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import readXlsxFile from "read-excel-file/node";
import {
  firstWorksheetMatrix,
  matrixToObjects,
  normalizeXlsxForImport,
  readAliased
} from "../../api/_lib/imports.js";

test("matrixToObjects başlıqdan əvvəlki titul sətrini ötürür", () => {
  const rows = matrixToObjects([
    ["Məhsul siyahısı"],
    ["SKU", "Ad", "Qiymət"],
    ["SKU-1", "Sement", 12.5]
  ]);

  assert.equal(rows.length, 1);
  assert.equal(readAliased(rows[0], "sku"), "SKU-1");
  assert.equal(readAliased(rows[0], "name"), "Sement");
  assert.equal(readAliased(rows[0], "price"), 12.5);
});

test("ConstEra XLSX idxal paketi server parseri ilə 40 məhsul qaytarır", async () => {
  const source = readFileSync("docs/imports/ConstEra_TVIM_40_import_az.xlsx");
  const normalized = normalizeXlsxForImport(source);
  const workbook = await readXlsxFile(normalized, { sheets: [1] });
  const rows = matrixToObjects(firstWorksheetMatrix(workbook));

  assert.equal(rows.length, 40);
  assert.equal(readAliased(rows[0], "sku"), "TVIM-20260718-001");
  assert.equal(readAliased(rows[0], "category"), "İzolyasiya");
  assert.equal(readAliased(rows.at(-1), "sku"), "TVIM-20260718-040");
  assert.equal(rows.filter((row) => !readAliased(row, "imageUrl")).length, 3);
});
