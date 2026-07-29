import { requireRole } from "../_lib/auth.js";
import { backupReadiness } from "../_lib/cloud-backup.js";
import { query } from "../_lib/db.js";
import { assertMethod, sendJson, withApiErrors } from "../_lib/http.js";
import { providerReadiness } from "../_lib/provider-adapters.js";
import { loadSupplierPerformance } from "../_lib/supplier-performance.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  await requireRole(req, ["super_admin", "admin", "sales"]);
  const [
    countsRows,
    priceRows,
    rfqRows,
    tenderRows,
    entityRows,
    categoryRows,
    auditRows,
    qualityRows,
    qualityItemRows,
    offerQualityRows,
    funnelRows,
    dailyRows,
    trustRows,
    supplierPerformance
  ] = await Promise.all([
    query(`SELECT
      (SELECT count(*) FROM users WHERE status = 'active')::int AS users,
      (SELECT count(*) FROM products WHERE status = 'active')::int AS products,
      (SELECT count(*) FROM suppliers WHERE status <> 'Arxiv')::int AS suppliers,
      (SELECT count(*) FROM categories WHERE active = true AND parent_id IS NULL)::int AS categories,
      (SELECT count(*) FROM categories WHERE active = true AND parent_id IS NOT NULL)::int AS subcategories,
      (SELECT count(*) FROM rfqs)::int AS rfqs,
      (SELECT count(*) FROM offers)::int AS offers,
      (SELECT count(*) FROM product_offers WHERE status = 'active')::int AS product_offers,
      (SELECT count(*) FROM orders)::int AS orders,
      (SELECT count(*) FROM procurement_requests WHERE status = 'pending')::int AS pending_procurement,
      (SELECT count(*) FROM logistics_zones WHERE active = true)::int AS logistics_zones,
      (SELECT count(*) FROM tenders)::int AS tenders,
      (SELECT count(*) FROM tender_bids)::int AS tender_bids,
      (SELECT count(*) FROM crm_leads)::int AS crm_leads,
      (SELECT count(*) FROM rental_bookings WHERE status NOT IN ('completed', 'cancelled'))::int AS active_rental_bookings,
      (SELECT count(*) FROM payment_transactions WHERE status IN ('pending', 'requires_action'))::int AS pending_payments,
      (SELECT count(*) FROM media_assets WHERE status = 'active')::int AS media,
      (SELECT count(*) FROM import_jobs)::int AS imports,
      (SELECT count(*) FROM supplier_applications WHERE status = 'pending')::int AS pending_supplier_applications,
      (SELECT count(*) FROM price_review_requests WHERE status = 'pending')::int AS pending_price_reviews,
      (SELECT count(*) FROM notifications WHERE status IN ('pending', 'failed'))::int AS pending_notifications,
      (SELECT count(*) FROM support_cases WHERE status NOT IN ('resolved', 'rejected', 'closed'))::int AS open_support_cases,
      (SELECT count(*) FROM marketplace_reviews WHERE status = 'pending')::int AS pending_reviews,
      (SELECT count(*) FROM refund_transactions WHERE status IN ('pending', 'processing'))::int AS pending_refunds`),
    query(`SELECT price_status AS status, count(*)::int AS count
             FROM products WHERE status = 'active' GROUP BY price_status ORDER BY price_status`),
    query(`SELECT status, count(*)::int AS count FROM rfqs GROUP BY status ORDER BY count(*) DESC`),
    query(`SELECT status, count(*)::int AS count FROM tenders GROUP BY status ORDER BY count(*) DESC`),
    query(`SELECT entity_kind AS kind, count(*)::int AS count
             FROM marketplace_entities WHERE status = 'active' GROUP BY entity_kind ORDER BY entity_kind`),
    query(`SELECT c.id, c.title, count(p.id)::int AS product_count
             FROM categories c
             LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
            WHERE c.active = true AND c.parent_id IS NULL AND c.kind = 'material'
            GROUP BY c.id, c.title ORDER BY count(p.id) DESC, c.title LIMIT 10`),
    query(`SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
                  u.name AS actor_name
             FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
            ORDER BY a.created_at DESC LIMIT 12`),
    query(`WITH classified_products AS (
      SELECT p.*,
        (
          lower(trim(coalesce(p.brand, ''))) = 'constera sorğu'
          OR lower(p.name) LIKE '%məhsul qrupu%'
          OR upper(p.sku) LIKE '%RFQ%'
        ) AS is_request_group
      FROM products p
      WHERE p.status = 'active'
    )
    SELECT
      count(*)::int AS all_total,
      count(*) FILTER (WHERE NOT p.is_request_group)::int AS total,
      count(*) FILTER (WHERE p.is_request_group)::int AS request_groups,
      count(*) FILTER (
        WHERE NOT p.is_request_group
          AND NULLIF(trim(coalesce(p.image_url, '')), '') IS NULL
      )::int AS missing_image,
      count(*) FILTER (
        WHERE NOT p.is_request_group
          AND NULLIF(trim(coalesce(p.source_url, '')), '') IS NULL
      )::int AS missing_source,
      count(*) FILTER (
        WHERE NOT p.is_request_group
          AND CASE
            WHEN jsonb_typeof(coalesce(p.specs, '[]'::jsonb)) = 'array'
              THEN jsonb_array_length(coalesce(p.specs, '[]'::jsonb)) < 2
            ELSE true
          END
      )::int AS missing_specs,
      count(*) FILTER (
        WHERE NOT p.is_request_group
          AND NULLIF(trim(coalesce(p.brand, '')), '') IS NULL
      )::int AS missing_brand,
      count(*) FILTER (
        WHERE NOT p.is_request_group AND lower(trim(p.brand)) = 'brendsiz'
      )::int AS brandless_listings,
      count(*) FILTER (
        WHERE NOT p.is_request_group
          AND (
            p.category_id IS NULL OR NOT EXISTS (
              SELECT 1 FROM categories c WHERE c.id = p.category_id AND c.active = true
            )
          )
      )::int AS missing_category,
      count(*) FILTER (
        WHERE NOT p.is_request_group
          AND p.price_status = 'confirmed'
          AND (p.price_verified_at IS NULL OR p.price_verified_at < now() - interval '30 days')
      )::int AS stale_price,
      count(*) FILTER (
        WHERE NOT p.is_request_group AND p.price_status = 'expired'
      )::int AS expired_price,
      count(*) FILTER (
        WHERE NOT p.is_request_group
          AND (
            p.stock_quantity IS NULL
            OR NULLIF(trim(coalesce(p.availability, '')), '') IS NULL
            OR lower(trim(p.availability)) IN ('stok sorğu ilə', 'sorğu əsasında', 'məlum deyil')
          )
      )::int AS unknown_stock,
      (
        SELECT coalesce(sum(duplicate_group.product_count), 0)::int
        FROM (
          SELECT count(*)::int AS product_count
          FROM classified_products duplicate_product
          WHERE NOT duplicate_product.is_request_group
          GROUP BY lower(trim(duplicate_product.name)), lower(trim(duplicate_product.brand))
          HAVING count(*) > 1
        ) duplicate_group
      ) AS duplicate_names
    FROM classified_products p`),
    query(`WITH classified_products AS (
      SELECT p.*,
        (
          lower(trim(coalesce(p.brand, ''))) = 'constera sorğu'
          OR lower(p.name) LIKE '%məhsul qrupu%'
          OR upper(p.sku) LIKE '%RFQ%'
        ) AS is_request_group
      FROM products p
      WHERE p.status = 'active'
    ), duplicate_products AS (
      SELECT lower(trim(name)) AS name_key, lower(trim(brand)) AS brand_key
      FROM classified_products
      WHERE NOT is_request_group
      GROUP BY lower(trim(name)), lower(trim(brand))
      HAVING count(*) > 1
    ), quality_base AS (
      SELECT
        p.id,
        p.sku,
        p.name,
        p.brand,
        p.price_status,
        p.price_verified_at,
        p.updated_at,
        NULLIF(trim(coalesce(p.image_url, '')), '') IS NULL AS missing_image,
        NULLIF(trim(coalesce(p.source_url, '')), '') IS NULL AS missing_source,
        CASE
          WHEN jsonb_typeof(coalesce(p.specs, '[]'::jsonb)) = 'array'
            THEN jsonb_array_length(coalesce(p.specs, '[]'::jsonb)) < 2
          ELSE true
        END AS missing_specs,
        NULLIF(trim(coalesce(p.brand, '')), '') IS NULL AS missing_brand,
        p.category_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM categories c WHERE c.id = p.category_id AND c.active = true
        ) AS missing_category,
        p.price_status = 'confirmed'
          AND (p.price_verified_at IS NULL OR p.price_verified_at < now() - interval '30 days') AS stale_price,
        p.price_status = 'expired' AS expired_price,
        p.stock_quantity IS NULL
          OR NULLIF(trim(coalesce(p.availability, '')), '') IS NULL
          OR lower(trim(p.availability)) IN ('stok sorğu ilə', 'sorğu əsasında', 'məlum deyil') AS unknown_stock,
        duplicate_products.name_key IS NOT NULL AS duplicate_name
      FROM classified_products p
      LEFT JOIN duplicate_products
        ON duplicate_products.name_key = lower(trim(p.name))
       AND duplicate_products.brand_key = lower(trim(p.brand))
      WHERE NOT p.is_request_group
    )
    SELECT *,
      (
        missing_image::int * 3 +
        missing_source::int * 3 +
        missing_specs::int * 2 +
        missing_brand::int * 2 +
        missing_category::int * 3 +
        stale_price::int * 2 +
        expired_price::int * 2 +
        unknown_stock::int +
        duplicate_name::int
      )::int AS issue_score
    FROM quality_base
    WHERE missing_image OR missing_source OR missing_specs OR missing_brand OR missing_category
       OR stale_price OR expired_price OR unknown_stock OR duplicate_name
    ORDER BY issue_score DESC, updated_at ASC
    LIMIT 32`),
    query(`SELECT
      count(*) FILTER (WHERE offer.status = 'active')::int AS total,
      count(*) FILTER (
        WHERE offer.status = 'active'
          AND NULLIF(trim(coalesce(offer.source_url, '')), '') IS NULL
      )::int AS missing_source,
      count(*) FILTER (
        WHERE offer.status = 'active'
          AND offer.price_status = 'confirmed'
          AND (offer.price_verified_at IS NULL OR offer.price_verified_at < now() - interval '30 days')
      )::int AS stale_price,
      count(*) FILTER (
        WHERE offer.status = 'active' AND offer.stock_quantity IS NULL
      )::int AS unknown_stock,
      count(*) FILTER (
        WHERE offer.status = 'active'
          AND offer.price_status = 'confirmed'
          AND (offer.unit_price IS NULL OR offer.unit_price < 0)
      )::int AS invalid_price,
      (
        SELECT count(*)::int
        FROM products product
        WHERE product.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM product_offers active_offer
            WHERE active_offer.product_id = product.id
              AND active_offer.status = 'active'
          )
      ) AS products_without_offers
    FROM product_offers offer`),
    query(
      `SELECT event_type, count(*)::int AS events,
              count(DISTINCT visitor_hash)::int AS visitors,
              count(DISTINCT session_hash)::int AS sessions
         FROM analytics_events
        WHERE created_at >= now() - interval '30 days'
        GROUP BY event_type`
    ),
    query(
      `WITH days AS (
         SELECT generate_series(current_date - interval '13 days', current_date, interval '1 day')::date AS day
       ),
       event_daily AS (
         SELECT created_at::date AS day, count(*)::int AS events,
                count(DISTINCT session_hash)::int AS sessions
           FROM analytics_events
          WHERE created_at >= current_date - interval '13 days'
          GROUP BY created_at::date
       ),
       order_daily AS (
         SELECT created_at::date AS day, count(*)::int AS orders
           FROM orders
          WHERE created_at >= current_date - interval '13 days'
          GROUP BY created_at::date
       ),
       rfq_daily AS (
         SELECT created_at::date AS day, count(*)::int AS rfqs
           FROM rfqs
          WHERE created_at >= current_date - interval '13 days'
          GROUP BY created_at::date
       )
       SELECT days.day, coalesce(event_daily.events, 0)::int AS events,
              coalesce(event_daily.sessions, 0)::int AS sessions,
              coalesce(order_daily.orders, 0)::int AS orders,
              coalesce(rfq_daily.rfqs, 0)::int AS rfqs
         FROM days
         LEFT JOIN event_daily USING (day)
         LEFT JOIN order_daily USING (day)
         LEFT JOIN rfq_daily USING (day)
        ORDER BY days.day`
    ),
    query(
      `SELECT
        (SELECT count(*) FROM support_cases)::int AS support_total,
        (SELECT count(*) FROM support_cases WHERE status NOT IN ('resolved', 'rejected', 'closed'))::int AS support_open,
        (SELECT count(*) FROM support_cases WHERE case_type = 'return')::int AS returns,
        (SELECT count(*) FROM support_cases WHERE case_type = 'dispute')::int AS disputes,
        (SELECT count(*) FROM refund_transactions WHERE status = 'completed')::int AS refunds_completed,
        (SELECT coalesce(sum(amount), 0) FROM refund_transactions WHERE status = 'completed')::numeric AS refunded_amount,
        (SELECT count(*) FROM marketplace_reviews WHERE status = 'published')::int AS reviews_published,
        (SELECT count(*) FROM marketplace_reviews WHERE status = 'pending')::int AS reviews_pending,
        (SELECT coalesce(round(avg(rating)::numeric, 1), 0) FROM marketplace_reviews WHERE status = 'published') AS review_average`
    ),
    loadSupplierPerformance()
  ]);
  const counts = countsRows[0] || {};
  const qualityRow = qualityRows[0] || {};
  const offerQualityRow = offerQualityRows[0] || {};
  const qualitySummary = {
    allTotal: Number(qualityRow.all_total || 0),
    total: Number(qualityRow.total || 0),
    requestGroups: Number(qualityRow.request_groups || 0),
    missingImage: Number(qualityRow.missing_image || 0),
    missingSource: Number(qualityRow.missing_source || 0),
    missingSpecs: Number(qualityRow.missing_specs || 0),
    missingBrand: Number(qualityRow.missing_brand || 0),
    brandlessListings: Number(qualityRow.brandless_listings || 0),
    missingCategory: Number(qualityRow.missing_category || 0),
    stalePrice: Number(qualityRow.stale_price || 0),
    expiredPrice: Number(qualityRow.expired_price || 0),
    unknownStock: Number(qualityRow.unknown_stock || 0),
    duplicateNames: Number(qualityRow.duplicate_names || 0),
    offerTotal: Number(offerQualityRow.total || 0),
    offerMissingSource: Number(offerQualityRow.missing_source || 0),
    offerStalePrice: Number(offerQualityRow.stale_price || 0),
    offerUnknownStock: Number(offerQualityRow.unknown_stock || 0),
    offerInvalidPrice: Number(offerQualityRow.invalid_price || 0),
    productsWithoutOffers: Number(offerQualityRow.products_without_offers || 0)
  };
  const completenessMaximum = qualitySummary.total * 5 + qualitySummary.offerTotal * 3;
  const completenessMissing = qualitySummary.missingImage
    + qualitySummary.missingSource
    + qualitySummary.missingSpecs
    + qualitySummary.missingBrand
    + qualitySummary.missingCategory
    + qualitySummary.offerMissingSource
    + qualitySummary.offerStalePrice
    + qualitySummary.offerUnknownStock;
  const qualityScore = completenessMaximum
    ? Math.max(0, Math.round(((completenessMaximum - completenessMissing) / completenessMaximum) * 100))
    : 100;

  return sendJson(res, 200, {
    ok: true,
    data: {
      counts,
      prices: priceRows,
      rfqs: rfqRows,
      tenders: tenderRows,
      entities: entityRows,
      topCategories: categoryRows.map((item) => ({
        id: String(item.id).replace(/^material:/, ""),
        title: item.title,
        productCount: item.product_count
      })),
      quality: {
        score: qualityScore,
        summary: qualitySummary,
        items: qualityItemRows.map((item) => {
          const issues = [];
          if (item.missing_image) issues.push("Real foto yoxdur");
          if (item.missing_source) issues.push("Mənbə URL-i yoxdur");
          if (item.missing_specs) issues.push("Texniki məlumat azdır");
          if (item.missing_brand) issues.push("Brend göstərilməyib");
          if (item.missing_category) issues.push("Kateqoriya düzgün deyil");
          if (item.stale_price) issues.push("Qiymət 30 gündən köhnədir");
          if (item.expired_price) issues.push("Qiymətin vaxtı keçib");
          if (item.unknown_stock) issues.push("Stok dəqiqləşdirilməyib");
          if (item.duplicate_name) issues.push("Eyni adlı məhsul təkrarlanır");
          return {
            id: item.id,
            sku: item.sku,
            name: item.name,
            brand: item.brand,
            priceStatus: item.price_status,
            priceVerifiedAt: item.price_verified_at,
            updatedAt: item.updated_at,
            issueScore: Number(item.issue_score || 0),
            issues
          };
        })
      },
      funnel: {
        windowDays: 30,
        stages: funnelRows.map((item) => ({
          eventType: item.event_type,
          events: Number(item.events || 0),
          visitors: Number(item.visitors || 0),
          sessions: Number(item.sessions || 0)
        })),
        daily: dailyRows.map((item) => ({
          day: item.day,
          events: Number(item.events || 0),
          sessions: Number(item.sessions || 0),
          orders: Number(item.orders || 0),
          rfqs: Number(item.rfqs || 0)
        }))
      },
      trust: {
        supportTotal: Number(trustRows[0]?.support_total || 0),
        supportOpen: Number(trustRows[0]?.support_open || 0),
        returns: Number(trustRows[0]?.returns || 0),
        disputes: Number(trustRows[0]?.disputes || 0),
        refundsCompleted: Number(trustRows[0]?.refunds_completed || 0),
        refundedAmount: Number(trustRows[0]?.refunded_amount || 0),
        reviewsPublished: Number(trustRows[0]?.reviews_published || 0),
        reviewsPending: Number(trustRows[0]?.reviews_pending || 0),
        reviewAverage: Number(trustRows[0]?.review_average || 0)
      },
      supplierPerformance: supplierPerformance.slice(0, 20),
      recentActivity: auditRows,
      integrations: {
        database: true,
        blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
        emailWebhook: Boolean(process.env.EMAIL_WEBHOOK_URL),
        whatsappWebhook: Boolean(process.env.WHATSAPP_WEBHOOK_URL),
        payment: providerReadiness().payment,
        electronicInvoice: providerReadiness().electronicInvoice,
        aiEstimate: providerReadiness().aiEstimate,
        scheduledBackup: backupReadiness()
      },
      generatedAt: new Date().toISOString()
    }
  });
});
