import { randomUUID } from "node:crypto";
import { assertCriticalTwoFactor, requireRole } from "../_lib/auth.js";
import { generateAiInvoiceDocument } from "../_lib/ai-foundation.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { calculateThreeWayMatch, procurementControlSummary } from "../_lib/procurement-control.js";
import { entityId, oneOf, text } from "../_lib/validation.js";

const roles = ["super_admin", "admin"];
const quantity = (value, field = "Miqdar", allowZero = false) => {
  const result = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(result) || result < (allowZero ? 0 : 0.001) || result > 1_000_000_000) {
    throw new ApiError(400, "validation_error", `${field} düzgün deyil.`);
  }
  return Math.round(result * 1_000) / 1_000;
};
const money = (value, field = "Məbləğ") => {
  const result = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(result) || result < 0 || result > 1_000_000_000) {
    throw new ApiError(400, "validation_error", `${field} düzgün deyil.`);
  }
  return Math.round(result * 100) / 100;
};
const dateValue = (value, field, required = true) => {
  const source = text(value, { field, required, max: 10 });
  if (!source && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source) || !Number.isFinite(Date.parse(`${source}T00:00:00Z`))) {
    throw new ApiError(400, "validation_error", `${field} düzgün deyil.`);
  }
  return source;
};

const mapPurchaseOrderItem = (item) => ({
  id: item.id,
  sku: item.sku || "",
  title: item.title || "",
  quantity: Number(item.quantity || 0),
  unit: item.unit || "ədəd",
  unitPrice: item.unit_price === null ? null : Number(item.unit_price),
  lineTotal: item.line_total === null ? null : Number(item.line_total)
});
const mapPurchaseOrder = (row) => ({
  id: row.id,
  number: Number(row.purchase_order_number),
  orderId: row.order_id,
  orderNumber: Number(row.order_number),
  supplierId: row.supplier_id,
  supplierName: row.supplier_name,
  status: row.status,
  totalAmount: row.total_amount === null ? null : Number(row.total_amount),
  currency: row.currency,
  projectId: row.project_id || null,
  projectTitle: row.project_title || "",
  projectBudget: row.project_budget === null ? null : Number(row.project_budget),
  projectCommitted: row.project_committed === null ? 0 : Number(row.project_committed),
  items: (Array.isArray(row.items) ? row.items : []).map(mapPurchaseOrderItem),
  updatedAt: row.updated_at
});
const mapReceiptItem = (item) => ({
  id: item.id,
  purchaseOrderItemId: item.purchase_order_item_id,
  title: item.title || "",
  unit: item.unit || "ədəd",
  receivedQuantity: Number(item.received_quantity),
  acceptedQuantity: Number(item.accepted_quantity),
  rejectedQuantity: Number(item.rejected_quantity),
  note: item.note || ""
});
const mapReceipt = (row) => ({
  id: row.id,
  number: Number(row.receipt_number),
  purchaseOrderId: row.purchase_order_id,
  purchaseOrderNumber: Number(row.purchase_order_number),
  supplierName: row.supplier_name,
  deliveryNoteNumber: row.delivery_note_number || "",
  receivedAt: row.received_at,
  status: row.status,
  fileUrl: row.file_url || "",
  note: row.note || "",
  voidReason: row.void_reason || "",
  items: (Array.isArray(row.items) ? row.items : []).map(mapReceiptItem),
  createdAt: row.created_at
});
const mapInvoiceItem = (item) => ({
  id: item.id,
  purchaseOrderItemId: item.purchase_order_item_id,
  title: item.title || "",
  unit: item.unit || "ədəd",
  quantity: Number(item.quantity),
  unitPrice: Number(item.unit_price),
  lineTotal: Number(item.line_total),
  description: item.description || ""
});
const mapInvoice = (row) => ({
  id: row.id,
  internalNumber: Number(row.internal_number),
  purchaseOrderId: row.purchase_order_id,
  purchaseOrderNumber: Number(row.purchase_order_number),
  supplierName: row.supplier_name,
  invoiceNumber: row.invoice_number,
  invoiceDate: row.invoice_date,
  dueDate: row.due_date,
  subtotal: Number(row.subtotal),
  taxAmount: Number(row.tax_amount),
  deliveryAmount: Number(row.delivery_amount),
  totalAmount: Number(row.total_amount),
  currency: row.currency,
  status: row.status,
  matchStatus: row.match_status,
  matchScore: row.match_score === null ? null : Number(row.match_score),
  matchResult: row.match_result || {},
  fileUrl: row.file_url || "",
  aiRunId: row.ai_run_id || null,
  note: row.note || "",
  paymentReference: row.payment_reference || "",
  items: (Array.isArray(row.items) ? row.items : []).map(mapInvoiceItem),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const loadPurchaseOrders = async () => (await query(
  `SELECT purchase_order.*, orders.order_number, supplier.name AS supplier_name,
          project.id AS project_id, project.title AS project_title, project.budget AS project_budget,
          COALESCE((
            SELECT sum(related_purchase_order.total_amount)
              FROM customer_projects related_project
              JOIN orders related_order ON related_order.rfq_id = related_project.rfq_id
              JOIN supplier_purchase_orders related_purchase_order ON related_purchase_order.order_id = related_order.id
             WHERE related_project.id = project.id
               AND related_purchase_order.status <> 'cancelled'
          ), 0) AS project_committed,
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', item.id, 'sku', order_item.sku, 'title', order_item.title,
              'quantity', item.quantity, 'unit', item.unit,
              'unit_price', item.unit_price, 'line_total', item.line_total
            ) ORDER BY order_item.created_at, item.id)
              FROM supplier_purchase_order_items item
              JOIN order_items order_item ON order_item.id = item.order_item_id
             WHERE item.purchase_order_id = purchase_order.id
          ), '[]'::json) AS items
     FROM supplier_purchase_orders purchase_order
     JOIN orders ON orders.id = purchase_order.order_id
     JOIN suppliers supplier ON supplier.id = purchase_order.supplier_id
     LEFT JOIN customer_projects project ON project.rfq_id = orders.rfq_id
    ORDER BY purchase_order.updated_at DESC, purchase_order.purchase_order_number DESC
    LIMIT 400`
)).map(mapPurchaseOrder);

const loadReceipts = async () => (await query(
  `SELECT receipt.*, purchase_order.purchase_order_number, supplier.name AS supplier_name,
          media.url AS file_url,
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', item.id, 'purchase_order_item_id', item.purchase_order_item_id,
              'title', order_item.title, 'unit', purchase_item.unit,
              'received_quantity', item.received_quantity,
              'accepted_quantity', item.accepted_quantity,
              'rejected_quantity', item.rejected_quantity, 'note', item.note
            ) ORDER BY order_item.created_at, item.id)
              FROM procurement_goods_receipt_items item
              JOIN supplier_purchase_order_items purchase_item ON purchase_item.id = item.purchase_order_item_id
              JOIN order_items order_item ON order_item.id = purchase_item.order_item_id
             WHERE item.receipt_id = receipt.id
          ), '[]'::json) AS items
     FROM procurement_goods_receipts receipt
     JOIN supplier_purchase_orders purchase_order ON purchase_order.id = receipt.purchase_order_id
     JOIN suppliers supplier ON supplier.id = purchase_order.supplier_id
     LEFT JOIN media_assets media ON media.id = receipt.media_asset_id AND media.status = 'active'
    ORDER BY receipt.received_at DESC, receipt.receipt_number DESC
    LIMIT 500`
)).map(mapReceipt);

const loadInvoices = async () => (await query(
  `SELECT invoice.*, purchase_order.purchase_order_number, supplier.name AS supplier_name,
          media.url AS file_url,
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', item.id, 'purchase_order_item_id', item.purchase_order_item_id,
              'title', order_item.title, 'unit', purchase_item.unit,
              'quantity', item.quantity, 'unit_price', item.unit_price,
              'line_total', item.line_total, 'description', item.description
            ) ORDER BY order_item.created_at, item.id)
              FROM supplier_invoice_items item
              JOIN supplier_purchase_order_items purchase_item ON purchase_item.id = item.purchase_order_item_id
              JOIN order_items order_item ON order_item.id = purchase_item.order_item_id
             WHERE item.invoice_id = invoice.id
          ), '[]'::json) AS items
     FROM supplier_invoices invoice
     JOIN supplier_purchase_orders purchase_order ON purchase_order.id = invoice.purchase_order_id
     JOIN suppliers supplier ON supplier.id = purchase_order.supplier_id
     LEFT JOIN media_assets media ON media.id = invoice.media_asset_id AND media.status = 'active'
    ORDER BY invoice.invoice_date DESC, invoice.internal_number DESC
    LIMIT 500`
)).map(mapInvoice);

const loadControl = async () => {
  const [purchaseOrders, receipts, invoices] = await Promise.all([
    loadPurchaseOrders(), loadReceipts(), loadInvoices()
  ]);
  return {
    summary: procurementControlSummary({ purchaseOrders, receipts, invoices }),
    purchaseOrders,
    receipts,
    invoices
  };
};

const purchaseOrderOrFail = async (id) => {
  const purchaseOrder = (await loadPurchaseOrders()).find((item) => item.id === id);
  if (!purchaseOrder) throw new ApiError(404, "purchase_order_not_found", "Satınalma sifarişi tapılmadı.");
  if (["draft", "cancelled"].includes(purchaseOrder.status)) {
    throw new ApiError(409, "purchase_order_not_receivable", "Qaralama və ya ləğv edilmiş sifariş üzrə əməliyyat aparmaq olmaz.");
  }
  return purchaseOrder;
};

const refreshInvoiceMatch = async (invoiceId) => {
  const [purchaseOrders, receipts, invoices] = await Promise.all([
    loadPurchaseOrders(), loadReceipts(), loadInvoices()
  ]);
  const invoice = invoices.find((item) => item.id === invoiceId);
  if (!invoice) throw new ApiError(404, "invoice_not_found", "Faktura tapılmadı.");
  const purchaseOrder = purchaseOrders.find((item) => item.id === invoice.purchaseOrderId);
  const result = calculateThreeWayMatch({
    purchaseOrder,
    receipts: receipts.filter((item) => item.purchaseOrderId === invoice.purchaseOrderId),
    invoice,
    previousInvoices: invoices.filter((item) => item.purchaseOrderId === invoice.purchaseOrderId)
  });
  const status = ["paid", "cancelled"].includes(invoice.status)
    ? invoice.status
    : invoice.status === "approved" && result.status === "matched"
      ? "approved"
      : result.status;
  await query(
    `UPDATE supplier_invoices SET match_status = $2, match_score = $3,
            match_result = $4::jsonb, status = $5,
            approved_by = CASE WHEN $5 = 'exception' THEN NULL ELSE approved_by END,
            approved_at = CASE WHEN $5 = 'exception' THEN NULL ELSE approved_at END,
            updated_at = now()
      WHERE id = $1`,
    [invoiceId, result.status, result.score, JSON.stringify(result), status]
  );
  return result;
};

const refreshPurchaseOrderInvoices = async (purchaseOrderId) => {
  const rows = await query(
    "SELECT id FROM supplier_invoices WHERE purchase_order_id = $1 AND status <> 'cancelled'",
    [purchaseOrderId]
  );
  for (const row of rows) await refreshInvoiceMatch(row.id);
};

const syncPurchaseOrderDeliveryStatus = async (purchaseOrderId) => {
  await query(
    `UPDATE supplier_purchase_orders purchase_order SET
       status = CASE
         WHEN NOT EXISTS (
           SELECT 1 FROM supplier_purchase_order_items purchase_item
            WHERE purchase_item.purchase_order_id = purchase_order.id
              AND purchase_item.quantity > COALESCE((
                SELECT sum(receipt_item.accepted_quantity)
                  FROM procurement_goods_receipt_items receipt_item
                  JOIN procurement_goods_receipts receipt ON receipt.id = receipt_item.receipt_id
                 WHERE receipt_item.purchase_order_item_id = purchase_item.id AND receipt.status = 'posted'
              ), 0)
         ) THEN 'delivered'
         WHEN purchase_order.status = 'delivered' THEN 'accepted'
         ELSE purchase_order.status
       END,
       updated_at = now()
     WHERE purchase_order.id = $1`,
    [purchaseOrderId]
  );
};

const createReceipt = async (user, body) => {
  const purchaseOrderId = text(body.purchaseOrderId, { field: "Satınalma sifarişi", required: true, max: 160 });
  const purchaseOrder = await purchaseOrderOrFail(purchaseOrderId);
  const sourceItems = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
  if (!sourceItems.length) throw new ApiError(400, "receipt_items_required", "Mal qəbulu üçün ən azı bir mövqe seçilməlidir.");
  const known = new Map(purchaseOrder.items.map((item) => [item.id, item]));
  const seen = new Set();
  const items = sourceItems.map((item) => {
    const id = text(item.purchaseOrderItemId, { field: "Sifariş mövqeyi", required: true, max: 160 });
    if (!known.has(id) || seen.has(id)) throw new ApiError(400, "invalid_receipt_item", "Mal qəbulu mövqeyi sifarişlə uyğun deyil.");
    seen.add(id);
    const receivedQuantity = quantity(item.receivedQuantity, "Qəbul edilən miqdar");
    const rejectedQuantity = quantity(item.rejectedQuantity || 0, "Rədd edilən miqdar", true);
    if (rejectedQuantity > receivedQuantity) throw new ApiError(400, "invalid_rejected_quantity", "Rədd edilən miqdar qəbul edilən miqdarı keçə bilməz.");
    return {
      id: `gri-${randomUUID()}`,
      purchaseOrderItemId: id,
      receivedQuantity,
      acceptedQuantity: quantity(receivedQuantity - rejectedQuantity, "Qəbul olunan miqdar", true),
      rejectedQuantity,
      note: text(item.note, { max: 500 }) || null
    };
  });
  const existing = await query(
    `SELECT item.purchase_order_item_id, sum(item.accepted_quantity)::numeric AS accepted_quantity
       FROM procurement_goods_receipt_items item
       JOIN procurement_goods_receipts receipt ON receipt.id = item.receipt_id
      WHERE receipt.purchase_order_id = $1 AND receipt.status = 'posted'
      GROUP BY item.purchase_order_item_id`,
    [purchaseOrderId]
  );
  const existingByItem = new Map(existing.map((item) => [item.purchase_order_item_id, Number(item.accepted_quantity)]));
  for (const item of items) {
    const ordered = known.get(item.purchaseOrderItemId);
    if ((existingByItem.get(item.purchaseOrderItemId) || 0) + item.acceptedQuantity - ordered.quantity > 0.001) {
      throw new ApiError(409, "accepted_quantity_exceeded", `${ordered.title} üzrə qəbul olunan miqdar sifarişi keçir.`);
    }
  }
  const receiptId = entityId(body.id, "pgr");
  try {
    await query(
      `INSERT INTO procurement_goods_receipts (
         id, purchase_order_id, delivery_note_number, received_at,
         media_asset_id, note, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        receiptId, purchaseOrderId,
        text(body.deliveryNoteNumber, { max: 120 }) || null,
        body.receivedAt && Number.isFinite(Date.parse(body.receivedAt)) ? new Date(body.receivedAt).toISOString() : new Date().toISOString(),
        text(body.mediaAssetId, { max: 160 }) || null,
        text(body.note, { max: 2_000 }) || null,
        user.id
      ]
    );
    for (const item of items) {
      await query(
        `INSERT INTO procurement_goods_receipt_items (
           id, receipt_id, purchase_order_item_id, received_quantity,
           accepted_quantity, rejected_quantity, note
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [item.id, receiptId, item.purchaseOrderItemId, item.receivedQuantity, item.acceptedQuantity, item.rejectedQuantity, item.note]
      );
    }
  } catch (error) {
    await query("DELETE FROM procurement_goods_receipts WHERE id = $1", [receiptId]).catch(() => null);
    throw error;
  }
  await syncPurchaseOrderDeliveryStatus(purchaseOrderId);
  await refreshPurchaseOrderInvoices(purchaseOrderId);
  await recordAudit({ actorId: user.id, action: "post", entityType: "procurement_goods_receipt", entityId: receiptId, details: { purchaseOrderId, itemCount: items.length } });
  return receiptId;
};

const createInvoice = async (user, body) => {
  const purchaseOrderId = text(body.purchaseOrderId, { field: "Satınalma sifarişi", required: true, max: 160 });
  const purchaseOrder = await purchaseOrderOrFail(purchaseOrderId);
  const invoiceDate = dateValue(body.invoiceDate, "Faktura tarixi");
  const dueDate = dateValue(body.dueDate, "Son ödəniş tarixi", false);
  if (dueDate && dueDate < invoiceDate) throw new ApiError(400, "invalid_due_date", "Son ödəniş tarixi faktura tarixindən əvvəl ola bilməz.");
  const known = new Map(purchaseOrder.items.map((item) => [item.id, item]));
  const seen = new Set();
  const sourceItems = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
  if (!sourceItems.length) throw new ApiError(400, "invoice_items_required", "Faktura üçün ən azı bir mövqe seçilməlidir.");
  const items = sourceItems.map((item) => {
    const id = text(item.purchaseOrderItemId, { field: "Sifariş mövqeyi", required: true, max: 160 });
    if (!known.has(id) || seen.has(id)) throw new ApiError(400, "invalid_invoice_item", "Faktura mövqeyi sifarişlə uyğun deyil.");
    seen.add(id);
    const itemQuantity = quantity(item.quantity, "Faktura miqdarı");
    const unitPrice = money(item.unitPrice, "Vahid qiyməti");
    return {
      id: `sii-${randomUUID()}`,
      purchaseOrderItemId: id,
      quantity: itemQuantity,
      unitPrice,
      lineTotal: money(item.lineTotal ?? itemQuantity * unitPrice, "Sətir yekunu"),
      description: text(item.description, { max: 500 }) || null
    };
  });
  const calculatedSubtotal = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
  const subtotal = body.subtotal === "" || body.subtotal === undefined ? calculatedSubtotal : money(body.subtotal, "Ara yekun");
  const taxAmount = money(body.taxAmount || 0, "Vergi məbləği");
  const deliveryAmount = money(body.deliveryAmount || 0, "Çatdırılma məbləği");
  const totalAmount = body.totalAmount === "" || body.totalAmount === undefined
    ? Math.round((subtotal + taxAmount + deliveryAmount) * 100) / 100
    : money(body.totalAmount, "Faktura yekunu");
  const currency = oneOf(body.currency, ["AZN", "USD", "EUR", "TRY"], purchaseOrder.currency || "AZN", "Valyuta");
  const invoice = {
    id: entityId(body.id, "sin"), items, subtotal, taxAmount, deliveryAmount, totalAmount, currency, status: "registered"
  };
  const aiRunId = text(body.aiRunId, { max: 160 }) || null;
  if (aiRunId) {
    const aiRun = (await query(
      "SELECT id, status, feature FROM ai_runs WHERE id = $1 AND user_id = $2 LIMIT 1",
      [aiRunId, user.id]
    ))[0];
    if (!aiRun || aiRun.status !== "completed" || aiRun.feature !== "invoice_document") {
      throw new ApiError(409, "invalid_invoice_ai_run", "Faktura AI nəticəsi bu hesaba və sənədə uyğun deyil.");
    }
  }
  const [receipts, previousInvoices] = await Promise.all([loadReceipts(), loadInvoices()]);
  const match = calculateThreeWayMatch({
    purchaseOrder,
    receipts: receipts.filter((item) => item.purchaseOrderId === purchaseOrderId),
    invoice,
    previousInvoices: previousInvoices.filter((item) => item.purchaseOrderId === purchaseOrderId)
  });
  try {
    await query(
      `INSERT INTO supplier_invoices (
         id, purchase_order_id, invoice_number, invoice_date, due_date,
         subtotal, tax_amount, delivery_amount, total_amount, currency,
         status, match_status, match_score, match_result,
         media_asset_id, ai_run_id, note, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14::jsonb, $15, $16, $17, $18
       )`,
      [
        invoice.id, purchaseOrderId,
        text(body.invoiceNumber, { field: "Faktura nömrəsi", required: true, max: 120 }),
        invoiceDate, dueDate, subtotal, taxAmount, deliveryAmount, totalAmount,
        currency,
        match.status, match.status, match.score, JSON.stringify(match),
        text(body.mediaAssetId, { max: 160 }) || null,
        aiRunId,
        text(body.note, { max: 2_000 }) || null,
        user.id
      ]
    );
    for (const item of items) {
      await query(
        `INSERT INTO supplier_invoice_items (
           id, invoice_id, purchase_order_item_id, quantity,
           unit_price, line_total, description
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [item.id, invoice.id, item.purchaseOrderItemId, item.quantity, item.unitPrice, item.lineTotal, item.description]
      );
    }
  } catch (error) {
    await query("DELETE FROM supplier_invoices WHERE id = $1", [invoice.id]).catch(() => null);
    throw error;
  }
  if (aiRunId) {
    await query(
      `UPDATE ai_runs SET approval_status = 'approved', reviewed_by = $2,
              reviewed_at = now(), review_note = 'Faktura forması insan tərəfindən yoxlanaraq qeydiyyata alındı.', updated_at = now()
        WHERE id = $1 AND approval_status = 'pending'`,
      [aiRunId, user.id]
    );
  }
  await recordAudit({ actorId: user.id, action: "register", entityType: "supplier_invoice", entityId: invoice.id, details: { purchaseOrderId, matchStatus: match.status, matchScore: match.score } });
  return invoice.id;
};

const updateInvoice = async (user, body) => {
  const id = text(body.id, { field: "Faktura", required: true, max: 160 });
  const invoice = (await query("SELECT * FROM supplier_invoices WHERE id = $1 LIMIT 1", [id]))[0];
  if (!invoice) throw new ApiError(404, "invoice_not_found", "Faktura tapılmadı.");
  const action = body.action;
  if (action === "recheck-invoice") {
    const match = await refreshInvoiceMatch(id);
    await recordAudit({ actorId: user.id, action: "match", entityType: "supplier_invoice", entityId: id, details: { status: match.status, score: match.score } });
    return;
  }
  if (action === "approve-invoice") {
    if (invoice.status !== "matched" || invoice.match_status !== "matched") {
      throw new ApiError(409, "invoice_not_matched", "Yalnız tam uyğunlaşdırılmış faktura təsdiqlənə bilər.");
    }
    await query("UPDATE supplier_invoices SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now() WHERE id = $1", [id, user.id]);
  } else if (action === "pay-invoice") {
    if (invoice.status !== "approved") throw new ApiError(409, "invoice_not_approved", "Ödənişdən əvvəl faktura təsdiqlənməlidir.");
    const paymentReference = text(body.paymentReference, { field: "Ödəniş istinadı", required: true, max: 200 });
    await query("UPDATE supplier_invoices SET status = 'paid', payment_reference = $2, paid_by = $3, paid_at = now(), updated_at = now() WHERE id = $1", [id, paymentReference, user.id]);
  } else {
    if (invoice.status === "paid") throw new ApiError(409, "paid_invoice_locked", "Ödənilmiş faktura ləğv edilə bilməz.");
    await query("UPDATE supplier_invoices SET status = 'cancelled', cancelled_by = $2, cancelled_at = now(), note = concat_ws(E'\n', note, $3), updated_at = now() WHERE id = $1", [id, user.id, text(body.note, { field: "Ləğv səbəbi", required: true, max: 1_000 })]);
  }
  await recordAudit({ actorId: user.id, action, entityType: "supplier_invoice", entityId: id });
};

const voidReceipt = async (user, body) => {
  const id = text(body.id, { field: "Mal qəbulu", required: true, max: 160 });
  const receipt = (await query("SELECT * FROM procurement_goods_receipts WHERE id = $1 LIMIT 1", [id]))[0];
  if (!receipt) throw new ApiError(404, "receipt_not_found", "Mal qəbulu tapılmadı.");
  if (receipt.status !== "posted") throw new ApiError(409, "receipt_already_void", "Mal qəbulu artıq ləğv edilib.");
  const paid = (await query("SELECT id FROM supplier_invoices WHERE purchase_order_id = $1 AND status = 'paid' LIMIT 1", [receipt.purchase_order_id]))[0];
  if (paid) throw new ApiError(409, "paid_invoice_receipt_locked", "Ödənilmiş fakturaya bağlı mal qəbulu ləğv edilə bilməz.");
  const reason = text(body.note, { field: "Ləğv səbəbi", required: true, max: 1_000 });
  await query("UPDATE procurement_goods_receipts SET status = 'void', voided_by = $2, voided_at = now(), void_reason = $3, updated_at = now() WHERE id = $1", [id, user.id, reason]);
  await syncPurchaseOrderDeliveryStatus(receipt.purchase_order_id);
  await refreshPurchaseOrderInvoices(receipt.purchase_order_id);
  await recordAudit({ actorId: user.id, action: "void", entityType: "procurement_goods_receipt", entityId: id, details: { reason } });
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, roles);
  if (req.method === "GET") return sendJson(res, 200, { ok: true, data: await loadControl() });
  assertMethod(req, ["POST"]);
  assertSameOrigin(req);
  assertCriticalTwoFactor(user);
  const body = await readJson(req, 2_200_000);
  const action = oneOf(body.action, [
    "create-receipt", "void-receipt", "create-invoice", "recheck-invoice",
    "approve-invoice", "pay-invoice", "cancel-invoice", "extract-invoice"
  ], "", "Əməliyyat");
  if (action === "extract-invoice") {
    const purchaseOrder = await purchaseOrderOrFail(text(body.purchaseOrderId, { field: "Satınalma sifarişi", required: true, max: 160 }));
    const data = await generateAiInvoiceDocument({ user, input: { document: body.document }, purchaseOrder });
    return sendJson(res, 200, { ok: true, data });
  }
  if (action === "create-receipt") await createReceipt(user, body);
  else if (action === "void-receipt") await voidReceipt(user, body);
  else if (action === "create-invoice") await createInvoice(user, body);
  else await updateInvoice(user, body);
  return sendJson(res, 200, { ok: true, data: await loadControl() });
});
