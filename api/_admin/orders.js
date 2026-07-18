import { randomUUID } from "node:crypto";
import { getSessionUser, hashOpaque, requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, getClientIp, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { email, oneOf, parseLimit, text } from "../_lib/validation.js";

const orderStatuses = ["submitted", "confirmed", "processing", "shipped", "completed", "cancelled"];
const paymentStatuses = ["pending", "awaiting", "paid", "failed", "refunded"];
const paymentMethods = ["invoice", "bank_transfer"];
const deliveryModes = ["delivery", "pickup", "supplier_delivery"];

const mapOrder = (row) => ({
  id: row.id,
  orderNumber: Number(row.order_number),
  customerId: row.customer_id,
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
  note: row.note || "",
  items: row.items || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const readOrder = async (id) => {
  const rows = await query(
    `SELECT o.*,
            COALESCE(json_agg(json_build_object(
              'id', i.id, 'productId', i.product_id, 'sku', i.sku, 'title', i.title,
              'quantity', i.quantity, 'unit', i.unit, 'unitPrice', i.unit_price,
              'priceText', i.price_text, 'lineTotal', i.line_total, 'snapshot', i.snapshot
            ) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
       FROM orders o
       LEFT JOIN order_items i ON i.order_id = o.id
      WHERE o.id = $1
      GROUP BY o.id
      LIMIT 1`,
    [id]
  );
  return rows[0] ? mapOrder(rows[0]) : null;
};

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
        SELECT 1 FROM products visible_product
        JOIN suppliers visible_supplier ON visible_supplier.id = visible_product.supplier_id
        WHERE visible_product.id = i.product_id AND visible_supplier.company_id = $${values.length}
      )`;
      where.push(`EXISTS (
        SELECT 1 FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN suppliers s ON s.id = p.supplier_id
        WHERE oi.order_id = o.id AND s.company_id = $${values.length}
      )`);
    }
    values.push(limit);
    const rows = await query(
      `SELECT o.*,
              COALESCE(json_agg(json_build_object(
                'id', i.id, 'productId', i.product_id, 'sku', i.sku, 'title', i.title,
                'quantity', i.quantity, 'unit', i.unit, 'unitPrice', i.unit_price,
                'priceText', i.price_text, 'lineTotal', i.line_total, 'snapshot', i.snapshot
              ) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
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
      await recordAudit({ actorId: user.id, action: "cancel", entityType: "order", entityId: id });
      return sendJson(res, 200, { ok: true, data: await readOrder(id) });
    }

    if (!["super_admin", "admin", "sales"].includes(user.role)) {
      throw new ApiError(403, "forbidden", "Sifariş statusunu dəyişmək üçün icazə yoxdur.");
    }
    const status = oneOf(body.status ?? current.status, orderStatuses, current.status, "Sifariş statusu");
    const paymentStatus = oneOf(body.paymentStatus ?? current.paymentStatus, paymentStatuses, current.paymentStatus, "Ödəniş statusu");
    await query(
      "UPDATE orders SET status = $2, payment_status = $3, updated_at = now() WHERE id = $1",
      [id, status, paymentStatus]
    );
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
    return sendJson(res, 200, { ok: true, data: await readOrder(id) });
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

  const productIds = [...new Set(sourceItems.map((item) => text(item.productId, { max: 160 })).filter(Boolean))];
  if (productIds.length !== sourceItems.length) throw new ApiError(400, "invalid_order_items", "Səbətdə təkrarlanan və ya yanlış məhsul var.");
  const products = await query(
    `SELECT id, sku, name, brand, package_text, price_amount, price_currency, price_text,
            price_status, image_url, supplier_id, supplier_name
       FROM products WHERE id = ANY($1::text[]) AND status = 'active'`,
    [productIds]
  );
  if (products.length !== productIds.length) throw new ApiError(400, "product_not_found", "Səbətdəki məhsullardan biri artıq aktiv deyil.");

  const productsById = new Map(products.map((product) => [product.id, product]));
  let subtotal = 0;
  let hasPendingPrice = false;
  const items = sourceItems.map((source) => {
    const product = productsById.get(source.productId);
    const quantity = parseOrderQuantity(source.quantity);
    const confirmed = product.price_status === "confirmed" && product.price_amount !== null;
    const unitPrice = confirmed ? Number(product.price_amount) : null;
    const lineTotal = unitPrice === null ? null : Math.round(unitPrice * quantity * 100) / 100;
    if (lineTotal === null) hasPendingPrice = true;
    else subtotal += lineTotal;
    return {
      id: `ori-${randomUUID()}`,
      productId: product.id,
      sku: product.sku,
      title: product.name,
      quantity,
      unit: text(source.unit, { max: 80 }) || product.package_text || "ədəd",
      unitPrice,
      priceText: confirmed ? product.price_text : "Sorğu əsasında",
      lineTotal,
      snapshot: {
        brand: product.brand,
        package: product.package_text || "",
        imageUrl: product.image_url || "",
        supplierId: product.supplier_id,
        supplierName: product.supplier_name || "",
        priceStatus: product.price_status
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
  const finalSubtotal = hasPendingPrice ? null : subtotal;

  const rows = await query(
    `WITH new_order AS (
       INSERT INTO orders (
         id, customer_id, company_name, contact_name, email, phone, city, address,
         delivery_mode, payment_method, subtotal, total_amount, has_pending_price,
         note, submission_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13, $14)
       RETURNING id, order_number
     ), incoming AS (
       SELECT * FROM jsonb_to_recordset($15::jsonb) AS x(
         id text, "productId" text, sku text, title text, quantity numeric,
         unit text, "unitPrice" numeric, "priceText" text, "lineTotal" numeric, snapshot jsonb
       )
     )
     INSERT INTO order_items (
       id, order_id, product_id, sku, title, quantity, unit,
       unit_price, price_text, line_total, snapshot
     )
     SELECT i.id, n.id, i."productId", i.sku, i.title, i.quantity, i.unit,
            i."unitPrice", i."priceText", i."lineTotal", i.snapshot
       FROM incoming i CROSS JOIN new_order n
     RETURNING (SELECT order_number FROM new_order) AS order_number`,
    [
      id, session?.id || null, companyName, contactName, orderEmail, phone, city, address,
      deliveryMode, paymentMethod, finalSubtotal, hasPendingPrice,
      text(body.note, { max: 3_000 }) || null, submissionHash, JSON.stringify(items)
    ]
  );
  const orderNumber = Number(rows[0]?.order_number || 0);
  await recordAudit({ actorId: session?.id || null, action: "create", entityType: "order", entityId: id, details: { orderNumber, itemCount: items.length, hasPendingPrice } });
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "";
  await queueNotification({
    channel: adminEmail ? "email" : "in_app",
    recipient: adminEmail || null,
    subject: `Yeni sifariş #${orderNumber}`,
    body: `${companyName}: ${items.length} məhsul. ${hasPendingPrice ? "Qiymət təsdiqi tələb olunur." : `${subtotal.toFixed(2)} AZN.`}`,
    templateKey: "order_created",
    payload: { orderId: id, orderNumber, itemCount: items.length, hasPendingPrice }
  });
  return sendJson(res, 201, { ok: true, data: await readOrder(id) });
});
