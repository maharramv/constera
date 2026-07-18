import "./load-local-env.mjs";
import catalogHandler from "../api/catalog.js";
import ordersHandler from "../api/_admin/orders.js";
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
