import test from "node:test";
import assert from "node:assert/strict";
import healthHandler from "../../api/health.js";
import authHandler from "../../api/auth.js";
import catalogHandler from "../../api/catalog.js";
import adminHandler from "../../api/admin.js";
import productsHandler from "../../api/products.js";
import rfqsHandler from "../../api/rfqs.js";
import offersHandler from "../../api/offers.js";
import proposalsHandler from "../../api/_admin/proposals.js";
import { parseRfqQuantity } from "../../api/_lib/rfq-order.js";
import { chooseProductOffer } from "../../api/_lib/product-offers.js";
import { calculateOfferLandedCosts } from "../../api/_lib/landed-cost.js";
import { parseLandedCostQuantity } from "../../api/landed-cost.js";

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
  }
});

const withoutDatabase = async (callback) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalPostgresUrl = process.env.POSTGRES_URL;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  try {
    return await callback();
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = originalPostgresUrl;
  }
};

test("health bazasız rejimi açıq bildirir", async () => withoutDatabase(async () => {
  const response = createResponse();
  await healthHandler({ method: "GET", headers: {}, query: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.database, "not_configured");
  assert.equal(response.payload.ok, true);
}));

test("sessiya endpoint-i cookiesiz anonim cavab verir", async () => withoutDatabase(async () => {
  const response = createResponse();
  await authHandler({ method: "GET", headers: {}, query: { action: "session" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.authenticated, false);
  assert.equal(response.payload.user, null);
}));

test("kataloq endpoint-i baza qoşulmayanda idarə olunan 503 qaytarır", async () => withoutDatabase(async () => {
  const response = createResponse();
  await catalogHandler({ method: "GET", headers: {}, query: {} }, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.error.code, "database_not_configured");
}));

test("idarəetmə gateway-i marşrutları bir funksiyada təhlükəsiz yönləndirir", async () => {
  const protectedResponse = createResponse();
  await adminHandler({ method: "GET", headers: {}, query: { __route: "analytics" } }, protectedResponse);
  assert.equal(protectedResponse.statusCode, 401);
  assert.equal(protectedResponse.payload.error.code, "authentication_required");

  const ordersResponse = createResponse();
  await adminHandler({ method: "GET", headers: {}, query: { __route: "orders" } }, ordersResponse);
  assert.equal(ordersResponse.statusCode, 401);
  assert.equal(ordersResponse.payload.error.code, "authentication_required");

  for (const route of [
    "cabinet",
    "catalog-staging",
    "catalog-quality",
    "crm",
    "events",
    "fulfillments",
    "inventory",
    "operations-center",
    "procurement",
    "proposals",
    "product-offers",
    "purchase-orders",
    "price-monitor",
    "rental-bookings",
    "supplier-performance",
    "supplier-feeds",
    "support"
  ]) {
    const response = createResponse();
    await adminHandler({ method: "GET", headers: {}, query: { __route: route } }, response);
    assert.equal(response.statusCode, 401, route);
    assert.equal(response.payload.error.code, "authentication_required", route);
  }

  const reviewsResponse = createResponse();
  await adminHandler({ method: "GET", headers: {}, query: { __route: "reviews", scope: "moderation" } }, reviewsResponse);
  assert.equal(reviewsResponse.statusCode, 401);
  assert.equal(reviewsResponse.payload.error.code, "authentication_required");

  const missingResponse = createResponse();
  await adminHandler({ method: "GET", headers: {}, query: { __route: "unknown" } }, missingResponse);
  assert.equal(missingResponse.statusCode, 404);
  assert.equal(missingResponse.payload.error.code, "admin_route_not_found");
});

test("provider hazırlığı açarsız rejimdə açıq və təhlükəsiz cavab verir", async () => {
  const keys = [
    "PAYMENT_WEBHOOK_URL",
    "PAYMENT_WEBHOOK_SECRET",
    "BANK_TRANSFER_ACCOUNT_NAME",
    "BANK_TRANSFER_BANK_NAME",
    "BANK_TRANSFER_IBAN",
    "BANK_TRANSFER_TAX_ID",
    "EINVOICE_WEBHOOK_URL",
    "EINVOICE_WEBHOOK_SECRET",
    "AI_ESTIMATE_WEBHOOK_URL",
    "AI_ESTIMATE_WEBHOOK_SECRET",
    "EMAIL_WEBHOOK_URL",
    "WHATSAPP_WEBHOOK_URL",
    "NOTIFICATION_WEBHOOK_SECRET"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  try {
    const response = createResponse();
    await adminHandler({ method: "GET", headers: {}, query: { __route: "integrations" } }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data.readiness, {
      payment: false,
      bankTransfer: false,
      electronicInvoice: false,
      logistics: false,
      aiEstimate: false,
      email: false,
      whatsapp: false
    });
  } finally {
    keys.forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
});

test("scheduled backup endpoint-i cron sirri olmadan bağlıdır", async () => {
  const response = createResponse();
  await adminHandler({ method: "GET", headers: {}, query: { __route: "scheduled-backup" } }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.error.code, "cron_unauthorized");
});

test("production monitor endpoint-i cron sirri olmadan bağlıdır", async () => {
  const response = createResponse();
  await adminHandler({ method: "GET", headers: {}, query: { __route: "production-monitor" } }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.error.code, "cron_unauthorized");
});

test("təchizatçının şəxsi məhsul siyahısı anonim sorğuya açılmır", async () => withoutDatabase(async () => {
  const response = createResponse();
  await productsHandler({ method: "GET", headers: {}, query: { scope: "mine" } }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.error.code, "authentication_required");
}));

test("RFQ və təklif müqayisəsi anonim istifadəçiyə açılmır", async () => withoutDatabase(async () => {
  const rfqResponse = createResponse();
  await rfqsHandler({ method: "GET", headers: {}, query: {} }, rfqResponse);
  assert.equal(rfqResponse.statusCode, 401);
  assert.equal(rfqResponse.payload.error.code, "authentication_required");

  const offerResponse = createResponse();
  await offersHandler({ method: "GET", headers: {}, query: { rfqId: "rfq-test" } }, offerResponse);
  assert.equal(offerResponse.statusCode, 401);
  assert.equal(offerResponse.payload.error.code, "authentication_required");

  const proposalResponse = createResponse();
  await proposalsHandler({ method: "GET", headers: {}, query: { rfqId: "rfq-test" } }, proposalResponse);
  assert.equal(proposalResponse.statusCode, 401);
  assert.equal(proposalResponse.payload.error.code, "authentication_required");
}));

test("RFQ miqdarı Azərbaycan yazılışından təhlükəsiz rəqəmə çevrilir", () => {
  assert.equal(parseRfqQuantity("500 kisə"), 500);
  assert.equal(parseRfqQuantity("1 250,5 kq"), 1250.5);
  assert.equal(parseRfqQuantity("dəqiqləşdiriləcək"), 1);
  assert.equal(parseRfqQuantity("0 ədəd"), 1);
});

test("məhsul təklifi seçimi açıq ID-ni qoruyur və uyğunsuz ID-ni qəbul etmir", () => {
  const offers = [
    { id: "offer-cheap", unitPrice: 10 },
    { id: "offer-fast", unitPrice: 12 }
  ];
  assert.equal(chooseProductOffer(offers).id, "offer-cheap");
  assert.equal(chooseProductOffer(offers, "offer-fast").id, "offer-fast");
  assert.equal(chooseProductOffer(offers, "offer-unknown"), null);
});

test("yekun maya müqayisəsi qiymət, logistika, stok və minimum sifarişi birlikdə hesablayır", () => {
  assert.equal(parseLandedCostQuantity("12,5"), 12.5);
  const offers = calculateOfferLandedCosts({
    city: "Bakı",
    mode: "delivery",
    quantity: 10,
    zones: [{
      id: "baku",
      name: "Bakı",
      cities: ["Bakı"],
      baseFee: 8,
      perSupplierFee: 3,
      perUnitFee: 0.1,
      minimumFee: 8,
      freeAbove: null,
      etaMinDays: 1,
      etaMaxDays: 2
    }],
    offers: [
      {
        id: "offer-a",
        supplier: "A",
        unitPrice: 10,
        currency: "AZN",
        priceStatus: "confirmed",
        stockQuantity: 100,
        minimumOrder: 1,
        leadTimeDays: 2,
        deliveryModes: ["supplier_delivery"]
      },
      {
        id: "offer-b",
        supplier: "B",
        unitPrice: 9,
        currency: "AZN",
        priceStatus: "confirmed",
        stockQuantity: 5,
        minimumOrder: 1,
        leadTimeDays: 1,
        deliveryModes: ["supplier_delivery"]
      }
    ]
  });
  assert.equal(offers[0].id, "offer-a");
  assert.equal(offers[0].landedTotal, 109);
  assert.equal(offers[0].effectiveUnitCost, 10.9);
  assert.equal(offers[0].recommended, true);
  assert.equal(offers[1].eligible, false);
  assert.match(offers[1].reasons.join(" "), /Stokda yalnız 5/);
});
