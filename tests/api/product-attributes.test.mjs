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
    { label: "Çəki", value: "30 kq" },
    { label: "Ölçü", value: "1200 × 2400 mm" },
    { label: "Qalınlıq", value: "12,5 mm" },
    { label: "Həcm", value: "800 ml" },
    { label: "Rəng", value: "Mavi" }
  ]);
  assert.equal(countTechnicalAttributes(attributes), 5);
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

test("məhsul adı və qablaşdırma yalnız aydın ölçü, rəng və material siqnallarını çıxarır", () => {
  const attributes = normalizeProductAttributes({
    name: "METAK PP üçlük Ø110, 90° mavi",
    packageText: "500 ml qab"
  });
  assert.deepEqual(
    attributes.filter((item) => !["Qablaşdırma"].includes(item.label))
      .map(({ label, value }) => ({ label, value })),
    [
      { label: "Həcm", value: "500 ml" },
      { label: "Diametr", value: "Ø110" },
      { label: "Bucaq", value: "90°" },
      { label: "Rəng", value: "Mavi" },
      { label: "Material", value: "PP" }
    ]
  );
});

test("ad daxilindəki tam ölçü və kimyəvi baza texniki atribut kimi saxlanır", () => {
  const attributes = normalizeProductAttributes({
    name: "Knauf alçıpan 1200 × 2400 × 12,5 mm",
    packageText: "1 lövhə"
  });
  assert.deepEqual(
    attributes.filter((item) => item.label !== "Qablaşdırma")
      .map(({ label, value }) => ({ label, value })),
    [
      { label: "Ölçü", value: "1200 × 2400 × 12,5 mm" },
      { label: "Material", value: "Gips" }
    ]
  );
});
