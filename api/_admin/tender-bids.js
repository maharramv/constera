import { randomUUID } from "node:crypto";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { oneOf, parseLimit, parsePriceAmount, text } from "../_lib/validation.js";

const statuses = ["draft", "submitted", "accepted", "rejected", "withdrawn"];

const mapBid = (row) => ({
  id: row.id,
  tenderId: row.tender_id,
  tenderTitle: row.tender_title || "",
  supplierId: row.supplier_id,
  supplierName: row.supplier_name || "",
  priceAmount: row.price_amount === null ? null : Number(row.price_amount),
  price: row.price_text,
  currency: row.currency,
  validity: row.validity || "",
  delivery: row.delivery || "",
  note: row.note || "",
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const supplierForUser = async (user) => {
  if (user.role !== "supplier" || !user.companyId) return null;
  const rows = await query("SELECT id, name FROM suppliers WHERE company_id = $1 LIMIT 1", [user.companyId]);
  return rows[0] || null;
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req);
  const privileged = ["super_admin", "admin", "sales"].includes(user.role);
  const ownSupplier = await supplierForUser(user);

  if (req.method === "GET") {
    const limit = parseLimit(req.query.limit, 100, 500);
    const tenderId = text(req.query.tenderId, { max: 160 });
    const values = [];
    const where = [];
    if (tenderId) {
      values.push(tenderId);
      where.push(`b.tender_id = $${values.length}`);
    }
    if (user.role === "supplier") {
      if (!ownSupplier) return sendJson(res, 200, { ok: true, data: [] });
      values.push(ownSupplier.id);
      where.push(`b.supplier_id = $${values.length}`);
    } else if (user.role === "customer") {
      values.push(user.id);
      where.push(`(t.created_by = $${values.length} OR t.customer_id = $${values.length})`);
    } else if (!privileged) {
      throw new ApiError(403, "permission_denied", "Tender təkliflərinə giriş icazəsi yoxdur.");
    }
    values.push(limit);
    const rows = await query(
      `SELECT b.*, t.title AS tender_title, s.name AS supplier_name
         FROM tender_bids b
         JOIN tenders t ON t.id = b.tender_id
         LEFT JOIN suppliers s ON s.id = b.supplier_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY b.created_at DESC LIMIT $${values.length}`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows.map(mapBid) });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 50_000);

  if (req.method === "POST") {
    if (!privileged && user.role !== "supplier") throw new ApiError(403, "permission_denied", "Tender təklifi göndərmək icazəsi yoxdur.");
    const tenderId = text(body.tenderId, { field: "Tender ID-si", required: true, max: 160 });
    const tenderRows = await query("SELECT id, title, status FROM tenders WHERE id = $1 LIMIT 1", [tenderId]);
    const tender = tenderRows[0];
    if (!tender || !["published", "evaluation"].includes(tender.status)) {
      throw new ApiError(409, "tender_not_open", "Tender təklif qəbulu üçün açıq deyil.");
    }
    const supplierId = privileged
      ? text(body.supplierId, { field: "Təchizatçı ID-si", required: true, max: 160 })
      : ownSupplier?.id;
    if (!supplierId) throw new ApiError(409, "supplier_profile_required", "Hesaba bağlı təchizatçı profili tapılmadı.");
    const priceAmount = parsePriceAmount(body.priceAmount ?? body.price);
    const priceText = text(body.price, { field: "Qiymət", required: true, max: 160 });
    const id = `tbd-${randomUUID()}`;
    const rows = await query(
      `INSERT INTO tender_bids (
         id, tender_id, supplier_id, created_by, price_amount, price_text,
         currency, validity, delivery, note, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'submitted')
       RETURNING *`,
      [
        id, tenderId, supplierId, user.id, priceAmount, priceText,
        oneOf(body.currency, ["AZN", "USD", "EUR"], "AZN", "Valyuta"),
        text(body.validity, { max: 160 }) || null,
        text(body.delivery, { max: 200 }) || null,
        text(body.note, { max: 2_000 }) || null
      ]
    );
    await query(
      "UPDATE tender_invitations SET status = 'submitted', updated_at = now() WHERE tender_id = $1 AND supplier_id = $2",
      [tenderId, supplierId]
    );
    await recordAudit({ actorId: user.id, action: "submit", entityType: "tender_bid", entityId: id, details: { tenderId, supplierId } });
    await queueNotification({
      channel: "in_app",
      subject: "Tenderə yeni təklif",
      body: `${tender.title} tenderinə yeni təklif daxil oldu.`,
      templateKey: "tender_bid_submitted",
      payload: { tenderId, bidId: id }
    });
    const supplierRows = await query("SELECT name FROM suppliers WHERE id = $1", [supplierId]);
    return sendJson(res, 201, { ok: true, data: mapBid({ ...rows[0], tender_title: tender.title, supplier_name: supplierRows[0]?.name }) });
  }

  const id = text(body.id || req.query.id, { field: "Təklif ID-si", required: true, max: 160 });
  const existingRows = await query(
    `SELECT b.*, t.created_by AS tender_owner, t.customer_id AS tender_customer
       FROM tender_bids b JOIN tenders t ON t.id = b.tender_id WHERE b.id = $1 LIMIT 1`,
    [id]
  );
  const existing = existingRows[0];
  if (!existing) throw new ApiError(404, "bid_not_found", "Tender təklifi tapılmadı.");
  const isOwner = existing.tender_owner === user.id || existing.tender_customer === user.id;
  const isSupplierOwner = ownSupplier?.id === existing.supplier_id;
  const status = oneOf(body.status, statuses, existing.status, "Status");
  if (["accepted", "rejected"].includes(status) && !privileged && !isOwner) {
    throw new ApiError(403, "permission_denied", "Təklifi qəbul və ya rədd etmək icazəsi yoxdur.");
  }
  if (["withdrawn", "draft", "submitted"].includes(status) && !privileged && !isSupplierOwner) {
    throw new ApiError(403, "permission_denied", "Bu təklifi dəyişmək icazəsi yoxdur.");
  }
  await query("UPDATE tender_bids SET status = $2, updated_at = now() WHERE id = $1", [id, status]);
  if (status === "accepted") {
    await query("UPDATE tenders SET status = 'awarded', updated_at = now() WHERE id = $1", [existing.tender_id]);
    await query("UPDATE tender_bids SET status = 'rejected', updated_at = now() WHERE tender_id = $1 AND id <> $2 AND status = 'submitted'", [existing.tender_id, id]);
  }
  await recordAudit({ actorId: user.id, action: status, entityType: "tender_bid", entityId: id });
  return sendJson(res, 200, { ok: true, data: { id, status } });
});
