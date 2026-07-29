import { query } from "./db.js";

const percent = (part, total, fallback = 70) => total > 0 ? Math.round((part / total) * 100) : fallback;
const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));
const gradeFor = (score) => score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : "D";

const mapScorecard = (row) => {
  const offers = Number(row.active_offers || 0);
  const dataQuality = offers
    ? Math.round((
      percent(Number(row.sourced_offers || 0), offers, 0)
      + percent(Number(row.fresh_offers || 0), offers, 0)
      + percent(Number(row.stocked_offers || 0), offers, 0)
    ) / 3)
    : 0;
  const purchaseOrders = Number(row.purchase_orders || 0);
  const delivered = Number(row.delivered_orders || 0);
  const acceptance = percent(purchaseOrders - Number(row.cancelled_orders || 0), purchaseOrders);
  const onTime = percent(Number(row.on_time_orders || 0), delivered);
  const averageAcceptanceHours = row.average_acceptance_hours === null ? null : Number(row.average_acceptance_hours);
  const response = averageAcceptanceHours === null ? 70
    : averageAcceptanceHours <= 4 ? 100
      : averageAcceptanceHours <= 24 ? 85
        : averageAcceptanceHours <= 48 ? 65 : 40;
  const reviewCount = Number(row.review_count || 0);
  const reviewAverage = Number(row.review_average || 0);
  const reviewScore = reviewCount ? (reviewAverage / 5) * 100 : 70;
  const score = clamp(dataQuality * 0.3 + acceptance * 0.2 + onTime * 0.2 + response * 0.15 + reviewScore * 0.15);
  const recommendations = [];
  if (dataQuality < 80) recommendations.push("Qiymət mənbəsi, stok və təsdiq tarixlərini yenilə.");
  if (acceptance < 85) recommendations.push("Ləğv edilən alt-sifarişlərin səbəbini azalt.");
  if (onTime < 85) recommendations.push("Təslimat müddətini daha real planlaşdır.");
  if (response < 80) recommendations.push("Yeni sifarişləri 24 saat ərzində qəbul et.");
  if (!reviewCount) recommendations.push("Tamamlanmış sifarişlərdən yoxlanılmış rəy topla.");
  return {
    supplierId: row.id,
    supplier: row.name,
    region: row.region || "",
    score,
    grade: gradeFor(score),
    metrics: {
      dataQuality,
      acceptance,
      onTime,
      response,
      reviewScore: clamp(reviewScore),
      activeOffers: offers,
      freshOffers: Number(row.fresh_offers || 0),
      purchaseOrders,
      deliveredOrders: delivered,
      cancelledOrders: Number(row.cancelled_orders || 0),
      averageAcceptanceHours,
      averageDeliveryDays: row.average_delivery_days === null ? null : Number(row.average_delivery_days),
      reviewAverage,
      reviewCount,
      openQualityIssues: Number(row.open_quality_issues || 0)
    },
    recommendations
  };
};

export const loadSupplierPerformance = async ({ companyId = "", supplierId = "" } = {}) => {
  const values = [];
  const where = ["supplier.status <> 'Arxiv'"];
  if (companyId) {
    values.push(companyId);
    where.push(`supplier.company_id = $${values.length}`);
  }
  if (supplierId) {
    values.push(supplierId);
    where.push(`supplier.id = $${values.length}`);
  }
  const rows = await query(
    `SELECT supplier.id, supplier.name, supplier.region,
            count(DISTINCT offer.id) FILTER (WHERE offer.status = 'active')::int AS active_offers,
            count(DISTINCT offer.id) FILTER (
              WHERE offer.status = 'active' AND NULLIF(offer.source_url, '') IS NOT NULL
            )::int AS sourced_offers,
            count(DISTINCT offer.id) FILTER (
              WHERE offer.status = 'active'
                AND offer.price_status = 'confirmed'
                AND offer.price_verified_at >= now() - interval '30 days'
            )::int AS fresh_offers,
            count(DISTINCT offer.id) FILTER (
              WHERE offer.status = 'active' AND offer.stock_quantity IS NOT NULL
            )::int AS stocked_offers,
            count(DISTINCT purchase_order.id)::int AS purchase_orders,
            count(DISTINCT purchase_order.id) FILTER (WHERE purchase_order.status = 'cancelled')::int AS cancelled_orders,
            count(DISTINCT purchase_order.id) FILTER (WHERE purchase_order.status = 'delivered')::int AS delivered_orders,
            count(DISTINCT purchase_order.id) FILTER (
              WHERE purchase_order.status = 'delivered'
                AND fulfillment.delivered_at IS NOT NULL
                AND purchase_order.lead_time_days IS NOT NULL
                AND fulfillment.delivered_at <= purchase_order.issued_at
                  + (purchase_order.lead_time_days::text || ' days')::interval
            )::int AS on_time_orders,
            round((avg(EXTRACT(epoch FROM (fulfillment.accepted_at - fulfillment.created_at)) / 3600)
              FILTER (WHERE fulfillment.accepted_at IS NOT NULL))::numeric, 1) AS average_acceptance_hours,
            round((avg(EXTRACT(epoch FROM (fulfillment.delivered_at - fulfillment.created_at)) / 86400)
              FILTER (WHERE fulfillment.delivered_at IS NOT NULL))::numeric, 1) AS average_delivery_days,
            coalesce(round(avg(review.rating)::numeric, 1), 0) AS review_average,
            count(DISTINCT review.id)::int AS review_count,
            count(DISTINCT quality.id) FILTER (WHERE quality.status = 'open')::int AS open_quality_issues
       FROM suppliers supplier
       LEFT JOIN product_offers offer ON offer.supplier_id = supplier.id
       LEFT JOIN supplier_purchase_orders purchase_order ON purchase_order.supplier_id = supplier.id
       LEFT JOIN order_fulfillments fulfillment ON fulfillment.id = purchase_order.fulfillment_id
       LEFT JOIN marketplace_reviews review
         ON review.target_type = 'supplier' AND review.target_id = supplier.id
        AND review.status = 'published'
       LEFT JOIN catalog_quality_issues quality
         ON quality.entity_type = 'product_offer' AND quality.entity_id = offer.id
      WHERE ${where.join(" AND ")}
      GROUP BY supplier.id, supplier.name, supplier.region
      ORDER BY supplier.name`,
    values
  );
  return rows.map(mapScorecard).sort((left, right) => right.score - left.score || left.supplier.localeCompare(right.supplier, "az"));
};
