import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { put } from "@vercel/blob";
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
  productOffers: "SELECT * FROM product_offers ORDER BY product_id, supplier_id",
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
  supplierPurchaseOrders: "SELECT * FROM supplier_purchase_orders ORDER BY order_id, supplier_id",
  supplierPurchaseOrderItems: "SELECT * FROM supplier_purchase_order_items ORDER BY purchase_order_id, order_item_id",
  inventoryReservations: "SELECT * FROM inventory_reservations ORDER BY order_id, created_at",
  logisticsZones: "SELECT * FROM logistics_zones ORDER BY priority, name",
  deliveryQuotes: "SELECT * FROM delivery_quotes ORDER BY created_at",
  procurementRequests: "SELECT * FROM procurement_requests ORDER BY created_at",
  procurementDecisions: "SELECT * FROM procurement_decisions ORDER BY request_id, created_at",
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
  supportCases: "SELECT * FROM support_cases ORDER BY created_at",
  supportCaseItems: "SELECT * FROM support_case_items ORDER BY case_id, created_at",
  supportCaseMessages: "SELECT * FROM support_case_messages ORDER BY case_id, created_at",
  refundTransactions: "SELECT * FROM refund_transactions ORDER BY created_at",
  marketplaceReviews: "SELECT * FROM marketplace_reviews ORDER BY created_at",
  analyticsEvents: `SELECT * FROM analytics_events
                      WHERE created_at >= now() - interval '90 days'
                      ORDER BY created_at`,
  catalogQualityRuns: "SELECT * FROM catalog_quality_runs ORDER BY started_at",
  catalogQualityIssues: "SELECT * FROM catalog_quality_issues ORDER BY first_seen_at",
  catalogQualityRemediations: "SELECT * FROM catalog_quality_remediations ORDER BY created_at",
  supplierFeeds: `SELECT id, supplier_id, name, endpoint_url, feed_format, auth_env_key,
                         mapping, schedule_minutes, active, next_run_at, last_run_at,
                         last_status, last_error, created_by, created_at, updated_at
                    FROM supplier_feeds ORDER BY created_at`,
  supplierFeedRuns: "SELECT * FROM supplier_feed_runs ORDER BY started_at",
  supplierOfferHistory: "SELECT * FROM supplier_offer_history ORDER BY captured_at",
  supplierFeedChanges: "SELECT * FROM supplier_feed_changes ORDER BY created_at",
  supplierContracts: "SELECT * FROM supplier_contracts ORDER BY created_at",
  supplierSettlements: "SELECT * FROM supplier_settlements ORDER BY created_at",
  supplierSettlementItems: "SELECT * FROM supplier_settlement_items ORDER BY created_at",
  deliveryTrackingEvents: "SELECT * FROM delivery_tracking_events ORDER BY occurred_at",
  securityEvents: "SELECT * FROM security_events ORDER BY created_at",
  backupVerifications: "SELECT * FROM backup_verifications ORDER BY created_at",
  auditLogs: "SELECT * FROM audit_logs ORDER BY created_at"
});

const webhookBackupReady = () => {
  try {
    return Boolean(
      process.env.BACKUP_WEBHOOK_SECRET
      && new URL(process.env.BACKUP_WEBHOOK_URL || "").protocol === "https:"
    );
  } catch {
    return false;
  }
};

const privateBlobBackupReady = () => Boolean(
  String(process.env.BACKUP_BLOB_READ_WRITE_TOKEN || "").trim()
);

export const backupDeliveryReadiness = () => {
  if (webhookBackupReady()) {
    return {
      ready: true,
      channel: "webhook",
      label: "Şifrəli webhook"
    };
  }
  if (privateBlobBackupReady()) {
    return {
      ready: true,
      channel: "private_blob",
      label: "Özəl Vercel Blob"
    };
  }
  return {
    ready: false,
    channel: "none",
    label: "Qurulmayıb"
  };
};

export const backupReadiness = () => backupDeliveryReadiness().ready;

export const buildCloudBackup = async () => {
  const entries = await Promise.all(
    Object.entries(backupQueries).map(async ([name, sql]) => [name, await query(sql)])
  );
  const data = Object.fromEntries(entries);
  return {
    version: "constera-cloud-backup-v8",
    backupId: `constera-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    exportedAt: new Date().toISOString(),
    source: "ConstEra PostgreSQL",
    schemaMigrations: 23,
    data
  };
};

export const backupSummary = (backup) => Object.fromEntries(
  Object.entries(backup.data || {}).map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 0])
);

export const verifyCloudBackup = async ({ actorId = null } = {}) => {
  const backup = await buildCloudBackup();
  const summary = backupSummary(backup);
  const required = ["companies", "users", "categories", "products", "suppliers", "auditLogs"];
  const missing = required.filter((name) => !Array.isArray(backup.data?.[name]));
  const serialized = JSON.stringify(backup);
  const checksum = createHash("sha256").update(serialized).digest("hex");
  const tableCount = Object.keys(summary).length;
  const recordCount = Object.values(summary).reduce((total, count) => total + Number(count || 0), 0);
  const status = missing.length || backup.schemaMigrations !== 23 ? "failed" : "verified";
  const details = {
    missing,
    requiredCollections: required.length,
    nonEmptyCollections: Object.values(summary).filter((count) => Number(count) > 0).length
  };
  await query(
    `INSERT INTO backup_verifications (
       id, backup_id, status, backup_version, schema_migrations,
       table_count, record_count, checksum_sha256, details, verified_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
    [
      `bvf-${randomUUID()}`,
      backup.backupId,
      status,
      backup.version,
      backup.schemaMigrations,
      tableCount,
      recordCount,
      checksum,
      JSON.stringify(details),
      actorId
    ]
  );
  return {
    backupId: backup.backupId,
    status,
    version: backup.version,
    schemaMigrations: backup.schemaMigrations,
    tableCount,
    recordCount,
    checksum,
    details
  };
};

export const deliverScheduledBackup = async () => {
  const delivery = backupDeliveryReadiness();
  if (!delivery.ready) {
    return { status: "skipped", reason: "Təhlükəsiz backup kanalı qurulmayıb." };
  }
  const backup = await buildCloudBackup();
  const compressed = gzipSync(Buffer.from(JSON.stringify(backup)), { level: 9 });
  let deliveryDetails;
  if (delivery.channel === "webhook") {
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
    deliveryDetails = { channel: delivery.channel };
  } else {
    const exportedAt = new Date(backup.exportedAt);
    const pathname = [
      "constera-backups",
      String(exportedAt.getUTCFullYear()),
      String(exportedAt.getUTCMonth() + 1).padStart(2, "0"),
      `${backup.backupId}.json.gz`
    ].join("/");
    try {
      await put(pathname, compressed, {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/gzip",
        token: process.env.BACKUP_BLOB_READ_WRITE_TOKEN
      });
    } catch {
      throw new Error("Özəl backup yaddaşına yazmaq mümkün olmadı.");
    }
    deliveryDetails = { channel: delivery.channel, pathname };
  }
  const summary = backupSummary(backup);
  await recordAudit({
    action: "scheduled_export",
    entityType: "backup",
    entityId: backup.backupId,
    details: { compressedBytes: compressed.byteLength, counts: summary, ...deliveryDetails }
  });
  return {
    status: "sent",
    backupId: backup.backupId,
    compressedBytes: compressed.byteLength,
    counts: summary,
    ...deliveryDetails
  };
};
