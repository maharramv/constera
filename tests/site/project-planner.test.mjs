import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("layihə səbəti bütün marketplace növlərini vahid axına bağlayır", () => {
  const page = read("project-planner.html");
  const marketplace = read("assets/js/marketplace.js");
  const shell = read("scripts/site-shell.mjs");

  assert.match(page, /data-page="project-planner"/);
  assert.match(page, /data-project-planner-form/);
  assert.match(page, /data-project-planner-items/);
  assert.match(page, /data-project-planner-rfq/);
  assert.match(page, /data-project-planner-ai/);
  assert.match(page, /data-project-match-suppliers/);
  assert.match(page, /data-project-milestone-form/);
  assert.match(page, /data-project-document-form/);
  assert.match(page, /data-project-commerce/);
  assert.match(marketplace, /constera-project-basket/);
  assert.match(marketplace, /projectEntityTypes = new Set\(\["product", "service", "package", "rental"\]\)/);
  assert.match(marketplace, /data-action="project"/);
  assert.match(marketplace, /initProjectPlanner\(\)/);
  assert.match(shell, /project-planner\.html/);
});

test("layihə səbəti RFQ və ağıllı smeta formalarını doldurur", () => {
  const marketplace = read("assets/js/marketplace.js");

  assert.match(marketplace, /requestedProjectId = params\.get\("project"\)/);
  assert.match(marketplace, /projectItems = requestedProjectEntries\.map/);
  assert.match(marketplace, /Layihə mövqeləri:/);
  assert.match(marketplace, /plannerParams\.get\("projectType"\)/);
  assert.match(marketplace, /plannerParams\.get\("area"\)/);
  assert.match(marketplace, /plannerParams\.get\("city"\)/);
});

test("layihə iş sahəsi Neon, təchizatçı, təqvim, sənəd və kommersiya axınını birləşdirir", () => {
  const api = read("api/_admin/projects.js");
  const migration = read("db/migrations/033_project_workspace.sql");
  const production = read("assets/js/production.js");
  const media = read("api/_admin/media.js");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS customer_project_items/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS customer_project_milestones/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS customer_project_supplier_matches/);
  assert.match(migration, /'project'/);
  assert.match(api, /matchSuppliers/);
  assert.match(api, /verified_reviews/);
  assert.match(api, /project_milestone_due/);
  assert.match(api, /EMAIL_WEBHOOK_URL/);
  assert.match(api, /WHATSAPP_WEBHOOK_URL/);
  assert.match(api, /commercial_proposals/);
  assert.match(production, /syncProjectWorkspace/);
  assert.match(production, /matchProjectSuppliers/);
  assert.match(production, /saveProjectMilestone/);
  assert.match(media, /entityType !== "project"/);
});

test("detal səhifələri əlaqəli seçimləri və layihəyə əlavə etməni göstərir", () => {
  const marketplace = read("assets/js/marketplace.js");

  assert.match(marketplace, /Oxşar xidmətlər/);
  assert.match(marketplace, /Oxşar hazır paketlər/);
  assert.match(marketplace, /Oxşar icarə avadanlıqları/);
  assert.match(marketplace, /projectActionButton\("product", item\.id\)/);
  assert.match(marketplace, /projectActionButton\("service", service\.id\)/);
  assert.match(marketplace, /projectActionButton\("package", pack\.id\)/);
  assert.match(marketplace, /projectActionButton\("rental", rental\.id\)/);
});
