import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionLifecycle,
  changeOrderImpact,
  passportCompleteness,
  priceLockTerms,
  summarizeIfc
} from "../../api/_lib/lifecycle.js";

test("IFC xülasəsi obyekt və material adlarını deterministik çıxarır", () => {
  const result = summarizeIfc(`
    #1=IFCWALL('a');
    #2=IFCWALL('b');
    #3=IFCDOOR('c');
    #4=IFCMATERIAL('Beton C30/37');
    #5=IFCMATERIAL('Armatur B500B');
    #6=IFCMATERIAL('Beton C30/37');
  `);
  assert.equal(result.elementCount, 6);
  assert.equal(result.materialCount, 2);
  assert.equal(result.entitySummary.IFCWALL, 2);
  assert.deepEqual(result.extractedItems.map((item) => item.name), ["Beton C30/37", "Armatur B500B"]);
});

test("məhsul pasportu boş ekoloji obyekti tamamlanmış saymır", () => {
  const partial = passportCompleteness({
    manufacturer: "Norm",
    warrantyMonths: 12,
    environmentalData: { epdUrl: "", carbonKgCo2e: null, recycledPercent: null }
  });
  assert.equal(partial.score, 29);
  assert.equal(partial.checks.environmental, false);

  const complete = passportCompleteness({
    manufacturer: "Norm", originCountry: "Azərbaycan", declarationUrl: "https://example.com/doc",
    safetyUrl: "https://example.com/safety", certificates: [{ label: "AZS" }], warrantyMonths: 12,
    environmentalData: { recycledPercent: 15 }
  });
  assert.equal(complete.score, 100);
});

test("qiymət kilidi təsdiqlənmiş müddət və məbləği hesablayır", () => {
  const now = new Date("2026-08-15T08:00:00.000Z");
  const result = priceLockTerms({ unitPrice: 12.5, quantity: 4, hours: 48, now });
  assert.equal(result.totalAmount, 50);
  assert.equal(result.expiresAt, "2026-08-17T08:00:00.000Z");
  assert.throws(() => priceLockTerms({ unitPrice: 12.5, quantity: 4, hours: 12 }), /24, 48 və ya 72/);
});

test("həyat dövrü statusları yalnız icazəli istiqamətdə dəyişir", () => {
  assert.equal(canTransitionLifecycle("change_order", "submitted", "approved"), true);
  assert.equal(canTransitionLifecycle("change_order", "implemented", "draft"), false);
  assert.equal(canTransitionLifecycle("warranty", "resolved", "closed"), true);
  assert.equal(canTransitionLifecycle("surplus", "sold", "published"), false);
});

test("dəyişiklik təsiri büdcə və müddəti birlikdə yeniləyir", () => {
  assert.deepEqual(changeOrderImpact({ currentBudget: 100000, currentDays: 90, costDelta: 5250.25, daysDelta: 7 }), {
    revisedBudget: 105250.25, revisedDays: 97, costDelta: 5250.25, daysDelta: 7
  });
});
