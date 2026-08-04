import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeterministicProcurementPlan,
  normalizeAiProcurementPlan,
  procurementPlanDurationDays
} from "../../api/_lib/procurement-plan.js";

const materialRows = (count, phase = "Bünövrə və konstruksiya") => Array.from({ length: count }, (_, index) => ({
  key: `material-${index + 1}`,
  title: `Material ${index + 1}`,
  phase,
  criticality: index === 0 ? "Yüksək" : "Normal",
  included: true,
  quantity: index + 1,
  unit: "ədəd",
  catalog: { lineTotal: index < count - 1 ? 10 : null }
}));

test("satınalma planı hər RFQ dalğasını 20 materialla məhdudlaşdırır", () => {
  const plan = buildDeterministicProcurementPlan({
    estimate: { rows: materialRows(25), catalogPricing: { currency: "AZN" } },
    projectStartDate: "2026-09-01",
    durationDays: 120
  });
  assert.equal(plan.waves.length, 2);
  assert.equal(plan.waves[0].rowCount, 20);
  assert.equal(plan.waves[1].rowCount, 5);
  assert.equal(plan.waves.every((wave) => wave.rowKeys.length <= 20), true);
  assert.equal(plan.totalBudget, 240);
  assert.equal(plan.unpricedRows, 1);
  assert.equal(procurementPlanDurationDays(plan.projectStartDate, plan.targetEndDate), 120);
});

test("AI yalnız icazəli dalğaların tarix və risk tövsiyəsini dəyişə bilir", () => {
  const baseline = buildDeterministicProcurementPlan({
    estimate: { rows: materialRows(2, "MEP sistemləri") },
    projectStartDate: "2026-10-01",
    durationDays: 90
  });
  const original = baseline.waves[0];
  const normalized = normalizeAiProcurementPlan({
    baseline,
    plan: {
      summary: "MEP materialları daha erkən sifariş edilməlidir.",
      confidence: 0.84,
      warnings: ["Kabel stokunu təsdiqlə."],
      waves: [
        {
          key: original.key,
          startDate: "2026-10-10",
          endDate: "2026-10-30",
          needByDate: "2026-09-15",
          leadTimeDays: 25,
          riskLevel: "high",
          reason: "Təchizat müddəti uzundur.",
          checks: ["Stok təsdiqi al."]
        },
        {
          key: "uydurma-dalga",
          startDate: "2026-10-01",
          endDate: "2026-10-02",
          needByDate: "2026-09-01",
          leadTimeDays: 10,
          riskLevel: "low",
          reason: "Uydurma",
          checks: []
        }
      ]
    }
  });
  assert.equal(normalized.output.waves.length, 1);
  assert.deepEqual(normalized.output.waves[0].rowKeys, original.rowKeys);
  assert.equal(normalized.output.waves[0].budget, original.budget);
  assert.equal(normalized.output.waves[0].needByDate, "2026-09-15");
  assert.equal(normalized.output.waves[0].riskLevel, "high");
});

test("təkrarlanan smeta açarları ayrıca RFQ materialı kimi qorunur", () => {
  const rows = materialRows(2).map((row) => ({ ...row, key: "eyni-material" }));
  const plan = buildDeterministicProcurementPlan({
    estimate: { rows },
    projectStartDate: "2026-11-01",
    durationDays: 60
  });
  assert.deepEqual(plan.waves[0].rowKeys, ["eyni-material", "eyni-material-2"]);
  assert.equal(new Set(plan.waves[0].rowKeys).size, 2);
});
