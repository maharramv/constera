import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommercialPilotCenter,
  commercialPilotTarget
} from "../../api/_lib/commercial-pilot.js";

const now = Date.parse("2026-08-10T00:00:00.000Z");
const readyProduct = (overrides = {}) => ({
  productId: "product-1",
  offerId: "offer-1",
  sku: "SKU-1",
  name: "Real məhsul",
  category: "Tikinti materialları",
  imageUrl: "/assets/products/real.webp",
  licensedImageUrl: "https://supplier.example/real.webp",
  sourceUrl: "https://supplier.example/product",
  offerSourceUrl: "https://supplier.example/price",
  technicalAttributeCount: 3,
  supplierId: "supplier-1",
  supplierName: "Real təchizatçı",
  supplierProfileReady: true,
  hasActiveContract: true,
  hasLicensedMedia: true,
  unitPrice: 12.5,
  currency: "AZN",
  priceStatus: "confirmed",
  priceVerifiedAt: "2026-08-01T00:00:00.000Z",
  stockQuantity: 50,
  ...overrides
});

test("tam sübutlu məhsul kommersiya pilotunun bütün qapılarından keçir", () => {
  const center = buildCommercialPilotCenter([readyProduct()], {
    verifiedLogisticsZones: 1,
    now
  });
  assert.equal(center.readyCount, 1);
  assert.equal(center.averageScore, 100);
  assert.equal(center.items[0].status, "ready");
  assert.equal(center.items[0].nextAction, null);
  assert.equal(center.items[0].checks.every((item) => item.ready), true);
});

test("pilot mərkəzi çatışmazlığı uydurmur və dəqiq növbəti admin addımını göstərir", () => {
  const center = buildCommercialPilotCenter([
    readyProduct({ hasLicensedMedia: false, licensedImageUrl: "" })
  ], { verifiedLogisticsZones: 1, now });
  const item = center.items[0];
  assert.equal(item.status, "near_ready");
  assert.equal(item.nextAction.key, "media");
  assert.equal(item.nextAction.target, "media");
  assert.equal(item.checks.find((check) => check.key === "image").ready, true);
  assert.equal(item.checks.find((check) => check.key === "media").ready, false);
});

test("iş sahəsi 20 məhsulla məhdudlaşır və ilk seçimdə kateqoriya müxtəlifliyini qoruyur", () => {
  const products = Array.from({ length: 30 }, (_, index) => readyProduct({
    productId: `product-${index + 1}`,
    offerId: `offer-${index + 1}`,
    sku: `SKU-${index + 1}`,
    name: `Məhsul ${String(index + 1).padStart(2, "0")}`,
    category: index < 12 ? "A" : `Kateqoriya ${index}`,
    hasLicensedMedia: index % 3 !== 0,
    licensedImageUrl: index % 3 !== 0 ? `https://supplier.example/${index}.webp` : ""
  }));
  const center = buildCommercialPilotCenter(products, { verifiedLogisticsZones: 1, now });
  assert.equal(center.target, commercialPilotTarget);
  assert.equal(center.items.length, 20);
  assert.ok(center.items.filter((item) => item.category === "A").length <= 4);
  assert.equal(center.gateSummary.length, 11);
});
