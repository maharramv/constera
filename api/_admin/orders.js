import { randomUUID } from "node:crypto";
import { getSessionUser, hashOpaque, requireRole } from "../_lib/auth.js";
import { syncOrderLead } from "../_lib/crm.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, getClientIp, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { calculateDeliveryQuote, saveDeliveryQuote } from "../_lib/logistics.js";
import {
  issueOrderDocument,
  mapOrder,
  readOrder,
  readOrderDetails,
  recordOrderHistory
} from "../_lib/order-lifecycle.js";
import {
  ensureOrderOperations,
  syncOperationsForOrderStatus
} from "../_lib/order-operations.js";
import { chooseProductOffer, loadOffersForProducts } from "../_lib/product-offers.js";
import { ensureSupplierPurchaseOrders } from "../_lib/purchase-orders.js";
import { email, oneOf, parseLimit, parsePriceAmount, text } from "../_lib/validation.js";

const orderStatuses = ["submitted", "confirmed", "processing", "shipped", "completed", "cancelled"];
const paymentStatuses = ["pending", "awaiting", "paid", "failed", "refunded"];
const paymentMethods = ["invoice", "bank_transfer", "card"];
const deliveryModes = ["delivery", "pickup", "supplier_delivery"];
const privilegedRoles = ["super_admin", "admin", "sales"];
const allowedOrderTransitions = Object.freeze({
  submitted: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["completed"],
  completed: [],
  cancelled: []
});

export const parseOrderQuantity = (value) => {
  const quantity = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new ApiError(400, "validation_error", "Məhsul miqdarı 0-dan böyük olmalıdır.");
  }
  return Math.round(quantity * 1_000) / 1_000;
};

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const user = await requireRole(req);
    const id = text(req.query.id, { max: 160 });
    if (id) {
      const order = await readOrderDetails(id);
      if (!order) throw new ApiError(404, "order_not_found", "Sifariş tapılmadı.");
      if (user.role === "customer" && order.customerId !== user.id) {
        throw new ApiError(403, "forbidden", "Bu sifarişə giriş yoxdur.");
      }
      if (user.role === "supplier") {
        const visibleRows = await query(
          `SELECT item.id
             FROM order_items item
             LEFT JOIN products product ON product.id = item.product_id
             JOIN suppliers supplier ON supplier.id = COALESCE(item.supplier_id, product.supplier_id)
            WHERE item.order_id = $1 AND supplier.company_id = $2`,
          [id, user.companyId || "none"]
        );
        const visibleIds = new Set(visibleRows.map((item) => item.id));
        if (!visibleIds.size) throw new ApiError(403, "forbidden", "Bu sifarişə giriş yoxdur.");
        const visibleSupplierIds = new Set(order.items
          .filter((item) => visibleIds.has(item.id))
          .map((item) => item.supplierId)
          .filter(Boolean));
        order.items = order.items.filter((item) => visibleIds.has(item.id));
        order.fulfillments = order.fulfillments.filter((item) => visibleSupplierIds.has(item.supplierId));
        order.reservations = order.reservations.filter((item) => visibleIds.has(item.orderItemId));
        order.purchaseOrders = order.purchaseOrders.filter((item) => visibleSupplierIds.has(item.supplierId));
        order.documents = [];
        order.procurement = null;
      }
      return sendJson(res, 200, { ok: true, data: order });
    }
    const limit = parseLimit(req.query.limit, 100, 500);
    const values = [];
    const where = [];
    let itemJoin = "LEFT JOIN order_items i ON i.order_id = o.id";
    if (user.role === "customer") {
      values.push(user.id);
      where.push(`o.customer_id = $${values.length}`);
    } else if (user.role === "supplier") {
      values.push(user.companyId || "none");
      itemJoin = `LEFT JOIN order_items i ON i.order_id = o.id AND EXISTS (
        SELECT 1
        FROM suppliers visible_supplier
        LEFT JOIN products visible_product ON visible_product.id = i.product_id
        WHERE visible_supplier.id = COALESCE(i.supplier_id, visible_product.supplier_id)
          AND visible_supplier.company_id = $${values.length}
      )`;
      where.push(`EXISTS (
        SELECT 1 FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        JOIN suppliers s ON s.id = COALESCE(oi.supplier_id, p.supplier_id)
        WHERE oi.order_id = o.id
          AND s.company_id = $${values.length}
      )`);
    }
    values.push(limit);
    const rows = await query(
      `SELECT o.*,
              COALESCE(json_agg(json_build_object(
                'id', i.id, 'productId', i.product_id, 'supplierId', i.supplier_id,
                'productOfferId', i.product_offer_id,
                'sku', i.sku, 'title', i.title,
                'quantity', i.quantity, 'unit', i.unit, 'unitPrice', i.unit_price,
                'priceText', i.price_text, 'lineTotal', i.line_total, 'snapshot', i.snapshot
              ) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', document.id, 'document_type', document.document_type,
                  'document_number', document.document_number, 'issued_at', document.issued_at
                ) ORDER BY document.issued_at DESC)
                FROM order_documents document WHERE document.order_id = o.id
              ), '[]'::json) AS documents
         FROM orders o
         ${itemJoin}
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT $${values.length}`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows.map(mapOrder) });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 120_000);

  if (req.method === "PATCH") {
    const user = await requireRole(req);
    const id = text(body.id || req.query.id, { field: "Sifariş ID-si", required: true, max: 160 });
    const current = await readOrder(id);
    if (!current) throw new ApiError(404, "order_not_found", "Sifariş tapılmadı.");

    if (user.role === "customer") {
      if (current.customerId !== user.id) throw new ApiError(403, "forbidden", "Bu sifarişə giriş yoxdur.");
      if (!["submitted", "confirmed"].includes(current.status)) {
        throw new ApiError(409, "order_cannot_cancel", "Bu mərhələdə sifarişi ləğv etmək mümkün deyil.");
      }
      await query("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1", [id]);
      await syncOperationsForOrderStatus(id, "cancelled");
      await ensureSupplierPurchaseOrders(id);
      await syncOrderLead(id);
      await recordOrderHistory({
        order: current,
        actorId: user.id,
        status: "cancelled",
        paymentStatus: current.paymentStatus,
        note: text(body.note, { max: 1_000 }) || "Müştəri tərəfindən ləğv edildi"
      });
      await recordAudit({ actorId: user.id, action: "cancel", entityType: "order", entityId: id });
      return sendJson(res, 200, { ok: true, data: await readOrderDetails(id) });
    }

    if (!privilegedRoles.includes(user.role)) {
      throw new ApiError(403, "forbidden", "Sifariş statusunu dəyişmək üçün icazə yoxdur.");
    }
    const status = oneOf(body.status ?? current.status, orderStatuses, current.status, "Sifariş statusu");
    const paymentStatus = oneOf(body.paymentStatus ?? current.paymentStatus, paymentStatuses, current.paymentStatus, "Ödəniş statusu");
    if (status !== current.status && !allowedOrderTransitions[current.status]?.includes(status)) {
      throw new ApiError(409, "invalid_order_transition", "Sifariş statusu mərhələləri ardıcıllıqla dəyişdirilməlidir.", {
        current: current.status,
        allowed: allowedOrderTransitions[current.status] || []
      });
    }
    if (status === "confirmed" && current.approvalStatus !== "not_required" && current.approvalStatus !== "approved") {
      throw new ApiError(
        409,
        "procurement_approval_required",
        current.approvalStatus === "rejected"
          ? "Satınalma sorğusu rədd edilib. Sifariş təsdiqlənə bilməz."
          : "Sifariş təsdiqlənməzdən əvvəl satınalma təsdiqləri tamamlanmalıdır."
      );
    }
    const deliveryAmount = Object.prototype.hasOwnProperty.call(body, "deliveryAmount")
      ? parsePriceAmount(body.deliveryAmount)
      : current.deliveryAmount;
    if (Object.prototype.hasOwnProperty.call(body, "deliveryAmount") && body.deliveryAmount !== "" && deliveryAmount === null) {
      throw new ApiError(400, "validation_error", "Çatdırılma məbləği düzgün deyil.");
    }
    const totalAmount = current.subtotal === null
      ? null
      : Math.round((Number(current.subtotal) + Number(deliveryAmount || 0)) * 100) / 100;
    const trackingCode = text(body.trackingCode ?? current.trackingCode, { max: 160 }) || null;
    const deliveryProvider = text(body.deliveryProvider ?? current.deliveryProvider, { max: 200 }) || null;
    const historyNote = text(body.historyNote, { max: 1_000 });
    await query(
      `UPDATE orders
          SET status = $2, payment_status = $3, delivery_amount = $4, total_amount = $5,
              tracking_code = $6, delivery_provider = $7, updated_at = now()
        WHERE id = $1`,
      [id, status, paymentStatus, deliveryAmount, totalAmount, trackingCode, deliveryProvider]
    );
    if (status !== current.status) await syncOperationsForOrderStatus(id, status);
    await ensureSupplierPurchaseOrders(id);
    await syncOrderLead(id);
    if (status !== current.status || paymentStatus !== current.paymentStatus || historyNote) {
      await recordOrderHistory({
        order: current,
        actorId: user.id,
        status,
        paymentStatus,
        note: historyNote || "Sifariş mərhələsi yeniləndi"
      });
    }
    await recordAudit({ actorId: user.id, action: "status_update", entityType: "order", entityId: id, details: { status, paymentStatus } });
    if (current.customerId) {
      await queueNotification({
        userId: current.customerId,
        channel: "in_app",
        subject: `Sifariş #${current.orderNumber}`,
        body: `Sifariş statusu yeniləndi: ${status}. Ödəniş statusu: ${paymentStatus}.`,
        templateKey: "order_status_updated",
        payload: { orderId: id, status, paymentStatus }
      });
    }
    const updated = await readOrderDetails(id);
    if (status === "confirmed") await issueOrderDocument(updated, "proforma_invoice", user.id);
    return sendJson(res, 200, { ok: true, data: await readOrderDetails(id) });
  }

  if (text(body.website, { max: 200 })) return sendJson(res, 201, { ok: true, data: { accepted: true } });
  const sourceItems = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
  if (!sourceItems.length) throw new ApiError(400, "empty_order", "Səbətdə ən azı bir məhsul olmalıdır.");

  const session = await getSessionUser(req);
  const submissionHash = hashOpaque(getClientIp(req));
  const recent = await query(
    "SELECT count(*)::int AS count FROM orders WHERE submission_hash = $1 AND created_at > now() - interval '1 hour'",
    [submissionHash]
  );
  if ((recent[0]?.count || 0) >= 10) {
    throw new ApiError(429, "order_rate_limited", "Bir saat ərzində sifariş limiti dolub. Bir qədər sonra yenidən yoxla.");
  }

  const normalizedSourceItems = sourceItems.map((item) => ({
    ...item,
    productId: text(item.productId, { max: 160 }),
    offerId: text(item.offerId, { max: 160 })
  }));
  const productIds = [...new Set(normalizedSourceItems.map((item) => item.productId).filter(Boolean))];
  if (productIds.length !== normalizedSourceItems.length) throw new ApiError(400, "invalid_order_items", "Səbətdə təkrarlanan və ya yanlış məhsul var.");
  const products = await query(
    `SELECT id, sku, name, brand, package_text, price_amount, price_currency, price_text,
            price_status, price_verified_at, image_url, source_url, supplier_id, supplier_name
       FROM products WHERE id = ANY($1::text[]) AND status = 'active'`,
    [productIds]
  );
  if (products.length !== productIds.length) throw new ApiError(400, "product_not_found", "Səbətdəki məhsullardan biri artıq aktiv deyil.");

  const productsById = new Map(products.map((product) => [product.id, product]));
  const offersByProduct = await loadOffersForProducts(productIds);
  let subtotal = 0;
  let hasPendingPrice = false;
  const items = normalizedSourceItems.map((source) => {
    const product = productsById.get(source.productId);
    const quantity = parseOrderQuantity(source.quantity);
    const offers = offersByProduct.get(product.id) || [];
    const selectedOffer = chooseProductOffer(offers, source.offerId);
    if (source.offerId && !selectedOffer) {
      throw new ApiError(400, "product_offer_not_found", `${product.name} üçün seçilmiş təchizatçı təklifi aktiv deyil.`);
    }
    if (selectedOffer?.minimumOrder !== null && quantity < selectedOffer.minimumOrder) {
      throw new ApiError(
        400,
        "minimum_order_not_met",
        `${product.name} üçün minimum sifariş ${selectedOffer.minimumOrder} vahiddir.`
      );
    }
    if (selectedOffer?.stockQuantity !== null && quantity > selectedOffer.stockQuantity) {
      throw new ApiError(
        409,
        "insufficient_offer_stock",
        `${product.name} üçün seçilmiş təchizatçıda maksimum ${selectedOffer.stockQuantity} vahid mövcuddur.`
      );
    }
    const offerCurrency = selectedOffer?.currency || product.price_currency || "AZN";
    const priceStatus = selectedOffer?.priceStatus || product.price_status;
    const priceAmount = selectedOffer ? selectedOffer.unitPrice : product.price_amount;
    const confirmed = priceStatus === "confirmed" && priceAmount !== null && offerCurrency === "AZN";
    const unitPrice = confirmed ? Number(priceAmount) : null;
    const lineTotal = unitPrice === null ? null : Math.round(unitPrice * quantity * 100) / 100;
    if (lineTotal === null) hasPendingPrice = true;
    else subtotal += lineTotal;
    return {
      id: `ori-${randomUUID()}`,
      productId: product.id,
      productOfferId: selectedOffer?.id || null,
      supplierId: selectedOffer?.supplierId || product.supplier_id,
      sku: selectedOffer?.supplierSku || product.sku,
      title: product.name,
      quantity,
      unit: text(source.unit, { max: 80 }) || product.package_text || "ədəd",
      unitPrice,
      priceText: confirmed ? (selectedOffer?.price || product.price_text) : "Sorğu əsasında",
      lineTotal,
      snapshot: {
        brand: product.brand,
        package: product.package_text || "",
        imageUrl: product.image_url || "",
        productOfferId: selectedOffer?.id || null,
        supplierId: selectedOffer?.supplierId || product.supplier_id,
        supplierName: selectedOffer?.supplier || product.supplier_name || "",
        priceStatus,
        leadTimeDays: selectedOffer?.leadTimeDays ?? null,
        priceVerifiedAt: selectedOffer?.priceVerifiedAt || product.price_verified_at || null,
        sourceUrl: selectedOffer?.sourceUrl || product.source_url || ""
      }
    };
  });
  subtotal = Math.round(subtotal * 100) / 100;

  const id = `ord-${randomUUID()}`;
  const orderEmail = email(body.email || session?.email);
  const companyName = text(body.companyName, { field: "Şirkət", required: true, max: 200 });
  const contactName = text(body.contactName || session?.name, { field: "Əlaqələndirici şəxs", required: true, max: 160 });
  const phone = text(body.phone, { field: "Telefon", required: true, max: 80 });
  const city = text(body.city, { field: "Şəhər", required: true, max: 160 });
  const address = text(body.address, { field: "Ünvan", required: true, max: 500 });
  const deliveryMode = oneOf(body.deliveryMode, deliveryModes, "delivery", "Çatdırılma üsulu");
  const paymentMethod = oneOf(body.paymentMethod, paymentMethods, "invoice", "Ödəniş üsulu");
  const requiresApproval = body.requiresApproval === true || String(body.requiresApproval) === "true";
  if (requiresApproval && !session) {
    throw new ApiError(401, "authentication_required", "Satınalma təsdiqi üçün müştəri hesabına daxil olmaq lazımdır.");
  }
  const requiredApprovals = Math.max(1, Math.min(Number.parseInt(String(body.requiredApprovals || 1), 10) || 1, 5));
  const budgetAmount = body.budgetAmount === "" || body.budgetAmount === null || body.budgetAmount === undefined
    ? null
    : parsePriceAmount(body.budgetAmount);
  if (body.budgetAmount !== "" && body.budgetAmount !== null && body.budgetAmount !== undefined && budgetAmount === null) {
    throw new ApiError(400, "validation_error", "Büdcə məbləği düzgün deyil.");
  }
  const costCenter = text(body.costCenter, { max: 160 }) || null;
  const approvalNote = text(body.approvalNote, { max: 1_000 }) || null;
  const approvalStatus = requiresApproval ? "pending" : "not_required";
  const finalSubtotal = hasPendingPrice ? null : subtotal;
  const supplierCount = new Set(items.map((item) => item.supplierId).filter(Boolean)).size;
  const itemQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryQuote = await calculateDeliveryQuote({
    city,
    mode: deliveryMode,
    subtotal: finalSubtotal,
    itemQuantity,
    supplierCount
  });
  const deliveryAmount = deliveryQuote.amount;
  const totalAmount = finalSubtotal === null
    ? null
    : Math.round((finalSubtotal + deliveryAmount) * 100) / 100;

  const rows = await query(
    `WITH new_order AS (
       INSERT INTO orders (
         id, customer_id, company_name, contact_name, email, phone, city, address,
         delivery_mode, payment_method, subtotal, delivery_amount, total_amount,
         has_pending_price, approval_status, note, submission_hash
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17
       )
       RETURNING id, order_number
     ), incoming AS (
       SELECT * FROM jsonb_to_recordset($18::jsonb) AS x(
         id text, "productId" text, "productOfferId" text, "supplierId" text,
         sku text, title text, quantity numeric,
         unit text, "unitPrice" numeric, "priceText" text, "lineTotal" numeric, snapshot jsonb
       )
     )
     INSERT INTO order_items (
       id, order_id, product_id, product_offer_id, supplier_id, sku, title, quantity, unit,
       unit_price, price_text, line_total, snapshot
     )
     SELECT i.id, n.id, i."productId", i."productOfferId", i."supplierId", i.sku, i.title, i.quantity, i.unit,
            i."unitPrice", i."priceText", i."lineTotal", i.snapshot
       FROM incoming i CROSS JOIN new_order n
     RETURNING (SELECT order_number FROM new_order) AS order_number`,
    [
      id, session?.id || null, companyName, contactName, orderEmail, phone, city, address,
      deliveryMode, paymentMethod, finalSubtotal, deliveryAmount, totalAmount,
      hasPendingPrice, approvalStatus, text(body.note, { max: 3_000 }) || null,
      submissionHash, JSON.stringify(items)
    ]
  );
  const orderNumber = Number(rows[0]?.order_number || 0);
  await saveDeliveryQuote({
    orderId: id,
    customerId: session?.id || null,
    city,
    mode: deliveryMode,
    supplierCount,
    itemQuantity,
    subtotal: finalSubtotal,
    quote: deliveryQuote,
    status: "accepted"
  });
  if (requiresApproval) {
    await query(
      `INSERT INTO procurement_requests (
         id, order_id, requested_by, company_id, required_approvals,
         budget_amount, cost_center, note
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `pcr-${randomUUID()}`, id, session.id, session.companyId || null,
        requiredApprovals, budgetAmount, costCenter, approvalNote
      ]
    );
  }
  await ensureOrderOperations(id);
  await ensureSupplierPurchaseOrders(id);
  await syncOrderLead(id);
  await recordAudit({
    actorId: session?.id || null,
    action: "create",
    entityType: "order",
    entityId: id,
    details: {
      orderNumber,
      itemCount: items.length,
      supplierCount,
      hasPendingPrice,
      approvalStatus,
      deliveryAmount
    }
  });
  const createdOrder = await readOrderDetails(id);
  await recordOrderHistory({
    order: { ...createdOrder, status: null, paymentStatus: null },
    actorId: session?.id || null,
    status: createdOrder.status,
    paymentStatus: createdOrder.paymentStatus,
    note: "Sifariş yaradıldı"
  });
  await issueOrderDocument(createdOrder, "order_summary", session?.id || null);
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "";
  await queueNotification({
    channel: adminEmail ? "email" : "in_app",
    recipient: adminEmail || null,
    subject: `Yeni sifariş #${orderNumber}`,
    body: `${companyName}: ${items.length} məhsul. ${hasPendingPrice ? "Qiymət təsdiqi tələb olunur." : `${subtotal.toFixed(2)} AZN.`}`,
    templateKey: "order_created",
    payload: { orderId: id, orderNumber, itemCount: items.length, hasPendingPrice }
  });
  return sendJson(res, 201, { ok: true, data: await readOrderDetails(id) });
});
