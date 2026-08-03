import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("Merchant feed yalnız təsdiqli qiymət, stok, mənbə və hüquqlu media ilə işləyir", () => {
  const handler = read("api/_admin/merchant-feed.js");
  const gateway = read("api/admin.js");
  const vercel = read("vercel.json");
  const analytics = read("api/_admin/analytics.js");
  const productClient = read("assets/js/marketplace.js");

  assert.match(handler, /price_status = 'confirmed'/);
  assert.match(handler, /price_verified_at >= now\(\) - interval '30 days'/);
  assert.match(handler, /stock_quantity IS NOT NULL/);
  assert.match(handler, /license_type IN \('own', 'supplier', 'official', 'licensed'\)/);
  assert.match(handler, /rights_status = 'verified'/);
  assert.match(handler, /contract\.legal_confirmed = true/);
  assert.match(gateway, /"merchant-feed"/);
  assert.match(vercel, /\/api\/merchant-feed/);
  assert.match(analytics, /commission_revenue/);
  assert.match(analytics, /licensed_media/);
  assert.match(productClient, /BreadcrumbList/);
  assert.match(productClient, /itemCondition/);
});

test("mobil kataloq kamera barkodu, GTIN axtarışı və oflayn PWA statusu verir", () => {
  const catalog = read("catalog.html");
  const marketplace = read("assets/js/marketplace.js");
  const script = read("assets/js/script.js");
  const worker = read("service-worker.js");
  const vercel = JSON.parse(read("vercel.json"));
  const permissions = vercel.headers
    .flatMap((entry) => entry.headers || [])
    .find((header) => header.key === "Permissions-Policy")?.value;

  assert.match(catalog, /data-catalog-scanner-open/);
  assert.match(catalog, /data-catalog-scanner-video/);
  assert.match(marketplace, /BarcodeDetector/);
  assert.match(marketplace, /camera_barcode/);
  assert.match(marketplace, /product\.barcode/);
  assert.match(script, /beforeinstallprompt/);
  assert.match(script, /Oflayn rejim/);
  assert.match(worker, /"\/catalog\.html"/);
  assert.match(worker, /"\/assets\/data\/marketplace\.data/);
  assert.equal(permissions, "camera=(self), microphone=(), geolocation=()");
});

test("sinxronizasiya nəticəsini inventara ötürür və idxal saxta URL saxlamır", () => {
  const sync = read("api/sync.js");
  const products = read("api/products.js");
  const template = read("docs/csv-templates/products.csv");
  const admin = read("admin.html");

  assert.match(sync, /const saved = await query\([\s\S]*RETURNING products\.id/);
  assert.match(sync, /syncProductInventoryLevels\(saved\.map/);
  assert.match(products, /extra_data = products\.extra_data \|\| EXCLUDED\.extra_data/);
  assert.match(admin, /name="barcode"/);
  assert.doesNotMatch(template, /example\.com/);
});

test("müqavilə və backup yalnız real təsdiqlə production-a keçir", () => {
  const operations = read("api/_admin/operations-center.js");
  const admin = read("admin.html");
  const backup = read("api/_lib/cloud-backup.js");
  const env = read(".env.example");

  assert.match(operations, /contract_activation_requirements/);
  assert.match(operations, /legalConfirmed/);
  assert.match(admin, /name="legalConfirmed"/);
  assert.match(backup, /access: "private"/);
  assert.match(backup, /BACKUP_BLOB_READ_WRITE_TOKEN/);
  assert.match(env, /BACKUP_BLOB_READ_WRITE_TOKEN=/);
});

test("rəsmi media, CSV/JSON inventar və bank köçürməsi idarə olunan axınla işləyir", () => {
  const media = read("api/_admin/media.js");
  const quality = read("api/_lib/catalog-quality.js");
  const inventory = read("api/_admin/inventory.js");
  const integrations = read("api/_admin/integrations.js");
  const orderLifecycle = read("api/_lib/order-lifecycle.js");
  const admin = read("admin.html");
  const supplier = read("supplier-portal.html");
  const order = read("order-detail.html");
  const env = read(".env.example");

  assert.match(media, /register-external/);
  assert.match(media, /validatePublicUrl/);
  assert.match(media, /provider !== "external"/);
  assert.match(quality, /missing_licensed_media/);
  assert.match(inventory, /parseInventorySource/);
  assert.match(inventory, /\["auto", "csv", "json"\]/);
  assert.match(integrations, /submit-bank-transfer/);
  assert.match(integrations, /review-bank-transfer/);
  assert.match(integrations, /register-invoice/);
  assert.match(orderLifecycle, /payments: paymentRows\.map/);
  assert.match(orderLifecycle, /invoices: invoiceRows\.map/);
  assert.match(admin, /data-admin-v2-external-media-form/);
  assert.match(supplier, /data-inventory-bulk-file/);
  assert.match(order, /data-order-bank-form/);
  assert.match(order, /data-order-manual-invoice-form/);
  assert.match(env, /BANK_TRANSFER_IBAN=/);
});
