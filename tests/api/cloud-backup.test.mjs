import test from "node:test";
import assert from "node:assert/strict";
import { validateBackupRestoreRoundTrip } from "../../api/_lib/cloud-backup.js";

const validBackup = () => ({
  version: "constera-cloud-backup-v13",
  backupId: "constera-test",
  exportedAt: "2026-08-03T00:00:00.000Z",
  source: "ConstEra PostgreSQL",
  schemaMigrations: 29,
  data: {
    companies: [{ id: "cmp-1" }],
    users: [{ id: "usr-1", company_id: "cmp-1" }],
    categories: [
      { id: "material-paints", parent_id: null },
      { id: "material-interior-paints", parent_id: "material-paints" }
    ],
    suppliers: [{ id: "sup-1", company_id: "cmp-1" }],
    products: [{ id: "prd-1", category_id: "material-interior-paints", supplier_id: "sup-1" }],
    productOffers: [{ id: "pof-1", product_id: "prd-1", supplier_id: "sup-1" }],
    priceHistory: [{ id: "prh-1", product_id: "prd-1" }]
  }
});

test("backup gzip round-trip və əsas əlaqələri bərpa məşqindən keçirir", () => {
  const result = validateBackupRestoreRoundTrip(validBackup());
  assert.equal(result.ready, true);
  assert.equal(result.restoredCollections, 7);
  assert.equal(result.restoredRecords, 8);
  assert.equal(result.orphanReferences, 0);
  assert.equal(result.duplicateIds, 0);
  assert.ok(result.compressedBytes > 0);
});

test("backup bərpa məşqi təkrarlanan ID və əlaqəsiz istinadı bloklayır", () => {
  const backup = validBackup();
  backup.data.products.push({ id: "prd-1", category_id: "material-missing", supplier_id: "sup-1" });
  const result = validateBackupRestoreRoundTrip(backup);
  assert.equal(result.ready, false);
  assert.equal(result.duplicateIds, 1);
  assert.equal(result.orphanReferences, 1);
  assert.match(result.errors.join(" "), /təkrarlanan ID/);
  assert.match(result.errors.join(" "), /əlaqəsiz istinad/);
});
