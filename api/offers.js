import { randomUUID } from "node:crypto";
import { requireRole } from "./_lib/auth.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { oneOf, parsePriceAmount, text } from "./_lib/validation.js";

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const user = await requireRole(req, ["super_admin", "admin", "sales", "supplier", "customer"]);
    const rfqId = text(req.query.rfqId, { field: "Sorğu ID-si", required: true, max: 160 });
    const values = [rfqId];
    let scope = "";
    if (user.role === "customer") {
      values.push(user.id);
      scope = `AND r.customer_id = $${values.length}`;
    } else if (user.role === "supplier") {
      values.push(user.companyId || "none");
      scope = `AND s.company_id = $${values.length}`;
    }
    const rows = await query(
      `SELECT o.*, s.name AS supplier_name
         FROM offers o
         JOIN rfqs r ON r.id = o.rfq_id
         LEFT JOIN suppliers s ON s.id = o.supplier_id
        WHERE o.rfq_id = $1 ${scope}
        ORDER BY o.created_at DESC`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const user = await requireRole(req, ["super_admin", "admin", "sales", "supplier"]);
  const body = await readJson(req, 40_000);

  if (req.method === "PATCH") {
    if (!["super_admin", "admin", "sales"].includes(user.role)) throw new ApiError(403, "permission_denied", "Təklif statusunu dəyişmək üçün icazən yoxdur.");
    const id = text(body.id, { field: "Təklif ID-si", required: true, max: 160 });
    const status = oneOf(body.status, ["submitted", "accepted", "rejected", "withdrawn"], "submitted", "Təklif statusu");
    const rows = await query("UPDATE offers SET status = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, status]);
    if (!rows[0]) throw new ApiError(404, "offer_not_found", "Təklif tapılmadı.");
    await recordAudit({ actorId: user.id, action: "status_update", entityType: "offer", entityId: id, details: { status } });
    return sendJson(res, 200, { ok: true, data: rows[0] });
  }

  const rfqId = text(body.rfqId, { field: "Sorğu ID-si", required: true, max: 160 });
  let supplierId = text(body.supplierId, { max: 160 });
  if (user.role === "supplier") {
    const suppliers = await query("SELECT id FROM suppliers WHERE company_id = $1 LIMIT 1", [user.companyId]);
    supplierId = suppliers[0]?.id || "";
  }
  if (!supplierId) throw new ApiError(400, "supplier_required", "Təklif üçün təchizatçı seçilməlidir.");
  const priceText = text(body.price, { field: "Təklif qiyməti", required: true, max: 160 });
  const priceAmount = parsePriceAmount(body.priceAmount ?? body.price);
  const id = `off-${randomUUID()}`;
  const rfq = await query("SELECT id FROM rfqs WHERE id = $1 LIMIT 1", [rfqId]);
  if (!rfq[0]) throw new ApiError(404, "rfq_not_found", "Qiymət sorğusu tapılmadı.");
  const rows = await query(
    `INSERT INTO offers (
       id, rfq_id, supplier_id, created_by, price_amount, price_text, currency,
       lead_time, delivery, warranty, note, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'submitted')
     RETURNING *`,
    [
      id, rfqId, supplierId, user.id, priceAmount, priceText,
      oneOf(body.currency, ["AZN", "USD", "EUR"], "AZN", "Valyuta"),
      text(body.leadTime, { max: 160 }) || null,
      text(body.delivery, { max: 300 }) || null,
      text(body.warranty, { max: 200 }) || null,
      text(body.note, { max: 2_000 }) || null
    ]
  );
  await query("UPDATE rfqs SET status = 'Təklif alındı', updated_at = now() WHERE id = $1", [rfqId]);
  await recordAudit({ actorId: user.id, action: "create", entityType: "offer", entityId: id, details: { rfqId, supplierId } });
  return sendJson(res, 201, { ok: true, data: rows[0] });
});
