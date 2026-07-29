import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("admin keyfiyyət mərkəzi real məhsulları RFQ qruplarından ayırır və düzəldir", () => {
  const admin = read("admin.html");
  const adminJs = read("assets/js/admin-v2.js");
  const analytics = read("api/_admin/analytics.js");

  assert.match(admin, /data-admin-quality-dialog/);
  assert.match(admin, /data-admin-quality-form/);
  assert.match(adminJs, /openQualityEditor/);
  assert.match(adminJs, /api\.saveProduct\(\{/);
  assert.match(adminJs, /\},\s*true\);/);
  assert.match(analytics, /request_groups/);
  assert.match(analytics, /məhsul qrupu/);
  assert.match(analytics, /brandless_listings/);
});

test("təchizatçı toplu inventarı əvvəl yoxlayır və təhlükəsiz hissələrlə yazır", () => {
  const portal = read("supplier-portal.html");
  const marketplace = read("assets/js/marketplace.js");
  const inventoryApi = read("api/_admin/inventory.js");
  const production = read("assets/js/production.js");

  for (const marker of [
    "data-supplier-import-file",
    "data-inventory-bulk-input",
    "data-inventory-bulk-preview",
    "data-inventory-bulk-apply",
    "data-supplier-order-rows"
  ]) {
    assert.match(portal, new RegExp(marker));
  }
  assert.match(marketplace, /runBulkInventory/);
  assert.match(marketplace, /ConstEraAPI\.importInventory/);
  assert.match(production, /importInventory:/);
  assert.match(inventoryApi, /parseBulkInventory/);
  assert.match(inventoryApi, /SKU bu təchizatçıya aid deyil/);
  assert.match(inventoryApi, /Təsdiqli qiymət üçün məbləğ və HTTPS mənbə tələb olunur/);
  assert.match(inventoryApi, /maksimum 1 000 SKU/);
});

test("RFQ təklifləri serverdə müqayisə olunur və yalnız bir qalib seçilir", () => {
  const dashboard = read("rfq-dashboard.html");
  const dashboardJs = read("assets/js/marketplace.js");
  const rfqApi = read("api/rfqs.js");
  const offersApi = read("api/offers.js");
  const migration = read("db/migrations/011_rfq_offer_selection.sql");

  assert.ok(
    dashboard.indexOf('src="assets/js/production.js"') < dashboard.indexOf('src="assets/js/marketplace.js"'),
    "production qatı marketplace-dən əvvəl yüklənməlidir"
  );
  assert.match(dashboardJs, /ConstEraAPI\.updateOffer/);
  assert.match(dashboardJs, /data-rfq-offer-select/);
  assert.match(rfqApi, /offer_supplier\.company_id/);
  assert.match(offersApi, /ownsRfq/);
  assert.match(offersApi, /status = 'accepted'/);
  assert.match(offersApi, /SELECT count\(\*\) FROM rejected/);
  assert.match(offersApi, /offer_accepted/);
  assert.match(migration, /UNIQUE INDEX/);
  assert.match(migration, /WHERE status = 'accepted'/);
});

test("məhsul səhifəsi qalereya, qiymət tarixçəsi və əlaqəli məhsullar alır", () => {
  const productsApi = read("api/products.js");
  const marketplace = read("assets/js/marketplace.js");

  assert.match(productsApi, /FROM price_history/);
  assert.match(productsApi, /FROM media_assets/);
  assert.match(productsApi, /relatedProducts/);
  assert.match(productsApi, /confirmedPriceChanged/);
  assert.match(marketplace, /detail-gallery-thumbs/);
  assert.match(marketplace, /Qiymət tarixçəsi/);
  assert.match(marketplace, /relatedProducts/);
  assert.match(read("db/migrations/012_price_history_baseline.sql"), /NOT EXISTS[\s\S]*price_history/);
});

test("ağıllı smeta Neon kabinetinə və canlı RFQ axınına qoşulur", () => {
  const page = read("ai-smeta.html");
  const marketplace = read("assets/js/marketplace.js");

  assert.ok(
    page.indexOf('src="assets/js/production.js"') < page.indexOf('src="assets/js/marketplace.js"'),
    "smeta səhifəsində production qatı marketplace-dən əvvəl yüklənməlidir"
  );
  assert.match(marketplace, /ConstEraAPI\.saveEstimate/);
  assert.match(marketplace, /ConstEraAPI\.createRfq/);
  assert.match(marketplace, /cloudSyncedAt/);
});

test("sifariş mərhələləri tarixçə və dəyişməz proforma sənədi yaradır", () => {
  const ordersApi = read("api/_admin/orders.js");
  const migration = read("db/migrations/013_commerce_lifecycle.sql");
  const page = read("order-detail.html");
  const client = read("assets/js/order-detail.js");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS order_status_history/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS order_documents/);
  assert.match(ordersApi, /allowedOrderTransitions/);
  assert.match(ordersApi, /issueOrderDocument/);
  assert.match(ordersApi, /proforma_invoice/);
  assert.match(page, /data-order-document/);
  assert.match(page, /data-order-admin-form/);
  assert.match(client, /window\.print\(\)/);
  assert.match(client, /ConstEraAPI\.order/);
});

test("təchizatçı müraciəti VÖEN yoxlaması və admin təsdiqi ilə hesaba çevrilir", () => {
  const page = read("suppliers.html");
  const supplierApi = read("api/suppliers.js");
  const admin = read("admin.html");
  const adminClient = read("assets/js/admin-v2.js");
  const production = read("assets/js/production.js");

  assert.match(page, /data-supplier-application-form/);
  assert.match(page, /name="taxId"/);
  assert.match(supplierApi, /supplier_applications/);
  assert.match(supplierApi, /VÖEN 10 rəqəmdən/);
  assert.match(supplierApi, /password_reset_tokens/);
  assert.match(supplierApi, /supplier_application_approved/);
  assert.match(admin, /data-admin-supplier-applications/);
  assert.match(adminClient, /reviewSupplierApplication/);
  assert.match(production, /applyAsSupplier:/);
});

test("qiymət monitoru 21 və 30 günlük nəzarət növbəsini idarə edir", () => {
  const helper = read("api/_lib/price-monitor.js");
  const monitorApi = read("api/_admin/price-monitor.js");
  const cron = read("api/cron-price-freshness.js");
  const inventory = read("api/_admin/inventory.js");
  const products = read("api/products.js");
  const admin = read("admin.html");

  assert.match(helper, /interval '21 days'/);
  assert.match(helper, /interval '30 days'/);
  assert.match(helper, /price_review_requests/);
  assert.match(monitorApi, /remindPriceReview/);
  assert.match(cron, /runPriceFreshnessScan/);
  assert.match(inventory, /status = 'completed'/);
  assert.match(products, /price_review_requests/);
  assert.match(admin, /data-admin-price-monitor-items/);
});
