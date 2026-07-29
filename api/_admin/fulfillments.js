import { randomUUID } from "node:crypto";
import { requireRole } from "../_lib/auth.js";
import { syncOrderLead } from "../_lib/crm.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { mapFulfillment, consumeOrderReservations, releaseOrderReservations } from "../_lib/order-operations.js";
import { readOrder, recordOrderHistory } from "../_lib/order-lifecycle.js";
import { ensureSupplierPurchaseOrders } from "../_lib/purchase-orders.js";
import { oneOf, parseLimit, text } from "../_lib/validation.js";

const privilegedRoles = ["super_admin", "admin", "sales"];
const statuses = ["pending", "accepted", "preparing", "ready", "shipped", "delivered", "cancelled"];
const transitions = Object.freeze({
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: []
});

const mapRow = (row) => ({
  ...mapFulfillment(row),
  orderNumber: Number(row.order_number || 0),
  orderStatus: row.order_status || "",
  customerId: row.customer_id || null,
  companyName: row.company_name || "",
  city: row.city || "",
  currency: row.currency || "AZN",
  itemCount: Number(row.item_count || 0),
  amount: row.amount === null || row.amount === undefined ? null : Number(row.amount)
});

const loadFulfillment = async (id) => {
  const rows = await query(
    `SELECT fulfillment.*,
            supplier.name AS supplier_name,
            supplier.company_id AS supplier_company_id,
            orders.order_number,
            orders.status AS order_status,
            orders.customer_id,
            orders.company_name,
            orders.city,
            orders.currency,
            item_summary.item_count,
            item_summary.amount
       FROM order_fulfillments fulfillment
       JOIN suppliers supplier ON supplier.id = fulfillment.supplier_id
       JOIN orders ON orders.id = fulfillment.order_id
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS item_count,
                CASE
                  WHEN count(*) FILTER (WHERE item.line_total IS NULL) > 0 THEN NULL
                  ELSE sum(item.line_total)
                END AS amount
           FROM order_items item
          WHERE item.order_id = fulfillment.order_id
            AND item.supplier_id = fulfillment.supplier_id
       ) item_summary ON true
      WHERE fulfillment.id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

const deriveOrderStatus = (currentStatus, fulfillmentStatuses) => {
  if (!fulfillmentStatuses.length) return currentStatus;
  if (fulfillmentStatuses.every((status) => status === "cancelled")) return "cancelled";
  if (fulfillmentStatuses.every((status) => ["delivered", "cancelled"].includes(status))
    && fulfillmentStatuses.includes("delivered")) return "completed";
  if (fulfillmentStatuses.includes("shipped")) return "shipped";
  if (fulfillmentStatuses.some((status) => ["accepted", "preparing", "ready", "delivered"].includes(status))) {
    return "processing";
  }
  return currentStatus === "submitted" ? "confirmed" : currentStatus;
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req);
  const privileged = privilegedRoles.includes(user.role);

  if (req.method === "GET") {
    const limit = parseLimit(req.query.limit, 200, 500);
    const orderId = text(req.query.orderId, { max: 160 });
    const values = [];
    const where = [];
    if (orderId) {
      values.push(orderId);
      where.push(`fulfillment.order_id = $${values.length}`);
    }
    if (user.role === "supplier") {
      values.push(user.companyId || "none");
      where.push(`supplier.company_id = $${values.length}`);
    } else if (user.role === "customer") {
      values.push(user.id);
      where.push(`orders.customer_id = $${values.length}`);
    } else if (!privileged) {
      throw new ApiError(403, "forbidden", "Sifariş icralarına giriş icazəsi yoxdur.");
    }
    values.push(limit);
    const rows = await query(
      `SELECT fulfillment.*,
              supplier.name AS supplier_name,
              orders.order_number,
              orders.status AS order_status,
              orders.customer_id,
              orders.company_name,
              orders.city,
              orders.currency,
              item_summary.item_count,
              item_summary.amount
         FROM order_fulfillments fulfillment
         JOIN suppliers supplier ON supplier.id = fulfillment.supplier_id
         JOIN orders ON orders.id = fulfillment.order_id
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS item_count,
                  CASE
                    WHEN count(*) FILTER (WHERE item.line_total IS NULL) > 0 THEN NULL
                    ELSE sum(item.line_total)
                  END AS amount
             FROM order_items item
            WHERE item.order_id = fulfillment.order_id
              AND item.supplier_id = fulfillment.supplier_id
         ) item_summary ON true
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY fulfillment.updated_at DESC
        LIMIT $${values.length}`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows.map(mapRow) });
  }

  assertMethod(req, ["PATCH"]);
  assertSameOrigin(req);
  if (!privileged && user.role !== "supplier") {
    throw new ApiError(403, "forbidden", "Sifariş icrasını yeniləmək üçün təchizatçı rolu tələb olunur.");
  }
  const body = await readJson(req, 30_000);
  const id = text(body.id || req.query.id, { field: "İcra ID-si", required: true, max: 160 });
  const current = await loadFulfillment(id);
  if (!current) throw new ApiError(404, "fulfillment_not_found", "Sifariş icrası tapılmadı.");
  if (!privileged && current.supplier_company_id !== user.companyId) {
    throw new ApiError(403, "forbidden", "Bu sifariş icrası şirkətinizə aid deyil.");
  }
  const status = oneOf(body.status, statuses, current.status, "İcra statusu");
  if (status !== current.status && !transitions[current.status]?.includes(status)) {
    throw new ApiError(409, "invalid_fulfillment_transition", "İcra mərhələləri ardıcıllıqla dəyişdirilməlidir.", {
      current: current.status,
      allowed: transitions[current.status] || []
    });
  }
  const trackingCode = text(body.trackingCode ?? current.tracking_code, { max: 160 }) || null;
  const deliveryProvider = text(body.deliveryProvider ?? current.delivery_provider, { max: 200 }) || null;
  const note = text(body.note ?? current.note, { max: 1_000 }) || null;
  if (status === "shipped" && !trackingCode && !deliveryProvider) {
    throw new ApiError(400, "shipping_reference_required", "Göndəriş üçün izləmə kodu və ya çatdırılma şirkəti yazılmalıdır.");
  }

  await query(
    `UPDATE order_fulfillments
        SET status = $2,
            tracking_code = $3,
            delivery_provider = $4,
            note = $5,
            accepted_by = CASE WHEN $2 = 'accepted' THEN $6 ELSE accepted_by END,
            accepted_at = CASE WHEN $2 = 'accepted' THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
            shipped_at = CASE WHEN $2 = 'shipped' THEN COALESCE(shipped_at, now()) ELSE shipped_at END,
            delivered_at = CASE WHEN $2 = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
            updated_at = now()
      WHERE id = $1`,
    [id, status, trackingCode, deliveryProvider, note, user.id]
  );
  const trackingChanged = status !== current.status
    || trackingCode !== current.tracking_code
    || deliveryProvider !== current.delivery_provider
    || note !== current.note;
  if (trackingChanged) {
    await query(
      `INSERT INTO delivery_tracking_events (
         id, fulfillment_id, order_id, purchase_order_id, status,
         note, source, actor_id
       )
       SELECT $1, fulfillment.id, fulfillment.order_id, purchase_order.id, $3,
              $4, $5, $6
         FROM order_fulfillments fulfillment
         LEFT JOIN supplier_purchase_orders purchase_order
           ON purchase_order.fulfillment_id = fulfillment.id
        WHERE fulfillment.id = $2
        LIMIT 1`,
      [
        `trk-${randomUUID()}`,
        id,
        status,
        note || [deliveryProvider, trackingCode].filter(Boolean).join(" · ") || null,
        user.role === "supplier" ? "supplier" : "manual",
        user.id
      ]
    );
  }

  if (status === "cancelled") {
    await releaseOrderReservations(current.order_id, current.supplier_id, "Təchizatçı sifariş icrasını ləğv etdi");
  } else if (status === "delivered") {
    await consumeOrderReservations(current.order_id, current.supplier_id);
  }

  const statusRows = await query(
    "SELECT status FROM order_fulfillments WHERE order_id = $1 ORDER BY id",
    [current.order_id]
  );
  const order = await readOrder(current.order_id);
  const orderStatus = deriveOrderStatus(order.status, statusRows.map((item) => item.status));
  if (orderStatus !== order.status) {
    await query("UPDATE orders SET status = $2, updated_at = now() WHERE id = $1", [order.id, orderStatus]);
    await syncOrderLead(order.id);
    await recordOrderHistory({
      order,
      actorId: user.id,
      status: orderStatus,
      paymentStatus: order.paymentStatus,
      note: `${current.supplier_name} icra mərhələsini “${status}” olaraq yenilədi`
    });
  }
  await ensureSupplierPurchaseOrders(current.order_id);

  await recordAudit({
    actorId: user.id,
    action: "status_update",
    entityType: "order_fulfillment",
    entityId: id,
    details: {
      orderId: current.order_id,
      supplierId: current.supplier_id,
      fromStatus: current.status,
      toStatus: status,
      orderStatus
    }
  });
  if (current.customer_id) {
    await queueNotification({
      userId: current.customer_id,
      channel: "in_app",
      subject: `Sifariş #${Number(current.order_number)}`,
      body: `${current.supplier_name} üzrə icra vəziyyəti yeniləndi: ${status}.`,
      templateKey: "fulfillment_status_updated",
      payload: {
        orderId: current.order_id,
        fulfillmentId: id,
        supplierId: current.supplier_id,
        status,
        orderStatus
      }
    });
  }
  return sendJson(res, 200, { ok: true, data: mapRow(await loadFulfillment(id)) });
});
