import { randomUUID } from "node:crypto";
import { syncOrderLead } from "./crm.js";
import { query, recordAudit } from "./db.js";
import {
  issueOrderDocument,
  readOrderDetails,
  recordOrderHistory
} from "./order-lifecycle.js";
import { ensureOrderOperations } from "./order-operations.js";

const emailFromContact = (value) => {
  const match = String(value || "").match(/[^\s·,;<>]+@[^\s·,;<>]+\.[^\s·,;<>]+/);
  return match?.[0]?.toLowerCase() || "";
};

const phoneFromContact = (value) => {
  const source = String(value || "");
  const match = source.match(/(?:\+994|0)[\d\s()-]{7,}/);
  return match?.[0]?.trim() || "";
};

const loadAcceptedBid = async (bidId) => {
  const rows = await query(
    `SELECT
       bid.id AS bid_id, bid.tender_id, bid.supplier_id,
       bid.price_amount, bid.price_text, bid.currency,
       bid.validity, bid.delivery, bid.note AS bid_note,
       tender.customer_id, tender.created_by, tender.company_name,
       tender.title AS tender_title, tender.description,
       tender.city, tender.contact, tender.requirements,
       owner.name AS owner_name, owner.email AS owner_email,
       owner_company.phone AS owner_company_phone,
       supplier.name AS supplier_name,
       COALESCE(json_agg(json_build_object(
         'id', lot.id, 'title', lot.title, 'quantity', lot.quantity_text,
         'unit', lot.unit, 'specifications', lot.specifications
       ) ORDER BY lot.sort_order) FILTER (WHERE lot.id IS NOT NULL), '[]'::json) AS lots
     FROM tender_bids bid
     JOIN tenders tender ON tender.id = bid.tender_id
     LEFT JOIN users owner ON owner.id = COALESCE(tender.customer_id, tender.created_by)
     LEFT JOIN companies owner_company ON owner_company.id = owner.company_id
     LEFT JOIN suppliers supplier ON supplier.id = bid.supplier_id
     LEFT JOIN tender_lots lot ON lot.tender_id = tender.id
     WHERE bid.id = $1
       AND bid.status = 'accepted'
       AND bid.price_amount IS NOT NULL
       AND bid.price_amount > 0
       AND bid.supplier_id IS NOT NULL
     GROUP BY bid.id, tender.id, owner.id, owner_company.id, supplier.id
     LIMIT 1`,
    [bidId]
  );
  return rows[0] || null;
};

export const ensureOrderForAcceptedTenderBid = async ({ bidId, actorId = null }) => {
  const source = await loadAcceptedBid(bidId);
  if (!source) return null;

  const existingRows = await query(
    "SELECT id, tender_bid_id FROM orders WHERE tender_id = $1 LIMIT 1",
    [source.tender_id]
  );
  if (existingRows[0] && existingRows[0].tender_bid_id !== bidId) return null;
  let orderId = existingRows[0]?.id || "";
  let created = false;

  if (!orderId) {
    const contactEmail = emailFromContact(source.contact)
      || source.owner_email
      || `tender-${String(source.tender_id).replace(/[^a-z0-9]/gi, "").slice(-20)}@pending.constera.invalid`;
    const contactName = source.owner_name || source.company_name;
    const phone = phoneFromContact(source.contact)
      || source.owner_company_phone
      || "Tender üzrə dəqiqləşdirilir";
    const city = source.city || "Dəqiqləşdirilir";
    const note = [
      `Tender ${source.tender_id} üzrə ${source.supplier_name || "təchizatçı"} qalib təklifindən avtomatik yaradılıb.`,
      source.validity ? `Təklifin etibarlılığı: ${source.validity}.` : "",
      source.delivery ? `Çatdırılma: ${source.delivery}.` : "",
      source.bid_note || source.description || ""
    ].filter(Boolean).join(" ");
    const orderIdCandidate = `ord-${randomUUID()}`;
    const itemId = `ori-${randomUUID()}`;
    const shortTender = String(source.tender_id).replace(/[^a-z0-9]/gi, "").slice(-12).toUpperCase();
    const snapshot = {
      source: "tender_bid",
      tenderId: source.tender_id,
      tenderBidId: source.bid_id,
      supplierId: source.supplier_id,
      supplierName: source.supplier_name || "",
      lots: source.lots || [],
      requirements: source.requirements || [],
      validity: source.validity || "",
      delivery: source.delivery || "",
      bidNote: source.bid_note || ""
    };
    const rows = await query(
      `WITH new_order AS (
         INSERT INTO orders (
           id, customer_id, tender_id, tender_bid_id,
           company_name, contact_name, email, phone, city, address,
           delivery_mode, payment_method, payment_status, status,
           subtotal, delivery_amount, total_amount, currency,
           has_pending_price, note
         )
         SELECT
           $1, $2, $3, $4,
           $5, $6, $7, $8, $9, $9,
           'supplier_delivery', 'invoice', 'awaiting', 'confirmed',
           $10, 0, $10, $11,
           false, $12
         WHERE EXISTS (
           SELECT 1 FROM tender_bids accepted
           WHERE accepted.id = $4 AND accepted.status = 'accepted'
         )
         ON CONFLICT (tender_id) WHERE tender_id IS NOT NULL DO NOTHING
         RETURNING id
       ), new_item AS (
         INSERT INTO order_items (
           id, order_id, product_id, supplier_id, sku, title,
           quantity, unit, unit_price, price_text, line_total, snapshot
         )
         SELECT
           $13, new_order.id, NULL, $14, $15, $16,
           1, 'tender', $10, $17, $10, $18::jsonb
         FROM new_order
         RETURNING id
       )
       SELECT new_order.id
       FROM new_order
       WHERE EXISTS (SELECT 1 FROM new_item)`,
      [
        orderIdCandidate,
        source.customer_id || source.created_by,
        source.tender_id,
        source.bid_id,
        source.company_name,
        contactName,
        contactEmail,
        phone,
        city,
        Number(source.price_amount),
        source.currency || "AZN",
        note,
        itemId,
        source.supplier_id,
        `TENDER-${shortTender || "TEKLIF"}`,
        `Tender: ${source.tender_title}`,
        source.price_text || `${Number(source.price_amount).toFixed(2)} ${source.currency || "AZN"}`,
        JSON.stringify(snapshot)
      ]
    );
    orderId = rows[0]?.id || "";
    created = Boolean(orderId);
    if (!orderId) {
      const concurrentRows = await query(
        "SELECT id, tender_bid_id FROM orders WHERE tender_id = $1 LIMIT 1",
        [source.tender_id]
      );
      if (concurrentRows[0]?.tender_bid_id !== bidId) return null;
      orderId = concurrentRows[0]?.id || "";
    }
  }

  if (!orderId) return null;
  await ensureOrderOperations(orderId);
  await syncOrderLead(orderId);
  let order = await readOrderDetails(orderId);
  if (created) {
    await recordOrderHistory({
      order: { ...order, status: null, paymentStatus: null },
      actorId,
      status: "confirmed",
      paymentStatus: "awaiting",
      note: "Qalib tender təklifindən avtomatik yaradıldı"
    });
  }
  await issueOrderDocument(order, "order_summary", actorId);
  await issueOrderDocument(order, "proforma_invoice", actorId);
  order = await readOrderDetails(orderId);

  if (created) {
    await recordAudit({
      actorId,
      action: "convert",
      entityType: "order",
      entityId: orderId,
      details: {
        source: "tender_bid",
        tenderId: source.tender_id,
        tenderBidId: source.bid_id,
        supplierId: source.supplier_id
      }
    });
  }
  return { order, created };
};
