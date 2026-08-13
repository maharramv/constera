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
  assert.match(page, /value="industrial">Anbar \/ istehsalat/);
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

test("obyekt üzrə QR qəbul və faktiki material sərfiyyatı layihə mərkəzinə bağlıdır", () => {
  const page = read("project-planner.html");
  const api = read("api/_admin/project-site-control.js");
  const production = read("assets/js/production.js");
  const client = read("assets/js/project-site-control.js");
  const migration = read("db/migrations/034_project_site_control.sql");
  const vercel = read("vercel.json");

  assert.match(page, /data-project-site-control/);
  assert.match(page, /data-project-receipt-form/);
  assert.match(page, /data-project-movement-form/);
  assert.match(page, /data-project-qr-file/);
  assert.match(page, /data-project-material-summary/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS project_material_receipts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS project_material_movements/);
  assert.match(api, /QRCode\.toString/);
  assert.match(api, /insufficient_project_material/);
  assert.match(api, /project_material_rejected/);
  assert.match(client, /BarcodeDetector/);
  assert.match(client, /createProjectReceipt/);
  assert.match(client, /createProjectMaterialMovement/);
  assert.match(production, /projectSiteControl/);
  assert.match(vercel, /project-site-control/);
});

test("rəqəmsal obyekt jurnalı davamiyyət, qüsur, akt və çertyoj reviziyasını birləşdirir", () => {
  const page = read("project-planner.html");
  const api = read("api/_admin/project-site-journal.js");
  const helper = read("api/_lib/project-site-journal.js");
  const production = read("assets/js/production.js");
  const client = read("assets/js/project-site-control.js");
  const migration = read("db/migrations/035_project_site_journal.sql");
  const vercel = read("vercel.json");

  assert.match(page, /data-project-site-journal/);
  assert.match(page, /data-daily-log-form/);
  assert.match(page, /data-quality-issue-form/);
  assert.match(page, /data-control-document-form/);
  assert.match(page, /data-journal-report/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS project_site_daily_logs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS project_quality_issues/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS project_control_documents/);
  assert.match(api, /project_critical_quality_issue/);
  assert.match(api, /sendWeeklyReport/);
  assert.match(api, /status = 'superseded'/);
  assert.match(helper, /workerShifts/);
  assert.match(client, /create-daily-log/);
  assert.match(client, /update-issue-status/);
  assert.match(production, /projectSiteJournal/);
  assert.match(vercel, /project-site-journal/);
});

test("satınalma nəzarəti sifariş, mal qəbulu, faktura və ödənişi birləşdirir", () => {
  const page = read("admin.html");
  const api = read("api/_admin/procurement-control.js");
  const helper = read("api/_lib/procurement-control.js");
  const production = read("assets/js/production.js");
  const client = read("assets/js/operations-center.js");
  const migration = read("db/migrations/036_procurement_three_way_control.sql");
  const vercel = read("vercel.json");

  assert.match(page, /data-procurement-control/);
  assert.match(page, /data-goods-receipt-form/);
  assert.match(page, /data-supplier-invoice-form/);
  assert.match(page, /data-invoice-ai/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS procurement_goods_receipts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS supplier_invoices/);
  assert.match(api, /approve-invoice/);
  assert.match(api, /pay-invoice/);
  assert.match(api, /extract-invoice/);
  assert.match(helper, /calculateThreeWayMatch/);
  assert.match(client, /create-receipt/);
  assert.match(client, /create-invoice/);
  assert.match(production, /procurementControl/);
  assert.match(vercel, /procurement-control/);
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
