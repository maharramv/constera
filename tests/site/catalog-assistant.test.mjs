import assert from "node:assert/strict";
import test from "node:test";

await import("../../assets/js/catalog-assistant.js");

const assistant = globalThis.ConstEraCatalogAssistant;

test("kataloq köməkçisi ev tikintisi üçün çoxmərhələli material seçimi yaradır", () => {
  const result = assistant.analyze("120 m² ev tikintisi üçün real foto və qiymət");
  assert.equal(result.area, "120 m2");
  assert.equal(result.sourceFilter, "sourced-image");
  assert.ok(result.searches.some((item) => item.query === "sement"));
  assert.ok(result.searches.some((item) => item.query === "armatur"));
  assert.equal(result.rfqRecommended, true);
});

test("icarə və xidmət niyyəti uyğun bölmələrə yönləndirilir", () => {
  const result = assistant.analyze("Operatorla ekskavator icarəsi və montaj xidməti");
  assert.ok(result.links.some((item) => item.href === "rental.html"));
  assert.ok(result.links.some((item) => item.href === "services.html"));
});

test("qısa dəqiq məhsul sorğusu lazımsız santexnika profili ilə genişlənmir", () => {
  const result = assistant.analyze("suvaq 30 kq");
  assert.deepEqual(result.searches.map((item) => item.query), ["suvaq 30 kq"]);
});
