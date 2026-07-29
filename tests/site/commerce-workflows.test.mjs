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
  const productsApi = read("api/products.js");
  const syncApi = read("api/sync.js");
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
  assert.match(productsApi, /syncProductInventoryLevels/);
  assert.match(productsApi, /stock_below_reserved/);
  assert.match(syncApi, /COALESCE\(products\.stock_quantity, EXCLUDED\.stock_quantity\)/);
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

test("qalib RFQ təklifi bir dəfə sifarişə çevrilir və proforma yaradır", () => {
  const offersApi = read("api/offers.js");
  const conversion = read("api/_lib/rfq-order.js");
  const lifecycle = read("api/_lib/order-lifecycle.js");
  const migration = read("db/migrations/014_rfq_order_conversion.sql");
  const marketplace = read("assets/js/marketplace.js");

  assert.match(offersApi, /ensureOrderForAcceptedOffer/);
  assert.match(offersApi, /rfq_already_converted/);
  assert.match(offersApi, /WHERE id = \$1 AND status IN \('draft', 'submitted', 'accepted'\)/);
  assert.match(conversion, /ON CONFLICT \(rfq_id\) WHERE rfq_id IS NOT NULL DO NOTHING/);
  assert.match(conversion, /proforma_invoice/);
  assert.match(conversion, /order_summary/);
  assert.match(lifecycle, /rfqId: order\.rfqId/);
  assert.match(migration, /orders_rfq_unique/);
  assert.match(migration, /orders_offer_unique/);
  assert.match(migration, /order_items_supplier_idx/);
  assert.match(marketplace, /order-detail\.html\?order=/);
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

test("qalib tender təklifi idempotent sifariş və proforma axınına çevrilir", () => {
  const bidsApi = read("api/_admin/tender-bids.js");
  const conversion = read("api/_lib/tender-order.js");
  const migration = read("db/migrations/015_tender_order_conversion.sql");
  const adminClient = read("assets/js/admin-v2.js");

  assert.match(bidsApi, /ensureOrderForAcceptedTenderBid/);
  assert.match(bidsApi, /tender_already_converted/);
  assert.match(conversion, /ON CONFLICT \(tender_id\) WHERE tender_id IS NOT NULL DO NOTHING/);
  assert.match(conversion, /if \(created\) \{\s*await recordOrderHistory/);
  assert.match(conversion, /proforma_invoice/);
  assert.match(migration, /tender_bids_one_accepted_per_tender_idx/);
  assert.match(migration, /orders_tender_unique/);
  assert.match(adminClient, /data-tender-bid-accept/);
  assert.match(adminClient, /order-detail\.html\?order=/);
});

test("stok rezervi anbar səviyyəsində atomik ayrılır və fulfillment ilə idarə olunur", () => {
  const operations = read("api/_lib/order-operations.js");
  const fulfillment = read("api/_admin/fulfillments.js");
  const inventory = read("api/_admin/inventory.js");
  const migration = read("db/migrations/016_fulfillment_inventory.sql");
  const supplierPage = read("supplier-portal.html");

  assert.match(operations, /reserved_quantity = level\.reserved_quantity \+ requested\.quantity/);
  assert.match(operations, /level\.stock_quantity - level\.reserved_quantity >= requested\.quantity/);
  assert.match(operations, /releaseOrderReservations/);
  assert.match(operations, /consumeOrderReservations/);
  assert.match(fulfillment, /invalid_fulfillment_transition/);
  assert.match(fulfillment, /shipping_reference_required/);
  assert.match(inventory, /stock_below_reserved/);
  assert.match(inventory, /reconcileShortageReservations/);
  assert.match(migration, /Mövcud sifariş üçün migrasiya zamanı rezerv edildi/);
  assert.match(supplierPage, /data-supplier-order-rows/);
});

test("CRM və icarə rezervasiyası satış mənbələrini vahid pipeline-da birləşdirir", () => {
  const crm = read("api/_admin/crm.js");
  const crmSync = read("api/_lib/crm.js");
  const rentals = read("api/_admin/rental-bookings.js");
  const migration = read("db/migrations/017_crm_rental_bookings.sql");
  const admin = read("admin.html");
  const marketplace = read("assets/js/marketplace.js");

  assert.match(crm, /crm_owner_not_found/);
  assert.match(crm, /crm_activities/);
  assert.match(crmSync, /syncRfqLead/);
  assert.match(crmSync, /syncOrderLead/);
  assert.match(crmSync, /syncRentalLead/);
  assert.match(rentals, /daterange\(start_date, end_date, '\[\]'\)/);
  assert.match(rentals, /rental_not_available/);
  assert.match(migration, /crm_leads_source_unique/);
  assert.match(admin, /data-admin-v2-crm-leads/);
  assert.match(admin, /data-admin-v2-rental-bookings/);
  assert.match(marketplace, /data-rental-booking-form/);
});

test("xarici providerlər açarsız imitasiya edilmir və təhlükəsiz adapterlə aktivləşir", () => {
  const adapters = read("api/_lib/provider-adapters.js");
  const integrations = read("api/_admin/integrations.js");
  const migration = read("db/migrations/018_provider_integrations.sql");
  const checkout = read("checkout.html");
  const orderClient = read("assets/js/order-detail.js");

  assert.match(adapters, /configuredHttpsEndpoint/);
  assert.match(adapters, /provider_unreachable/);
  assert.match(adapters, /PAYMENT_WEBHOOK_URL/);
  assert.match(adapters, /EINVOICE_WEBHOOK_URL/);
  assert.match(adapters, /AI_ESTIMATE_WEBHOOK_URL/);
  assert.match(integrations, /safeProviderPayload/);
  assert.match(integrations, /paymentTransitionAllowed/);
  assert.match(integrations, /invalid_webhook_signature/);
  assert.match(migration, /payment_transactions/);
  assert.match(migration, /electronic_invoices/);
  assert.match(checkout, /data-payment-card/);
  assert.match(orderClient, /createPayment/);
  assert.match(orderClient, /issueElectronicInvoice/);
});

test("tam backup, CI və production monitorinqi repozitoriyada aktivdir", () => {
  const backup = read("api/_lib/cloud-backup.js");
  const scheduled = read("api/_admin/scheduled-backup.js");
  const qualityWorkflow = read(".github/workflows/quality.yml");
  const monitorWorkflow = read(".github/workflows/production-monitor.yml");
  const productionCheck = read("scripts/check-production.mjs");

  assert.match(backup, /constera-cloud-backup-v3/);
  assert.doesNotMatch(backup, /password_hash/);
  assert.doesNotMatch(backup, /SELECT \* FROM users/);
  assert.match(backup, /Content-Encoding/);
  assert.match(scheduled, /cron_unauthorized/);
  assert.match(qualityWorkflow, /npm run check/);
  assert.match(qualityWorkflow, /npm run test:layout/);
  assert.match(monitorWorkflow, /npm run check:production/);
  assert.match(productionCheck, /database === "ready"/);
});
