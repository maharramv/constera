import { assertCriticalTwoFactor, criticalAdminTwoFactorRequired, requireRole } from "../_lib/auth.js";
import { runCatalogQualityScan } from "../_lib/catalog-quality.js";
import { backupDeliveryReadiness } from "../_lib/cloud-backup.js";
import { buildCommercialLaunchProgram } from "../_lib/commercial-launch.js";
import { buildCommercialPilotCenter } from "../_lib/commercial-pilot.js";
import { query, recordAudit } from "../_lib/db.js";
import { googleMarketingReadiness } from "../_lib/google-marketing.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { buildLaunchReadiness, buildSupplierOnboarding } from "../_lib/launch-readiness.js";
import { calculateDeliveryQuote } from "../_lib/logistics.js";
import { providerConfigurationStatus, providerReadiness } from "../_lib/provider-adapters.js";
import { productionMonitorAlertReadiness } from "../_lib/production-monitor.js";
import { remindDuePriceReviews, runPriceFreshnessScan } from "../_lib/price-monitor.js";
import { backupVerificationState, buildReleaseQueue } from "../_lib/release-queue.js";
import { oneOf, text } from "../_lib/validation.js";

const roles = ["super_admin", "admin"];
const freshnessWindowMs = 30 * 86_400_000;

const number = (value) => Math.max(0, Number(value || 0));

const mapPilotCandidate = (row) => {
  if (!row) return null;
  const missing = [
    ...(!row.has_active_contract ? [{ key: "contract", label: "Hüquqi profil və aktiv müqavilə" }] : []),
    ...(!row.has_licensed_media ? [{ key: "media", label: "Media istifadə hüququ" }] : [])
  ];
  return {
    productId: row.product_id,
    offerId: row.offer_id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    package: row.package_text || "",
    imageUrl: row.media_url || row.image_url || "",
    sourceImageUrl: row.image_url || "",
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    unitPrice: Number(row.unit_price),
    currency: row.currency || "AZN",
    stockQuantity: Number(row.stock_quantity),
    minimumOrder: row.minimum_order === null ? null : Number(row.minimum_order),
    leadTimeDays: row.lead_time_days === null ? null : Number(row.lead_time_days),
    priceVerifiedAt: row.price_verified_at,
    sourceUrl: row.source_url,
    hasActiveContract: Boolean(row.has_active_contract),
    hasLicensedMedia: Boolean(row.has_licensed_media),
    ready: missing.length === 0,
    missing
  };
};

export const loadLaunchCenter = async () => {
  const [
    metricRows,
    supplierRows,
    pilotRows,
    pilotWorkspaceRows,
    readyFulfillmentRows,
    salesDailyRows,
    topProductRows,
    topSupplierRows,
    orderStatusRows,
    qualityIssueRows,
    stagingRows,
    searchInsightRows,
    backupVerificationRows,
    pilotAuditRows
  ] = await Promise.all([
    query(
      `WITH real_products AS (
         SELECT product.*
           FROM products product
          WHERE product.status = 'active'
            AND lower(trim(coalesce(product.brand, ''))) <> 'constera sorğu'
            AND lower(product.name) NOT LIKE '%məhsul qrupu%'
            AND upper(product.sku) NOT LIKE '%RFQ%'
       ),
       licensed_products AS (
         SELECT DISTINCT media.entity_id AS product_id
           FROM media_assets media
          WHERE media.status = 'active'
            AND media.entity_type = 'product'
            AND media.content_type LIKE 'image/%'
            AND media.license_type IN ('own', 'supplier', 'official', 'licensed')
            AND media.rights_status = 'verified'
            AND (media.rights_expires_on IS NULL OR media.rights_expires_on >= current_date)
            AND media.url ~ '^https://'
       ),
       eligible_offers AS (
         SELECT offer.*
           FROM product_offers offer
           JOIN products product ON product.id = offer.product_id AND product.status = 'active'
           JOIN suppliers supplier ON supplier.id = offer.supplier_id AND supplier.status <> 'Arxiv'
           JOIN supplier_contracts contract
             ON contract.supplier_id = offer.supplier_id
            AND contract.status = 'active'
            AND contract.legal_confirmed = true
            AND contract.starts_on <= current_date
            AND (contract.ends_on IS NULL OR contract.ends_on >= current_date)
          WHERE offer.status = 'active'
            AND NULLIF(trim(supplier.contact), '') IS NOT NULL
            AND supplier.website ~ '^https://'
            AND EXISTS (
              SELECT 1 FROM companies company
               WHERE company.id = supplier.company_id
                 AND company.status = 'active'
                 AND NULLIF(trim(company.tax_id), '') IS NOT NULL
            )
            AND EXISTS (
              SELECT 1 FROM users supplier_user
               WHERE supplier_user.company_id = supplier.company_id
                 AND supplier_user.role = 'supplier'
                 AND supplier_user.status = 'active'
            )
            AND offer.price_status = 'confirmed'
            AND offer.unit_price > 0
            AND offer.price_verified_at >= now() - interval '30 days'
            AND offer.stock_quantity > 0
            AND offer.source_url ~ '^https://'
       ),
       onboarded_suppliers AS (
         SELECT DISTINCT supplier.id
           FROM suppliers supplier
           JOIN supplier_contracts contract
             ON contract.supplier_id = supplier.id
            AND contract.status = 'active'
            AND contract.legal_confirmed = true
            AND contract.starts_on <= current_date
            AND (contract.ends_on IS NULL OR contract.ends_on >= current_date)
           JOIN companies company
             ON company.id = supplier.company_id
            AND company.status = 'active'
            AND NULLIF(trim(company.tax_id), '') IS NOT NULL
           JOIN eligible_offers offer ON offer.supplier_id = supplier.id
           JOIN licensed_products media ON media.product_id = offer.product_id
          WHERE supplier.status <> 'Arxiv'
            AND NULLIF(trim(supplier.contact), '') IS NOT NULL
            AND supplier.website ~ '^https://'
            AND EXISTS (
              SELECT 1 FROM users supplier_user
               WHERE supplier_user.company_id = supplier.company_id
                 AND supplier_user.role = 'supplier'
                 AND supplier_user.status = 'active'
            )
       )
       SELECT
         (SELECT count(*) FROM real_products)::int AS real_products,
         (SELECT count(*) FROM real_products product
           WHERE EXISTS (
               SELECT 1 FROM eligible_offers offer WHERE offer.product_id = product.id
             )
             AND EXISTS (
               SELECT 1 FROM licensed_products media WHERE media.product_id = product.id
             ))::int AS eligible_products,
         (SELECT count(*) FROM licensed_products)::int AS licensed_media_products,
         (SELECT count(*) FROM eligible_offers)::int AS eligible_offers,
         (SELECT count(*) FROM suppliers WHERE status <> 'Arxiv')::int AS active_suppliers,
         (SELECT count(*) FROM onboarded_suppliers)::int AS onboarded_suppliers,
         (SELECT count(*) FROM supplier_feeds
           WHERE active = true AND last_status = 'completed'
             AND last_run_at >= now() - interval '48 hours')::int AS healthy_feeds,
         (SELECT count(*) FROM logistics_zones WHERE active = true)::int AS logistics_zones,
         (SELECT count(*) FROM logistics_zones
           WHERE active = true AND rate_status = 'verified'
             AND rate_valid_until >= current_date)::int AS verified_logistics_zones,
         (SELECT count(*) FROM users
           WHERE status = 'active' AND role IN ('super_admin', 'admin'))::int AS privileged_users,
         (SELECT count(*) FROM users
           WHERE status = 'active' AND role IN ('super_admin', 'admin')
             AND two_factor_enabled = true)::int AS admins_with_two_factor,
         (SELECT count(*) FROM security_events
           WHERE created_at >= now() - interval '30 days'
             AND risk_level IN ('high', 'critical')
             AND succeeded = false)::int AS critical_security_events,
         (SELECT count(*) FROM orders)::int AS orders,
         (SELECT count(*) FROM rfqs)::int AS rfqs,
         (SELECT count(*) FROM offers)::int AS rfq_offers,
         (SELECT count(*) FROM commercial_proposals)::int AS commercial_proposals,
         (SELECT count(*) FROM orders WHERE payment_status = 'paid')::int AS paid_orders,
         (SELECT count(*) FROM orders WHERE status = 'completed')::int AS completed_orders,
         (SELECT count(*) FROM users
           WHERE status = 'active' AND role = 'customer')::int AS active_customers,
         (SELECT count(DISTINCT activity.customer_id)
            FROM (
              SELECT customer_id FROM rfqs
               WHERE customer_id IS NOT NULL AND created_at >= now() - interval '90 days'
              UNION
              SELECT customer_id FROM orders
               WHERE customer_id IS NOT NULL AND created_at >= now() - interval '90 days'
            ) activity)::int AS pilot_engaged_customers,
         (SELECT count(*) FROM electronic_invoices WHERE status = 'issued')::int AS issued_invoices,
         (SELECT count(*) FROM order_fulfillments WHERE status = 'ready')::int AS ready_fulfillments,
         (SELECT count(*) FROM order_fulfillments WHERE status = 'shipped')::int AS shipped_fulfillments,
         (SELECT count(*) FROM payment_transactions
           WHERE provider = 'bank_transfer' AND status = 'pending')::int AS pending_bank_transfers,
         (SELECT count(*) FROM price_review_requests WHERE status = 'pending')::int AS pending_price_reviews,
         (SELECT count(*) FROM real_products product
           WHERE (
             SELECT count(*)
               FROM jsonb_array_elements(
                 CASE
                   WHEN jsonb_typeof(product.extra_data->'attributes') = 'array'
                   THEN product.extra_data->'attributes'
                   ELSE '[]'::jsonb
                 END
               ) attribute
              WHERE coalesce(attribute->>'label', '') NOT IN ('Qablaşdırma', 'Mənşə')
           ) >= 2 OR (
             SELECT count(*)
               FROM jsonb_array_elements_text(coalesce(product.specs, '[]'::jsonb)) spec
              WHERE spec ~ '^[^:]{2,60}:[[:space:]]*.+'
           ) >= 2)::int AS structured_attribute_products,
         (SELECT count(*) FROM real_products product
           WHERE product.source_url ~ '^https://')::int AS sourced_products,
         (SELECT count(*) FROM supplier_contracts contract
           WHERE contract.status = 'active'
             AND contract.legal_confirmed = true
             AND contract.starts_on <= current_date
             AND (contract.ends_on IS NULL OR contract.ends_on >= current_date))::int AS active_contracts,
         (SELECT count(*) FROM supplier_feeds WHERE active = true)::int AS configured_feeds,
         (SELECT count(*) FROM marketplace_reviews WHERE status = 'published')::int AS published_reviews`
    ),
    query(
      `SELECT supplier.id, supplier.name, supplier.website, supplier.contact,
              supplier.status, supplier.region, supplier.response_time,
              supplier.company_id, company.tax_id,
              (SELECT count(*) FROM users
                WHERE users.company_id = supplier.company_id
                  AND users.role = 'supplier'
                  AND users.status = 'active')::int AS supplier_user_count,
              (SELECT count(*) FROM supplier_contracts contract
                WHERE contract.supplier_id = supplier.id
                  AND contract.status = 'active'
                  AND contract.legal_confirmed = true
                  AND contract.starts_on <= current_date
                  AND (contract.ends_on IS NULL OR contract.ends_on >= current_date))::int AS active_contract_count,
              (SELECT count(*) FROM supplier_feeds feed
                WHERE feed.supplier_id = supplier.id
                  AND feed.active = true
                  AND feed.last_status = 'completed'
                  AND feed.last_run_at >= now() - interval '48 hours')::int AS healthy_feed_count,
              (SELECT count(*) FROM products product
                WHERE product.supplier_id = supplier.id
                  AND product.status = 'active')::int AS product_count,
              (SELECT count(*) FROM product_offers offer
                WHERE offer.supplier_id = supplier.id
                  AND offer.status = 'active')::int AS offer_count,
              (SELECT count(*) FROM product_offers offer
                WHERE offer.supplier_id = supplier.id
                  AND offer.status = 'active'
                  AND offer.price_status = 'confirmed'
                  AND offer.unit_price > 0
                  AND offer.price_verified_at >= now() - interval '30 days'
                  AND offer.stock_quantity > 0
                  AND offer.source_url ~ '^https://')::int AS eligible_offer_count,
              (SELECT count(DISTINCT product.id)
                 FROM products product
                 JOIN media_assets media
                   ON media.entity_type = 'product'
                  AND media.entity_id = product.id
                  AND media.status = 'active'
                  AND media.content_type LIKE 'image/%'
                  AND media.license_type IN ('own', 'supplier', 'official', 'licensed')
                  AND media.rights_status = 'verified'
                  AND (media.rights_expires_on IS NULL OR media.rights_expires_on >= current_date)
                WHERE product.supplier_id = supplier.id
                  AND product.status = 'active')::int AS licensed_media_count
         FROM suppliers supplier
         LEFT JOIN companies company ON company.id = supplier.company_id
        WHERE supplier.status <> 'Arxiv'
        ORDER BY supplier.name`
    ),
    query(
      `SELECT product.id AS product_id, product.sku, product.name, product.brand,
              product.package_text, product.image_url,
              offer.id AS offer_id, offer.supplier_id, supplier.name AS supplier_name,
              offer.unit_price, offer.currency, offer.stock_quantity,
              offer.minimum_order, offer.lead_time_days, offer.price_verified_at,
              offer.source_url, media.url AS media_url,
              EXISTS (
                SELECT 1 FROM supplier_contracts contract
                 WHERE contract.supplier_id = supplier.id
                   AND contract.status = 'active'
                   AND contract.legal_confirmed = true
                   AND contract.starts_on <= current_date
                   AND (contract.ends_on IS NULL OR contract.ends_on >= current_date)
                   AND NULLIF(trim(supplier.contact), '') IS NOT NULL
                   AND supplier.website ~ '^https://'
                   AND EXISTS (
                     SELECT 1 FROM companies company
                      WHERE company.id = supplier.company_id
                        AND company.status = 'active'
                        AND NULLIF(trim(company.tax_id), '') IS NOT NULL
                   )
                   AND EXISTS (
                     SELECT 1 FROM users supplier_user
                      WHERE supplier_user.company_id = supplier.company_id
                        AND supplier_user.role = 'supplier'
                        AND supplier_user.status = 'active'
                   )
              ) AS has_active_contract,
              media.url IS NOT NULL AS has_licensed_media
         FROM product_offers offer
         JOIN products product ON product.id = offer.product_id AND product.status = 'active'
         JOIN suppliers supplier ON supplier.id = offer.supplier_id AND supplier.status <> 'Arxiv'
         LEFT JOIN LATERAL (
           SELECT asset.url
             FROM media_assets asset
            WHERE asset.entity_type = 'product'
              AND asset.entity_id = product.id
              AND asset.status = 'active'
              AND asset.content_type LIKE 'image/%'
              AND asset.license_type IN ('own', 'supplier', 'official', 'licensed')
              AND asset.rights_status = 'verified'
              AND (asset.rights_expires_on IS NULL OR asset.rights_expires_on >= current_date)
              AND asset.url ~ '^https://'
            ORDER BY asset.is_primary DESC, asset.created_at DESC
            LIMIT 1
         ) media ON true
        WHERE offer.status = 'active'
          AND offer.price_status = 'confirmed'
          AND offer.unit_price > 0
          AND offer.price_verified_at >= now() - interval '30 days'
          AND offer.stock_quantity > 0
          AND offer.source_url ~ '^https://'
        ORDER BY offer.stock_quantity DESC, offer.price_verified_at DESC
        LIMIT 100`
    ),
    query(
      `SELECT product.id AS product_id, product.sku, product.name, product.brand,
              category.title AS category, product.subcategory, product.package_text,
              product.image_url, product.source_url,
              greatest(
                (SELECT count(*)
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(product.extra_data->'attributes') = 'array'
                       THEN product.extra_data->'attributes' ELSE '[]'::jsonb END
                   ) attribute
                  WHERE coalesce(attribute->>'label', '') NOT IN ('Qablaşdırma', 'Mənşə')),
                (SELECT count(*)
                   FROM jsonb_array_elements_text(coalesce(product.specs, '[]'::jsonb)) spec
                  WHERE spec ~ '^[^:]{2,60}:[[:space:]]*.+')
              )::int AS technical_attribute_count,
              offer.id AS offer_id, offer.supplier_id,
              offer.unit_price, offer.currency, offer.price_status,
              offer.price_verified_at, offer.stock_quantity,
              offer.minimum_order, offer.lead_time_days,
              offer.source_url AS offer_source_url,
              supplier.name AS supplier_name,
              (
                supplier.id IS NOT NULL
                AND NULLIF(trim(supplier.contact), '') IS NOT NULL
                AND supplier.website ~ '^https://'
                AND NULLIF(trim(company.tax_id), '') IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM users supplier_user
                   WHERE supplier_user.company_id = supplier.company_id
                     AND supplier_user.role = 'supplier'
                     AND supplier_user.status = 'active'
                )
              ) AS supplier_profile_ready,
              EXISTS (
                SELECT 1 FROM supplier_contracts contract
                 WHERE contract.supplier_id = supplier.id
                   AND contract.status = 'active'
                   AND contract.legal_confirmed = true
                   AND contract.starts_on <= current_date
                   AND (contract.ends_on IS NULL OR contract.ends_on >= current_date)
              ) AS has_active_contract,
              media.url AS licensed_image_url,
              media.url IS NOT NULL AS has_licensed_media
         FROM products product
         LEFT JOIN categories category ON category.id = product.category_id
         LEFT JOIN LATERAL (
           SELECT candidate.*
             FROM product_offers candidate
            WHERE candidate.product_id = product.id
              AND candidate.status = 'active'
            ORDER BY
              CASE candidate.price_status WHEN 'confirmed' THEN 0 WHEN 'request' THEN 1 ELSE 2 END,
              candidate.price_verified_at DESC NULLS LAST,
              candidate.stock_quantity DESC NULLS LAST,
              candidate.unit_price ASC NULLS LAST
            LIMIT 1
         ) offer ON true
         LEFT JOIN suppliers supplier ON supplier.id = offer.supplier_id AND supplier.status <> 'Arxiv'
         LEFT JOIN companies company ON company.id = supplier.company_id AND company.status = 'active'
         LEFT JOIN LATERAL (
           SELECT asset.url
             FROM media_assets asset
            WHERE asset.entity_type = 'product'
              AND asset.entity_id = product.id
              AND asset.status = 'active'
              AND asset.content_type LIKE 'image/%'
              AND asset.license_type IN ('own', 'supplier', 'official', 'licensed')
              AND asset.rights_status = 'verified'
              AND (asset.rights_expires_on IS NULL OR asset.rights_expires_on >= current_date)
              AND asset.url ~ '^https://'
            ORDER BY asset.is_primary DESC, asset.created_at DESC
            LIMIT 1
         ) media ON true
        WHERE product.status = 'active'
          AND lower(trim(coalesce(product.brand, ''))) <> 'constera sorğu'
          AND lower(product.name) NOT LIKE '%məhsul qrupu%'
          AND upper(product.sku) NOT LIKE '%RFQ%'
        ORDER BY product.name`
    ),
    query(
      `SELECT fulfillment.id, fulfillment.order_id, orders.order_number,
              supplier.name AS supplier_name, orders.city,
              orders.payment_status, orders.total_amount, orders.currency
         FROM order_fulfillments fulfillment
         JOIN orders ON orders.id = fulfillment.order_id
         JOIN suppliers supplier ON supplier.id = fulfillment.supplier_id
        WHERE fulfillment.status = 'ready'
          AND orders.status NOT IN ('cancelled', 'completed')
        ORDER BY fulfillment.updated_at
        LIMIT 50`
    ),
    query(
      `WITH days AS (
         SELECT generate_series(current_date - interval '29 days', current_date, interval '1 day')::date AS day
       ),
       sales AS (
         SELECT created_at::date AS day,
                count(*) FILTER (WHERE status <> 'cancelled')::int AS orders,
                coalesce(sum(total_amount) FILTER (WHERE status <> 'cancelled'), 0)::numeric AS gross,
                coalesce(sum(total_amount) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS paid
           FROM orders
          WHERE created_at >= current_date - interval '29 days'
          GROUP BY created_at::date
       )
       SELECT days.day, coalesce(sales.orders, 0)::int AS orders,
              coalesce(sales.gross, 0)::numeric AS gross,
              coalesce(sales.paid, 0)::numeric AS paid
         FROM days LEFT JOIN sales USING (day)
        ORDER BY days.day`
    ),
    query(
      `SELECT item.product_id, item.sku, item.title,
              count(DISTINCT item.order_id)::int AS order_count,
              coalesce(sum(item.quantity), 0)::numeric AS quantity,
              coalesce(sum(item.line_total), 0)::numeric AS revenue
         FROM order_items item
         JOIN orders ON orders.id = item.order_id
        WHERE orders.status <> 'cancelled'
        GROUP BY item.product_id, item.sku, item.title
        ORDER BY revenue DESC, quantity DESC, item.title
        LIMIT 10`
    ),
    query(
      `SELECT supplier.id, supplier.name,
              count(DISTINCT item.order_id)::int AS order_count,
              coalesce(sum(item.quantity), 0)::numeric AS quantity,
              coalesce(sum(item.line_total), 0)::numeric AS revenue
         FROM order_items item
         JOIN orders ON orders.id = item.order_id
         JOIN suppliers supplier ON supplier.id = item.supplier_id
        WHERE orders.status <> 'cancelled'
        GROUP BY supplier.id, supplier.name
        ORDER BY revenue DESC, quantity DESC, supplier.name
        LIMIT 10`
    ),
    query(
      `SELECT status, payment_status, count(*)::int AS count,
              coalesce(sum(total_amount), 0)::numeric AS amount
         FROM orders
        GROUP BY status, payment_status
        ORDER BY count(*) DESC, status, payment_status`
    ),
    query(
      `SELECT issue_type, severity, count(*)::int AS count
         FROM catalog_quality_issues
        WHERE status = 'open'
        GROUP BY issue_type, severity
        ORDER BY
          CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
          count(*) DESC`
    ),
    query(
      `SELECT item_kind, count(*)::int AS count,
              count(*) FILTER (
                WHERE jsonb_array_length(validation_errors) > 0
              )::int AS invalid_count,
              min(created_at) AS oldest_created_at
         FROM catalog_import_items
        WHERE review_status = 'pending'
        GROUP BY item_kind
        ORDER BY count(*) DESC, item_kind`
    ),
    query(
      `WITH searches AS (
         SELECT lower(trim(payload->>'query')) AS search_query,
                CASE
                  WHEN payload->>'resultCount' ~ '^[0-9]+$'
                  THEN (payload->>'resultCount')::int
                  ELSE NULL
                END AS result_count,
                session_hash,
                created_at
           FROM analytics_events
          WHERE event_type = 'search'
            AND created_at >= now() - interval '30 days'
            AND NULLIF(trim(payload->>'query'), '') IS NOT NULL
       )
       SELECT search.search_query,
              count(*)::int AS searches,
              count(*) FILTER (WHERE search.result_count = 0)::int AS zero_results,
              round(avg(search.result_count), 1) AS average_results,
              count(*) FILTER (
                WHERE EXISTS (
                  SELECT 1
                    FROM analytics_events followup
                   WHERE followup.session_hash = search.session_hash
                     AND followup.created_at >= search.created_at
                     AND followup.created_at <= search.created_at + interval '30 minutes'
                     AND followup.event_type IN ('product_view', 'add_to_cart', 'checkout_start')
                )
              )::int AS converted_searches,
              max(search.created_at) AS last_searched_at
         FROM searches search
        GROUP BY search.search_query
        ORDER BY zero_results DESC, searches DESC, search.search_query
        LIMIT 30`
    ),
    query(
      `SELECT status, created_at, table_count, record_count, checksum_sha256, details
         FROM backup_verifications
        ORDER BY created_at DESC
       LIMIT 1`
    ),
    query(
      `SELECT audit.id, audit.details, audit.created_at,
              users.name AS actor_name
         FROM audit_logs audit
         LEFT JOIN users ON users.id = audit.actor_id
        WHERE audit.entity_type = 'launch_pilot'
          AND audit.action = 'validate'
        ORDER BY audit.created_at DESC
        LIMIT 12`
    )
  ]);

  const providers = providerReadiness();
  const marketing = googleMarketingReadiness();
  const monitoring = {
    externalAlert: productionMonitorAlertReadiness(),
    scheduledWorkflow: true
  };
  const backup = backupDeliveryReadiness();
  const metricsRow = metricRows[0] || {};
  const metrics = {
    realProducts: number(metricsRow.real_products),
    eligibleProducts: number(metricsRow.eligible_products),
    licensedMediaProducts: number(metricsRow.licensed_media_products),
    eligibleOffers: number(metricsRow.eligible_offers),
    activeSuppliers: number(metricsRow.active_suppliers),
    onboardedSuppliers: number(metricsRow.onboarded_suppliers),
    healthyFeeds: number(metricsRow.healthy_feeds),
    logisticsZones: number(metricsRow.logistics_zones),
    verifiedLogisticsZones: number(metricsRow.verified_logistics_zones),
    privilegedUsers: number(metricsRow.privileged_users),
    adminsWithTwoFactor: number(metricsRow.admins_with_two_factor),
    criticalSecurityEvents: number(metricsRow.critical_security_events),
    orders: number(metricsRow.orders),
    rfqs: number(metricsRow.rfqs),
    rfqOffers: number(metricsRow.rfq_offers),
    commercialProposals: number(metricsRow.commercial_proposals),
    paidOrders: number(metricsRow.paid_orders),
    completedOrders: number(metricsRow.completed_orders),
    activeCustomers: number(metricsRow.active_customers),
    pilotEngagedCustomers: number(metricsRow.pilot_engaged_customers),
    issuedInvoices: number(metricsRow.issued_invoices),
    readyFulfillments: number(metricsRow.ready_fulfillments),
    shippedFulfillments: number(metricsRow.shipped_fulfillments),
    pendingBankTransfers: number(metricsRow.pending_bank_transfers),
    pendingPriceReviews: number(metricsRow.pending_price_reviews),
    structuredAttributeProducts: number(metricsRow.structured_attribute_products),
    sourcedProducts: number(metricsRow.sourced_products),
    activeContracts: number(metricsRow.active_contracts),
    configuredFeeds: number(metricsRow.configured_feeds),
    publishedReviews: number(metricsRow.published_reviews),
    openQualityIssues: qualityIssueRows.reduce((sum, item) => sum + number(item.count), 0),
    highQualityIssues: qualityIssueRows
      .filter((item) => ["critical", "high"].includes(item.severity))
      .reduce((sum, item) => sum + number(item.count), 0),
    pendingStagingItems: stagingRows.reduce((sum, item) => sum + number(item.count), 0),
    criticalTwoFactorEnforced: criticalAdminTwoFactorRequired()
  };
  const pilotSelections = pilotRows.map(mapPilotCandidate);
  const pilotCandidates = pilotSelections.filter((item) => item.ready);
  const latestBackup = backupVerificationRows[0] ? {
    status: backupVerificationRows[0].status,
    createdAt: backupVerificationRows[0].created_at,
    tableCount: number(backupVerificationRows[0].table_count),
    recordCount: number(backupVerificationRows[0].record_count),
    checksumSha256: backupVerificationRows[0].checksum_sha256 || "",
    restoreRehearsal: backupVerificationRows[0].details?.restoreRehearsal || null
  } : null;
  const backupVerification = backupVerificationState(latestBackup);
  const searches = searchInsightRows.map((row) => ({
    query: row.search_query,
    searches: number(row.searches),
    zeroResults: number(row.zero_results),
    averageResults: row.average_results === null ? null : Number(row.average_results),
    convertedSearches: number(row.converted_searches),
    lastSearchedAt: row.last_searched_at
  }));
  const readiness = buildLaunchReadiness({
    metrics,
    providers,
    marketing,
    backup: { ...backup, recentVerified: backupVerification.ready },
    monitoring,
    pilotCandidate: pilotCandidates[0] || null
  });
  const qualityIssues = qualityIssueRows.map((row) => ({
    type: row.issue_type,
    severity: row.severity,
    count: number(row.count)
  }));
  const staging = stagingRows.map((row) => ({
    kind: row.item_kind,
    count: number(row.count),
    invalidCount: number(row.invalid_count),
    oldestCreatedAt: row.oldest_created_at
  }));
  const releaseQueue = buildReleaseQueue({
    metrics,
    qualityIssues,
    staging,
    searches,
    providers,
    marketing,
    backup: latestBackup,
    criticalTwoFactorEnforced: metrics.criticalTwoFactorEnforced
  });
  const commercialLaunch = buildCommercialLaunchProgram({
    metrics,
    providers,
    backup: { ready: backup.ready, recentVerified: backupVerification.ready },
    monitoring,
    assortment: pilotSelections
  });
  const commercialPilot = buildCommercialPilotCenter(
    pilotWorkspaceRows.map((row) => ({
      productId: row.product_id,
      offerId: row.offer_id || null,
      sku: row.sku,
      name: row.name,
      brand: row.brand,
      category: row.category || "Digər",
      subcategory: row.subcategory || "",
      package: row.package_text || "",
      imageUrl: row.image_url || "",
      licensedImageUrl: row.licensed_image_url || "",
      sourceUrl: row.source_url || "",
      offerSourceUrl: row.offer_source_url || "",
      technicalAttributeCount: number(row.technical_attribute_count),
      supplierId: row.supplier_id || null,
      supplierName: row.supplier_name || "",
      supplierProfileReady: Boolean(row.supplier_profile_ready),
      hasActiveContract: Boolean(row.has_active_contract),
      hasLicensedMedia: Boolean(row.has_licensed_media),
      unitPrice: row.unit_price === null ? null : Number(row.unit_price),
      currency: row.currency || "AZN",
      priceStatus: row.price_status || "request",
      priceVerifiedAt: row.price_verified_at,
      stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity),
      minimumOrder: row.minimum_order === null ? null : Number(row.minimum_order),
      leadTimeDays: row.lead_time_days === null ? null : Number(row.lead_time_days)
    })),
    { verifiedLogisticsZones: metrics.verifiedLogisticsZones }
  );

  return {
    readiness,
    commercialLaunch,
    commercialPilot,
    metrics,
    providers,
    monitoring,
    providerConfiguration: providerConfigurationStatus(),
    backup: {
      ready: backup.ready,
      channel: backup.channel,
      label: backup.label,
      verification: backupVerification,
      latest: latestBackup
    },
    releaseQueue,
    marketing,
    catalogControl: {
      qualityIssues,
      staging,
      searches
    },
    suppliers: supplierRows.map((row) => ({
      id: row.id,
      name: row.name,
      website: row.website || "",
      contact: row.contact || "",
      companyId: row.company_id || null,
      taxId: row.tax_id || "",
      status: row.status,
      region: row.region || "",
      responseTime: row.response_time || "",
      productCount: number(row.product_count),
      offerCount: number(row.offer_count),
      eligibleOfferCount: number(row.eligible_offer_count),
      licensedMediaCount: number(row.licensed_media_count),
      onboarding: buildSupplierOnboarding(row)
    })).sort((left, right) =>
      Number(right.onboarding.readyForPilot) - Number(left.onboarding.readyForPilot)
      || right.onboarding.score - left.onboarding.score
      || left.name.localeCompare(right.name, "az")
    ),
    pilotCandidates,
    pilotSelections,
    pilotHistory: pilotAuditRows.map((row) => ({
      id: row.id,
      actor: row.actor_name || "Sistem",
      ready: Boolean(row.details?.ready),
      productId: row.details?.productId || "",
      sku: row.details?.sku || "",
      productName: row.details?.productName || "",
      blockerCount: number(row.details?.blockerCount),
      tariffType: row.details?.tariffType || "",
      paymentMethod: row.details?.paymentMethod || "",
      createdAt: row.created_at
    })),
    readyFulfillments: readyFulfillmentRows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      orderNumber: Number(row.order_number),
      supplierName: row.supplier_name,
      city: row.city,
      paymentStatus: row.payment_status,
      totalAmount: row.total_amount === null ? null : Number(row.total_amount),
      currency: row.currency || "AZN"
    })),
    sales: {
      windowDays: 30,
      daily: salesDailyRows.map((row) => ({
        day: row.day,
        orders: number(row.orders),
        gross: Number(row.gross || 0),
        paid: Number(row.paid || 0)
      })),
      topProducts: topProductRows.map((row) => ({
        productId: row.product_id,
        sku: row.sku,
        title: row.title,
        orderCount: number(row.order_count),
        quantity: Number(row.quantity || 0),
        revenue: Number(row.revenue || 0)
      })),
      topSuppliers: topSupplierRows.map((row) => ({
        supplierId: row.id,
        name: row.name,
        orderCount: number(row.order_count),
        quantity: Number(row.quantity || 0),
        revenue: Number(row.revenue || 0)
      })),
      statuses: orderStatusRows.map((row) => ({
        status: row.status,
        paymentStatus: row.payment_status,
        count: number(row.count),
        amount: Number(row.amount || 0)
      }))
    },
    generatedAt: new Date().toISOString()
  };
};

const loadPilotSelection = async (productId, offerId = "") => {
  const values = [productId];
  let offerFilter = "";
  if (offerId) {
    values.push(offerId);
    offerFilter = `AND offer.id = $${values.length}`;
  }
  const rows = await query(
    `SELECT product.id AS product_id, product.sku, product.name, product.brand,
            product.status AS product_status, product.package_text, product.image_url,
            offer.id AS offer_id, offer.supplier_id, supplier.name AS supplier_name,
            supplier.status AS supplier_status, offer.unit_price, offer.currency,
            offer.stock_quantity, offer.minimum_order, offer.lead_time_days,
            offer.price_status, offer.price_verified_at, offer.source_url,
            EXISTS (
              SELECT 1 FROM supplier_contracts contract
               WHERE contract.supplier_id = supplier.id
                 AND contract.status = 'active'
                 AND contract.legal_confirmed = true
                 AND contract.starts_on <= current_date
                 AND (contract.ends_on IS NULL OR contract.ends_on >= current_date)
                 AND NULLIF(trim(supplier.contact), '') IS NOT NULL
                 AND supplier.website ~ '^https://'
                 AND EXISTS (
                   SELECT 1 FROM companies company
                    WHERE company.id = supplier.company_id
                      AND company.status = 'active'
                      AND NULLIF(trim(company.tax_id), '') IS NOT NULL
                 )
                 AND EXISTS (
                   SELECT 1 FROM users supplier_user
                    WHERE supplier_user.company_id = supplier.company_id
                      AND supplier_user.role = 'supplier'
                      AND supplier_user.status = 'active'
                 )
            ) AS has_active_contract,
            EXISTS (
              SELECT 1 FROM media_assets media
               WHERE media.entity_type = 'product'
                 AND media.entity_id = product.id
                 AND media.status = 'active'
                 AND media.content_type LIKE 'image/%'
                 AND media.license_type IN ('own', 'supplier', 'official', 'licensed')
                 AND media.rights_status = 'verified'
                 AND (media.rights_expires_on IS NULL OR media.rights_expires_on >= current_date)
                 AND media.url ~ '^https://'
            ) AS has_licensed_media
       FROM products product
       LEFT JOIN product_offers offer
         ON offer.product_id = product.id
        AND offer.status = 'active'
        ${offerFilter}
       LEFT JOIN suppliers supplier ON supplier.id = offer.supplier_id
      WHERE product.id = $1
      ORDER BY
        CASE WHEN offer.price_status = 'confirmed' THEN 0 ELSE 1 END,
        offer.price_verified_at DESC NULLS LAST,
        offer.unit_price ASC NULLS LAST
      LIMIT 1`,
    values
  );
  return rows[0] || null;
};

const validatePilot = async (body) => {
  const productId = text(body.productId, { field: "Məhsul", required: true, max: 160 });
  const offerId = text(body.offerId, { max: 160 });
  const quantity = Number(String(body.quantity ?? "").replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new ApiError(400, "invalid_pilot_quantity", "Pilot miqdarı 0-dan böyük olmalıdır.");
  }
  const city = text(body.city, { field: "Şəhər", required: true, max: 160 });
  const deliveryMode = oneOf(body.deliveryMode, ["delivery", "pickup", "supplier_delivery"], "delivery", "Çatdırılma üsulu");
  const paymentMethod = oneOf(body.paymentMethod, ["invoice", "bank_transfer", "card"], "invoice", "Ödəniş üsulu");
  const selected = await loadPilotSelection(productId, offerId);
  if (!selected) throw new ApiError(404, "pilot_product_not_found", "Pilot məhsulu tapılmadı.");
  const providers = providerReadiness();
  const priceFresh = selected.price_verified_at
    && Date.now() - new Date(selected.price_verified_at).getTime() <= freshnessWindowMs;
  const availableStock = selected.stock_quantity === null ? null : Number(selected.stock_quantity);
  const unitPrice = selected.unit_price === null ? null : Number(selected.unit_price);
  const minimumOrder = selected.minimum_order === null ? null : Number(selected.minimum_order);
  const subtotal = unitPrice === null ? null : Math.round(unitPrice * quantity * 100) / 100;
  const delivery = await calculateDeliveryQuote({
    city,
    mode: deliveryMode,
    subtotal,
    itemQuantity: quantity,
    supplierCount: selected.supplier_id ? 1 : 0
  });
  const paymentReady = paymentMethod === "invoice"
    || (paymentMethod === "bank_transfer" && providers.bankTransfer)
    || (paymentMethod === "card" && providers.payment);
  const checks = [
    {
      key: "product",
      label: "Məhsul aktivdir",
      ready: selected.product_status === "active",
      required: true
    },
    {
      key: "offer",
      label: "Təchizatçı təklifi seçilib",
      ready: Boolean(selected.offer_id && selected.supplier_id && selected.supplier_status !== "Arxiv"),
      required: true
    },
    {
      key: "price",
      label: "Qiymət təsdiqlidir",
      ready: selected.price_status === "confirmed" && unitPrice !== null && unitPrice > 0,
      required: true
    },
    {
      key: "freshness",
      label: "Qiymət 30 gündən yenidir",
      ready: Boolean(priceFresh),
      required: true
    },
    {
      key: "stock",
      label: "Stok miqdarı kifayətdir",
      ready: availableStock !== null && availableStock >= quantity,
      required: true
    },
    {
      key: "minimum_order",
      label: "Minimum sifariş şərti ödənir",
      ready: minimumOrder === null || quantity >= minimumOrder,
      required: true
    },
    {
      key: "source",
      label: "Qiymət mənbəsi HTTPS-dir",
      ready: String(selected.source_url || "").startsWith("https://"),
      required: true
    },
    {
      key: "media",
      label: "Media hüququ təsdiqlidir",
      ready: Boolean(selected.has_licensed_media),
      required: true
    },
    {
      key: "contract",
      label: "Təchizatçı hüquqi profili və müqaviləsi hazırdır",
      ready: Boolean(selected.has_active_contract),
      required: true
    },
    {
      key: "logistics",
      label: deliveryMode === "pickup" ? "Təhvil üsulu hazırdır" : "Logistika zonası tapılıb",
      ready: deliveryMode === "pickup" || Boolean(delivery.zone),
      required: true
    },
    {
      key: "logistics_tariff",
      label: deliveryMode === "pickup" ? "Götürmə üçün tarif tələb olunmur" : "Logistika tarifi mənbə ilə təsdiqlidir",
      ready: deliveryMode === "pickup" || delivery.zone?.rateStatus === "verified",
      required: true
    },
    {
      key: "payment",
      label: "Seçilmiş ödəniş üsulu hazırdır",
      ready: paymentReady,
      required: true
    },
    {
      key: "invoice",
      label: "Avtomatik elektron qaimə hazırdır",
      ready: Boolean(providers.electronicInvoice),
      required: false
    }
  ];
  const ready = checks.filter((item) => item.required).every((item) => item.ready);
  return {
    ready,
    writePerformed: false,
    product: {
      id: selected.product_id,
      offerId: selected.offer_id || null,
      sku: selected.sku,
      name: selected.name,
      brand: selected.brand,
      supplierId: selected.supplier_id || null,
      supplierName: selected.supplier_name || "",
      unitPrice,
      currency: selected.currency || "AZN",
      quantity,
      availableStock,
      minimumOrder
    },
    delivery: {
      mode: deliveryMode,
      city,
      zone: delivery.zone?.name || "",
      rateStatus: delivery.zone?.rateStatus || "request",
      rateValidUntil: delivery.zone?.rateValidUntil || null,
      amount: delivery.amount,
      currency: delivery.currency,
      etaMinDays: delivery.etaMinDays,
      etaMaxDays: delivery.etaMaxDays,
      breakdown: delivery.breakdown
    },
    paymentMethod,
    subtotal,
    total: subtotal === null ? null : Math.round((subtotal + Number(delivery.amount || 0)) * 100) / 100,
    checks,
    nextUrl: ready ? `product-detail.html?product=${encodeURIComponent(selected.product_id)}` : ""
  };
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, roles);
  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, data: await loadLaunchCenter() });
  }

  assertMethod(req, ["POST"]);
  assertSameOrigin(req);
  const body = await readJson(req, 30_000);
  const action = oneOf(body.action, ["validate-pilot", "run-daily-checks"], "validate-pilot", "Əməliyyat");
  if (action === "validate-pilot") {
    const result = await validatePilot(body);
    await recordAudit({
      actorId: user.id,
      action: "validate",
      entityType: "launch_pilot",
      entityId: result.product.id,
      details: {
        productId: result.product.id,
        offerId: result.product.offerId,
        sku: result.product.sku,
        productName: result.product.name,
        ready: result.ready,
        blockerCount: result.checks.filter((item) => item.required && !item.ready).length,
        tariffType: result.delivery.breakdown?.tariffType || "",
        paymentMethod: result.paymentMethod,
        writePerformed: false
      }
    });
    return sendJson(res, 200, { ok: true, data: result });
  }
  if (action === "run-daily-checks") {
    assertCriticalTwoFactor(user);
    const [prices, quality] = await Promise.all([
      runPriceFreshnessScan({ actorId: user.id, notify: true }),
      runCatalogQualityScan({ probeLinks: false, linkLimit: 0 })
    ]);
    const reminders = await remindDuePriceReviews();
    const result = { prices, reminders, quality };
    await recordAudit({ actorId: user.id, action: "daily_checks", entityType: "launch_operations", details: result });
    return sendJson(res, 200, { ok: true, data: { run: result, launch: await loadLaunchCenter() } });
  }
  throw new ApiError(400, "invalid_launch_action", "Buraxılış əməliyyatı dəstəklənmir.");
});
