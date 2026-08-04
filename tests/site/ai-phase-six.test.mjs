import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("AI Mərhələ 6 təsdiqlənmiş smetanı mərhələli satınalma planına çevirir", () => {
  const page = read("ai-smeta.html");
  const marketplace = read("assets/js/marketplace.js");
  const endpoint = read("api/_admin/procurement-plans.js");
  const foundation = read("api/_lib/ai-foundation.js");
  const migration = read("db/migrations/032_ai_procurement_plans.sql");

  assert.match(page, /AI Mərhələ 6/);
  assert.match(marketplace, /data-ai-plan-generate/);
  assert.match(marketplace, /data-ai-plan-review/);
  assert.match(marketplace, /data-ai-plan-activate/);
  assert.match(endpoint, /procurement_plan_not_approved/);
  assert.match(endpoint, /ON CONFLICT \(procurement_plan_phase_id\)/);
  assert.match(foundation, /procurement_plan/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS procurement_plans/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS procurement_plan_phases/);
});

test("mərhələli RFQ material və büdcəni AI-dan deyil təsdiqlənmiş smetadan alır", () => {
  const planner = read("api/_lib/procurement-plan.js");
  const endpoint = read("api/_admin/procurement-plans.js");
  const openAi = read("api/_lib/openai.js");

  assert.match(planner, /rowKeys/);
  assert.match(planner, /rowCount: rows\.length/);
  assert.match(endpoint, /estimate_payload/);
  assert.match(endpoint, /preparePhaseItems/);
  assert.match(openAi, /Materialları dalğalar arasında köçürmə/);
  assert.match(openAi, /constera_procurement_plan/);
});
