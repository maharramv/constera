import { randomUUID } from "node:crypto";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { entityId, oneOf, parseLimit, stringList, text } from "../_lib/validation.js";

const statuses = ["draft", "published", "evaluation", "awarded", "closed", "cancelled"];
const visibilities = ["public", "invited"];

const normalizeDate = (value) => {
  const source = text(value, { max: 30 });
  if (!source) return null;
  const date = new Date(`${source}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) throw new ApiError(400, "validation_error", "Son tarix düzgün deyil.");
  return source;
};

const normalizeLots = (value) => {
  const items = Array.isArray(value) ? value : [];
  if (!items.length || items.length > 100) throw new ApiError(400, "validation_error", "Tenderdə 1-100 lot olmalıdır.");
  return items.map((item, index) => ({
    id: entityId(item.id, "lot"),
    title: text(item.title, { field: `Lot ${index + 1} adı`, required: true, max: 240 }),
    quantityText: text(item.quantityText || item.quantity, { field: `Lot ${index + 1} miqdarı`, required: true, max: 120 }),
    unit: text(item.unit, { max: 80 }),
    specifications: stringList(item.specifications || item.specs, 50),
    sortOrder: index
  }));
};

const loadSupplierId = async (user) => {
  if (user.role !== "supplier" || !user.companyId) return null;
  const rows = await query("SELECT id FROM suppliers WHERE company_id = $1 LIMIT 1", [user.companyId]);
  return rows[0]?.id || null;
};

const mapTender = (row, lots = [], bids = []) => ({
  id: row.id,
  companyName: row.company_name,
  title: row.title,
  description: row.description || "",
  city: row.city || "",
  deadline: row.deadline,
  budget: row.budget_text || "",
  status: row.status,
  visibility: row.visibility,
  contact: row.contact || "",
  requirements: row.requirements || [],
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lots: lots.filter((item) => item.tender_id === row.id).map((item) => ({
    id: item.id,
    title: item.title,
    quantity: item.quantity_text,
    unit: item.unit || "",
    specifications: item.specifications || []
  })),
  bidCount: bids.filter((item) => item.tender_id === row.id).length
});

const loadTenders = async (user, limit) => {
  const values = [];
  const where = [];
  if (!['super_admin', 'admin', 'sales'].includes(user.role)) {
    if (user.role === "customer") {
      values.push(user.id);
      where.push(`(t.created_by = $${values.length} OR t.customer_id = $${values.length})`);
    } else if (user.role === "supplier") {
      const supplierId = await loadSupplierId(user);
      values.push(supplierId || "");
      where.push(`(t.status IN ('published', 'evaluation') AND (t.visibility = 'public' OR EXISTS (
        SELECT 1 FROM tender_invitations ti WHERE ti.tender_id = t.id AND ti.supplier_id = $${values.length}
      )))`);
    }
  }
  values.push(limit);
  const rows = await query(
    `SELECT t.* FROM tenders t ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY t.created_at DESC LIMIT $${values.length}`,
    values
  );
  if (!rows.length) return [];
  const ids = rows.map((item) => item.id);
  const [lots, bids] = await Promise.all([
    query("SELECT * FROM tender_lots WHERE tender_id = ANY($1::text[]) ORDER BY sort_order", [ids]),
    query("SELECT id, tender_id FROM tender_bids WHERE tender_id = ANY($1::text[]) AND status <> 'withdrawn'", [ids])
  ]);
  return rows.map((row) => mapTender(row, lots, bids));
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req);
  if (req.method === "GET") {
    const limit = parseLimit(req.query.limit, 100, 500);
    return sendJson(res, 200, { ok: true, data: await loadTenders(user, limit) });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const body = await readJson(req, 200_000);

  if (req.method === "POST") {
    if (!["super_admin", "admin", "sales", "customer"].includes(user.role)) {
      throw new ApiError(403, "permission_denied", "Tender yaratmaq üçün uyğun rol tələb olunur.");
    }
    const id = `tnd-${randomUUID()}`;
    const lots = normalizeLots(body.lots);
    const companyName = text(body.companyName || user.companyName, { field: "Şirkət", required: true, max: 200 });
    const title = text(body.title, { field: "Tender adı", required: true, max: 260 });
    const allowedStatus = ["super_admin", "admin", "sales"].includes(user.role)
      ? oneOf(body.status, statuses, "draft", "Status")
      : oneOf(body.status, ["draft", "published"], "draft", "Status");
    await query(
      `INSERT INTO tenders (
         id, created_by, customer_id, company_name, title, description, city, deadline,
         budget_text, status, visibility, contact, requirements
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
      [
        id, user.id, user.role === "customer" ? user.id : null, companyName, title,
        text(body.description, { max: 5_000 }) || null, text(body.city, { max: 160 }) || null,
        normalizeDate(body.deadline), text(body.budget, { max: 160 }) || null, allowedStatus,
        oneOf(body.visibility, visibilities, "public", "Görünürlük"),
        text(body.contact, { max: 300 }) || null, JSON.stringify(stringList(body.requirements, 50))
      ]
    );
    await query(
      `WITH incoming AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
           id text, title text, "quantityText" text, unit text, specifications jsonb, "sortOrder" integer
         )
       )
       INSERT INTO tender_lots (id, tender_id, title, quantity_text, unit, specifications, sort_order)
       SELECT id, $2, title, "quantityText", NULLIF(unit, ''), specifications, "sortOrder" FROM incoming`,
      [JSON.stringify(lots), id]
    );
    const invited = Array.isArray(body.supplierIds) ? [...new Set(body.supplierIds.map(String))].slice(0, 200) : [];
    if (invited.length) {
      await query(
        `INSERT INTO tender_invitations (tender_id, supplier_id)
         SELECT $1, s.id FROM suppliers s WHERE s.id = ANY($2::text[])
         ON CONFLICT (tender_id, supplier_id) DO NOTHING`,
        [id, invited]
      );
    }
    await recordAudit({ actorId: user.id, action: "create", entityType: "tender", entityId: id, details: { lots: lots.length } });
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "";
    await queueNotification({
      channel: adminEmail ? "email" : "in_app",
      recipient: adminEmail || null,
      subject: "Yeni ConstEra tenderi",
      body: `${companyName}: ${title}`,
      templateKey: "tender_created",
      payload: { tenderId: id, companyName, title }
    });
    const created = (await loadTenders(user, 500)).find((item) => item.id === id);
    return sendJson(res, 201, { ok: true, data: created });
  }

  const id = text(body.id || req.query.id, { field: "Tender ID-si", required: true, max: 160 });
  const existingRows = await query("SELECT * FROM tenders WHERE id = $1 LIMIT 1", [id]);
  const existing = existingRows[0];
  if (!existing) throw new ApiError(404, "tender_not_found", "Tender tapılmadı.");
  const privileged = ["super_admin", "admin", "sales"].includes(user.role);
  if (!privileged && existing.created_by !== user.id) throw new ApiError(403, "permission_denied", "Bu tenderi idarə edə bilməzsən.");

  if (req.method === "DELETE") {
    await query("UPDATE tenders SET status = 'cancelled', updated_at = now() WHERE id = $1", [id]);
    await recordAudit({ actorId: user.id, action: "cancel", entityType: "tender", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, status: "cancelled" } });
  }

  const status = privileged
    ? oneOf(body.status ?? existing.status, statuses, existing.status, "Status")
    : oneOf(body.status ?? existing.status, ["draft", "published", "cancelled"], existing.status, "Status");
  await query(
    `UPDATE tenders SET
       company_name = $2, title = $3, description = $4, city = $5, deadline = $6,
       budget_text = $7, status = $8, visibility = $9, contact = $10,
       requirements = $11::jsonb, updated_at = now()
     WHERE id = $1`,
    [
      id,
      text(body.companyName ?? existing.company_name, { required: true, max: 200 }),
      text(body.title ?? existing.title, { required: true, max: 260 }),
      text(body.description ?? existing.description, { max: 5_000 }) || null,
      text(body.city ?? existing.city, { max: 160 }) || null,
      body.deadline === undefined ? existing.deadline : normalizeDate(body.deadline),
      text(body.budget ?? existing.budget_text, { max: 160 }) || null,
      status,
      oneOf(body.visibility ?? existing.visibility, visibilities, existing.visibility, "Görünürlük"),
      text(body.contact ?? existing.contact, { max: 300 }) || null,
      JSON.stringify(body.requirements === undefined ? existing.requirements : stringList(body.requirements, 50))
    ]
  );
  if (body.lots) {
    const lots = normalizeLots(body.lots);
    await query("DELETE FROM tender_lots WHERE tender_id = $1", [id]);
    await query(
      `WITH incoming AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
           id text, title text, "quantityText" text, unit text, specifications jsonb, "sortOrder" integer
         )
       )
       INSERT INTO tender_lots (id, tender_id, title, quantity_text, unit, specifications, sort_order)
       SELECT id, $2, title, "quantityText", NULLIF(unit, ''), specifications, "sortOrder" FROM incoming`,
      [JSON.stringify(lots), id]
    );
  }
  await recordAudit({ actorId: user.id, action: "update", entityType: "tender", entityId: id, details: { status } });
  const updated = (await loadTenders(user, 500)).find((item) => item.id === id);
  return sendJson(res, 200, { ok: true, data: updated });
});
