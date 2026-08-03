import { ApiError } from "./http.js";
import { queueNotification } from "./notifications.js";
import { ensureOrderForAcceptedOffer } from "./rfq-order.js";
import { syncRfqLead } from "./crm.js";
import { query, recordAudit } from "./db.js";

const privilegedRoles = ["super_admin", "admin", "sales"];

export const acceptRfqOffer = async ({ offerId, user, commercialProposal = null }) => {
  const targetRows = await query(
    `SELECT o.*, r.customer_id, supplier.company_id AS supplier_company_id
       FROM offers o
       JOIN rfqs r ON r.id = o.rfq_id
       LEFT JOIN suppliers supplier ON supplier.id = o.supplier_id
      WHERE o.id = $1
      LIMIT 1`,
    [offerId]
  );
  const target = targetRows[0];
  if (!target) throw new ApiError(404, "offer_not_found", "Təklif tapılmadı.");

  const privileged = privilegedRoles.includes(user.role);
  const ownsRfq = user.role === "customer" && target.customer_id === user.id;
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
  if (convertedOrders[0] && convertedOrders[0].offer_id !== offerId) {
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
    [offerId]
  );
  if (!rows[0]) throw new ApiError(409, "offer_not_selectable", "Bu təklif artıq seçilə bilən vəziyyətdə deyil.");

  const conversion = await ensureOrderForAcceptedOffer({
    offerId,
    actorId: user.id,
    commercialProposal
  });
  if (!conversion?.order) {
    throw new ApiError(409, "offer_order_conversion_failed", "Qalib təklif sifarişə çevrilmədi. Təklif qiymətini və RFQ məlumatlarını yoxla.");
  }
  await syncRfqLead(target.rfq_id);

  if (conversion.created) {
    await recordAudit({
      actorId: user.id,
      action: "accept",
      entityType: "offer",
      entityId: offerId,
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
          offerId,
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
                offerId,
                rfqId: target.rfq_id,
                orderId: conversion.order.id,
                orderNumber: conversion.order.orderNumber
              }
            })]
          : []
      )
    ]);
  }

  return {
    ...rows[0],
    order: conversion.order,
    conversionCreated: conversion.created
  };
};
