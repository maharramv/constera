import { randomUUID } from "node:crypto";
import { assertCriticalTwoFactor, requireRole } from "../_lib/auth.js";
import {
  calculateCommercialProposalTotals,
  formatCommercialProposalNumber,
  mapCommercialProposal,
  proposalVatModes
} from "../_lib/commercial-proposals.js";
import { syncCommercialProposalLead } from "../_lib/crm.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { acceptRfqOffer } from "../_lib/offer-selection.js";
import { oneOf, parseLimit, parsePriceAmount, text } from "../_lib/validation.js";

const privilegedRoles = ["super_admin", "admin", "sales"];
const readableRoles = [...privilegedRoles, "customer"];
const moneyValue = (value, field, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  const amount = parsePriceAmount(value);
  if (amount === null || amount < 0) {
    throw new ApiError(400, "validation_error", `${field} 0 və ya daha böyük rəqəm olmalıdır.`);
  }
  return amount;
};

const proposalSelect = `
  SELECT proposal.*, rfq.title AS rfq_title,
         selected_supplier.name AS selected_supplier_name,
         converted_order.id AS order_id,
         converted_order.order_number
    FROM commercial_proposals proposal
    JOIN rfqs rfq ON rfq.id = proposal.rfq_id
    LEFT JOIN offers selected_offer ON selected_offer.id = proposal.selected_offer_id
    LEFT JOIN suppliers selected_supplier ON selected_supplier.id = selected_offer.supplier_id
    LEFT JOIN orders converted_order ON converted_order.commercial_proposal_id = proposal.id`;

const readProposal = async (id) => {
  const rows = await query(`${proposalSelect} WHERE proposal.id = $1 LIMIT 1`, [id]);
  return rows[0] ? mapCommercialProposal(rows[0]) : null;
};

const recordProposalActivity = async ({ rfqId, actorId, subject, note = "" }) => {
  await query(
    `INSERT INTO crm_activities (id, lead_id, actor_id, activity_type, subject, note)
     SELECT $1, lead.id, $2, 'status', $3, $4
       FROM crm_leads lead
      WHERE lead.source_type = 'rfq' AND lead.source_id = $5
      LIMIT 1`,
    [`act-${randomUUID()}`, actorId, subject, note || null, rfqId]
  );
};

const sourceForProposal = async (rfqId) => {
  const [rfqRows, itemRows, offerRows] = await Promise.all([
    query(
      `SELECT rfq.*, customer.name AS account_name, customer.email AS account_email,
              customer_company.name AS account_company_name,
              customer_company.tax_id AS account_company_tax_id,
              customer_company.phone AS account_company_phone,
              converted_order.id AS order_id
         FROM rfqs rfq
         LEFT JOIN users customer ON customer.id = rfq.customer_id
         LEFT JOIN companies customer_company ON customer_company.id = customer.company_id
         LEFT JOIN orders converted_order ON converted_order.rfq_id = rfq.id
        WHERE rfq.id = $1
        LIMIT 1`,
      [rfqId]
    ),
    query(
      `SELECT id, item_kind, item_id, title, quantity_text, unit, specs
         FROM rfq_items
        WHERE rfq_id = $1
        ORDER BY created_at`,
      [rfqId]
    ),
    query(
      `SELECT offer.*, supplier.name AS supplier_name,
              supplier.supplier_type, supplier.region, supplier.contact,
              supplier.website
         FROM offers offer
         LEFT JOIN suppliers supplier ON supplier.id = offer.supplier_id
        WHERE offer.rfq_id = $1
          AND offer.status <> 'withdrawn'
        ORDER BY (offer.status = 'accepted') DESC, offer.price_amount NULLS LAST, offer.created_at`,
      [rfqId]
    )
  ]);
  return { rfq: rfqRows[0] || null, items: itemRows, offers: offerRows };
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, readableRoles);

  if (req.method === "GET") {
    const id = text(req.query.id, { max: 160 });
    const rfqId = text(req.query.rfqId, { max: 160 });
    const limit = parseLimit(req.query.limit, 100, 500);
    const values = [];
    const where = [];
    if (id) {
      values.push(id);
      where.push(`proposal.id = $${values.length}`);
    }
    if (rfqId) {
      values.push(rfqId);
      where.push(`proposal.rfq_id = $${values.length}`);
    }
    if (user.role === "customer") {
      values.push(user.id);
      where.push(`proposal.customer_id = $${values.length}`);
      where.push("proposal.status <> 'draft'");
    }
    values.push(limit);
    const rows = await query(
      `${proposalSelect}
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY proposal.created_at DESC
       LIMIT $${values.length}`,
      values
    );
    if (id && !rows[0]) throw new ApiError(404, "proposal_not_found", "Kommersiya təklifi tapılmadı.");
    return sendJson(res, 200, { ok: true, data: id ? mapCommercialProposal(rows[0]) : rows.map(mapCommercialProposal) });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 60_000);

  if (req.method === "PATCH") {
    const id = text(body.id || req.query.id, { field: "Təklif ID-si", required: true, max: 160 });
    const targetRows = await query(
      `SELECT proposal.*, rfq.customer_id, rfq.title AS rfq_title
         FROM commercial_proposals proposal
         JOIN rfqs rfq ON rfq.id = proposal.rfq_id
        WHERE proposal.id = $1
        LIMIT 1`,
      [id]
    );
    const target = targetRows[0];
    if (!target) throw new ApiError(404, "proposal_not_found", "Kommersiya təklifi tapılmadı.");
    const requestedStatus = oneOf(body.status, ["issued", "accepted", "cancelled"], target.status, "Təklif vəziyyəti");
    const privileged = privilegedRoles.includes(user.role);
    const ownsProposal = user.role === "customer" && target.customer_id === user.id;
    const alreadyAccepted = target.status === "accepted";
    if (privileged) assertCriticalTwoFactor(user);

    if (requestedStatus === "accepted") {
      if (!privileged && !ownsProposal) {
        throw new ApiError(403, "permission_denied", "Kommersiya təklifini yalnız sorğu sahibi və ya administrator qəbul edə bilər.");
      }
      if (!["issued", "accepted"].includes(target.status)) {
        throw new ApiError(409, "proposal_not_acceptable", "Bu kommersiya təklifi qəbul edilə bilən vəziyyətdə deyil.");
      }
      const validityRows = alreadyAccepted ? [{ valid: true }] : await query(
        "SELECT ($1::date >= (now() AT TIME ZONE 'Asia/Baku')::date) AS valid",
        [target.valid_until]
      );
      if (!validityRows[0]?.valid) {
        await query("UPDATE commercial_proposals SET status = 'expired', updated_at = now() WHERE id = $1 AND status = 'issued'", [id]);
        throw new ApiError(409, "proposal_expired", "Kommersiya təklifinin etibarlılıq müddəti bitib.");
      }
      if (!target.selected_offer_id) {
        throw new ApiError(409, "proposal_offer_required", "Kommersiya təklifinə seçilmiş təchizatçı təklifi bağlı deyil.");
      }
      const conversion = await acceptRfqOffer({
        offerId: target.selected_offer_id,
        user,
        commercialProposal: {
          id: target.id,
          documentNumber: target.document_number,
          selectedOfferId: target.selected_offer_id,
          subtotal: Number(target.subtotal),
          discountAmount: Number(target.discount_amount || 0),
          deliveryAmount: Number(target.delivery_amount || 0),
          vatMode: target.vat_mode,
          vatRate: Number(target.vat_rate || 0),
          vatAmount: Number(target.vat_amount || 0),
          totalAmount: Number(target.total_amount),
          currency: target.currency
        }
      });
      await query(
        `UPDATE commercial_proposals
            SET status = 'accepted', accepted_at = COALESCE(accepted_at, now()), updated_at = now()
          WHERE id = $1 AND status IN ('issued', 'accepted')`,
        [id]
      );
      await query(
        `UPDATE commercial_proposals
            SET status = 'cancelled', cancelled_at = now(), updated_at = now()
          WHERE rfq_id = $1 AND id <> $2 AND status IN ('draft', 'issued')`,
        [target.rfq_id, id]
      );
      await syncCommercialProposalLead(id);
      if (!alreadyAccepted) {
        await recordProposalActivity({
          rfqId: target.rfq_id,
          actorId: user.id,
          subject: `Kommersiya təklifi qəbul edildi: ${target.document_number}`,
          note: conversion.order?.orderNumber ? `Sifariş #${conversion.order.orderNumber} yaradıldı.` : ""
        });
        await recordAudit({
          actorId: user.id,
          action: "accept",
          entityType: "commercial_proposal",
          entityId: id,
          details: { rfqId: target.rfq_id, offerId: target.selected_offer_id, orderId: conversion.order?.id }
        });
      }
      return sendJson(res, 200, { ok: true, data: { proposal: await readProposal(id), order: conversion.order } });
    }

    if (!privileged) throw new ApiError(403, "permission_denied", "Bu əməliyyat yalnız satış komandası üçündür.");
    if (requestedStatus === "issued") {
      if (target.status !== "draft") throw new ApiError(409, "proposal_already_issued", "Yalnız qaralama təklif göndərilə bilər.");
      await query(
        "UPDATE commercial_proposals SET status = 'issued', issued_at = now(), updated_at = now() WHERE id = $1",
        [id]
      );
      await query("UPDATE rfqs SET status = 'Təklif alındı', updated_at = now() WHERE id = $1", [target.rfq_id]);
    } else {
      if (["accepted", "cancelled"].includes(target.status)) {
        throw new ApiError(409, "proposal_locked", "Qəbul edilmiş və ya ləğv olunmuş təklif dəyişdirilə bilməz.");
      }
      await query(
        "UPDATE commercial_proposals SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1",
        [id]
      );
    }
    await syncCommercialProposalLead(id);
    await recordProposalActivity({
      rfqId: target.rfq_id,
      actorId: user.id,
      subject: requestedStatus === "issued"
        ? `Kommersiya təklifi göndərildi: ${target.document_number}`
        : `Kommersiya təklifi ləğv edildi: ${target.document_number}`
    });
    await recordAudit({
      actorId: user.id,
      action: requestedStatus === "issued" ? "issue" : "cancel",
      entityType: "commercial_proposal",
      entityId: id,
      details: { rfqId: target.rfq_id }
    });
    if (requestedStatus === "issued" && target.customer_id && target.customer_id !== user.id) {
      await Promise.allSettled([queueNotification({
        userId: target.customer_id,
        subject: `Kommersiya təklifi hazırdır · ${target.document_number}`,
        body: `${target.rfq_title} üzrə ${Number(target.total_amount).toFixed(2)} ${target.currency} məbləğində təklif ${String(target.valid_until).slice(0, 10)} tarixinədək qüvvədədir.`,
        templateKey: "commercial_proposal_issued",
        payload: {
          proposalId: id,
          rfqId: target.rfq_id,
          documentNumber: target.document_number,
          validUntil: target.valid_until,
          url: `/proposal-detail.html?proposal=${encodeURIComponent(id)}`
        }
      })]);
    }
    return sendJson(res, 200, { ok: true, data: await readProposal(id) });
  }

  if (!privilegedRoles.includes(user.role)) {
    throw new ApiError(403, "permission_denied", "Kommersiya təklifini yalnız satış komandası hazırlaya bilər.");
  }
  assertCriticalTwoFactor(user);
  const rfqId = text(body.rfqId, { field: "Sorğu ID-si", required: true, max: 160 });
  const source = await sourceForProposal(rfqId);
  if (!source.rfq) throw new ApiError(404, "rfq_not_found", "Qiymət sorğusu tapılmadı.");
  if (source.rfq.order_id) {
    throw new ApiError(409, "rfq_already_converted", "Bu RFQ artıq sifarişə çevrilib və yeni kommersiya təklifi yaradıla bilməz.");
  }
  if (["Bağlandı", "Ləğv edildi"].includes(source.rfq.status)) {
    throw new ApiError(409, "rfq_closed", "Bağlanmış və ya ləğv edilmiş RFQ üçün yeni kommersiya təklifi yaradıla bilməz.");
  }
  const eligibleOffers = source.offers.filter((offer) =>
    ["draft", "submitted", "accepted"].includes(offer.status)
      && offer.supplier_id
      && offer.price_amount !== null
      && Number(offer.price_amount) > 0
  );
  const selectedOfferId = text(body.selectedOfferId, {
    field: "Seçilmiş təchizatçı təklifi",
    required: true,
    max: 160
  });
  const selectedOffer = eligibleOffers.find((offer) => offer.id === selectedOfferId);
  if (!selectedOffer) {
    throw new ApiError(409, "proposal_offer_required", "Kommersiya təklifi üçün qiyməti və təchizatçısı təsdiqlənmiş təklif seçilməlidir.");
  }

  const discountAmount = moneyValue(body.discountAmount, "Endirim");
  const deliveryAmount = moneyValue(body.deliveryAmount, "Çatdırılma məbləği");
  const subtotal = Number(selectedOffer.price_amount);
  if (discountAmount > subtotal) {
    throw new ApiError(400, "invalid_discount", "Endirim seçilmiş təklif məbləğindən böyük ola bilməz.");
  }
  const vatMode = oneOf(body.vatMode, proposalVatModes, "", "ƏDV rejimi");
  const vatRate = vatMode === "not_applicable" ? 0 : moneyValue(body.vatRate, "ƏDV dərəcəsi", 18);
  if (vatRate > 100) throw new ApiError(400, "invalid_vat_rate", "ƏDV dərəcəsi 100 faizdən böyük ola bilməz.");
  const totals = calculateCommercialProposalTotals({
    subtotal,
    discountAmount,
    deliveryAmount,
    vatMode,
    vatRate
  });
  const requestedAction = oneOf(body.action, ["draft", "issue"], "issue", "Əməliyyat");
  const parsedValidDays = Number.parseInt(body.validDays, 10);
  const validDays = Number.isFinite(parsedValidDays) ? parsedValidDays : 14;
  if (validDays < 1 || validDays > 90) {
    throw new ApiError(400, "invalid_validity", "Etibarlılıq müddəti 1-90 gün arasında olmalıdır.");
  }
  const bakuToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const validUntil = new Date(`${bakuToday}T00:00:00.000Z`);
  validUntil.setUTCDate(validUntil.getUTCDate() + validDays);
  const validUntilText = validUntil.toISOString().slice(0, 10);
  const [sequenceRows, versionRows] = await Promise.all([
    query("SELECT nextval('commercial_proposal_number_seq') AS value"),
    query("SELECT COALESCE(max(version), 0)::int + 1 AS value FROM commercial_proposals WHERE rfq_id = $1", [rfqId])
  ]);
  const documentNumber = formatCommercialProposalNumber(sequenceRows[0].value);
  const version = Number(versionRows[0]?.value || 1);
  const id = `proposal-${randomUUID()}`;
  const customerSnapshot = {
    title: source.rfq.title,
    companyName: source.rfq.company_name || source.rfq.account_company_name || "",
    taxId: source.rfq.account_company_tax_id || "",
    contactName: source.rfq.contact_name || source.rfq.account_name || "",
    email: source.rfq.email || source.rfq.account_email || "",
    phone: source.rfq.phone || source.rfq.account_company_phone || "",
    city: source.rfq.city || "",
    address: source.rfq.address || ""
  };
  const supplierSnapshot = {
    id: selectedOffer.supplier_id,
    name: selectedOffer.supplier_name || "Təchizatçı",
    type: selectedOffer.supplier_type || "Təchizatçı",
    region: selectedOffer.region || "Azərbaycan",
    contact: selectedOffer.contact || "",
    website: selectedOffer.website || "",
    offerId: selectedOffer.id,
    leadTime: selectedOffer.lead_time || "",
    delivery: selectedOffer.delivery || "",
    warranty: selectedOffer.warranty || ""
  };
  const itemsSnapshot = source.items.map((item) => ({
    id: item.id,
    kind: item.item_kind,
    itemId: item.item_id || "",
    title: item.title,
    quantity: item.quantity_text,
    unit: item.unit || "",
    specs: item.specs || []
  }));
  const offerComparison = source.offers.map((offer) => ({
    id: offer.id,
    supplierId: offer.supplier_id || "",
    supplier: offer.supplier_name || "Təchizatçı",
    priceAmount: offer.price_amount === null ? null : Number(offer.price_amount),
    price: offer.price_text || "Sorğu əsasında",
    currency: offer.currency || "AZN",
    leadTime: offer.lead_time || "",
    delivery: offer.delivery || "",
    warranty: offer.warranty || "",
    note: offer.note || "",
    status: offer.status,
    selected: offer.id === selectedOffer.id
  }));
  const status = requestedAction === "issue" ? "issued" : "draft";
  const rows = await query(
    `INSERT INTO commercial_proposals (
       id, document_number, rfq_id, selected_offer_id, customer_id, created_by,
       version, status, currency, subtotal, discount_amount, delivery_amount,
       vat_mode, vat_rate, vat_amount, total_amount, valid_until,
       payment_terms, delivery_terms, warranty_terms, note,
       customer_snapshot, supplier_snapshot, items_snapshot, offer_comparison, issued_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17,
       $18, $19, $20, $21,
       $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb,
       CASE WHEN $8 = 'issued' THEN now() ELSE NULL END
     )
     RETURNING *`,
    [
      id, documentNumber, rfqId, selectedOffer.id, source.rfq.customer_id, user.id,
      version, status, selectedOffer.currency || "AZN", totals.subtotal,
      totals.discountAmount, totals.deliveryAmount, totals.vatMode, totals.vatRate,
      totals.vatAmount, totals.totalAmount, validUntilText,
      text(body.paymentTerms, { max: 1_000 }) || "Bank köçürməsi ilə, proforma əsasında",
      text(body.deliveryTerms, { max: 1_000 }) || selectedOffer.delivery || "Sorğu üzrə razılaşdırılır",
      text(body.warrantyTerms, { max: 1_000 }) || selectedOffer.warranty || "İstehsalçı və təchizatçı şərtlərinə əsasən",
      text(body.note, { max: 3_000 }) || selectedOffer.note || null,
      JSON.stringify(customerSnapshot), JSON.stringify(supplierSnapshot),
      JSON.stringify(itemsSnapshot), JSON.stringify(offerComparison)
    ]
  );
  if (!rows[0]) throw new ApiError(500, "proposal_creation_failed", "Kommersiya təklifi yaradılmadı.");

  if (status === "issued") {
    await query("UPDATE rfqs SET status = 'Təklif alındı', updated_at = now() WHERE id = $1", [rfqId]);
  }
  await syncCommercialProposalLead(id);
  await recordProposalActivity({
    rfqId,
    actorId: user.id,
    subject: status === "issued"
      ? `Kommersiya təklifi göndərildi: ${documentNumber}`
      : `Kommersiya təklifi qaralama kimi yaradıldı: ${documentNumber}`,
    note: `${totals.totalAmount.toFixed(2)} ${selectedOffer.currency || "AZN"}`
  });
  await recordAudit({
    actorId: user.id,
    action: status === "issued" ? "issue" : "create",
    entityType: "commercial_proposal",
    entityId: id,
    details: { rfqId, selectedOfferId: selectedOffer.id, documentNumber, version }
  });
  if (status === "issued" && source.rfq.customer_id && source.rfq.customer_id !== user.id) {
    await Promise.allSettled([queueNotification({
      userId: source.rfq.customer_id,
      subject: `Kommersiya təklifi hazırdır · ${documentNumber}`,
      body: `${source.rfq.title} üzrə ${totals.totalAmount.toFixed(2)} ${selectedOffer.currency || "AZN"} məbləğində təklif ${validUntilText} tarixinədək qüvvədədir.`,
      templateKey: "commercial_proposal_issued",
      payload: {
        proposalId: id,
        rfqId,
        documentNumber,
        validUntil: validUntilText,
        url: `/proposal-detail.html?proposal=${encodeURIComponent(id)}`
      }
    })]);
  }
  return sendJson(res, 201, { ok: true, data: await readProposal(id) });
});
