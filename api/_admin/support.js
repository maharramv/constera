import { randomUUID } from "node:crypto";
import { assertCriticalTwoFactor, requireRole } from "../_lib/auth.js";
import { syncOrderLead } from "../_lib/crm.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { readOrderDetails, recordOrderHistory } from "../_lib/order-lifecycle.js";
import { providerReadiness, refundPayment } from "../_lib/provider-adapters.js";
import { oneOf, parseLimit, parsePriceAmount, safeMediaUrl, text } from "../_lib/validation.js";

const adminRoles = ["super_admin", "admin", "sales"];
const caseTypes = ["support", "return", "refund", "dispute"];
const caseStatuses = [
  "open", "in_review", "awaiting_customer", "awaiting_supplier",
  "approved", "refund_pending", "resolved", "rejected", "closed"
];
const priorities = ["low", "normal", "high", "urgent"];

const parseMediaUrls = (value) => {
  const items = Array.isArray(value) ? value : String(value || "").split(/\r?\n|;/);
  return [...new Set(items.map((item) => safeMediaUrl(item)).filter(Boolean))].slice(0, 5);
};

const mapCase = (row) => ({
  id: row.id,
  caseNumber: Number(row.case_number),
  customerId: row.customer_id,
  customerName: row.customer_name || "",
  customerEmail: row.customer_email || "",
  orderId: row.order_id || null,
  orderNumber: row.order_number === null ? null : Number(row.order_number),
  orderTotal: row.order_total === null ? null : Number(row.order_total),
  orderPaymentStatus: row.order_payment_status || "",
  rentalBookingId: row.rental_booking_id || null,
  rentalTitle: row.rental_title || "",
  supplierId: row.supplier_id || null,
  supplierName: row.supplier_name || "",
  type: row.case_type,
  subject: row.subject,
  description: row.description,
  status: row.status,
  priority: row.priority,
  requestedAmount: row.requested_amount === null ? null : Number(row.requested_amount),
  approvedAmount: row.approved_amount === null ? null : Number(row.approved_amount),
  currency: row.currency,
  resolution: row.resolution || "",
  items: Array.isArray(row.items) ? row.items : [],
  messages: Array.isArray(row.messages) ? row.messages : [],
  refund: row.refund?.id ? {
    id: row.refund.id,
    amount: Number(row.refund.amount),
    currency: row.refund.currency,
    provider: row.refund.provider,
    status: row.refund.status,
    externalId: row.refund.externalId || "",
    error: row.refund.error || ""
  } : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  resolvedAt: row.resolved_at
});

const baseSelect = `
  support.*,
  customer.name AS customer_name,
  customer.email AS customer_email,
  supplier.name AS supplier_name,
  orders.order_number,
  orders.total_amount AS order_total,
  orders.payment_status AS order_payment_status,
  booking.rental_title,
  COALESCE((
    SELECT json_agg(json_build_object(
      'id', case_item.id,
      'orderItemId', case_item.order_item_id,
      'title', order_item.title,
      'quantity', case_item.quantity,
      'unit', order_item.unit,
      'reason', case_item.reason,
      'condition', case_item.condition,
      'resolution', case_item.resolution
    ) ORDER BY case_item.created_at)
    FROM support_case_items case_item
    LEFT JOIN order_items order_item ON order_item.id = case_item.order_item_id
    WHERE case_item.case_id = support.id
  ), '[]'::json) AS items,
  COALESCE((
    SELECT json_agg(json_build_object(
      'id', message.id,
      'authorId', message.author_id,
      'authorName', author.name,
      'authorRole', author.role,
      'body', message.body,
      'mediaUrls', message.media_urls,
      'internalNote', message.internal_note,
      'createdAt', message.created_at
    ) ORDER BY message.created_at)
    FROM support_case_messages message
    LEFT JOIN users author ON author.id = message.author_id
    WHERE message.case_id = support.id
  ), '[]'::json) AS messages,
  (
    SELECT json_build_object(
      'id', refund.id,
      'amount', refund.amount,
      'currency', refund.currency,
      'provider', refund.provider,
      'status', refund.status,
      'externalId', refund.external_id,
      'error', refund.error_text
    )
    FROM refund_transactions refund WHERE refund.case_id = support.id
  ) AS refund
`;

const caseScope = (user, values) => {
  if (adminRoles.includes(user.role)) return "";
  if (user.role === "customer") {
    values.push(user.id);
    return `support.customer_id = $${values.length}`;
  }
  if (user.role === "supplier") {
    values.push(user.companyId || "none");
    return `EXISTS (
      SELECT 1 FROM suppliers scoped_supplier
      WHERE scoped_supplier.id = support.supplier_id
        AND scoped_supplier.company_id = $${values.length}
    )`;
  }
  throw new ApiError(403, "support_forbidden", "Dəstək mərkəzinə giriş icazən yoxdur.");
};

const loadCases = async (user, { id = "", orderId = "", limit = 100 } = {}) => {
  const values = [];
  const where = [];
  const scope = caseScope(user, values);
  if (scope) where.push(scope);
  if (id) {
    values.push(id);
    where.push(`support.id = $${values.length}`);
  }
  if (orderId) {
    values.push(orderId);
    where.push(`support.order_id = $${values.length}`);
  }
  values.push(limit);
  const rows = await query(
    `SELECT ${baseSelect}
       FROM support_cases support
       JOIN users customer ON customer.id = support.customer_id
       LEFT JOIN suppliers supplier ON supplier.id = support.supplier_id
       LEFT JOIN orders ON orders.id = support.order_id
       LEFT JOIN rental_bookings booking ON booking.id = support.rental_booking_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY support.updated_at DESC
      LIMIT $${values.length}`,
    values
  );
  const privileged = adminRoles.includes(user.role);
  return rows.map(mapCase).map((supportCase) => ({
    ...supportCase,
    messages: privileged
      ? supportCase.messages
      : supportCase.messages.filter((message) => !message.internalNote)
  }));
};

const notifyCaseStakeholders = async (supportCase, actorId, subject, body) => {
  const recipients = new Set([supportCase.customerId]);
  const admins = await query("SELECT id FROM users WHERE role IN ('super_admin', 'admin', 'sales') AND status = 'active'");
  admins.forEach((item) => recipients.add(item.id));
  if (supportCase.supplierId) {
    const supplierUsers = await query(
      `SELECT users.id FROM users
       JOIN suppliers ON suppliers.company_id = users.company_id
       WHERE suppliers.id = $1 AND users.role = 'supplier' AND users.status = 'active'`,
      [supportCase.supplierId]
    );
    supplierUsers.forEach((item) => recipients.add(item.id));
  }
  recipients.delete(actorId);
  await Promise.allSettled([...recipients].map((userId) => queueNotification({
    userId,
    subject,
    body,
    templateKey: "support_case_updated",
    payload: { caseId: supportCase.id, caseNumber: supportCase.caseNumber, status: supportCase.status }
  })));
};

const markRefundCompleted = async ({ refundId, supportCase, actorId, externalId = "", payload = {} }) => {
  await query(
    `UPDATE refund_transactions
        SET status = 'completed', external_id = COALESCE(NULLIF($2, ''), external_id),
            payload = payload || $3::jsonb, error_text = NULL,
            processed_by = $4, completed_at = now(), updated_at = now()
      WHERE id = $1`,
    [refundId, externalId, JSON.stringify(payload), actorId]
  );
  await query(
    `UPDATE support_cases
        SET status = 'resolved', resolution = COALESCE(resolution, 'Geri ödəniş tamamlandı'),
            resolved_at = now(), updated_at = now()
      WHERE id = $1`,
    [supportCase.id]
  );
  if (supportCase.orderId && supportCase.approvedAmount !== null && supportCase.orderTotal !== null
    && supportCase.approvedAmount + 0.01 >= supportCase.orderTotal) {
    const order = await readOrderDetails(supportCase.orderId);
    if (order && order.paymentStatus !== "refunded") {
      await query("UPDATE orders SET payment_status = 'refunded', updated_at = now() WHERE id = $1", [order.id]);
      await recordOrderHistory({
        order,
        actorId,
        status: order.status,
        paymentStatus: "refunded",
        note: `Dəstək işi #${supportCase.caseNumber} üzrə geri ödəniş tamamlandı`
      });
      await syncOrderLead(order.id);
    }
  }
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req);
  if (req.method === "GET") {
    const cases = await loadCases(user, {
      id: text(req.query.id, { max: 160 }),
      orderId: text(req.query.orderId, { max: 160 }),
      limit: parseLimit(req.query.limit, 100, 500)
    });
    return sendJson(res, 200, { ok: true, data: { cases } });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 120_000);

  if (req.method === "POST") {
    if (user.role !== "customer") throw new ApiError(403, "customer_required", "Dəstək işi müştəri hesabından yaradılmalıdır.");
    const type = oneOf(body.type, caseTypes, "support", "Müraciət tipi");
    const orderId = text(body.orderId, { max: 160 }) || null;
    const rentalBookingId = text(body.rentalBookingId, { max: 160 }) || null;
    if (type !== "support" && !orderId && !rentalBookingId) {
      throw new ApiError(400, "case_source_required", "Qaytarma və mübahisə üçün sifariş və ya icarə seçilməlidir.");
    }
    const recent = await query(
      "SELECT count(*)::int AS count FROM support_cases WHERE customer_id = $1 AND created_at > now() - interval '24 hours'",
      [user.id]
    );
    if (Number(recent[0]?.count || 0) >= 10) throw new ApiError(429, "support_rate_limited", "24 saatlıq müraciət limiti dolub.");

    let order = null;
    let booking = null;
    let supplierId = text(body.supplierId, { max: 160 }) || null;
    if (orderId) {
      const rows = await query(
        `SELECT orders.*,
                COALESCE(json_agg(json_build_object(
                  'id', item.id, 'supplierId', item.supplier_id, 'title', item.title,
                  'quantity', item.quantity, 'unit', item.unit
                )) FILTER (WHERE item.id IS NOT NULL), '[]'::json) AS items
           FROM orders
           LEFT JOIN order_items item ON item.order_id = orders.id
          WHERE orders.id = $1 AND orders.customer_id = $2
          GROUP BY orders.id LIMIT 1`,
        [orderId, user.id]
      );
      order = rows[0] || null;
      if (!order) throw new ApiError(404, "order_not_found", "Sifariş tapılmadı.");
      if (["return", "refund"].includes(type) && order.status !== "completed") {
        throw new ApiError(409, "order_not_completed", "Qaytarma və geri ödəniş yalnız tamamlanmış sifariş üçün açılır.");
      }
      const supplierIds = [...new Set(order.items.map((item) => item.supplierId).filter(Boolean))];
      if (supplierId && !supplierIds.includes(supplierId)) throw new ApiError(400, "supplier_not_in_order", "Təchizatçı bu sifarişə aid deyil.");
      if (!supplierId && supplierIds.length === 1) supplierId = supplierIds[0];
    }
    if (rentalBookingId) {
      const rows = await query(
        "SELECT * FROM rental_bookings WHERE id = $1 AND customer_id = $2 LIMIT 1",
        [rentalBookingId, user.id]
      );
      booking = rows[0] || null;
      if (!booking) throw new ApiError(404, "rental_booking_not_found", "İcarə rezervasiyası tapılmadı.");
      if (["return", "refund"].includes(type) && booking.status !== "completed") {
        throw new ApiError(409, "rental_not_completed", "Qaytarma yalnız tamamlanmış icarə üçün açılır.");
      }
      supplierId = supplierId || booking.supplier_id || null;
    }
    const requestedAmount = parsePriceAmount(body.requestedAmount);
    if (requestedAmount !== null && order?.total_amount !== null && requestedAmount > Number(order.total_amount) + 0.01) {
      throw new ApiError(400, "refund_amount_exceeds_order", "Tələb edilən məbləğ sifariş məbləğini keçə bilməz.");
    }
    const id = `sup-${randomUUID()}`;
    const rows = await query(
      `INSERT INTO support_cases (
         id, customer_id, order_id, rental_booking_id, supplier_id,
         case_type, subject, description, priority, requested_amount, currency
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id, user.id, orderId, rentalBookingId, supplierId, type,
        text(body.subject, { field: "Mövzu", required: true, min: 3, max: 200 }),
        text(body.description, { field: "Təsvir", required: true, min: 10, max: 5_000 }),
        oneOf(body.priority, priorities, "normal", "Prioritet"),
        requestedAmount,
        oneOf(body.currency, ["AZN", "USD", "EUR"], order?.currency || booking?.currency || "AZN", "Valyuta")
      ]
    );
    const requestedItems = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
    for (const item of requestedItems) {
      const orderItemId = text(item.orderItemId, { max: 160 });
      const source = order?.items.find((entry) => entry.id === orderItemId);
      if (!source) throw new ApiError(400, "invalid_return_item", "Qaytarma mövqelərindən biri sifarişə aid deyil.");
      const quantity = Number(item.quantity || source.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(source.quantity)) {
        throw new ApiError(400, "invalid_return_quantity", `${source.title} üçün qaytarma miqdarı düzgün deyil.`);
      }
      await query(
        `INSERT INTO support_case_items (id, case_id, order_item_id, quantity, reason, condition)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `sci-${randomUUID()}`, id, orderItemId, quantity,
          text(item.reason, { max: 500 }) || null,
          text(item.condition, { max: 300 }) || null
        ]
      );
    }
    await query(
      `INSERT INTO support_case_messages (id, case_id, author_id, body, media_urls)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [`scm-${randomUUID()}`, id, user.id, rows[0].description, JSON.stringify(parseMediaUrls(body.mediaUrls))]
    );
    const created = (await loadCases(user, { id, limit: 1 }))[0];
    await notifyCaseStakeholders(created, user.id, `Yeni dəstək işi #${created.caseNumber}`, created.subject);
    await recordAudit({ actorId: user.id, action: "create", entityType: "support_case", entityId: id, details: { type, orderId, rentalBookingId } });
    return sendJson(res, 201, { ok: true, data: created });
  }

  const id = text(body.id, { field: "Dəstək işi ID-si", required: true, max: 160 });
  const current = (await loadCases(user, { id, limit: 1 }))[0];
  if (!current) throw new ApiError(404, "support_case_not_found", "Dəstək işi tapılmadı.");
  const action = oneOf(body.action, ["reply", "status", "approve-refund", "complete-refund"], "reply", "Dəstək əməliyyatı");

  if (action === "reply") {
    const internalNote = body.internalNote === true && adminRoles.includes(user.role);
    await query(
      `INSERT INTO support_case_messages (id, case_id, author_id, body, media_urls, internal_note)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        `scm-${randomUUID()}`, id, user.id,
        text(body.message, { field: "Mesaj", required: true, min: 2, max: 5_000 }),
        JSON.stringify(parseMediaUrls(body.mediaUrls)), internalNote
      ]
    );
    if (!internalNote) {
      const nextStatus = user.role === "customer" ? "awaiting_supplier" : "awaiting_customer";
      await query("UPDATE support_cases SET status = $2, updated_at = now() WHERE id = $1 AND status NOT IN ('resolved', 'rejected', 'closed')", [id, nextStatus]);
    }
  } else if (action === "status") {
    const next = oneOf(body.status, caseStatuses, current.status, "Dəstək vəziyyəti");
    if (user.role === "customer" && next !== "closed") {
      throw new ApiError(403, "status_forbidden", "Müştəri yalnız işi bağlaya bilər.");
    }
    if (user.role === "supplier" && !["in_review", "awaiting_customer"].includes(next)) {
      throw new ApiError(403, "status_forbidden", "Təchizatçı üçün bu vəziyyət dəyişikliyi açıq deyil.");
    }
    const resolution = text(body.resolution, { max: 2_000 }) || current.resolution || null;
    await query(
      `UPDATE support_cases
          SET status = $2, resolution = $3, assigned_to = COALESCE(assigned_to, $4),
              resolved_at = CASE WHEN $2 IN ('resolved', 'rejected', 'closed') THEN now() ELSE NULL END,
              updated_at = now()
        WHERE id = $1`,
      [id, next, resolution, adminRoles.includes(user.role) ? user.id : null]
    );
  } else {
    if (!adminRoles.includes(user.role)) throw new ApiError(403, "permission_denied", "Geri ödənişi yalnız administrator idarə edə bilər.");
    assertCriticalTwoFactor(user);
    if (!current.orderId) throw new ApiError(409, "refund_order_required", "Geri ödəniş üçün sifariş tələb olunur.");
    const amount = action === "approve-refund"
      ? parsePriceAmount(body.amount ?? current.requestedAmount)
      : current.approvedAmount;
    if (amount === null || amount <= 0 || (current.orderTotal !== null && amount > current.orderTotal + 0.01)) {
      throw new ApiError(400, "invalid_refund_amount", "Geri ödəniş məbləği düzgün deyil.");
    }
    const paymentRows = await query(
      `SELECT * FROM payment_transactions
        WHERE order_id = $1 AND status = 'paid'
        ORDER BY updated_at DESC LIMIT 1`,
      [current.orderId]
    );
    const payment = paymentRows[0] || null;
    const refundRows = await query(
      `INSERT INTO refund_transactions (
         id, case_id, order_id, payment_transaction_id, provider,
         amount, currency, processed_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (case_id) DO UPDATE SET
         amount = EXCLUDED.amount, processed_by = EXCLUDED.processed_by, updated_at = now()
       RETURNING *`,
      [
        `rfd-${randomUUID()}`, id, current.orderId, payment?.id || null,
        payment?.provider || "manual", amount, current.currency, user.id
      ]
    );
    const refund = refundRows[0];
    await query(
      `UPDATE support_cases
          SET status = 'refund_pending', approved_amount = $2,
              resolution = $3, assigned_to = $4, updated_at = now()
        WHERE id = $1`,
      [id, amount, text(body.resolution, { max: 2_000 }) || "Geri ödəniş təsdiqləndi", user.id]
    );
    const shouldExecute = action === "complete-refund" || body.execute === true;
    if (action === "complete-refund" && (!payment || !providerReadiness().payment)) {
      await markRefundCompleted({ refundId: refund.id, supportCase: { ...current, approvedAmount: amount }, actorId: user.id });
    } else if (shouldExecute && payment && providerReadiness().payment) {
      await query("UPDATE refund_transactions SET status = 'processing', updated_at = now() WHERE id = $1", [refund.id]);
      try {
        const order = await readOrderDetails(current.orderId);
        const result = await refundPayment({
          refund: { id: refund.id, amount, currency: current.currency, reason: text(body.resolution, { max: 500 }) || current.subject },
          transaction: payment,
          order
        });
        if (result.status === "completed") {
          await markRefundCompleted({
            refundId: refund.id,
            supportCase: { ...current, approvedAmount: amount },
            actorId: user.id,
            externalId: result.externalId,
            payload: result.payload
          });
        } else {
          await query(
            "UPDATE refund_transactions SET status = 'processing', external_id = $2, payload = $3::jsonb, updated_at = now() WHERE id = $1",
            [refund.id, result.externalId, JSON.stringify(result.payload)]
          );
        }
      } catch (error) {
        await query(
          "UPDATE refund_transactions SET status = 'failed', error_text = $2, updated_at = now() WHERE id = $1",
          [refund.id, String(error.message || "Geri ödəniş xətası").slice(0, 500)]
        );
        throw error;
      }
    }
  }

  const updated = (await loadCases(user, { id, limit: 1 }))[0];
  await notifyCaseStakeholders(updated, user.id, `Dəstək işi #${updated.caseNumber} yeniləndi`, `${updated.subject}: ${updated.status}`);
  await recordAudit({ actorId: user.id, action, entityType: "support_case", entityId: id, details: { status: updated.status } });
  return sendJson(res, 200, { ok: true, data: updated });
});
