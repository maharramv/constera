import { randomUUID } from "node:crypto";
import { query } from "./db.js";
import { text } from "./validation.js";

const mapDocument = (row) => ({
  id: row.id,
  type: row.document_type,
  number: row.document_number,
  payload: row.payload || null,
  issuedAt: row.issued_at
});

export const mapOrder = (row) => ({
  id: row.id,
  orderNumber: Number(row.order_number),
  customerId: row.customer_id,
  rfqId: row.rfq_id || null,
  offerId: row.offer_id || null,
  companyName: row.company_name,
  contactName: row.contact_name,
  email: row.email,
  phone: row.phone,
  city: row.city,
  address: row.address,
  deliveryMode: row.delivery_mode,
  paymentMethod: row.payment_method,
  paymentStatus: row.payment_status,
  status: row.status,
  subtotal: row.subtotal === null ? null : Number(row.subtotal),
  deliveryAmount: row.delivery_amount === null ? null : Number(row.delivery_amount),
  totalAmount: row.total_amount === null ? null : Number(row.total_amount),
  currency: row.currency,
  hasPendingPrice: Boolean(row.has_pending_price),
  trackingCode: row.tracking_code || "",
  deliveryProvider: row.delivery_provider || "",
  note: row.note || "",
  items: row.items || [],
  documents: (row.documents || []).map(mapDocument),
  history: row.history || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const readOrder = async (id) => {
  const rows = await query(
    `SELECT o.*,
            COALESCE(json_agg(json_build_object(
              'id', i.id, 'productId', i.product_id, 'supplierId', i.supplier_id,
              'sku', i.sku, 'title', i.title, 'quantity', i.quantity, 'unit', i.unit,
              'unitPrice', i.unit_price, 'priceText', i.price_text,
              'lineTotal', i.line_total, 'snapshot', i.snapshot
            ) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items,
            COALESCE((
              SELECT json_agg(json_build_object(
                'id', document.id, 'document_type', document.document_type,
                'document_number', document.document_number, 'issued_at', document.issued_at
              ) ORDER BY document.issued_at DESC)
              FROM order_documents document WHERE document.order_id = o.id
            ), '[]'::json) AS documents
       FROM orders o
       LEFT JOIN order_items i ON i.order_id = o.id
      WHERE o.id = $1
      GROUP BY o.id
      LIMIT 1`,
    [id]
  );
  return rows[0] ? mapOrder(rows[0]) : null;
};

export const readOrderDetails = async (id) => {
  const order = await readOrder(id);
  if (!order) return null;
  const [historyRows, documentRows] = await Promise.all([
    query(
      `SELECT history.*, actor.name AS actor_name
         FROM order_status_history history
         LEFT JOIN users actor ON actor.id = history.actor_id
        WHERE history.order_id = $1
        ORDER BY history.created_at DESC`,
      [id]
    ),
    query(
      `SELECT id, document_type, document_number, payload, issued_at
         FROM order_documents
        WHERE order_id = $1
        ORDER BY issued_at DESC`,
      [id]
    )
  ]);
  return {
    ...order,
    documents: documentRows.map(mapDocument),
    history: historyRows.map((item) => ({
      id: item.id,
      actorName: item.actor_name || "Sistem",
      fromStatus: item.from_status,
      toStatus: item.to_status,
      fromPaymentStatus: item.from_payment_status,
      toPaymentStatus: item.to_payment_status,
      note: item.note || "",
      createdAt: item.created_at
    }))
  };
};

export const recordOrderHistory = async ({
  order,
  actorId = null,
  status,
  paymentStatus,
  note = ""
}) => {
  const rows = await query(
    `INSERT INTO order_status_history (
       id, order_id, actor_id, from_status, to_status,
       from_payment_status, to_payment_status, note
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      `osh-${randomUUID()}`,
      order.id,
      actorId,
      order.status || null,
      status,
      order.paymentStatus || null,
      paymentStatus,
      text(note, { max: 1_000 }) || null
    ]
  );
  return rows[0]?.id || null;
};

export const issueOrderDocument = async (order, documentType, actorId = null) => {
  if (!order) return null;
  if (documentType === "proforma_invoice" && (order.hasPendingPrice || order.totalAmount === null)) return null;
  const year = new Date().getUTCFullYear();
  const prefix = documentType === "proforma_invoice" ? "PF" : "SIF";
  const documentNumber = `${prefix}-${year}-${String(order.orderNumber).padStart(6, "0")}`;
  const snapshot = {
    version: 1,
    documentType,
    documentNumber,
    issuedAt: new Date().toISOString(),
    marketplace: {
      name: "ConstEra",
      note: documentType === "proforma_invoice"
        ? "Bu sənəd marketplace sifarişi üzrə proforma hesabdır və rəsmi vergi hesab-fakturasını əvəz etmir."
        : "ConstEra marketplace sifariş xülasəsi."
    },
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      rfqId: order.rfqId,
      offerId: order.offerId,
      companyName: order.companyName,
      contactName: order.contactName,
      email: order.email,
      phone: order.phone,
      city: order.city,
      address: order.address,
      deliveryMode: order.deliveryMode,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      status: order.status,
      trackingCode: order.trackingCode,
      deliveryProvider: order.deliveryProvider,
      subtotal: order.subtotal,
      deliveryAmount: order.deliveryAmount,
      totalAmount: order.totalAmount,
      currency: order.currency,
      note: order.note,
      items: order.items
    }
  };
  const rows = await query(
    `INSERT INTO order_documents (
       id, order_id, document_type, document_number, payload, issued_by
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (order_id, document_type) DO NOTHING
     RETURNING id, document_type, document_number, payload, issued_at`,
    [`doc-${randomUUID()}`, order.id, documentType, documentNumber, JSON.stringify(snapshot), actorId]
  );
  return rows[0] ? mapDocument(rows[0]) : null;
};
