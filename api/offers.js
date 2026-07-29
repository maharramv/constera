import { randomUUID } from "node:crypto";
import { requireRole } from "./_lib/auth.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { queueNotification } from "./_lib/notifications.js";
import { ensureOrderForAcceptedOffer } from "./_lib/rfq-order.js";
import { oneOf, parsePriceAmount, text } from "./_lib/validation.js";

const offerStatuses = ["submitted", "accepted", "rejected", "withdrawn"];
const privilegedRoles = ["super_admin", "admin", "sales"];

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
      `SELECT o.*, s.name AS supplier_name,
              converted_order.id AS order_id,
              converted_order.order_number,
              converted_order.status AS order_status
         FROM offers o
         JOIN rfqs r ON r.id = o.rfq_id
         LEFT JOIN suppliers s ON s.id = o.supplier_id
         LEFT JOIN orders converted_order ON converted_order.offer_id = o.id
        WHERE o.rfq_id = $1 ${scope}
        ORDER BY o.created_at DESC`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const user = await requireRole(req, ["super_admin", "admin", "sales", "supplier", "customer"]);
  const body = await readJson(req, 40_000);

  if (req.method === "PATCH") {
    const id = text(body.id, { field: "Təklif ID-si", required: true, max: 160 });
    const status = oneOf(body.status, offerStatuses, "submitted", "Təklif statusu");
    const targetRows = await query(
      `SELECT o.*, r.customer_id, supplier.company_id AS supplier_company_id
         FROM offers o
         JOIN rfqs r ON r.id = o.rfq_id
         LEFT JOIN suppliers supplier ON supplier.id = o.supplier_id
        WHERE o.id = $1
        LIMIT 1`,
      [id]
    );
    const target = targetRows[0];
    if (!target) throw new ApiError(404, "offer_not_found", "Təklif tapılmadı.");
    const privileged = privilegedRoles.includes(user.role);
    const ownsRfq = user.role === "customer" && target.customer_id === user.id;
    const ownsOffer = user.role === "supplier" && target.supplier_company_id === user.companyId;

    if (status === "accepted") {
      if (!privileged && !ownsRfq) {
        throw new ApiError(403, "permission_denied", "Qalib təklifi yalnız sorğu sahibi və ya administrator seçə bilər.");
      }
      if (target.price_amount === null || Number(target.price_amount) <= 0) {
        throw new ApiError(409, "offer_price_required", "Qalib seçmək üçün təklifin yekun qiyməti 0-dan böyük olmalıdır.");
      }
      if (!target.supplier_id) {
        throw new ApiError(409, "offer_supplier_required", "Qalib təklif aktiv təchizatçıya bağlı olmalıdır.");
      }
      const convertedOrders = await query(
        "SELECT id, offer_id FROM orders WHERE rfq_id = $1 LIMIT 1",
        [target.rfq_id]
      );
      if (convertedOrders[0] && convertedOrders[0].offer_id !== id) {
        throw new ApiError(
          409,
          "rfq_already_converted",
          "Bu RFQ artıq başqa qalib təklif üzrə sifarişə çevrilib."
        );
      }
      const rows = await query(
        `WITH selected AS (
           SELECT id, rfq_id
           FROM offers
           WHERE id = $1 AND status IN ('draft', 'submitted', 'accepted')
         ), rejected AS (
           UPDATE offers offer_row SET status = 'rejected', updated_at = now()
           FROM selected
           WHERE offer_row.rfq_id = selected.rfq_id
             AND offer_row.id <> selected.id
             AND offer_row.status IN ('draft', 'submitted', 'accepted')
           RETURNING offer_row.id
         ), accepted AS (
           UPDATE offers offer_row SET status = 'accepted', updated_at = now()
           FROM selected
           WHERE offer_row.id = selected.id
             AND offer_row.status IN ('draft', 'submitted', 'accepted')
             AND (SELECT count(*) FROM rejected) >= 0
           RETURNING offer_row.*
         ), rfq_updated AS (
           UPDATE rfqs rfq_row SET status = 'Bağlandı', updated_at = now()
           FROM accepted
           WHERE rfq_row.id = accepted.rfq_id
         )
         SELECT accepted.*, supplier.name AS supplier_name
         FROM accepted
         LEFT JOIN suppliers supplier ON supplier.id = accepted.supplier_id`,
        [id]
      );
      if (!rows[0]) throw new ApiError(409, "offer_not_selectable", "Bu təklif artıq seçilə bilən vəziyyətdə deyil.");
      const conversion = await ensureOrderForAcceptedOffer({ offerId: id, actorId: user.id });
      if (!conversion?.order) {
        throw new ApiError(409, "offer_order_conversion_failed", "Qalib təklif sifarişə çevrilmədi. Təklif qiymətini və RFQ məlumatlarını yoxla.");
      }
      if (conversion.created) {
        await recordAudit({
          actorId: user.id,
          action: "accept",
          entityType: "offer",
          entityId: id,
          details: {
            rfqId: target.rfq_id,
            supplierId: target.supplier_id,
            orderId: conversion.order.id,
            orderNumber: conversion.order.orderNumber
          }
        });
        const supplierUsers = target.supplier_company_id ? await query(
          "SELECT id FROM users WHERE company_id = $1 AND role = 'supplier' AND status = 'active'",
          [target.supplier_company_id]
        ) : [];
        await Promise.allSettled([
          ...supplierUsers.map((supplierUser) => queueNotification({
            userId: supplierUser.id,
            subject: `Təklifiniz qalib seçildi · Sifariş #${conversion.order.orderNumber}`,
            body: `Qiymət sorğusu üzrə ${target.price_text || "təklifiniz"} qəbul edildi və sifariş yaradıldı.`,
            templateKey: "offer_accepted",
            payload: {
              offerId: id,
              rfqId: target.rfq_id,
              orderId: conversion.order.id,
              orderNumber: conversion.order.orderNumber
            }
          })),
          ...(
            target.customer_id && target.customer_id !== user.id
              ? [queueNotification({
                  userId: target.customer_id,
                  subject: `RFQ sifarişə çevrildi · #${conversion.order.orderNumber}`,
                  body: `${target.price_text || "Seçilmiş təklif"} təsdiqləndi, sifariş və proforma hazırdır.`,
                  templateKey: "rfq_awarded",
                  payload: {
                    offerId: id,
                    rfqId: target.rfq_id,
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
          ...rows[0],
          order: conversion.order,
          conversionCreated: conversion.created
        }
      });
    }

    const canChange = privileged
      || (status === "rejected" && ownsRfq)
      || (status === "withdrawn" && ownsOffer);
    if (!canChange) throw new ApiError(403, "permission_denied", "Bu təklifin statusunu dəyişmək üçün icazən yoxdur.");
    if (target.status === "accepted" && !privileged) {
      throw new ApiError(409, "accepted_offer_locked", "Qalib təklif yalnız administrator tərəfindən dəyişdirilə bilər.");
    }
    const rows = await query(
      "UPDATE offers SET status = $2, updated_at = now() WHERE id = $1 RETURNING *",
      [id, status]
    );
    if (!rows[0]) throw new ApiError(404, "offer_not_found", "Təklif tapılmadı.");
    await recordAudit({ actorId: user.id, action: "status_update", entityType: "offer", entityId: id, details: { status } });
    return sendJson(res, 200, { ok: true, data: rows[0] });
  }

  if (user.role === "customer") {
    throw new ApiError(403, "permission_denied", "Müştəri hesabı təchizatçı təklifi yarada bilməz.");
  }
  const rfqId = text(body.rfqId, { field: "Sorğu ID-si", required: true, max: 160 });
  let supplierId = text(body.supplierId, { max: 160 });
  if (user.role === "supplier") {
    const suppliers = await query("SELECT id FROM suppliers WHERE company_id = $1 LIMIT 1", [user.companyId]);
    supplierId = suppliers[0]?.id || "";
  }
  if (!supplierId) throw new ApiError(400, "supplier_required", "Təklif üçün təchizatçı seçilməlidir.");
  const currency = oneOf(body.currency, ["AZN", "USD", "EUR"], "AZN", "Valyuta");
  const priceAmount = parsePriceAmount(body.priceAmount ?? body.price);
  if (priceAmount === null || priceAmount <= 0) {
    throw new ApiError(400, "invalid_offer_price", "Təklif qiyməti 0-dan böyük rəqəm olmalıdır.");
  }
  const priceText = text(body.price, { max: 160 })
    || `${priceAmount.toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const rfq = await query(
    `SELECT r.id, r.title, r.customer_id, r.supplier_id, assigned_supplier.company_id AS assigned_company_id
       FROM rfqs r
       LEFT JOIN suppliers assigned_supplier ON assigned_supplier.id = r.supplier_id
      WHERE r.id = $1
      LIMIT 1`,
    [rfqId]
  );
  if (!rfq[0]) throw new ApiError(404, "rfq_not_found", "Qiymət sorğusu tapılmadı.");
  if (user.role === "supplier" && rfq[0].supplier_id && rfq[0].assigned_company_id !== user.companyId) {
    throw new ApiError(403, "rfq_scope_violation", "Bu sorğu başqa təchizatçıya yönləndirilib.");
  }
  const supplierRows = await query("SELECT id, name FROM suppliers WHERE id = $1 AND status <> 'Arxiv' LIMIT 1", [supplierId]);
  if (!supplierRows[0]) throw new ApiError(404, "supplier_not_found", "Təchizatçı tapılmadı.");
  const existingRows = await query(
    `SELECT id FROM offers
      WHERE rfq_id = $1 AND supplier_id = $2 AND status IN ('draft', 'submitted')
      ORDER BY created_at DESC LIMIT 1`,
    [rfqId, supplierId]
  );
  const id = existingRows[0]?.id || `off-${randomUUID()}`;
  const rows = await query(
    `INSERT INTO offers (
       id, rfq_id, supplier_id, created_by, price_amount, price_text, currency,
       lead_time, delivery, warranty, note, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'submitted')
     ON CONFLICT (id) DO UPDATE SET
       created_by = EXCLUDED.created_by,
       price_amount = EXCLUDED.price_amount,
       price_text = EXCLUDED.price_text,
       currency = EXCLUDED.currency,
       lead_time = EXCLUDED.lead_time,
       delivery = EXCLUDED.delivery,
       warranty = EXCLUDED.warranty,
       note = EXCLUDED.note,
       status = 'submitted',
       updated_at = now()
     RETURNING *`,
    [
      id, rfqId, supplierId, user.id, priceAmount, priceText,
      currency,
      text(body.leadTime, { max: 160 }) || null,
      text(body.delivery, { max: 300 }) || null,
      text(body.warranty, { max: 200 }) || null,
      text(body.note, { max: 2_000 }) || null
    ]
  );
  await query("UPDATE rfqs SET status = 'Təklif alındı', updated_at = now() WHERE id = $1", [rfqId]);
  await recordAudit({
    actorId: user.id,
    action: existingRows[0] ? "update" : "create",
    entityType: "offer",
    entityId: id,
    details: { rfqId, supplierId }
  });
  if (rfq[0].customer_id && rfq[0].customer_id !== user.id) {
    await Promise.allSettled([queueNotification({
      userId: rfq[0].customer_id,
      subject: "Yeni təchizatçı təklifi",
      body: `${rfq[0].title}: ${supplierRows[0].name} ${priceText} təklif göndərdi.`,
      templateKey: "offer_submitted",
      payload: { offerId: id, rfqId, supplierId }
    })]);
  }
  return sendJson(res, existingRows[0] ? 200 : 201, {
    ok: true,
    data: { ...rows[0], supplier_name: supplierRows[0].name }
  });
});
