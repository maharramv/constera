import { randomUUID } from "node:crypto";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { ensureOrderForAcceptedTenderBid } from "../_lib/tender-order.js";
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
  orderId: row.order_id || row.order?.id || null,
  orderNumber: row.order_number === null || row.order_number === undefined
    ? row.order?.orderNumber || null
    : Number(row.order_number),
  orderStatus: row.order_status || row.order?.status || "",
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
      `SELECT b.*, t.title AS tender_title, s.name AS supplier_name,
              converted_order.id AS order_id,
              converted_order.order_number,
              converted_order.status AS order_status
         FROM tender_bids b
         JOIN tenders t ON t.id = b.tender_id
         LEFT JOIN suppliers s ON s.id = b.supplier_id
         LEFT JOIN orders converted_order ON converted_order.tender_bid_id = b.id
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
    const tenderRows = await query("SELECT id, title, status, visibility FROM tenders WHERE id = $1 LIMIT 1", [tenderId]);
    const tender = tenderRows[0];
    if (!tender || !["published", "evaluation"].includes(tender.status)) {
      throw new ApiError(409, "tender_not_open", "Tender təklif qəbulu üçün açıq deyil.");
    }
    const supplierId = privileged
      ? text(body.supplierId, { field: "Təchizatçı ID-si", required: true, max: 160 })
      : ownSupplier?.id;
    if (!supplierId) throw new ApiError(409, "supplier_profile_required", "Hesaba bağlı təchizatçı profili tapılmadı.");
    if (!privileged && tender.visibility === "invited") {
      const invitations = await query(
        "SELECT 1 FROM tender_invitations WHERE tender_id = $1 AND supplier_id = $2 LIMIT 1",
        [tenderId, supplierId]
      );
      if (!invitations[0]) {
        throw new ApiError(403, "tender_invitation_required", "Bu tender yalnız dəvət edilmiş təchizatçılar üçündür.");
      }
    }
    const existingBids = await query(
      "SELECT id FROM tender_bids WHERE tender_id = $1 AND supplier_id = $2 AND status <> 'withdrawn' LIMIT 1",
      [tenderId, supplierId]
    );
    if (existingBids[0]) {
      throw new ApiError(409, "tender_bid_exists", "Bu tender üçün aktiv təklif artıq mövcuddur.");
    }
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
    `SELECT b.*, t.created_by AS tender_owner, t.customer_id AS tender_customer,
            t.title AS tender_title, supplier.name AS supplier_name,
            supplier.company_id AS supplier_company_id
       FROM tender_bids b
       JOIN tenders t ON t.id = b.tender_id
       LEFT JOIN suppliers supplier ON supplier.id = b.supplier_id
      WHERE b.id = $1
      LIMIT 1`,
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

  if (status === "accepted") {
    if (existing.price_amount === null || Number(existing.price_amount) <= 0) {
      throw new ApiError(409, "tender_bid_price_required", "Qalib seçmək üçün tender təklifinin yekun qiyməti olmalıdır.");
    }
    if (!existing.supplier_id) {
      throw new ApiError(409, "tender_bid_supplier_required", "Qalib tender təklifi aktiv təchizatçıya bağlı olmalıdır.");
    }
    const convertedOrders = await query(
      "SELECT id, tender_bid_id FROM orders WHERE tender_id = $1 LIMIT 1",
      [existing.tender_id]
    );
    if (convertedOrders[0] && convertedOrders[0].tender_bid_id !== id) {
      throw new ApiError(409, "tender_already_converted", "Bu tender artıq başqa qalib təklif üzrə sifarişə çevrilib.");
    }
    const selectedRows = await query(
      `WITH selected AS (
         SELECT id, tender_id
         FROM tender_bids
         WHERE id = $1 AND status IN ('draft', 'submitted', 'accepted')
       ), rejected AS (
         UPDATE tender_bids bid_row
            SET status = 'rejected', updated_at = now()
           FROM selected
          WHERE bid_row.tender_id = selected.tender_id
            AND bid_row.id <> selected.id
            AND bid_row.status IN ('draft', 'submitted', 'accepted')
         RETURNING bid_row.id
       ), accepted AS (
         UPDATE tender_bids bid_row
            SET status = 'accepted', updated_at = now()
           FROM selected
          WHERE bid_row.id = selected.id
            AND (SELECT count(*) FROM rejected) >= 0
         RETURNING bid_row.*
       ), tender_updated AS (
         UPDATE tenders tender_row
            SET status = 'awarded', updated_at = now()
           FROM accepted
          WHERE tender_row.id = accepted.tender_id
       )
       SELECT accepted.*
       FROM accepted`,
      [id]
    );
    if (!selectedRows[0]) {
      throw new ApiError(409, "tender_bid_not_selectable", "Bu tender təklifi artıq seçilə bilən vəziyyətdə deyil.");
    }
    const conversion = await ensureOrderForAcceptedTenderBid({ bidId: id, actorId: user.id });
    if (!conversion?.order) {
      throw new ApiError(409, "tender_order_conversion_failed", "Tender qalibi sifarişə çevrilmədi.");
    }
    if (conversion.created) {
      await recordAudit({
        actorId: user.id,
        action: "accept",
        entityType: "tender_bid",
        entityId: id,
        details: {
          tenderId: existing.tender_id,
          supplierId: existing.supplier_id,
          orderId: conversion.order.id,
          orderNumber: conversion.order.orderNumber
        }
      });
      const supplierUsers = existing.supplier_company_id ? await query(
        "SELECT id FROM users WHERE company_id = $1 AND role = 'supplier' AND status = 'active'",
        [existing.supplier_company_id]
      ) : [];
      const tenderOwner = existing.tender_customer || existing.tender_owner;
      await Promise.allSettled([
        ...supplierUsers.map((supplierUser) => queueNotification({
          userId: supplierUser.id,
          subject: `Tender təklifiniz qalib seçildi · Sifariş #${conversion.order.orderNumber}`,
          body: `${existing.tender_title} tenderi üzrə sifariş və proforma yaradıldı.`,
          templateKey: "tender_bid_accepted",
          payload: {
            tenderId: existing.tender_id,
            bidId: id,
            orderId: conversion.order.id,
            orderNumber: conversion.order.orderNumber
          }
        })),
        ...(
          tenderOwner && tenderOwner !== user.id
            ? [queueNotification({
                userId: tenderOwner,
                subject: `Tender sifarişə çevrildi · #${conversion.order.orderNumber}`,
                body: `${existing.supplier_name || "Təchizatçı"} qalib seçildi, sifariş və proforma hazırdır.`,
                templateKey: "tender_awarded",
                payload: {
                  tenderId: existing.tender_id,
                  bidId: id,
                  orderId: conversion.order.id,
                  orderNumber: conversion.order.orderNumber
                }
              })]
            : []
        )
      ]);
    }
    return sendJson(res, 200, {
      ok: true,
      data: {
        ...mapBid({
          ...selectedRows[0],
          tender_title: existing.tender_title,
          supplier_name: existing.supplier_name,
          order: conversion.order
        }),
        order: conversion.order,
        conversionCreated: conversion.created
      }
    });
  }

  const convertedOrders = await query(
    "SELECT id FROM orders WHERE tender_bid_id = $1 LIMIT 1",
    [id]
  );
  if (convertedOrders[0]) {
    throw new ApiError(409, "converted_tender_bid_locked", "Sifarişə çevrilmiş tender təklifinin statusu dəyişdirilə bilməz.");
  }
  await query("UPDATE tender_bids SET status = $2, updated_at = now() WHERE id = $1", [id, status]);
  await recordAudit({ actorId: user.id, action: status, entityType: "tender_bid", entityId: id });
  return sendJson(res, 200, { ok: true, data: { id, status } });
});
