import assert from "node:assert/strict";
import test from "node:test";
import { calculateEstimateLine, rankEstimateCandidates } from "../../api/_lib/estimate-catalog.js";

test("kataloq qiymətləndirilməsi tələb olunan miqdarı qablaşdırma sayına çevirir", () => {
  assert.deepEqual(calculateEstimateLine({
    quantity: 30,
    unit: "litr",
    packageText: "15 L",
    unitPrice: 72.9
  }), {
    packageCount: 2,
    packageSize: 15,
    lineTotal: 145.8,
    confidence: "high"
  });
});

test("smeta məhsul sıralaması verilmiş real məhsulu və təsdiqli qiyməti önə çəkir", () => {
  const ranked = rankEstimateCandidates({
    title: "Daxili divar boyası",
    category: "Boya",
    keywords: ["interyer", "15 litr"],
    productIds: ["prd-penguin"]
  }, [{
    id: "prd-penguin",
    name: "Penguin Penplus daxili boya 15 L",
    sku: "PEN-PLUS-15",
    brand: "Penguin",
    category: "Boya",
    subcategory: "Daxili boya",
    package: "15 L",
    origin: "Azərbaycan",
    specs: ["Mat"],
    priceStatus: "confirmed",
    unitPrice: 72.9,
    sourceUrl: "https://www.penguin.az/"
  }, {
    id: "prd-request",
    name: "Daxili boya",
    sku: "REQ-1",
    brand: "Digər",
    category: "Boya",
    subcategory: "Daxili boya",
    package: "15 L",
    origin: "",
    specs: [],
    priceStatus: "request",
    unitPrice: null,
    sourceUrl: ""
  }]);

  assert.equal(ranked[0].id, "prd-penguin");
  assert.ok(ranked[0].score >= 2_000);
  assert.equal(ranked[0].priceStatus, "confirmed");
});

test("texniki kod və ölçü uyğun gəlməyəndə ümumi kateqoriya sözü məhsul seçdirmir", () => {
  const wrongArmatureMatch = rankEstimateCandidates({
    title: "Armatur 12 mm A500C",
    category: "Metal",
    quantity: 2,
    unit: "ton",
    keywords: ["armatur", "A500C"],
    productIds: []
  }, [{
    id: "metal-profile",
    name: "Knauf UA 50/4000 mm metal profil, 2 mm",
    sku: "UA-50",
    brand: "Knauf",
    category: "Metal",
    subcategory: "Profil",
    package: "4 m",
    origin: "",
    specs: [],
    priceStatus: "confirmed",
    unitPrice: 10.15,
    sourceUrl: "https://example.com/profile"
  }]);
  assert.deepEqual(wrongArmatureMatch, []);

  const exactArmatureMatch = rankEstimateCandidates({
    title: "Armatur 12 mm A500C",
    category: "Metal",
    quantity: 2,
    unit: "ton",
    keywords: ["armatur", "A500C"],
    productIds: []
  }, [{
    id: "armature-a500c",
    name: "Armatur A500C 12 mm",
    sku: "A500C-12",
    brand: "Yerli istehsal",
    category: "Metal",
    subcategory: "Armatur",
    package: "ton",
    origin: "Azərbaycan",
    specs: ["12 mm"],
    priceStatus: "confirmed",
    unitPrice: 980,
    sourceUrl: "https://example.com/armature"
  }]);
  assert.equal(exactArmatureMatch[0].id, "armature-a500c");
});

test("Azərbaycan şəkilçiləri və interyer sinonimi real boya uyğunluğunu itirmir", () => {
  const ranked = rankEstimateCandidates({
    title: "Daxili və xarici boya",
    category: "Boya",
    quantity: 30,
    unit: "litr",
    keywords: ["interyer", "boya"],
    productIds: []
  }, [{
    id: "interior-paint",
    name: "Premium interyer boyası 15 L",
    sku: "PAINT-15",
    brand: "Yerli brend",
    category: "Boya",
    subcategory: "Daxili boya",
    package: "15 L",
    origin: "Azərbaycan",
    specs: ["Mat"],
    priceStatus: "confirmed",
    unitPrice: 75,
    sourceUrl: "https://example.com/paint"
  }]);
  assert.equal(ranked[0].id, "interior-paint");
});
