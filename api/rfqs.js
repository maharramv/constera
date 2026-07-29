import { randomUUID } from "node:crypto";
import { getSessionUser, hashOpaque, requireRole } from "./_lib/auth.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, getClientIp, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { queueNotification } from "./_lib/notifications.js";
import { oneOf, parseLimit, stringList, text } from "./_lib/validation.js";

const statuses = ["Yeni", "Baxılır", "Təklif gözləyir", "Təklif alındı", "Bağlandı", "Ləğv edildi"];
const rfqTypes = ["product", "service", "package", "rental", "custom"];

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const user = await requireRole(req);
    const limit = parseLimit(req.query.limit, 100, 500);
    const values = [];
    const where = [];
    let offerScope = "";
    if (user.role === "customer") {
      values.push(user.id);
      where.push(`r.customer_id = $${values.length}`);
    } else if (user.role === "supplier") {
      values.push(user.companyId || "none");
      where.push(`(r.supplier_id IS NULL OR s.company_id = $${values.length})`);
      offerScope = `AND offer_supplier.company_id = $${values.length}`;
    }
    values.push(limit);
    const rows = await query(
      `SELECT r.*, s.name AS supplier_name,
              COALESCE(json_agg(json_build_object(
                'id', i.id, 'kind', i.item_kind, 'itemId', i.item_id,
                'title', i.title, 'quantity', i.quantity_text, 'unit', i.unit, 'specs', i.specs
              )) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', o.id,
                  'rfqId', o.rfq_id,
                  'supplierId', o.supplier_id,
                  'supplier', offer_supplier.name,
                  'priceAmount', o.price_amount,
                  'price', o.price_text,
                  'currency', o.currency,
                  'leadTime', o.lead_time,
                  'delivery', o.delivery,
                  'warranty', o.warranty,
                  'note', o.note,
                  'status', o.status,
                  'createdAt', o.created_at,
                  'updatedAt', o.updated_at
                ) ORDER BY (o.status = 'accepted') DESC, o.price_amount NULLS LAST, o.created_at DESC)
                FROM offers o
                LEFT JOIN suppliers offer_supplier ON offer_supplier.id = o.supplier_id
                WHERE o.rfq_id = r.id ${offerScope}
              ), '[]'::json) AS offers
         FROM rfqs r
         LEFT JOIN suppliers s ON s.id = r.supplier_id
         LEFT JOIN rfq_items i ON i.rfq_id = r.id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        GROUP BY r.id, s.name
        ORDER BY r.created_at DESC
        LIMIT $${values.length}`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 60_000);

  if (req.method === "PATCH") {
    const user = await requireRole(req, ["super_admin", "admin", "sales"]);
    const id = text(body.id || req.query.id, { field: "Sorğu ID-si", required: true, max: 160 });
    const currentRows = await query("SELECT * FROM rfqs WHERE id = $1 LIMIT 1", [id]);
    if (!currentRows[0]) throw new ApiError(404, "rfq_not_found", "Qiymət sorğusu tapılmadı.");
    const hasSupplier = Object.prototype.hasOwnProperty.call(body, "supplierId");
    const supplierId = hasSupplier ? text(body.supplierId, { max: 160 }) || null : currentRows[0].supplier_id;
    if (supplierId) {
      const supplierRows = await query("SELECT id FROM suppliers WHERE id = $1 AND status <> 'Arxiv' LIMIT 1", [supplierId]);
      if (!supplierRows[0]) throw new ApiError(404, "supplier_not_found", "Təchizatçı tapılmadı.");
    }
    const defaultStatus = hasSupplier && supplierId ? "Təklif gözləyir" : currentRows[0].status;
    const status = oneOf(body.status, statuses, defaultStatus, "Sorğu statusu");
    const rows = await query(
      "UPDATE rfqs SET status = $2, supplier_id = $3, updated_at = now() WHERE id = $1 RETURNING *",
      [id, status, supplierId]
    );
    if (!rows[0]) throw new ApiError(404, "rfq_not_found", "Qiymət sorğusu tapılmadı.");
    await recordAudit({
      actorId: user.id,
      action: "status_update",
      entityType: "rfq",
      entityId: id,
      details: { status, supplierId }
    });
    return sendJson(res, 200, { ok: true, data: rows[0] });
  }

  if (text(body.website, { max: 200 })) return sendJson(res, 201, { ok: true, data: { accepted: true } });
  const session = await getSessionUser(req);
  const submissionHash = hashOpaque(getClientIp(req));
  const recentSubmissions = await query(
    `SELECT count(*)::int AS count FROM rfqs
      WHERE submission_hash = $1 AND created_at > now() - interval '1 hour'`,
    [submissionHash]
  );
  if ((recentSubmissions[0]?.count || 0) >= 20) {
    throw new ApiError(429, "rfq_rate_limited", "Bir saat ərzində sorğu limiti dolub. Bir qədər sonra yenidən yoxla.");
  }
  const id = `rfq-${randomUUID()}`;
  const itemId = `rfi-${randomUUID()}`;
  const type = oneOf(body.type, rfqTypes, "custom", "Sorğu tipi");
  const title = text(body.product || body.title, { field: "Sorğu mövzusu", required: true, max: 300 });
  const quantity = text(body.quantity, { field: "Miqdar", required: true, max: 160 });
  const company = text(body.company, { field: "Şirkət", required: true, max: 200 });
  const contact = text(body.contact, { field: "Əlaqə", required: true, max: 300 });
  const supplierId = text(body.supplierId, { max: 160 }) || null;
  const needDate = text(body.needDate, { max: 10 }) || null;
  if (needDate && !/^\d{4}-\d{2}-\d{2}$/.test(needDate)) throw new ApiError(400, "validation_error", "Tələb tarixi düzgün deyil.");

  await query(
    `WITH new_rfq AS (
       INSERT INTO rfqs (
         id, customer_id, supplier_id, rfq_type, title, company_name, contact, city,
         priority, need_date, budget, delivery_mode, usage_text, note, submission_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $19)
       RETURNING id
     )
     INSERT INTO rfq_items (id, rfq_id, item_kind, item_id, title, quantity_text, specs)
     SELECT $15, new_rfq.id, $4, $16, $5, $17, $18::jsonb FROM new_rfq`,
    [
      id,
      session?.id || null,
      supplierId,
      type,
      title,
      company,
      contact,
      text(body.city, { max: 160 }) || null,
      text(body.priority, { max: 80 }) || "Normal",
      needDate,
      text(body.budget, { max: 160 }) || null,
      text(body.deliveryMode, { max: 200 }) || null,
      text(body.usage, { max: 600 }) || null,
      text(body.note, { max: 3_000 }) || null,
      itemId,
      text(body.sourceId, { max: 160 }) || null,
      quantity,
      JSON.stringify(stringList(body.specs)),
      submissionHash
    ]
  );
  await recordAudit({ actorId: session?.id || null, action: "create", entityType: "rfq", entityId: id, details: { type, supplierId } });
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "";
  await queueNotification({
    channel: adminEmail ? "email" : "in_app",
    recipient: adminEmail || null,
    subject: "Yeni qiymət sorğusu",
    body: `${company}: ${title} · ${quantity}`,
    templateKey: "rfq_created",
    payload: { rfqId: id, type, supplierId, company, title, quantity }
  });
  return sendJson(res, 201, { ok: true, data: { id, status: "Yeni", cloud: true } });
});
