import assert from "node:assert/strict";
import test from "node:test";
import {
  countTechnicalAttributes,
  normalizeProductAttributes
} from "../../api/_lib/product-attributes.js";
import {
  catalogAttributeNormalizationOptions,
  summarizeAttributeEvidence
} from "../../api/_lib/catalog-quality.js";

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

test("atribut robotu təhlükəsiz limitləri və minimum texniki sahəni qoruyur", () => {
  assert.deepEqual(catalogAttributeNormalizationOptions({ limit: 9_999, minTechnicalAttributes: 0 }), {
    limit: 500,
    minTechnicalAttributes: 2
  });
  assert.deepEqual(catalogAttributeNormalizationOptions({ limit: -3, minTechnicalAttributes: 99 }), {
    limit: 1,
    minTechnicalAttributes: 12
  });
});

test("atribut sübutu mənbəni saxlayır və etibar səviyyəsini açıq göstərir", () => {
  assert.deepEqual(summarizeAttributeEvidence([
    { label: "Güc", value: "600 W", source: "stored" },
    { label: "Ölçü", value: "1200 x 2400 mm", source: "spec" }
  ]), [
    { label: "Güc", value: "600 W", source: "stored", confidence: "confirmed" },
    { label: "Ölçü", value: "1200 x 2400 mm", source: "spec", confidence: "high" }
  ]);
});

test("spesifikasiyadakı dəqiq atribut məhsul adından çıxarılan ümumi dəyəri əvəz edir", () => {
  const attributes = normalizeProductAttributes({
    name: "Knauf alçıpan 12,5 × 2500 × 1200 mm",
    specs: ["Qalınlıq: 12,5 mm", "Ölçü: 2500 × 1200 mm"]
  });
  assert.deepEqual(attributes.filter((item) => item.label === "Ölçü"), [
    { label: "Ölçü", value: "2500 × 1200 mm", source: "spec" }
  ]);
  assert.equal(attributes.filter((item) => item.label === "Qalınlıq").length, 1);
});

test("ölçü və güc kimi səhv idxal dəyərləri qablaşdırma və ümumi idxal qeydi mənşə sayılmır", () => {
  const attributes = normalizeProductAttributes({
    name: "LED spot 22W ağ",
    packageText: "22W",
    origin: "Azərbaycan bazarı / idxal"
  });
  assert.equal(attributes.some((item) => item.label === "Qablaşdırma"), false);
  assert.equal(attributes.some((item) => item.label === "Mənşə"), false);
  assert.deepEqual(attributes.find((item) => item.label === "Güc"), {
    label: "Güc",
    value: "22 W",
    source: "name"
  });
});
