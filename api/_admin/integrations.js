import { randomUUID, timingSafeEqual } from "node:crypto";
import { requireRole } from "../_lib/auth.js";
import { syncOrderLead } from "../_lib/crm.js";
import { query, recordAudit } from "../_lib/db.js";
import { priceEstimateWithCatalog } from "../_lib/estimate-catalog.js";
import { parseEstimateDocument } from "../_lib/estimate-import.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { deliverNotificationNow } from "../_lib/notifications.js";
import { readOrderDetails, recordOrderHistory } from "../_lib/order-lifecycle.js";
import {
  createPaymentCheckout,
  generateProviderEstimate,
  issueElectronicInvoice,
  providerReadiness
} from "../_lib/provider-adapters.js";
import { email, oneOf, text } from "../_lib/validation.js";

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

const paymentTransitionAllowed = (current, next) => (
  current === next
  || (["pending", "requires_action"].includes(current) && ["paid", "failed", "cancelled"].includes(next))
  || (current === "paid" && next === "refunded")
);

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const transactionId = text(req.query.transactionId, { max: 160 });
    if (!transactionId) {
      return sendJson(res, 200, { ok: true, data: { readiness: providerReadiness() } });
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
    const requestId = `ai-${randomUUID()}`;
    const estimate = await generateProviderEstimate({
      requestId,
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
    await recordAudit({
      actorId: user.id,
      action: "parse",
      entityType: "estimate_document",
      entityId: requestId,
      details: { fileName: parsed.fileName, sourceType: "pdf", rows: estimate.rows.length }
    });
    return sendJson(res, 200, {
      ok: true,
      data: { fileName: parsed.fileName, sourceType: "pdf-ai", requiresAi: true, rows: estimate.rows }
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

  if (action === "create-payment") {
    const user = await requireRole(req);
    const orderId = text(body.orderId, { field: "Sifariş ID-si", required: true, max: 160 });
    const order = await readOrderDetails(orderId);
    if (!order) throw new ApiError(404, "order_not_found", "Sifariş tapılmadı.");
    if (!privilegedRoles.includes(user.role) && order.customerId !== user.id) {
      throw new ApiError(403, "forbidden", "Bu sifariş üçün ödəniş yaratmaq icazəsi yoxdur.");
    }
    if (order.status === "cancelled" || order.paymentStatus === "paid") {
      throw new ApiError(409, "order_not_payable", "Bu sifariş üçün yeni ödəniş yaratmaq mümkün deyil.");
    }
    if (order.approvalStatus !== "not_required" && order.approvalStatus !== "approved") {
      throw new ApiError(409, "procurement_approval_required", "Kart ödənişindən əvvəl satınalma təsdiqi tamamlanmalıdır.");
    }
    if (order.hasPendingPrice || order.totalAmount === null || order.totalAmount <= 0) {
      throw new ApiError(409, "order_price_pending", "Kart ödənişindən əvvəl sifarişin yekun məbləği təsdiqlənməlidir.");
    }
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
    if (!providerReadiness().aiEstimate) throw new ApiError(503, "ai_estimate_not_configured", "Xarici AI smeta provayderi hələ qoşulmayıb.");
    const deterministicEstimate = body.deterministicEstimate && typeof body.deterministicEstimate === "object"
      ? body.deterministicEstimate
      : {};
    const input = body.input && typeof body.input === "object" ? body.input : {};
    const encoded = JSON.stringify({ deterministicEstimate, input });
    if (Buffer.byteLength(encoded, "utf8") > 120_000) throw new ApiError(413, "estimate_too_large", "AI smeta sorğusu maksimum 120 KB ola bilər.");
    const requestId = `ai-${randomUUID()}`;
    const estimate = await generateProviderEstimate({ requestId, input, deterministicEstimate });
    await recordAudit({ actorId: user.id, action: "generate", entityType: "ai_estimate", entityId: requestId });
    return sendJson(res, 200, { ok: true, data: { requestId, estimate } });
  }

  throw new ApiError(400, "invalid_integration_action", "İnteqrasiya əməliyyatı dəstəklənmir.");
});
