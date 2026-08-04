import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyEstimatePhase,
  enrichEstimateWorkflowRow,
  estimateCriticality
} from "../../api/_lib/estimate-workflow.js";

test("smeta mövqeləri tikinti satınalma mərhələlərinə ayrılır", () => {
  assert.equal(classifyEstimatePhase({ title: "A500C armatur 12 mm", category: "Metal" }), "Bünövrə və konstruksiya");
  assert.equal(classifyEstimatePhase({ title: "NYM elektrik kabeli", category: "Elektrik" }), "MEP sistemləri");
  assert.equal(classifyEstimatePhase({ title: "Daxili divar boyası", category: "Boya" }), "Tamamlama");
  assert.equal(classifyEstimatePhase({ title: "Tikinti materialı", category: "Digər" }), "Ümumi");
});

test("kritik mövqelər və RFQ seçimi təhlükəsiz başlanğıc dəyərləri alır", () => {
  const row = enrichEstimateWorkflowRow({ title: "PPR boru 25 mm", category: "Santexnika" });
  assert.equal(row.phase, "MEP sistemləri");
  assert.equal(row.criticality, "Yüksək");
  assert.equal(row.included, true);
  assert.equal(estimateCriticality({ phase: "Tamamlama", confidence: "Aşağı" }), "Yüksək");
  assert.equal(enrichEstimateWorkflowRow({ title: "Boya", included: false }).included, false);
});
