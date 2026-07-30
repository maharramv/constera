import assert from "node:assert/strict";
import test from "node:test";
import {
  countTechnicalAttributes,
  normalizeProductAttributes
} from "../../api/_lib/product-attributes.js";

test("məhsul xüsusiyyətləri Azərbaycan dilində sabit atributlara çevrilir", () => {
  const attributes = normalizeProductAttributes({
    packageText: "30 kg kisə",
    origin: "Azərbaycan",
    specs: [
      "Ölçü: 1200 × 2400 mm",
      "12,5 mm qalınlıq",
      "Həcm: 800 ml",
      "Mavi rəng",
      "Sadə təsvir"
    ]
  });

  assert.deepEqual(attributes.map(({ label, value }) => ({ label, value })), [
    { label: "Qablaşdırma", value: "30 kq kisə" },
    { label: "Mənşə", value: "Azərbaycan" },
    { label: "Ölçü", value: "1200 × 2400 mm" },
    { label: "Qalınlıq", value: "12,5 mm" },
    { label: "Həcm", value: "800 ml" },
    { label: "Rəng", value: "Mavi" }
  ]);
  assert.equal(countTechnicalAttributes(attributes), 4);
});

test("saxlanmış atributlar üstünlük təşkil edir və təkrarlar silinir", () => {
  const attributes = normalizeProductAttributes({
    packageText: "1 ədəd",
    storedAttributes: [
      { key: "power", value: "600 W" },
      { label: "Güc", value: "600 W" }
    ],
    specs: ["Güc: 600 W"]
  });
  assert.equal(attributes.filter((item) => item.label === "Güc").length, 1);
  assert.equal(attributes.find((item) => item.label === "Güc").source, "stored");
});
