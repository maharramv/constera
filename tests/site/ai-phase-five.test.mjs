import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("AI Mərhələ 5 smetanı redaktə, təsdiq və idempotent RFQ axınına çevirir", () => {
  const page = read("ai-smeta.html");
  const marketplace = read("assets/js/marketplace.js");
  const cabinet = read("api/_admin/cabinet.js");
  const rfqs = read("api/rfqs.js");
  const migration = read("db/migrations/031_ai_estimate_workflow.sql");

  assert.match(page, /AI Mərhələ 6/);
  assert.match(marketplace, /data-ai-smeta-row-include/);
  assert.match(marketplace, /data-ai-smeta-row-quantity/);
  assert.match(marketplace, /data-ai-smeta-reprice/);
  assert.match(marketplace, /data-ai-smeta-approve-rfq/);
  assert.match(marketplace, /estimateId: rfq\.estimateId/);
  assert.match(cabinet, /workflow_status/);
  assert.match(cabinet, /estimate_ai_not_approved/);
  assert.match(rfqs, /estimate_not_approved/);
  assert.match(rfqs, /ON CONFLICT \(estimate_id\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS workflow_status/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS rfqs_estimate_unique/);
});

test("satınalma mərhələsi və insan düzəlişi RFQ spesifikasiyasına daxil edilir", () => {
  const workflow = read("api/_lib/estimate-workflow.js");
  const marketplace = read("assets/js/marketplace.js");
  const foundation = read("api/_lib/ai-foundation.js");

  assert.match(workflow, /Bünövrə və konstruksiya/);
  assert.match(workflow, /MEP sistemləri/);
  assert.match(marketplace, /Satınalma mərhələsi:/);
  assert.match(marketplace, /humanEditedAt/);
  assert.match(foundation, /enrichEstimateWorkflowRow/);
});
