import { randomUUID } from "node:crypto";
import { syncOrderLead } from "./crm.js";
import { query, recordAudit } from "./db.js";
import {
  issueOrderDocument,
  readOrderDetails,
  recordOrderHistory
} from "./order-lifecycle.js";
import { ensureOrderOperations } from "./order-operations.js";
import { ensureSupplierPurchaseOrders } from "./purchase-orders.js";

const money = (value) => Math.round(Number(value) * 100) / 100;

export const parseRfqQuantity = (value) => {
  const match = String(value || "").match(/\d[\d\s]*(?:[.,]\d+)?/);
  if (!match) return 1;
  const quantity = Number(match[0].replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return 1;
  return Math.round(quantity * 1_000) / 1_000;
};

const unitFromQuantity = (value, fallback = "təklif") => {
  const unit = String(value || "")
    .replace(/\d[\d\s]*(?:[.,]\d+)?/, "")
    .trim()
    .slice(0, 80);
  return unit || fallback;
};

const deliveryModeFromRfq = (value) => {
  const normalized = String(value || "").toLocaleLowerCase("az-AZ");
  if (normalized.includes("götür") || normalized.includes("pickup")) return "pickup";
  if (normalized.includes("təchizatçı") || normalized.includes("supplier")) return "supplier_delivery";
  return "delivery";
};

const emailFromContact = (value) => {
  const match = String(value || "").match(/[^\s·,;<>]+@[^\s·,;<>]+\.[^\s·,;<>]+/);
  return match?.[0]?.toLowerCase() || "";
};

const loadAcceptedOffer = async (offerId) => {
  const rows = await query(
    `SELECT
       offer.id AS offer_id, offer.rfq_id, offer.supplier_id,
       offer.price_amount, offer.price_text, offer.currency,
       offer.lead_time, offer.delivery, offer.warranty, offer.note AS offer_note,
       rfq.customer_id, rfq.rfq_type, rfq.title AS rfq_title,
       rfq.company_name, rfq.contact, rfq.contact_name,
       rfq.email AS rfq_email, rfq.phone AS rfq_phone,
       rfq.city, rfq.address, rfq.delivery_mode, rfq.note AS rfq_note,
       customer.name AS customer_name, customer.email AS customer_email,
       customer_company.phone AS customer_company_phone,
       supplier.name AS supplier_name,
       COALESCE(json_agg(json_build_object(
         'id', item.id, 'kind', item.item_kind, 'itemId', item.item_id,
         'title', item.title, 'quantity', item.quantity_text,
         'unit', item.unit, 'specs', item.specs
       ) ORDER BY item.created_at) FILTER (WHERE item.id IS NOT NULL), '[]'::json) AS requested_items
     FROM offers offer
     JOIN rfqs rfq ON rfq.id = offer.rfq_id
     LEFT JOIN users customer ON customer.id = rfq.customer_id
     LEFT JOIN companies customer_company ON customer_company.id = customer.company_id
     LEFT JOIN suppliers supplier ON supplier.id = offer.supplier_id
     LEFT JOIN rfq_items item ON item.rfq_id = rfq.id
     WHERE offer.id = $1
       AND offer.status = 'accepted'
       AND offer.price_amount IS NOT NULL
       AND offer.price_amount > 0
       AND offer.supplier_id IS NOT NULL
     GROUP BY
       offer.id, rfq.id, customer.id, customer_company.id, supplier.id
     LIMIT 1`,
    [offerId]
  );
  return rows[0] || null;
};

const buildOrderItem = async (source) => {
  const requestedItems = source.requested_items || [];
  const single = requestedItems.length === 1 ? requestedItems[0] : null;
  const productRows = single?.kind === "product" && single.itemId
    ? await query(
        `SELECT id, sku, name, brand, package_text, image_url
           FROM products
          WHERE id = $1
          LIMIT 1`,
        [single.itemId]
      )
    : [];
  const product = productRows[0] || null;
  const quantity = product ? parseRfqQuantity(single.quantity) : 1;
  const unitPrice = product ? money(Number(source.price_amount) / quantity) : Number(source.price_amount);
  const shortRfq = String(source.rfq_id).replace(/[^a-z0-9]/gi, "").slice(-12).toUpperCase();
  return {
    id: `ori-${randomUUID()}`,
    productId: product?.id || null,
    supplierId: source.supplier_id,
    sku: product?.sku || `RFQ-${shortRfq || "TEKLIF"}`,
    title: product?.name || `RFQ: ${source.rfq_title}`,
    quantity,
    unit: product
      ? single.unit || unitFromQuantity(single.quantity, product.package_text || "ədəd")
      : "təklif",
    unitPrice,
    priceText: source.price_text
      || `${Number(source.price_amount).toLocaleString("az-AZ", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })} ${source.currency || "AZN"}`,
    lineTotal: Number(source.price_amount),
    snapshot: {
      source: "rfq_offer",
      rfqId: source.rfq_id,
      offerId: source.offer_id,
      rfqType: source.rfq_type,
      supplierId: source.supplier_id,
      supplierName: source.supplier_name || "",
      requestedItems,
      leadTime: source.lead_time || "",
      delivery: source.delivery || "",
      warranty: source.warranty || "",
      offerNote: source.offer_note || "",
      ...(product ? {
        brand: product.brand || "",
        package: product.package_text || "",
        imageUrl: product.image_url || ""
      } : {})
    }
  };
};

export const ensureOrderForAcceptedOffer = async ({ offerId, actorId = null }) => {
  const source = await loadAcceptedOffer(offerId);
  if (!source) return null;

  const existingRows = await query(
    "SELECT id, offer_id FROM orders WHERE rfq_id = $1 LIMIT 1",
    [source.rfq_id]
  );
  if (existingRows[0] && existingRows[0].offer_id !== offerId) return null;
  let orderId = existingRows[0]?.id || "";
  let created = false;

  if (!orderId) {
    const item = await buildOrderItem(source);
    const extractedEmail = emailFromContact(source.contact);
    const contactEmail = source.rfq_email
      || source.customer_email
      || extractedEmail
      || `rfq-${String(source.rfq_id).replace(/[^a-z0-9]/gi, "").slice(-20)}@pending.constera.invalid`;
    const contactName = source.contact_name || source.customer_name || source.company_name;
    const phone = source.rfq_phone || source.customer_company_phone || source.contact || "RFQ üzrə dəqiqləşdirilir";
    const city = source.city || "Dəqiqləşdirilir";
    const address = source.address || source.city || "RFQ üzrə dəqiqləşdirilir";
    const orderNote = [
      `RFQ ${source.rfq_id} üzrə ${source.supplier_name || "təchizatçı"} qalib təklifindən avtomatik yaradılıb.`,
      source.lead_time ? `Təchizat müddəti: ${source.lead_time}.` : "",
      source.delivery ? `Çatdırılma: ${source.delivery}.` : "",
      source.warranty ? `Zəmanət: ${source.warranty}.` : "",
      source.offer_note || source.rfq_note || ""
    ].filter(Boolean).join(" ");
    const newOrderId = `ord-${randomUUID()}`;
    const rows = await query(
      `WITH new_order AS (
         INSERT INTO orders (
           id, customer_id, rfq_id, offer_id,
           company_name, contact_name, email, phone, city, address,
           delivery_mode, payment_method, payment_status, status,
           subtotal, delivery_amount, total_amount, currency,
           has_pending_price, note
         )
         SELECT
           $1, $2, $3, $4,
           $5, $6, $7, $8, $9, $10,
           $11, 'invoice', 'awaiting', 'confirmed',
           $12, 0, $12, $13,
           false, $14
         WHERE EXISTS (
           SELECT 1 FROM offers accepted
           WHERE accepted.id = $4 AND accepted.status = 'accepted'
         )
         ON CONFLICT (rfq_id) WHERE rfq_id IS NOT NULL DO NOTHING
         RETURNING id
       ), new_item AS (
         INSERT INTO order_items (
           id, order_id, product_id, supplier_id, sku, title,
           quantity, unit, unit_price, price_text, line_total, snapshot
         )
         SELECT
           $15, new_order.id, $16, $17, $18, $19,
           $20, $21, $22, $23, $24, $25::jsonb
         FROM new_order
         RETURNING id
       )
       SELECT new_order.id
       FROM new_order
       WHERE EXISTS (SELECT 1 FROM new_item)`,
      [
        newOrderId,
        source.customer_id,
        source.rfq_id,
        source.offer_id,
        source.company_name,
        contactName,
        contactEmail,
        phone,
        city,
        address,
        deliveryModeFromRfq(source.delivery_mode),
        Number(source.price_amount),
        source.currency || "AZN",
        orderNote,
        item.id,
        item.productId,
        item.supplierId,
        item.sku,
        item.title,
        item.quantity,
        item.unit,
        item.unitPrice,
        item.priceText,
        item.lineTotal,
        JSON.stringify(item.snapshot)
      ]
    );
    orderId = rows[0]?.id || "";
    created = Boolean(orderId);
    if (!orderId) {
      const concurrentRows = await query(
        "SELECT id, offer_id FROM orders WHERE rfq_id = $1 LIMIT 1",
        [source.rfq_id]
      );
      if (concurrentRows[0]?.offer_id !== offerId) return null;
      orderId = concurrentRows[0]?.id || "";
    }
  }

  if (!orderId) return null;
  await ensureOrderOperations(orderId);
  await ensureSupplierPurchaseOrders(orderId);
  await syncOrderLead(orderId);
  let order = await readOrderDetails(orderId);
  if (created) {
    await recordOrderHistory({
      order: { ...order, status: null, paymentStatus: null },
      actorId,
      status: "confirmed",
      paymentStatus: "awaiting",
      note: "Qalib RFQ təklifindən avtomatik yaradıldı"
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
        source: "rfq_offer",
        rfqId: source.rfq_id,
        offerId: source.offer_id,
        supplierId: source.supplier_id
      }
    });
  }
  return { order, created };
};
