import { randomUUID } from "node:crypto";
import { query } from "./db.js";

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

const mapPurchaseOrderItem = (item) => ({
  id: item.id,
  orderItemId: item.orderItemId,
  productId: item.productId || null,
  productOfferId: item.productOfferId || null,
  sku: item.sku || "",
  title: item.title || "",
  quantity: Number(item.quantity || 0),
  unit: item.unit || "ədəd",
  unitPrice: item.unitPrice === null || item.unitPrice === undefined ? null : Number(item.unitPrice),
  lineTotal: item.lineTotal === null || item.lineTotal === undefined ? null : Number(item.lineTotal),
  snapshot: item.snapshot || {}
});

export const mapSupplierPurchaseOrder = (row) => ({
  id: row.id,
  purchaseOrderNumber: Number(row.purchase_order_number),
  orderId: row.order_id,
  orderNumber: Number(row.order_number || row.snapshot?.orderNumber || 0),
  supplierId: row.supplier_id,
  supplierName: row.supplier_name || row.snapshot?.supplierName || "",
  fulfillmentId: row.fulfillment_id || null,
  status: row.status,
  itemCount: Number(row.item_count || 0),
  totalQuantity: Number(row.total_quantity || 0),
  subtotal: row.subtotal === null ? null : Number(row.subtotal),
  deliveryAmount: Number(row.delivery_amount || 0),
  totalAmount: row.total_amount === null ? null : Number(row.total_amount),
  currency: row.currency || "AZN",
  hasPendingPrice: Boolean(row.has_pending_price),
  leadTimeDays: row.lead_time_days === null ? null : Number(row.lead_time_days),
  companyName: row.company_name || row.snapshot?.companyName || "",
  contactName: row.contact_name || "",
  city: row.city || row.snapshot?.city || "",
  deliveryMode: row.delivery_mode || row.snapshot?.deliveryMode || "",
  orderStatus: row.order_status || "",
  fulfillmentStatus: row.fulfillment_status || "",
  snapshot: row.snapshot || {},
  items: (Array.isArray(row.items) ? row.items : []).map(mapPurchaseOrderItem),
  issuedAt: row.issued_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const purchaseOrderSelect = `
  SELECT purchase_order.*,
         orders.order_number,
         orders.company_name,
         orders.contact_name,
         orders.customer_id,
         orders.city,
         orders.delivery_mode,
         orders.status AS order_status,
         supplier.name AS supplier_name,
         supplier.company_id AS supplier_company_id,
         fulfillment.status AS fulfillment_status,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', purchase_item.id,
             'orderItemId', purchase_item.order_item_id,
             'productId', order_item.product_id,
             'productOfferId', order_item.product_offer_id,
             'sku', order_item.sku,
             'title', order_item.title,
             'quantity', purchase_item.quantity,
             'unit', purchase_item.unit,
             'unitPrice', purchase_item.unit_price,
             'lineTotal', purchase_item.line_total,
             'snapshot', purchase_item.snapshot
           ) ORDER BY order_item.created_at, purchase_item.id)
           FROM supplier_purchase_order_items purchase_item
           JOIN order_items order_item ON order_item.id = purchase_item.order_item_id
           WHERE purchase_item.purchase_order_id = purchase_order.id
         ), '[]'::json) AS items
    FROM supplier_purchase_orders purchase_order
    JOIN orders ON orders.id = purchase_order.order_id
    JOIN suppliers supplier ON supplier.id = purchase_order.supplier_id
    LEFT JOIN order_fulfillments fulfillment ON fulfillment.id = purchase_order.fulfillment_id`;

export const listSupplierPurchaseOrders = async ({
  id = "",
  orderId = "",
  supplierCompanyId = "",
  customerId = "",
  limit = 500
} = {}) => {
  const values = [];
  const where = [];
  const add = (condition, value) => {
    values.push(value);
    where.push(condition.replace("?", `$${values.length}`));
  };
  if (id) add("purchase_order.id = ?", id);
  if (orderId) add("purchase_order.order_id = ?", orderId);
  if (supplierCompanyId) add("supplier.company_id = ?", supplierCompanyId);
  if (customerId) add("orders.customer_id = ?", customerId);
  values.push(Math.max(1, Math.min(Number(limit) || 500, 1_000)));
  const rows = await query(
    `${purchaseOrderSelect}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY purchase_order.updated_at DESC, purchase_order.purchase_order_number DESC
      LIMIT $${values.length}`,
    values
  );
  return rows.map(mapSupplierPurchaseOrder);
};

export const readSupplierPurchaseOrders = async (orderId) =>
  listSupplierPurchaseOrders({ orderId, limit: 500 });

const allocateDelivery = (groups, deliveryAmount) => {
  const total = money(deliveryAmount);
  if (!groups.length || total <= 0) return new Map(groups.map((group) => [group.supplierId, 0]));
  const allPriced = groups.every((group) => group.subtotal !== null);
  const weightTotal = groups.reduce(
    (sum, group) => sum + (allPriced ? Number(group.subtotal || 0) : Number(group.totalQuantity || 0)),
    0
  );
  if (weightTotal <= 0) return new Map(groups.map((group, index) => [group.supplierId, index === groups.length - 1 ? total : 0]));
  let allocated = 0;
  return new Map(groups.map((group, index) => {
    const amount = index === groups.length - 1
      ? money(total - allocated)
      : money(total * (allPriced ? Number(group.subtotal || 0) : Number(group.totalQuantity || 0)) / weightTotal);
    allocated = money(allocated + amount);
    return [group.supplierId, amount];
  }));
};

const purchaseOrderStatus = (order, fulfillmentStatus) => {
  if (order.status === "cancelled" || order.approval_status === "rejected") return "cancelled";
  if (order.approval_status === "pending") return "draft";
  if (["accepted", "preparing", "ready", "shipped", "delivered", "cancelled"].includes(fulfillmentStatus)) {
    return fulfillmentStatus;
  }
  return "issued";
};

export const ensureSupplierPurchaseOrders = async (orderId) => {
  const orderRows = await query(
    `SELECT orders.*, quote.amount AS quoted_delivery_amount
       FROM orders
       LEFT JOIN delivery_quotes quote
         ON quote.order_id = orders.id
        AND quote.status = 'accepted'
      WHERE orders.id = $1
      LIMIT 1`,
    [orderId]
  );
  const order = orderRows[0];
  if (!order) return [];

  const itemRows = await query(
    `SELECT item.*, supplier.name AS supplier_name,
            fulfillment.id AS fulfillment_id,
            fulfillment.status AS fulfillment_status
       FROM order_items item
       JOIN suppliers supplier ON supplier.id = item.supplier_id
       LEFT JOIN order_fulfillments fulfillment
         ON fulfillment.order_id = item.order_id
        AND fulfillment.supplier_id = item.supplier_id
      WHERE item.order_id = $1
        AND item.supplier_id IS NOT NULL
      ORDER BY supplier.name, item.created_at, item.id`,
    [orderId]
  );
  if (!itemRows.length) return [];

  const groupsBySupplier = new Map();
  itemRows.forEach((item) => {
    if (!groupsBySupplier.has(item.supplier_id)) {
      groupsBySupplier.set(item.supplier_id, {
        supplierId: item.supplier_id,
        supplierName: item.supplier_name,
        fulfillmentId: item.fulfillment_id,
        fulfillmentStatus: item.fulfillment_status || "pending",
        items: []
      });
    }
    groupsBySupplier.get(item.supplier_id).items.push(item);
  });
  const groups = [...groupsBySupplier.values()].map((group) => {
    const pending = group.items.some((item) => item.line_total === null);
    const subtotal = pending
      ? null
      : money(group.items.reduce((sum, item) => sum + Number(item.line_total || 0), 0));
    const leadTimes = group.items
      .map((item) => Number(item.snapshot?.leadTimeDays))
      .filter((value) => Number.isFinite(value) && value >= 0);
    return {
      ...group,
      itemCount: group.items.length,
      totalQuantity: group.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      subtotal,
      hasPendingPrice: pending,
      leadTimeDays: leadTimes.length ? Math.max(...leadTimes) : null
    };
  }).sort((left, right) => left.supplierId.localeCompare(right.supplierId));

  const deliveryAmount = order.delivery_amount ?? order.quoted_delivery_amount ?? 0;
  const deliveryBySupplier = allocateDelivery(groups, deliveryAmount);
  for (const group of groups) {
    const allocatedDelivery = deliveryBySupplier.get(group.supplierId) || 0;
    const totalAmount = group.subtotal === null ? null : money(group.subtotal + allocatedDelivery);
    const desiredStatus = purchaseOrderStatus(order, group.fulfillmentStatus);
    const snapshot = {
      version: 1,
      orderNumber: Number(order.order_number),
      companyName: order.company_name,
      city: order.city,
      deliveryMode: order.delivery_mode,
      supplierName: group.supplierName,
      allocationMethod: groups.every((item) => item.subtotal !== null) ? "subtotal" : "quantity"
    };
    const rows = await query(
      `INSERT INTO supplier_purchase_orders (
         id, order_id, supplier_id, fulfillment_id, status,
         item_count, total_quantity, subtotal, delivery_amount, total_amount,
         currency, has_pending_price, lead_time_days, snapshot, issued_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14::jsonb,
         CASE WHEN $5 <> 'draft' THEN now() ELSE NULL END, now()
       )
       ON CONFLICT (order_id, supplier_id) DO UPDATE SET
         fulfillment_id = EXCLUDED.fulfillment_id,
         status = CASE
           WHEN supplier_purchase_orders.status IN ('delivered', 'cancelled')
             THEN supplier_purchase_orders.status
           WHEN EXCLUDED.status IN ('accepted', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled')
             THEN EXCLUDED.status
           WHEN EXCLUDED.status = 'draft' THEN 'draft'
           WHEN supplier_purchase_orders.status = 'draft' AND EXCLUDED.status = 'issued' THEN 'issued'
           ELSE supplier_purchase_orders.status
         END,
         item_count = EXCLUDED.item_count,
         total_quantity = EXCLUDED.total_quantity,
         subtotal = EXCLUDED.subtotal,
         delivery_amount = EXCLUDED.delivery_amount,
         total_amount = EXCLUDED.total_amount,
         currency = EXCLUDED.currency,
         has_pending_price = EXCLUDED.has_pending_price,
         lead_time_days = EXCLUDED.lead_time_days,
         snapshot = EXCLUDED.snapshot,
         issued_at = CASE
           WHEN supplier_purchase_orders.issued_at IS NULL AND EXCLUDED.status <> 'draft' THEN now()
           ELSE supplier_purchase_orders.issued_at
         END,
         updated_at = now()
       RETURNING id`,
      [
        `spo-${randomUUID()}`, orderId, group.supplierId, group.fulfillmentId,
        desiredStatus, group.itemCount, group.totalQuantity, group.subtotal,
        allocatedDelivery, totalAmount, order.currency || "AZN",
        group.hasPendingPrice, group.leadTimeDays, JSON.stringify(snapshot)
      ]
    );
    const purchaseOrderId = rows[0].id;
    for (const item of group.items) {
      const itemSnapshot = {
        ...(item.snapshot || {}),
        productId: item.product_id,
        productOfferId: item.product_offer_id,
        sku: item.sku,
        title: item.title
      };
      await query(
        `INSERT INTO supplier_purchase_order_items (
           id, purchase_order_id, order_item_id, quantity, unit,
           unit_price, line_total, snapshot
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (order_item_id) DO UPDATE SET
           purchase_order_id = EXCLUDED.purchase_order_id,
           quantity = EXCLUDED.quantity,
           unit = EXCLUDED.unit,
           unit_price = EXCLUDED.unit_price,
           line_total = EXCLUDED.line_total,
           snapshot = EXCLUDED.snapshot`,
        [
          `spi-${randomUUID()}`, purchaseOrderId, item.id, item.quantity, item.unit,
          item.unit_price, item.line_total, JSON.stringify(itemSnapshot)
        ]
      );
    }
  }
  return readSupplierPurchaseOrders(orderId);
};
