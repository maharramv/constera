import "./load-local-env.mjs";
import { randomBytes, randomUUID } from "node:crypto";
import catalogHandler from "../api/catalog.js";
import productsHandler from "../api/products.js";
import analyticsHandler from "../api/_admin/analytics.js";
import inventoryHandler from "../api/_admin/inventory.js";
import ordersHandler from "../api/_admin/orders.js";
import offersHandler from "../api/offers.js";
import { getCookieName, hashOpaque } from "../api/_lib/auth.js";
import { query } from "../api/_lib/db.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const createResponse = () => ({
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

const catalogResponse = createResponse();
await catalogHandler({
  method: "GET",
  headers: {},
  query: { q: "sement", page: "1", pageSize: "5", scope: "products", sort: "relevance" }
}, catalogResponse);

if (catalogResponse.statusCode !== 200 || !catalogResponse.payload?.data?.products?.length) {
  throw new Error(`Kataloq smoke testi uğursuz oldu: HTTP ${catalogResponse.statusCode}`);
}
if (catalogResponse.payload.meta?.scope !== "products" || catalogResponse.payload.data.services?.length) {
  throw new Error("Kataloqun yüngül məhsul axtarışı rejimi düzgün işləmədi.");
}

const product = catalogResponse.payload.data.products[0];
const productResponse = createResponse();
await productsHandler({
  method: "GET",
  headers: {},
  query: { id: product.id, limit: "1" }
}, productResponse);
if (productResponse.statusCode !== 200 || productResponse.payload?.data?.id !== product.id) {
  throw new Error(`Məhsul detal smoke testi uğursuz oldu: HTTP ${productResponse.statusCode}`);
}
for (const field of ["priceHistory", "gallery", "relatedProducts"]) {
  if (!Array.isArray(productResponse.payload.data[field])) {
    throw new Error(`Məhsul detalında ${field} massivi qaytarılmadı.`);
  }
}

const [admin] = await query(
  "SELECT id FROM users WHERE role IN ('super_admin', 'admin') AND status = 'active' ORDER BY (role = 'super_admin') DESC LIMIT 1"
);
if (!admin) throw new Error("Admin analitika smoke testi üçün aktiv administrator tapılmadı.");
const sessionId = `ses-smoke-${randomUUID()}`;
const sessionToken = randomBytes(32).toString("base64url");
await query(
  `INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_hash)
   VALUES ($1, $2, $3, now() + interval '10 minutes', 'ConstEra smoke test', $4)`,
  [sessionId, admin.id, hashOpaque(sessionToken), hashOpaque("127.0.0.251")]
);
try {
  const analyticsResponse = createResponse();
  await analyticsHandler({
    method: "GET",
    headers: { cookie: `${getCookieName()}=${sessionToken}` },
    query: {}
  }, analyticsResponse);
  const quality = analyticsResponse.payload?.data?.quality;
  if (analyticsResponse.statusCode !== 200 || !quality || Number(quality.summary?.total || 0) <= 0) {
    throw new Error(`Admin analitika smoke testi uğursuz oldu: HTTP ${analyticsResponse.statusCode}`);
  }
  if (Number(quality.summary?.requestGroups || 0) <= 0) {
    throw new Error("RFQ məhsul qrupları real satış qeydlərindən ayrılmadı.");
  }
  const inventoryResponse = createResponse();
  await inventoryHandler({
    method: "POST",
    headers: {
      cookie: `${getCookieName()}=${sessionToken}`,
      origin: "https://constera.az",
      host: "constera.az"
    },
    query: {},
    body: Buffer.from(JSON.stringify({
      action: "validate",
      supplierId: productResponse.payload.data.supplierId,
      csv: [
        "sku,qiymət,status,stok,minimum sifariş,mənbə url",
        [
          product.sku,
          productResponse.payload.data.priceAmount,
          productResponse.payload.data.priceStatus,
          5,
          1,
          productResponse.payload.data.sourceUrl
        ].join(",")
      ].join("\n")
    }))
  }, inventoryResponse);
  if (inventoryResponse.statusCode !== 200 || inventoryResponse.payload?.data?.valid !== 1) {
    throw new Error(`Toplu inventar yoxlaması uğursuz oldu: HTTP ${inventoryResponse.statusCode}`);
  }
  const supplierRows = await query(
    "SELECT id FROM suppliers WHERE status <> 'Arxiv' ORDER BY id LIMIT 2"
  );
  if (supplierRows.length < 2) throw new Error("Təklif seçimi smoke testi üçün iki təchizatçı tapılmadı.");
  const smokeRfqId = `rfq-smoke-${randomUUID()}`;
  const firstOfferId = `off-smoke-${randomUUID()}`;
  const winningOfferId = `off-smoke-${randomUUID()}`;
  try {
    await query(
      `INSERT INTO rfqs (id, customer_id, title, company_name, contact, status)
       VALUES ($1, $2, 'Avtomatik təklif seçimi', 'ConstEra smoke test', 'smoke-test@constera.az', 'Təklif alındı')`,
      [smokeRfqId, admin.id]
    );
    await query(
      `INSERT INTO offers (id, rfq_id, supplier_id, created_by, price_amount, price_text, status)
       VALUES
         ($1, $3, $5, $4, 120, '120 AZN', 'accepted'),
         ($2, $3, $6, $4, 110, '110 AZN', 'submitted')`,
      [firstOfferId, winningOfferId, smokeRfqId, admin.id, supplierRows[0].id, supplierRows[1].id]
    );
    const offerResponse = createResponse();
    await offersHandler({
      method: "PATCH",
      headers: {
        cookie: `${getCookieName()}=${sessionToken}`,
        origin: "https://constera.az",
        host: "constera.az"
      },
      query: {},
      body: Buffer.from(JSON.stringify({ id: winningOfferId, status: "accepted" }))
    }, offerResponse);
    const statuses = await query(
      "SELECT id, status FROM offers WHERE rfq_id = $1 ORDER BY id",
      [smokeRfqId]
    );
    const accepted = statuses.filter((offer) => offer.status === "accepted");
    const rejected = statuses.find((offer) => offer.id === firstOfferId);
    if (
      offerResponse.statusCode !== 200
      || accepted.length !== 1
      || accepted[0].id !== winningOfferId
      || rejected?.status !== "rejected"
    ) {
      throw new Error(`Təklif seçimi smoke testi uğursuz oldu: HTTP ${offerResponse.statusCode}`);
    }
    console.log("RFQ təklif seçimi: əvvəlki qalib rədd edildi və yalnız yeni qalib saxlanıldı.");
  } finally {
    await query("DELETE FROM notifications WHERE payload->>'rfqId' = $1", [smokeRfqId]);
    await query("DELETE FROM audit_logs WHERE entity_type = 'offer' AND entity_id IN ($1, $2)", [firstOfferId, winningOfferId]);
    await query("DELETE FROM rfqs WHERE id = $1", [smokeRfqId]);
  }
  console.log(`Məlumat keyfiyyəti: ${quality.score}%, ${quality.summary.total} real qeyd, ${quality.summary.requestGroups} RFQ qrupu.`);
  console.log("Toplu inventar: real SKU və HTTPS mənbə serverdə yoxlanıldı.");
} finally {
  await query("DELETE FROM sessions WHERE id = $1", [sessionId]);
}

const orderResponse = createResponse();
let orderId = "";

try {
  await ordersHandler({
    method: "POST",
    headers: {
      origin: "https://constera.az",
      host: "constera.az",
      "x-forwarded-for": "127.0.0.250"
    },
    query: {},
    body: Buffer.from(JSON.stringify({
      companyName: "ConstEra avtomatik yoxlama",
      contactName: "Smoke test",
      email: "smoke-test@constera.az",
      phone: "+994 00 000 00 00",
      city: "Bakı",
      address: "Avtomatik test ünvanı",
      deliveryMode: "pickup",
      paymentMethod: "invoice",
      note: "Bu sifariş avtomatik yaradılır və dərhal silinir.",
      items: [{ productId: product.id, quantity: 1, unit: product.package || "ədəd" }]
    }))
  }, orderResponse);

  if (orderResponse.statusCode !== 201 || !orderResponse.payload?.data?.id) {
    throw new Error(`Sifariş smoke testi uğursuz oldu: HTTP ${orderResponse.statusCode} ${orderResponse.payload?.error?.message || ""}`);
  }
  orderId = orderResponse.payload.data.id;
  if (orderResponse.payload.data.items.length !== 1) throw new Error("Sifariş mövqeyi bazadan geri oxunmadı.");
  console.log(`Kataloq axtarışı: ${catalogResponse.payload.meta.total} nəticə, ilk SKU ${product.sku}.`);
  console.log(`Məhsul detalı: ${productResponse.payload.data.gallery.length} şəkil, ${productResponse.payload.data.priceHistory.length} qiymət qeydi, ${productResponse.payload.data.relatedProducts.length} əlaqəli məhsul.`);
  console.log(`Sifariş axını: #${orderResponse.payload.data.orderNumber} yaradıldı və server qiyməti ilə oxundu.`);
} finally {
  if (orderId) {
    await query("DELETE FROM notifications WHERE payload->>'orderId' = $1", [orderId]);
    await query("DELETE FROM audit_logs WHERE entity_type = 'order' AND entity_id = $1", [orderId]);
    await query("DELETE FROM orders WHERE id = $1", [orderId]);
    console.log("Smoke sifarişi və əlaqəli test qeydləri silindi.");
  }
}

console.log("ConstEra commerce smoke testi uğurla tamamlandı.");
