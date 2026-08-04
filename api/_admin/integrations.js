import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { generateAiEstimate } from "../_lib/ai-foundation.js";
import { assertCriticalTwoFactor, requireRole } from "../_lib/auth.js";
import { syncOrderLead } from "../_lib/crm.js";
import { query, recordAudit } from "../_lib/db.js";
import { priceEstimateWithCatalog } from "../_lib/estimate-catalog.js";
import { parseEstimateDocument } from "../_lib/estimate-import.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { deliverNotificationNow, queueNotification } from "../_lib/notifications.js";
import { readOrderDetails, recordOrderHistory } from "../_lib/order-lifecycle.js";
import {
  bankTransferInstructions,
  createLogisticsShipment,
  createPaymentCheckout,
  issueElectronicInvoice,
  providerConfigurationStatus,
  providerReadiness
} from "../_lib/provider-adapters.js";
import { email, oneOf, safeUrl, text } from "../_lib/validation.js";

const privilegedRoles = ["super_admin", "admin", "sales"];

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
};

const verifyPaymentWebhook = (req) => {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET || "";
  const provided = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || !safeEqual(provided, expected)) {
    throw new ApiError(401, "invalid_webhook_signature", "Ödəniş webhook imzası düzgün deyil.");
  }
};

const readTransaction = async (id) => {
  const rows = await query(
    `SELECT transaction.*, orders.customer_id, orders.order_number
       FROM payment_transactions transaction
       JOIN orders ON orders.id = transaction.order_id
      WHERE transaction.id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

const readFulfillmentForShipment = async (id) => {
  const rows = await query(
    `SELECT fulfillment.id, fulfillment.order_id, fulfillment.supplier_id,
            fulfillment.status, fulfillment.tracking_code, fulfillment.delivery_provider,
            supplier.name AS supplier_name,
            orders.order_number, orders.status AS order_status,
            orders.payment_status, orders.payment_method,
            orders.company_name, orders.contact_name, orders.email, orders.phone,
            orders.city, orders.address, orders.delivery_mode,
            orders.total_amount, orders.currency,
            item_summary.items
       FROM order_fulfillments fulfillment
       JOIN suppliers supplier ON supplier.id = fulfillment.supplier_id
       JOIN orders ON orders.id = fulfillment.order_id
       LEFT JOIN LATERAL (
         SELECT coalesce(json_agg(json_build_object(
           'id', item.id,
           'productId', item.product_id,
           'sku', item.sku,
           'title', item.title,
           'quantity', item.quantity,
           'unit', item.unit,
           'lineTotal', item.line_total
         ) ORDER BY item.created_at), '[]'::json) AS items
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

const safeProviderPayload = (body) => ({
  eventId: text(body.eventId, { max: 200 }) || null,
  transactionId: text(body.transactionId, { max: 160 }) || null,
  externalId: text(body.externalId, { max: 200 }) || null,
  provider: text(body.provider, { max: 100 }) || null,
  status: text(body.status, { max: 40 }) || null,
  reason: text(body.reason || body.message, { max: 500 }) || null
});

const mapInvoice = (row) => ({
  id: row.id,
  orderId: row.order_id,
  provider: row.provider,
  externalId: row.external_id || "",
  status: row.status,
  documentUrl: row.document_url || "",
  issuedAt: row.issued_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapPayment = (row) => ({
  id: row.id,
  orderId: row.order_id,
  provider: row.provider,
  externalId: row.external_id || "",
  status: row.status,
  amount: Number(row.amount),
  currency: row.currency,
  reference: text(row.payload?.submission?.reference, { max: 160 }),
  payerName: text(row.payload?.submission?.payerName, { max: 200 }),
  paidAt: row.payload?.submission?.paidAt || null,
  reviewNote: text(row.payload?.review?.note, { max: 500 }),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const notifyPrivilegedUsers = async ({ subject, body, templateKey, payload }) => {
  const users = await query(
    "SELECT id FROM users WHERE status = 'active' AND role IN ('super_admin', 'admin', 'sales')"
  );
  await Promise.all(users.map((item) => queueNotification({
    userId: item.id,
    channel: "in_app",
    subject,
    body,
    templateKey,
    payload
  })));
};

const assertPayableOrder = (order, label) => {
  if (order.status === "cancelled" || order.paymentStatus === "paid") {
    throw new ApiError(409, "order_not_payable", `Bu sifariş üçün ${label} qəbul edilmir.`);
  }
  if (order.approvalStatus !== "not_required" && order.approvalStatus !== "approved") {
    throw new ApiError(409, "procurement_approval_required", `${label} əvvəl satınalma təsdiqi tamamlanmalıdır.`);
  }
  if (order.hasPendingPrice || order.totalAmount === null || order.totalAmount <= 0) {
    throw new ApiError(409, "order_price_pending", `${label} əvvəl sifarişin yekun məbləği təsdiqlənməlidir.`);
  }
};

const normalizedPaidAt = (value) => {
  const source = text(value, { max: 80 });
  if (!source) return null;
  const timestamp = Date.parse(source);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 86_400_000 || timestamp < Date.now() - 366 * 86_400_000) {
    throw new ApiError(400, "invalid_payment_date", "Ödəniş tarixi düzgün deyil.");
  }
  return new Date(timestamp).toISOString();
};

const paymentTransitionAllowed = (current, next) => (
  current === next
  || (["pending", "requires_action"].includes(current) && ["paid", "failed", "cancelled"].includes(next))
  || (current === "paid" && next === "refunded")
);

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const transactionId = text(req.query.transactionId, { max: 160 });
    if (!transactionId) {
      return sendJson(res, 200, {
        ok: true,
        data: {
          readiness: providerReadiness(),
          configuration: providerConfigurationStatus(),
          bankTransfer: bankTransferInstructions()
        }
      });
    }
    const user = await requireRole(req);
    const transaction = await readTransaction(transactionId);
    if (!transaction) throw new ApiError(404, "payment_not_found", "Ödəniş əməliyyatı tapılmadı.");
    if (!privilegedRoles.includes(user.role) && transaction.customer_id !== user.id) {
      throw new ApiError(403, "forbidden", "Bu ödəniş əməliyyatına giriş yoxdur.");
    }
    return sendJson(res, 200, {
      ok: true,
      data: {
        id: transaction.id,
        orderId: transaction.order_id,
        orderNumber: Number(transaction.order_number),
        status: transaction.status,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        checkoutUrl: transaction.checkout_url || ""
      }
    });
  }

  assertMethod(req, ["POST"]);
  const body = await readJson(req, 2_200_000);
  const action = text(body.action || req.query.action, { field: "Əməliyyat", required: true, max: 80 });

  if (action === "payment-webhook") {
    verifyPaymentWebhook(req);
    const transactionId = text(body.transactionId, { field: "Ödəniş ID-si", required: true, max: 160 });
    const status = oneOf(body.status, ["paid", "failed", "cancelled", "refunded"], "failed", "Ödəniş statusu");
    const eventId = `evt-${randomUUID()}`;
    const safePayload = safeProviderPayload(body);
    const currentTransaction = await readTransaction(transactionId);
    if (!currentTransaction) throw new ApiError(404, "payment_not_found", "Ödəniş əməliyyatı tapılmadı.");
    await query(
      `INSERT INTO integration_events (id, provider, event_type, external_id, payload)
       VALUES ($1, $2, 'payment_status', $3, $4::jsonb)`,
      [
        eventId,
        safePayload.provider || "payment_webhook",
        safePayload.externalId,
        JSON.stringify(safePayload)
      ]
    );
    if (!paymentTransitionAllowed(currentTransaction.status, status)) {
      await query(
        "UPDATE integration_events SET status = 'ignored', processed_at = now() WHERE id = $1",
        [eventId]
      );
      return sendJson(res, 200, {
        ok: true,
        data: { accepted: false, currentStatus: currentTransaction.status }
      });
    }
    const rows = await query(
      `UPDATE payment_transactions
          SET status = $2,
              external_id = COALESCE(NULLIF($3, ''), external_id),
              payload = payload || $4::jsonb,
              updated_at = now()
        WHERE id = $1
          AND status = $5
        RETURNING order_id`,
      [
        transactionId,
        status,
        safePayload.externalId,
        JSON.stringify({ webhook: safePayload }),
        currentTransaction.status
      ]
    );
    if (!rows[0]) {
      const latest = await readTransaction(transactionId);
      await query(
        "UPDATE integration_events SET status = 'ignored', processed_at = now() WHERE id = $1",
        [eventId]
      );
      return sendJson(res, 200, {
        ok: true,
        data: { accepted: false, currentStatus: latest?.status || currentTransaction.status }
      });
    }
    if (currentTransaction.status === status) {
      await query("UPDATE integration_events SET status = 'processed', processed_at = now() WHERE id = $1", [eventId]);
      return sendJson(res, 200, { ok: true, data: { accepted: true, duplicate: true } });
    }
    const paymentStatus = status === "paid" ? "paid" : status === "refunded" ? "refunded" : "failed";
    const order = await readOrderDetails(rows[0].order_id);
    await query("UPDATE orders SET payment_status = $2, updated_at = now() WHERE id = $1", [order.id, paymentStatus]);
    await recordOrderHistory({
      order,
      status: order.status,
      paymentStatus,
      note: `Ödəniş provayderi statusu: ${status}`
    });
    await syncOrderLead(order.id);
    await query("UPDATE integration_events SET status = 'processed', processed_at = now() WHERE id = $1", [eventId]);
    return sendJson(res, 200, { ok: true, data: { accepted: true } });
  }

  assertSameOrigin(req);
  if (action === "estimate-document") {
    const user = await requireRole(req);
    const parsed = await parseEstimateDocument({
      fileName: text(body.fileName, { field: "Fayl adı", required: true, max: 240 }),
      mimeType: text(body.mimeType, { max: 160 }),
      contentBase64: text(body.contentBase64, { field: "Fayl məlumatı", required: true, max: 2_100_000 })
    });
    if (!parsed.requiresAi) {
      await recordAudit({
        actorId: user.id,
        action: "parse",
        entityType: "estimate_document",
        details: { fileName: parsed.fileName, sourceType: parsed.sourceType, rows: parsed.rows.length }
      });
      return sendJson(res, 200, { ok: true, data: parsed });
    }
    if (!providerReadiness().aiEstimate) {
      throw new ApiError(503, "ai_estimate_not_configured", "PDF smetanın oxunması üçün AI sənəd provayderi qoşulmalıdır.");
    }
    const result = await generateAiEstimate({
      user,
      feature: "estimate_document",
      input: {
        document: {
          fileName: parsed.fileName,
          mimeType: "application/pdf",
          contentBase64: parsed.contentBase64
        },
        instruction: "Material adını, miqdarı, vahidi və kateqoriyanı Azərbaycan dilində strukturlaşdır."
      },
      deterministicEstimate: {}
    });
    const estimate = result.estimate;
    await recordAudit({
      actorId: user.id,
      action: "parse",
      entityType: "estimate_document",
      entityId: result.runId,
      details: { fileName: parsed.fileName, sourceType: "pdf", rows: estimate.rows.length }
    });
    return sendJson(res, 200, {
      ok: true,
      data: {
        fileName: parsed.fileName,
        sourceType: "pdf-ai",
        requiresAi: true,
        rows: estimate.rows,
        aiRunId: result.runId,
        confidence: result.confidence,
        sources: result.sources,
        warnings: result.warnings,
        approval: result.approval
      }
    });
  }

  if (action === "test-notification") {
    const user = await requireRole(req, ["super_admin", "admin"]);
    const channel = oneOf(body.channel, ["email", "whatsapp"], "email", "Bildiriş kanalı");
    if (!providerReadiness()[channel]) {
      throw new ApiError(503, "notification_not_configured", `${channel === "email" ? "E-poçt" : "WhatsApp"} provayderi qoşulmayıb.`);
    }
    const recipient = channel === "email"
      ? email(body.recipient)
      : text(body.recipient, { field: "Telefon", required: true, min: 7, max: 80 });
    const result = await deliverNotificationNow({
      channel,
      recipient,
      subject: "ConstEra inteqrasiya yoxlaması",
      body: "Bildiriş provayderi uğurla qoşulub və test mesajı göndərilib.",
      templateKey: "integration_test",
      payload: { testedBy: user.id }
    });
    await recordAudit({ actorId: user.id, action: "test", entityType: "notification_integration", entityId: channel });
    return sendJson(res, 200, { ok: true, data: { channel, sent: Boolean(result.sent) } });
  }

  if (action === "catalog-estimate") {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 30) : [];
    if (!rows.length) throw new ApiError(400, "estimate_rows_required", "Smeta üçün material sətirləri tələb olunur.");
    const encoded = JSON.stringify(rows);
    if (Buffer.byteLength(encoded, "utf8") > 100_000) {
      throw new ApiError(413, "estimate_too_large", "Kataloq qiymətləndirilməsi maksimum 100 KB ola bilər.");
    }
    return sendJson(res, 200, {
      ok: true,
      data: await priceEstimateWithCatalog(rows)
    });
  }

  if (action === "create-shipment") {
    const user = await requireRole(req, privilegedRoles);
    assertCriticalTwoFactor(user);
    if (!providerReadiness().logistics) {
      throw new ApiError(503, "logistics_not_configured", "Logistika provayderi hələ qoşulmayıb.");
    }
    const fulfillmentId = text(body.fulfillmentId, {
      field: "Sifariş icrası",
      required: true,
      max: 160
    });
    const fulfillment = await readFulfillmentForShipment(fulfillmentId);
    if (!fulfillment) throw new ApiError(404, "fulfillment_not_found", "Sifariş icrası tapılmadı.");
    if (fulfillment.status === "shipped" && fulfillment.tracking_code) {
      return sendJson(res, 200, {
        ok: true,
        duplicate: true,
        data: {
          fulfillmentId,
          trackingCode: fulfillment.tracking_code,
          provider: fulfillment.delivery_provider || ""
        }
      });
    }
    if (fulfillment.status !== "ready") {
      throw new ApiError(409, "fulfillment_not_ready", "Yalnız “hazır” mərhələsində olan sifariş icrası provayderə göndərilə bilər.");
    }
    if (fulfillment.delivery_mode === "pickup") {
      throw new ApiError(409, "pickup_shipment_not_allowed", "Özün götür sifarişi logistika provayderinə göndərilmir.");
    }
    if (fulfillment.payment_status !== "paid" && fulfillment.payment_method !== "invoice") {
      throw new ApiError(409, "shipment_payment_required", "Göndərişdən əvvəl ödəniş təsdiqlənməlidir.");
    }
    const result = await createLogisticsShipment({
      shipmentId: `shipment-${fulfillment.id}`,
      fulfillment: {
        id: fulfillment.id,
        supplierId: fulfillment.supplier_id,
        supplierName: fulfillment.supplier_name
      },
      order: {
        id: fulfillment.order_id,
        orderNumber: Number(fulfillment.order_number),
        companyName: fulfillment.company_name,
        contactName: fulfillment.contact_name,
        email: fulfillment.email,
        phone: fulfillment.phone,
        city: fulfillment.city,
        address: fulfillment.address,
        deliveryMode: fulfillment.delivery_mode,
        totalAmount: fulfillment.total_amount === null ? null : Number(fulfillment.total_amount),
        currency: fulfillment.currency
      },
      items: fulfillment.items || []
    });
    const updated = await query(
      `UPDATE order_fulfillments
          SET status = 'shipped', tracking_code = $2, delivery_provider = $3,
              note = concat_ws(E'\\n', NULLIF(note, ''), $4),
              shipped_at = COALESCE(shipped_at, now()), updated_at = now()
        WHERE id = $1 AND status = 'ready'
        RETURNING id`,
      [
        fulfillment.id,
        result.trackingCode,
        result.provider,
        `Logistika provayderi: ${result.externalId}`
      ]
    );
    if (!updated[0]) {
      throw new ApiError(409, "fulfillment_already_processed", "Sifariş icrası artıq başqa əməkdaş tərəfindən yenilənib.");
    }
    await query(
      `INSERT INTO delivery_tracking_events (
         id, fulfillment_id, order_id, purchase_order_id, status,
         note, source, actor_id
       )
       SELECT $1, fulfillment.id, fulfillment.order_id, purchase_order.id, 'shipped',
              $3, 'provider', $4
         FROM order_fulfillments fulfillment
         LEFT JOIN supplier_purchase_orders purchase_order
           ON purchase_order.fulfillment_id = fulfillment.id
        WHERE fulfillment.id = $2
        LIMIT 1`,
      [
        `trk-${randomUUID()}`,
        fulfillment.id,
        [result.provider, result.trackingCode].filter(Boolean).join(" · "),
        user.id
      ]
    );
    const order = await readOrderDetails(fulfillment.order_id);
    if (["confirmed", "processing"].includes(order.status)) {
      await query("UPDATE orders SET status = 'shipped', updated_at = now() WHERE id = $1", [order.id]);
      await recordOrderHistory({
        order,
        actorId: user.id,
        status: "shipped",
        paymentStatus: order.paymentStatus,
        note: `${fulfillment.supplier_name} göndərişi logistika provayderinə ötürüldü.`
      });
    }
    await syncOrderLead(order.id);
    await recordAudit({
      actorId: user.id,
      action: "create_shipment",
      entityType: "order_fulfillment",
      entityId: fulfillment.id,
      details: {
        orderId: order.id,
        provider: result.provider,
        trackingCode: result.trackingCode,
        externalId: result.externalId
      }
    });
    if (order.customerId) {
      await queueNotification({
        userId: order.customerId,
        channel: "in_app",
        subject: `Sifariş #${order.orderNumber}: göndəriş`,
        body: `${fulfillment.supplier_name} üzrə göndəriş ${result.provider} vasitəsilə yola salındı. İzləmə kodu: ${result.trackingCode}.`,
        templateKey: "shipment_created",
        payload: {
          orderId: order.id,
          fulfillmentId: fulfillment.id,
          trackingCode: result.trackingCode,
          provider: result.provider
        }
      });
    }
    return sendJson(res, 201, {
      ok: true,
      data: {
        fulfillmentId: fulfillment.id,
        orderId: order.id,
        trackingCode: result.trackingCode,
        provider: result.provider,
        labelUrl: result.labelUrl
      }
    });
  }

  if (action === "submit-bank-transfer") {
    const user = await requireRole(req);
    const orderId = text(body.orderId, { field: "Sifariş ID-si", required: true, max: 160 });
    const order = await readOrderDetails(orderId);
    if (!order) throw new ApiError(404, "order_not_found", "Sifariş tapılmadı.");
    if (!privilegedRoles.includes(user.role) && order.customerId !== user.id) {
      throw new ApiError(403, "forbidden", "Bu sifariş üçün bank köçürməsi təqdim etmək icazəsi yoxdur.");
    }
    assertPayableOrder(order, "Bank köçürməsi qeydindən");
    if (!providerReadiness().bankTransfer) {
      throw new ApiError(503, "bank_transfer_not_configured", "Bank köçürməsi rekvizitləri hələ qurulmayıb.");
    }
    const reference = text(body.reference, {
      field: "Bank əməliyyatı referansı",
      required: true,
      min: 4,
      max: 160
    });
    const payerName = text(body.payerName, { max: 200 }) || order.companyName || order.contactName;
    const paidAt = normalizedPaidAt(body.paidAt);
    const idempotencyKey = `bank-${createHash("sha256")
      .update(`${order.id}:${reference.toLocaleLowerCase("az-AZ")}`)
      .digest("hex")
      .slice(0, 40)}`;
    const pendingForOrder = (await query(
      `SELECT * FROM payment_transactions
        WHERE order_id = $1 AND provider = 'bank_transfer' AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
      [order.id]
    ))[0];
    if (pendingForOrder && pendingForOrder.idempotency_key !== idempotencyKey) {
      throw new ApiError(409, "bank_transfer_review_pending", "Bu sifariş üçün başqa bank köçürməsi artıq yoxlama gözləyir.");
    }
    const existing = (await query(
      "SELECT * FROM payment_transactions WHERE order_id = $1 AND idempotency_key = $2 LIMIT 1",
      [order.id, idempotencyKey]
    ))[0];
    if (existing?.status === "paid") {
      return sendJson(res, 200, { ok: true, data: mapPayment(existing), duplicate: true });
    }
    const transactionId = existing?.id || `pay-${randomUUID()}`;
    const submission = {
      reference,
      payerName,
      paidAt,
      submittedBy: user.id,
      submittedAt: new Date().toISOString()
    };
    const rows = existing
      ? await query(
        `UPDATE payment_transactions
            SET provider = 'bank_transfer', amount = $2, currency = $3, status = 'pending',
                payload = jsonb_build_object('submission', $4::jsonb),
                checkout_url = NULL, error_text = NULL, updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [transactionId, order.totalAmount, order.currency, JSON.stringify(submission)]
      )
      : await query(
        `INSERT INTO payment_transactions (
           id, order_id, provider, idempotency_key, amount, currency, status, payload
         ) VALUES ($1, $2, 'bank_transfer', $3, $4, $5, 'pending', $6::jsonb)
         RETURNING *`,
        [transactionId, order.id, idempotencyKey, order.totalAmount, order.currency, JSON.stringify({ submission })]
      );
    await query(
      "UPDATE orders SET payment_method = 'bank_transfer', payment_status = 'awaiting', updated_at = now() WHERE id = $1",
      [order.id]
    );
    await recordOrderHistory({
      order,
      actorId: user.id,
      status: order.status,
      paymentStatus: "awaiting",
      note: `Bank köçürməsi yoxlamaya təqdim edildi: ${reference}`
    });
    await recordAudit({
      actorId: user.id,
      action: "submit",
      entityType: "bank_transfer",
      entityId: transactionId,
      details: { orderId: order.id, reference }
    });
    await notifyPrivilegedUsers({
      subject: `Sifariş #${order.orderNumber}: bank köçürməsi`,
      body: `${payerName} tərəfindən ${Number(order.totalAmount).toFixed(2)} ${order.currency} köçürmə yoxlamaya təqdim edildi.`,
      templateKey: "bank_transfer_submitted",
      payload: { orderId: order.id, transactionId }
    });
    return sendJson(res, existing ? 200 : 201, { ok: true, data: mapPayment(rows[0]) });
  }

  if (action === "review-bank-transfer") {
    const user = await requireRole(req, privilegedRoles);
    assertCriticalTwoFactor(user);
    const transactionId = text(body.transactionId, { field: "Ödəniş ID-si", required: true, max: 160 });
    const decision = oneOf(body.decision, ["approve", "reject"], "reject", "Qərar");
    const note = text(body.note, { max: 500 });
    if (decision === "reject" && !note) {
      throw new ApiError(400, "review_note_required", "Rədd qərarı üçün səbəb yazılmalıdır.");
    }
    const transaction = await readTransaction(transactionId);
    if (!transaction || transaction.provider !== "bank_transfer") {
      throw new ApiError(404, "bank_transfer_not_found", "Bank köçürməsi qeydi tapılmadı.");
    }
    if (transaction.status !== "pending") {
      throw new ApiError(409, "bank_transfer_already_reviewed", "Bank köçürməsi artıq yoxlanılıb.");
    }
    const order = await readOrderDetails(transaction.order_id);
    const transactionStatus = decision === "approve" ? "paid" : "failed";
    const paymentStatus = decision === "approve" ? "paid" : "failed";
    const rows = await query(
      `UPDATE payment_transactions
          SET status = $2,
              payload = payload || jsonb_build_object(
                'review', jsonb_build_object(
                  'decision', $3::text, 'note', $4::text,
                  'reviewedBy', $5::text, 'reviewedAt', now()
                )
              ),
              error_text = CASE WHEN $2 = 'failed' THEN NULLIF($4, '') ELSE NULL END,
              updated_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [transactionId, transactionStatus, decision, note, user.id]
    );
    if (!rows[0]) throw new ApiError(409, "bank_transfer_already_reviewed", "Bank köçürməsi artıq başqa əməkdaş tərəfindən yoxlanılıb.");
    await query("UPDATE orders SET payment_status = $2, updated_at = now() WHERE id = $1", [order.id, paymentStatus]);
    await recordOrderHistory({
      order,
      actorId: user.id,
      status: order.status,
      paymentStatus,
      note: decision === "approve" ? "Bank köçürməsi təsdiqləndi." : `Bank köçürməsi rədd edildi: ${note}`
    });
    await recordAudit({
      actorId: user.id,
      action: decision,
      entityType: "bank_transfer",
      entityId: transactionId,
      details: { orderId: order.id, note }
    });
    await syncOrderLead(order.id);
    if (order.customerId) {
      await queueNotification({
        userId: order.customerId,
        channel: "in_app",
        subject: `Sifariş #${order.orderNumber}: ödəniş`,
        body: decision === "approve"
          ? "Bank köçürməsi təsdiqləndi."
          : `Bank köçürməsi təsdiqlənmədi: ${note}`,
        templateKey: "bank_transfer_reviewed",
        payload: { orderId: order.id, transactionId, decision }
      });
    }
    return sendJson(res, 200, { ok: true, data: mapPayment(rows[0]) });
  }

  if (action === "register-invoice") {
    const user = await requireRole(req, privilegedRoles);
    assertCriticalTwoFactor(user);
    const orderId = text(body.orderId, { field: "Sifariş ID-si", required: true, max: 160 });
    const order = await readOrderDetails(orderId);
    if (!order) throw new ApiError(404, "order_not_found", "Sifariş tapılmadı.");
    if (order.hasPendingPrice || order.totalAmount === null) {
      throw new ApiError(409, "order_price_pending", "Qaimə üçün yekun məbləğ təsdiqlənməlidir.");
    }
    const documentUrl = safeUrl(body.documentUrl, "Qaimə sənədi URL-i");
    if (!documentUrl) throw new ApiError(400, "invoice_document_required", "Qaimə sənədinin HTTPS URL-i tələb olunur.");
    const documentLocation = new URL(documentUrl);
    if (documentLocation.username || documentLocation.password) {
      throw new ApiError(400, "invalid_invoice_document", "Qaimə sənədi URL-ində giriş məlumatı ola bilməz.");
    }
    const reference = text(body.reference, { field: "Qaimə nömrəsi", required: true, min: 3, max: 200 });
    const note = text(body.note, { max: 500 });
    const current = (await query("SELECT * FROM electronic_invoices WHERE order_id = $1 LIMIT 1", [order.id]))[0];
    if (current?.status === "issued" && current.document_url !== documentUrl) {
      throw new ApiError(409, "invoice_already_issued", "Bu sifariş üçün qaimə artıq qeydə alınıb.");
    }
    const invoiceId = current?.id || `einv-${randomUUID()}`;
    const payload = { registeredBy: user.id, note, registeredAt: new Date().toISOString() };
    const rows = current
      ? await query(
        `UPDATE electronic_invoices
            SET provider = 'manual', external_id = $2, document_url = $3,
                payload = $4::jsonb, status = 'issued', issued_at = now(),
                error_text = NULL, updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [invoiceId, reference, documentUrl, JSON.stringify(payload)]
      )
      : await query(
        `INSERT INTO electronic_invoices (
           id, order_id, provider, external_id, status, document_url, payload, issued_at
         ) VALUES ($1, $2, 'manual', $3, 'issued', $4, $5::jsonb, now())
         RETURNING *`,
        [invoiceId, order.id, reference, documentUrl, JSON.stringify(payload)]
      );
    await recordAudit({
      actorId: user.id,
      action: "register",
      entityType: "electronic_invoice",
      entityId: invoiceId,
      details: { orderId, reference }
    });
    if (order.customerId) {
      await queueNotification({
        userId: order.customerId,
        channel: "in_app",
        subject: `Sifariş #${order.orderNumber}: qaimə`,
        body: `Qaimə ${reference} sifarişə əlavə edildi.`,
        templateKey: "invoice_registered",
        payload: { orderId, invoiceId }
      });
    }
    return sendJson(res, current ? 200 : 201, { ok: true, data: mapInvoice(rows[0]) });
  }

  if (action === "create-payment") {
    const user = await requireRole(req);
    const orderId = text(body.orderId, { field: "Sifariş ID-si", required: true, max: 160 });
    const order = await readOrderDetails(orderId);
    if (!order) throw new ApiError(404, "order_not_found", "Sifariş tapılmadı.");
    if (!privilegedRoles.includes(user.role) && order.customerId !== user.id) {
      throw new ApiError(403, "forbidden", "Bu sifariş üçün ödəniş yaratmaq icazəsi yoxdur.");
    }
    assertPayableOrder(order, "Kart ödənişindən");
    if (!providerReadiness().payment) throw new ApiError(503, "payment_not_configured", "Kart ödənişi provayderi hələ qoşulmayıb.");
    const idempotencyKey = text(body.idempotencyKey, { max: 160 }) || `order-${order.id}`;
    const existingRows = await query(
      "SELECT * FROM payment_transactions WHERE order_id = $1 AND idempotency_key = $2 LIMIT 1",
      [order.id, idempotencyKey]
    );
    if (existingRows[0]?.checkout_url && ["pending", "requires_action"].includes(existingRows[0].status)) {
      return sendJson(res, 200, { ok: true, data: {
        id: existingRows[0].id,
        status: existingRows[0].status,
        checkoutUrl: existingRows[0].checkout_url
      } });
    }
    const transactionId = existingRows[0]?.id || `pay-${randomUUID()}`;
    if (!existingRows[0]) {
      await query(
        `INSERT INTO payment_transactions (
           id, order_id, provider, idempotency_key, amount, currency
         ) VALUES ($1, $2, 'generic_webhook', $3, $4, $5)`,
        [transactionId, order.id, idempotencyKey, order.totalAmount, order.currency]
      );
    }
    try {
      const result = await createPaymentCheckout({
        transaction: { id: transactionId, idempotencyKey },
        order,
        returnUrl: `https://constera.az/order-detail.html?order=${encodeURIComponent(order.id)}`
      });
      await query(
        `UPDATE payment_transactions
            SET external_id = $2, checkout_url = $3, status = 'requires_action',
                payload = $4::jsonb, error_text = NULL, updated_at = now()
          WHERE id = $1`,
        [transactionId, result.externalId, result.checkoutUrl, JSON.stringify(result.payload)]
      );
      await query("UPDATE orders SET payment_method = 'card', payment_status = 'awaiting', updated_at = now() WHERE id = $1", [order.id]);
      await recordAudit({ actorId: user.id, action: "create", entityType: "payment_transaction", entityId: transactionId, details: { orderId: order.id } });
      return sendJson(res, 201, { ok: true, data: { id: transactionId, status: "requires_action", checkoutUrl: result.checkoutUrl } });
    } catch (error) {
      await query("UPDATE payment_transactions SET status = 'failed', error_text = $2, updated_at = now() WHERE id = $1", [transactionId, String(error.message || "Provider xətası").slice(0, 500)]);
      throw error;
    }
  }

  if (action === "issue-invoice") {
    const user = await requireRole(req, privilegedRoles);
    const orderId = text(body.orderId, { field: "Sifariş ID-si", required: true, max: 160 });
    const order = await readOrderDetails(orderId);
    if (!order) throw new ApiError(404, "order_not_found", "Sifariş tapılmadı.");
    if (order.hasPendingPrice || order.totalAmount === null) {
      throw new ApiError(409, "order_price_pending", "Elektron qaimə üçün yekun məbləğ təsdiqlənməlidir.");
    }
    if (!providerReadiness().electronicInvoice) throw new ApiError(503, "einvoice_not_configured", "Elektron qaimə provayderi hələ qoşulmayıb.");
    const existingRows = await query("SELECT * FROM electronic_invoices WHERE order_id = $1 LIMIT 1", [order.id]);
    if (existingRows[0]?.status === "issued") {
      return sendJson(res, 200, { ok: true, data: mapInvoice(existingRows[0]) });
    }
    const invoiceId = existingRows[0]?.id || `einv-${randomUUID()}`;
    if (!existingRows[0]) {
      await query(
        "INSERT INTO electronic_invoices (id, order_id, provider) VALUES ($1, $2, 'generic_webhook')",
        [invoiceId, order.id]
      );
    }
    try {
      const result = await issueElectronicInvoice({ invoiceId, order });
      const rows = await query(
        `UPDATE electronic_invoices
            SET external_id = $2, document_url = NULLIF($3, ''), payload = $4::jsonb,
                status = 'issued', issued_at = now(), error_text = NULL, updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [invoiceId, result.externalId, result.documentUrl, JSON.stringify(result.payload)]
      );
      await recordAudit({ actorId: user.id, action: "issue", entityType: "electronic_invoice", entityId: invoiceId, details: { orderId } });
      return sendJson(res, 201, { ok: true, data: mapInvoice(rows[0]) });
    } catch (error) {
      await query("UPDATE electronic_invoices SET status = 'failed', error_text = $2, updated_at = now() WHERE id = $1", [invoiceId, String(error.message || "Provider xətası").slice(0, 500)]);
      throw error;
    }
  }

  if (action === "ai-estimate") {
    const user = await requireRole(req);
    const deterministicEstimate = body.deterministicEstimate && typeof body.deterministicEstimate === "object"
      ? body.deterministicEstimate
      : {};
    const input = body.input && typeof body.input === "object" ? body.input : {};
    const encoded = JSON.stringify({ deterministicEstimate, input });
    if (Buffer.byteLength(encoded, "utf8") > 120_000) throw new ApiError(413, "estimate_too_large", "AI smeta sorğusu maksimum 120 KB ola bilər.");
    const result = await generateAiEstimate({ user, feature: "estimate_review", input, deterministicEstimate });
    return sendJson(res, 200, { ok: true, data: { ...result, requestId: result.runId } });
  }

  throw new ApiError(400, "invalid_integration_action", "İnteqrasiya əməliyyatı dəstəklənmir.");
});
