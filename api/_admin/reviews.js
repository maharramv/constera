import { randomUUID } from "node:crypto";
import { getSessionUser, requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { oneOf, parseLimit, safeMediaUrl, text } from "../_lib/validation.js";

const targetTypes = ["product", "supplier", "service", "package", "rental"];
const adminRoles = ["super_admin", "admin", "sales"];

const mapReview = (row) => ({
  id: row.id,
  customerId: row.customer_id,
  customerName: row.customer_name || "Təsdiqlənmiş müştəri",
  targetType: row.target_type,
  targetId: row.target_id,
  targetName: row.target_name || "",
  sourceType: row.source_type,
  sourceId: row.source_id,
  rating: Number(row.rating),
  title: row.title,
  body: row.body,
  mediaUrls: Array.isArray(row.media_urls) ? row.media_urls : [],
  verified: Boolean(row.verified),
  status: row.status,
  moderationNote: row.moderation_note || "",
  supplierResponse: row.supplier_response || "",
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const reviewSelect = `
  review.*,
  customer.name AS customer_name,
  CASE review.target_type
    WHEN 'product' THEN (SELECT product.name FROM products product WHERE product.id = review.target_id)
    WHEN 'supplier' THEN (SELECT supplier.name FROM suppliers supplier WHERE supplier.id = review.target_id)
    ELSE (SELECT entity.title FROM marketplace_entities entity WHERE entity.id = review.target_id)
  END AS target_name
`;

const loadTarget = async (targetType, targetId) => {
  if (targetType === "product") {
    const rows = await query("SELECT id, name AS title FROM products WHERE id = $1 AND status = 'active' LIMIT 1", [targetId]);
    return rows[0] || null;
  }
  if (targetType === "supplier") {
    const rows = await query("SELECT id, name AS title FROM suppliers WHERE id = $1 AND status <> 'Arxiv' LIMIT 1", [targetId]);
    return rows[0] || null;
  }
  const rows = await query(
    `SELECT id, title FROM marketplace_entities
      WHERE id = $1 AND entity_kind = $2 AND status = 'active' LIMIT 1`,
    [targetId, targetType]
  );
  return rows[0] || null;
};

const loadEligibility = async (customerId, targetType, targetId) => {
  if (!customerId) return [];
  if (targetType === "rental") {
    const rows = await query(
      `SELECT booking.id, 'rental_booking' AS source_type,
              booking.rental_title AS source_label, booking.updated_at
         FROM rental_bookings booking
        WHERE booking.customer_id = $1
          AND booking.rental_id = $2
          AND booking.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM marketplace_reviews review
            WHERE review.customer_id = $1
              AND review.target_type = 'rental'
              AND review.target_id = $2
              AND review.source_type = 'rental_booking'
              AND review.source_id = booking.id
          )
        ORDER BY booking.updated_at DESC LIMIT 20`,
      [customerId, targetId]
    );
    return rows.map((row) => ({
      sourceType: row.source_type,
      sourceId: row.id,
      sourceLabel: row.source_label,
      completedAt: row.updated_at
    }));
  }

  const targetCondition = targetType === "product"
    ? "item.product_id = $2"
    : targetType === "supplier"
      ? "item.supplier_id = $2"
      : `EXISTS (
          SELECT 1 FROM rfq_items requested
          WHERE requested.rfq_id = orders.rfq_id
            AND requested.item_kind = $3
            AND requested.item_id = $2
        )`;
  const values = targetType === "product" || targetType === "supplier"
    ? [customerId, targetId]
    : [customerId, targetId, targetType];
  const rows = await query(
    `SELECT DISTINCT orders.id, orders.order_number, orders.updated_at
       FROM orders
       JOIN order_items item ON item.order_id = orders.id
      WHERE orders.customer_id = $1
        AND orders.status = 'completed'
        AND ${targetCondition}
        AND NOT EXISTS (
          SELECT 1 FROM marketplace_reviews review
          WHERE review.customer_id = $1
            AND review.target_type = '${targetType}'
            AND review.target_id = $2
            AND review.source_type = 'order'
            AND review.source_id = orders.id
        )
      ORDER BY orders.updated_at DESC LIMIT 20`,
    values
  );
  return rows.map((row) => ({
    sourceType: "order",
    sourceId: row.id,
    sourceLabel: `Sifariş #${Number(row.order_number)}`,
    completedAt: row.updated_at
  }));
};

const parseMediaUrls = (value) => {
  const items = Array.isArray(value) ? value : String(value || "").split(/\r?\n|;/);
  return [...new Set(items.map((item) => safeMediaUrl(item)).filter(Boolean))].slice(0, 3);
};

const canSupplierRespond = async (user, review) => {
  if (!user.companyId || user.role !== "supplier") return false;
  if (review.target_type === "supplier") {
    const rows = await query("SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2 LIMIT 1", [review.target_id, user.companyId]);
    return Boolean(rows[0]);
  }
  if (review.target_type === "product") {
    const rows = await query(
      `SELECT 1 FROM products product
       JOIN suppliers supplier ON supplier.id = product.supplier_id
       WHERE product.id = $1 AND supplier.company_id = $2 LIMIT 1`,
      [review.target_id, user.companyId]
    );
    return Boolean(rows[0]);
  }
  const rows = await query(
    `SELECT 1
       FROM marketplace_entities entity
       JOIN suppliers supplier ON supplier.id = entity.extra_data->>'supplierId'
      WHERE entity.id = $1 AND supplier.company_id = $2 LIMIT 1`,
    [review.target_id, user.companyId]
  );
  return Boolean(rows[0]);
};

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const scope = text(req.query.scope, { max: 30 });
    if (scope === "moderation") {
      await requireRole(req, adminRoles);
      const rows = await query(
        `SELECT ${reviewSelect}
           FROM marketplace_reviews review
           JOIN users customer ON customer.id = review.customer_id
          WHERE review.status = 'pending'
          ORDER BY review.created_at ASC
          LIMIT $1`,
        [parseLimit(req.query.limit, 100, 500)]
      );
      return sendJson(res, 200, { ok: true, data: { reviews: rows.map(mapReview) } });
    }
    if (scope === "mine") {
      const user = await requireRole(req);
      const rows = await query(
        `SELECT ${reviewSelect}
           FROM marketplace_reviews review
           JOIN users customer ON customer.id = review.customer_id
          WHERE review.customer_id = $1
          ORDER BY review.created_at DESC LIMIT $2`,
        [user.id, parseLimit(req.query.limit, 100, 500)]
      );
      return sendJson(res, 200, { ok: true, data: { reviews: rows.map(mapReview) } });
    }

    const targetType = oneOf(req.query.targetType, targetTypes, "product", "Rəy obyekti");
    const targetId = text(req.query.targetId, { field: "Obyekt ID-si", required: true, max: 160 });
    const target = await loadTarget(targetType, targetId);
    if (!target) throw new ApiError(404, "review_target_not_found", "Rəy obyekti tapılmadı.");
    const [reviews, statsRows] = await Promise.all([
      query(
        `SELECT ${reviewSelect}
           FROM marketplace_reviews review
           JOIN users customer ON customer.id = review.customer_id
          WHERE review.target_type = $1 AND review.target_id = $2
            AND review.status = 'published'
          ORDER BY review.created_at DESC LIMIT $3`,
        [targetType, targetId, parseLimit(req.query.limit, 30, 100)]
      ),
      query(
        `SELECT count(*)::int AS count, coalesce(round(avg(rating)::numeric, 1), 0) AS average,
                count(*) FILTER (WHERE verified = true)::int AS verified
           FROM marketplace_reviews
          WHERE target_type = $1 AND target_id = $2 AND status = 'published'`,
        [targetType, targetId]
      )
    ]);
    const user = await getSessionUser(req);
    const eligibility = user?.role === "customer" ? await loadEligibility(user.id, targetType, targetId) : [];
    const stats = statsRows[0] || {};
    return sendJson(res, 200, {
      ok: true,
      data: {
        target: { type: targetType, id: targetId, title: target.title },
        summary: {
          count: Number(stats.count || 0),
          average: Number(stats.average || 0),
          verified: Number(stats.verified || 0)
        },
        reviews: reviews.map(mapReview),
        eligibility
      }
    });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 80_000);

  if (req.method === "POST") {
    const user = await requireRole(req, ["customer"]);
    const targetType = oneOf(body.targetType, targetTypes, "product", "Rəy obyekti");
    const targetId = text(body.targetId, { field: "Obyekt ID-si", required: true, max: 160 });
    const sourceType = oneOf(body.sourceType, ["order", "rental_booking"], "order", "Mənbə tipi");
    const sourceId = text(body.sourceId, { field: "Sifariş mənbəyi", required: true, max: 160 });
    const target = await loadTarget(targetType, targetId);
    if (!target) throw new ApiError(404, "review_target_not_found", "Rəy obyekti tapılmadı.");
    const eligible = await loadEligibility(user.id, targetType, targetId);
    if (!eligible.some((item) => item.sourceType === sourceType && item.sourceId === sourceId)) {
      throw new ApiError(403, "verified_source_required", "Rəy yalnız tamamlanmış real sifarişdən sonra yazıla bilər.");
    }
    const rating = Math.round(Number(body.rating));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new ApiError(400, "validation_error", "Reytinq 1-5 aralığında olmalıdır.");
    }
    const id = `rev-${randomUUID()}`;
    const rows = await query(
      `INSERT INTO marketplace_reviews (
         id, customer_id, target_type, target_id, source_type, source_id,
         rating, title, body, media_urls, verified
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, true)
       RETURNING *`,
      [
        id, user.id, targetType, targetId, sourceType, sourceId, rating,
        text(body.title, { field: "Rəy başlığı", required: true, min: 3, max: 160 }),
        text(body.body, { field: "Rəy mətni", required: true, min: 10, max: 3_000 }),
        JSON.stringify(parseMediaUrls(body.mediaUrls))
      ]
    );
    const admins = await query("SELECT id FROM users WHERE role IN ('super_admin', 'admin') AND status = 'active'");
    await Promise.allSettled(admins.map((admin) => queueNotification({
      userId: admin.id,
      subject: "Yeni yoxlanılmış rəy",
      body: `${target.title} üçün ${rating}/5 rəy moderasiya gözləyir.`,
      templateKey: "review_pending",
      payload: { reviewId: id, targetType, targetId }
    })));
    await recordAudit({ actorId: user.id, action: "create", entityType: "marketplace_review", entityId: id, details: { targetType, targetId, rating } });
    return sendJson(res, 201, { ok: true, data: mapReview({ ...rows[0], customer_name: user.name, target_name: target.title }) });
  }

  const user = await requireRole(req);
  const id = text(body.id, { field: "Rəy ID-si", required: true, max: 160 });
  const currentRows = await query(
    `SELECT ${reviewSelect}
       FROM marketplace_reviews review
       JOIN users customer ON customer.id = review.customer_id
      WHERE review.id = $1 LIMIT 1`,
    [id]
  );
  const current = currentRows[0];
  if (!current) throw new ApiError(404, "review_not_found", "Rəy tapılmadı.");
  const action = oneOf(body.action, ["moderate", "respond"], "moderate", "Rəy əməliyyatı");
  if (action === "respond") {
    if (!adminRoles.includes(user.role) && !(await canSupplierRespond(user, current))) {
      throw new ApiError(403, "review_response_forbidden", "Bu rəyə cavab vermək icazən yoxdur.");
    }
    const response = text(body.response, { field: "Təchizatçı cavabı", required: true, min: 3, max: 1_500 });
    await query(
      `UPDATE marketplace_reviews
          SET supplier_response = $2, supplier_responded_by = $3,
              supplier_responded_at = now(), updated_at = now()
        WHERE id = $1`,
      [id, response, user.id]
    );
    await queueNotification({
      userId: current.customer_id,
      subject: "Rəyinizə cavab verildi",
      body: `${current.target_name || "Rəy obyekti"} üzrə rəyinizə cavab əlavə edildi.`,
      templateKey: "review_response",
      payload: { reviewId: id }
    });
  } else {
    if (!adminRoles.includes(user.role)) throw new ApiError(403, "permission_denied", "Rəyi yalnız administrator moderasiya edə bilər.");
    const status = oneOf(body.status, ["published", "rejected"], "published", "Moderasiya qərarı");
    const note = text(body.note, { max: 1_000 }) || null;
    await query(
      `UPDATE marketplace_reviews
          SET status = $2, moderation_note = $3, moderated_by = $4,
              moderated_at = now(), updated_at = now()
        WHERE id = $1`,
      [id, status, note, user.id]
    );
    await queueNotification({
      userId: current.customer_id,
      subject: status === "published" ? "Rəyiniz yayımlandı" : "Rəyiniz moderasiya edildi",
      body: status === "published" ? "Yoxlanılmış rəyiniz ConstEra-da yayımlandı." : (note || "Rəy yayımlanmadı."),
      templateKey: `review_${status}`,
      payload: { reviewId: id, status }
    });
  }
  await recordAudit({ actorId: user.id, action, entityType: "marketplace_review", entityId: id });
  const updated = await query(
    `SELECT ${reviewSelect}
       FROM marketplace_reviews review
       JOIN users customer ON customer.id = review.customer_id
      WHERE review.id = $1 LIMIT 1`,
    [id]
  );
  return sendJson(res, 200, { ok: true, data: mapReview(updated[0]) });
});
