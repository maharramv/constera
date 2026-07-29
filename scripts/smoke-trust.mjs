import "./load-local-env.mjs";
import { randomBytes, randomUUID } from "node:crypto";
import eventsHandler from "../api/_admin/events.js";
import qualityHandler from "../api/_admin/catalog-quality.js";
import reviewsHandler from "../api/_admin/reviews.js";
import supplierPerformanceHandler from "../api/_admin/supplier-performance.js";
import supportHandler from "../api/_admin/support.js";
import { getCookieName, hashOpaque, hashPassword } from "../api/_lib/auth.js";
import { query } from "../api/_lib/db.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const response = () => ({
  headers: {},
  statusCode: 200,
  payload: null,
  setHeader(key, value) {
    this.headers[key] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
  end(value) {
    this.payload = value ? JSON.parse(value) : null;
    return this;
  }
});
const body = (value) => Buffer.from(JSON.stringify(value));
const headers = (token, ip) => ({
  cookie: `${getCookieName()}=${token}`,
  origin: "https://constera.az",
  host: "constera.az",
  "x-forwarded-for": ip
});
const call = async (handler, request) => {
  const result = response();
  await handler(request, result);
  return result;
};

const suffix = randomUUID();
const companyId = `cmp-smoke-trust-${suffix}`;
const customerId = `usr-smoke-trust-${suffix}`;
const customerSessionId = `ses-smoke-trust-customer-${suffix}`;
const adminSessionId = `ses-smoke-trust-admin-${suffix}`;
const orderId = `ord-smoke-trust-${suffix}`;
const orderItemId = `ori-smoke-trust-${suffix}`;
const historyId = `osh-smoke-trust-${suffix}`;
const eventId = `ane-smoke-trust-${suffix}`;
let reviewId = "";
let supportId = "";

const [admin] = await query(
  `SELECT id FROM users
    WHERE role IN ('super_admin', 'admin') AND status = 'active'
      AND coalesce(must_change_password, false) = false
    ORDER BY (role = 'super_admin') DESC LIMIT 1`
);
const [product] = await query(
  `SELECT id, sku, name, supplier_id
     FROM products WHERE status = 'active'
       AND lower(trim(coalesce(brand, ''))) <> 'constera sorğu'
     ORDER BY updated_at DESC LIMIT 1`
);
if (!admin || !product) throw new Error("Etibar smoke testi üçün administrator və məhsul tapılmadı.");

const customerToken = randomBytes(32).toString("base64url");
const adminToken = randomBytes(32).toString("base64url");
try {
  await query(
    `INSERT INTO companies (id, name, company_type, contact_email)
     VALUES ($1, 'ConstEra etibar smoke testi', 'customer', $2)`,
    [companyId, `trust-smoke-${suffix}@constera.az`]
  );
  await query(
    `INSERT INTO users (id, company_id, email, name, password_hash, role)
     VALUES ($1, $2, $3, 'Etibar smoke müştərisi', $4, 'customer')`,
    [customerId, companyId, `trust-smoke-${suffix}@constera.az`, await hashPassword(`Smoke-${suffix}-Strong!`)]
  );
  await query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_hash)
     VALUES
       ($1, $2, $3, now() + interval '15 minutes', 'ConstEra trust smoke', $4),
       ($5, $6, $7, now() + interval '15 minutes', 'ConstEra trust smoke admin', $8)`,
    [
      customerSessionId, customerId, hashOpaque(customerToken), hashOpaque("127.0.0.241"),
      adminSessionId, admin.id, hashOpaque(adminToken), hashOpaque("127.0.0.242")
    ]
  );
  await query(
    `INSERT INTO orders (
       id, customer_id, company_name, contact_name, email, phone, city, address,
       payment_method, payment_status, status, subtotal, delivery_amount, total_amount
     ) VALUES (
       $1, $2, 'ConstEra etibar smoke testi', 'Smoke müştəri', $3,
       '+994 00 000 00 05', 'Bakı', 'Avtomatik test ünvanı',
       'invoice', 'paid', 'completed', 20, 0, 20
     )`,
    [orderId, customerId, `trust-smoke-${suffix}@constera.az`]
  );
  await query(
    `INSERT INTO order_items (
       id, order_id, product_id, supplier_id, sku, title, quantity,
       unit, unit_price, price_text, line_total
     ) VALUES ($1, $2, $3, $4, $5, $6, 1, 'ədəd', 20, '20 AZN', 20)`,
    [orderItemId, orderId, product.id, product.supplier_id, product.sku, product.name]
  );
  await query(
    `INSERT INTO order_status_history (
       id, order_id, actor_id, to_status, to_payment_status, note
     ) VALUES ($1, $2, $3, 'completed', 'paid', 'Etibar smoke testi')`,
    [historyId, orderId, admin.id]
  );

  const createdReview = await call(reviewsHandler, {
    method: "POST",
    headers: headers(customerToken, "127.0.0.241"),
    query: {},
    body: body({
      targetType: "product",
      targetId: product.id,
      sourceType: "order",
      sourceId: orderId,
      rating: 5,
      title: "Smoke test təsdiqlənmiş rəy",
      body: "Bu rəy tamamlanmış real test sifarişi ilə yoxlanılır."
    })
  });
  reviewId = createdReview.payload?.data?.id || "";
  if (createdReview.statusCode !== 201 || !reviewId || createdReview.payload.data.verified !== true) {
    throw new Error(`Təsdiqlənmiş rəy yaradılmadı: HTTP ${createdReview.statusCode}`);
  }
  const moderatedReview = await call(reviewsHandler, {
    method: "PATCH",
    headers: headers(adminToken, "127.0.0.242"),
    query: {},
    body: body({ id: reviewId, action: "moderate", status: "published" })
  });
  const publicReviews = await call(reviewsHandler, {
    method: "GET",
    headers: {},
    query: { targetType: "product", targetId: product.id }
  });
  if (
    moderatedReview.statusCode !== 200
    || moderatedReview.payload?.data?.status !== "published"
    || !publicReviews.payload?.data?.reviews?.some((item) => item.id === reviewId)
  ) {
    throw new Error("Rəy moderasiyası və ictimai görünüş yoxlaması uğursuz oldu.");
  }
  console.log("Rəylər: tamamlanmış sifariş təsdiqi və moderasiya yoxlanıldı.");

  const createdSupport = await call(supportHandler, {
    method: "POST",
    headers: headers(customerToken, "127.0.0.241"),
    query: {},
    body: body({
      type: "refund",
      orderId,
      subject: "Smoke test geri ödənişi",
      description: "Tamamlanmış sifariş üçün geri ödəniş axını sınaqdan keçirilir.",
      requestedAmount: 20,
      items: [{ orderItemId, quantity: 1, reason: "Avtomatik test" }]
    })
  });
  supportId = createdSupport.payload?.data?.id || "";
  if (createdSupport.statusCode !== 201 || !supportId) {
    throw new Error(`Dəstək işi yaradılmadı: HTTP ${createdSupport.statusCode}`);
  }
  const approved = await call(supportHandler, {
    method: "PATCH",
    headers: headers(adminToken, "127.0.0.242"),
    query: {},
    body: body({ id: supportId, action: "approve-refund", amount: 20 })
  });
  const completed = await call(supportHandler, {
    method: "PATCH",
    headers: headers(adminToken, "127.0.0.242"),
    query: {},
    body: body({ id: supportId, action: "complete-refund" })
  });
  if (
    approved.statusCode !== 200
    || completed.statusCode !== 200
    || completed.payload?.data?.refund?.status !== "completed"
    || completed.payload?.data?.orderPaymentStatus !== "refunded"
  ) {
    throw new Error("Geri ödəniş təsdiqi və manual tamamlama axını uğursuz oldu.");
  }
  console.log("Dəstək: qaytarma məbləği və geri ödəniş həyat dövrü yoxlanıldı.");

  const tracked = await call(eventsHandler, {
    method: "POST",
    headers: { origin: "https://constera.az", host: "constera.az", "x-forwarded-for": "127.0.0.243" },
    query: {},
    body: body({
      eventType: "order_created",
      eventId: `smoke.${suffix}`,
      visitorId: `visitor.${suffix}`,
      sessionId: `session.${suffix}`,
      path: "/smoke",
      entityType: "order",
      entityId: orderId,
      payload: { source: "smoke" }
    })
  });
  if (tracked.statusCode !== 201) throw new Error(`Analitika hadisəsi qəbul edilmədi: HTTP ${tracked.statusCode}`);

  const quality = await call(qualityHandler, {
    method: "POST",
    headers: headers(adminToken, "127.0.0.242"),
    query: {},
    body: body({ probeLinks: false, linkLimit: 0 })
  });
  if (
    quality.statusCode !== 200
    || Number(quality.payload?.data?.scan?.scannedProducts || 0) < 200
    || Number(quality.payload?.data?.scan?.scannedOffers || 0) < 70
  ) {
    throw new Error(`Kataloq keyfiyyət skanı uğursuz oldu: HTTP ${quality.statusCode}`);
  }
  const performance = await call(supplierPerformanceHandler, {
    method: "GET",
    headers: headers(adminToken, "127.0.0.242"),
    query: {}
  });
  if (performance.statusCode !== 200 || !Array.isArray(performance.payload?.data?.scorecards)) {
    throw new Error("Təchizatçı performans scorecard-ı yaradılmadı.");
  }
  console.log("Analitika, kataloq keyfiyyəti və təchizatçı performansı yoxlanıldı.");
} finally {
  await query("DELETE FROM notifications WHERE user_id = $1 OR payload->>'caseId' = $2 OR payload->>'reviewId' = $3", [customerId, supportId || "none", reviewId || "none"]);
  await query("DELETE FROM audit_logs WHERE actor_id = $1 OR entity_id = ANY($2::text[])", [customerId, [orderId, supportId || "none", reviewId || "none"]]);
  await query("DELETE FROM analytics_events WHERE id = $1 OR entity_id = $2", [eventId, orderId]);
  await query("DELETE FROM refund_transactions WHERE case_id = $1", [supportId || "none"]);
  await query("DELETE FROM support_cases WHERE id = $1", [supportId || "none"]);
  await query("DELETE FROM marketplace_reviews WHERE id = $1", [reviewId || "none"]);
  await query("DELETE FROM crm_leads WHERE source_type = 'order' AND source_id = $1", [orderId]);
  await query("DELETE FROM orders WHERE id = $1", [orderId]);
  await query("DELETE FROM sessions WHERE id = ANY($1::text[])", [[customerSessionId, adminSessionId]]);
  await query("DELETE FROM users WHERE id = $1", [customerId]);
  await query("DELETE FROM companies WHERE id = $1", [companyId]);
}

console.log("ConstEra etibar və keyfiyyət smoke testi uğurla tamamlandı.");
