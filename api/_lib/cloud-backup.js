import { gzipSync } from "node:zlib";
import { query, recordAudit } from "./db.js";

const backupQueries = Object.freeze({
  companies: "SELECT * FROM companies ORDER BY created_at",
  users: `SELECT id, company_id, email, name, role, status, must_change_password,
                 last_login_at, created_at, updated_at
            FROM users ORDER BY created_at`,
  categories: "SELECT * FROM categories ORDER BY kind, parent_id NULLS FIRST, sort_order, title",
  suppliers: "SELECT * FROM suppliers ORDER BY name",
  products: `SELECT id, sku, name, slug, brand, category_id, subcategory, package_text, origin,
                    supplier_id, supplier_name, price_amount, price_currency, price_text, price_note,
                    price_status, availability, stock_quantity, minimum_order, price_verified_at,
                    image_url, source_url, source_label, specs, extra_data, status, created_at, updated_at
               FROM products ORDER BY updated_at`,
  priceHistory: "SELECT * FROM price_history ORDER BY captured_at",
  marketplaceEntities: "SELECT * FROM marketplace_entities ORDER BY entity_kind, title",
  mediaAssets: "SELECT * FROM media_assets ORDER BY created_at",
  tenders: "SELECT * FROM tenders ORDER BY created_at",
  tenderLots: "SELECT * FROM tender_lots ORDER BY tender_id, sort_order",
  tenderBids: "SELECT * FROM tender_bids ORDER BY tender_id, created_at",
  rfqs: "SELECT * FROM rfqs ORDER BY created_at",
  rfqItems: "SELECT * FROM rfq_items ORDER BY rfq_id, created_at",
  offers: "SELECT * FROM offers ORDER BY rfq_id, created_at",
  orders: "SELECT * FROM orders ORDER BY created_at",
  orderItems: "SELECT * FROM order_items ORDER BY order_id, created_at",
  orderStatusHistory: "SELECT * FROM order_status_history ORDER BY order_id, created_at",
  orderDocuments: "SELECT * FROM order_documents ORDER BY order_id, issued_at",
  warehouses: "SELECT * FROM warehouses ORDER BY supplier_id, name",
  inventoryLevels: "SELECT * FROM inventory_levels ORDER BY warehouse_id, product_id",
  orderFulfillments: "SELECT * FROM order_fulfillments ORDER BY order_id, supplier_id",
  inventoryReservations: "SELECT * FROM inventory_reservations ORDER BY order_id, created_at",
  crmLeads: "SELECT * FROM crm_leads ORDER BY created_at",
  crmActivities: "SELECT * FROM crm_activities ORDER BY lead_id, created_at",
  rentalBookings: "SELECT * FROM rental_bookings ORDER BY created_at",
  supplierApplications: "SELECT * FROM supplier_applications ORDER BY created_at",
  priceReviewRequests: "SELECT * FROM price_review_requests ORDER BY requested_at",
  notifications: "SELECT * FROM notifications ORDER BY created_at",
  paymentTransactions: `SELECT id, order_id, provider, external_id, idempotency_key, amount,
                               currency, status, checkout_url, created_at, updated_at
                          FROM payment_transactions ORDER BY created_at`,
  electronicInvoices: `SELECT id, order_id, provider, external_id, status, document_url,
                              issued_at, created_at, updated_at
                         FROM electronic_invoices ORDER BY created_at`,
  integrationEvents: `SELECT id, provider, event_type, external_id, status, created_at, processed_at
                         FROM integration_events ORDER BY created_at`,
  auditLogs: "SELECT * FROM audit_logs ORDER BY created_at"
});

export const backupReadiness = () => {
  try {
    return Boolean(
      process.env.BACKUP_WEBHOOK_SECRET
      && new URL(process.env.BACKUP_WEBHOOK_URL || "").protocol === "https:"
    );
  } catch {
    return false;
  }
};

export const buildCloudBackup = async () => {
  const entries = await Promise.all(
    Object.entries(backupQueries).map(async ([name, sql]) => [name, await query(sql)])
  );
  const data = Object.fromEntries(entries);
  return {
    version: "constera-cloud-backup-v3",
    backupId: `constera-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    exportedAt: new Date().toISOString(),
    source: "ConstEra PostgreSQL",
    schemaMigrations: 18,
    data
  };
};

export const backupSummary = (backup) => Object.fromEntries(
  Object.entries(backup.data || {}).map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 0])
);

export const deliverScheduledBackup = async () => {
  if (!backupReadiness()) {
    return { status: "skipped", reason: "Təhlükəsiz backup webhook-u qurulmayıb." };
  }
  const backup = await buildCloudBackup();
  const compressed = gzipSync(Buffer.from(JSON.stringify(backup)), { level: 9 });
  let response;
  try {
    response = await fetch(process.env.BACKUP_WEBHOOK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.BACKUP_WEBHOOK_SECRET}`,
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "X-Constera-Backup-Id": backup.backupId
      },
      body: compressed,
      signal: AbortSignal.timeout(25_000)
    });
  } catch {
    throw new Error("Backup yaddaş xidməti ilə əlaqə qurulmadı.");
  }
  if (!response.ok) throw new Error(`Backup yaddaş xidməti HTTP ${response.status} qaytardı.`);
  const summary = backupSummary(backup);
  await recordAudit({
    action: "scheduled_export",
    entityType: "backup",
    entityId: backup.backupId,
    details: { compressedBytes: compressed.byteLength, counts: summary }
  });
  return {
    status: "sent",
    backupId: backup.backupId,
    compressedBytes: compressed.byteLength,
    counts: summary
  };
};
