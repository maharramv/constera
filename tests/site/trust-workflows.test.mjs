import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (file) => readFileSync(file, "utf8");

test("təsdiqlənmiş rəylər məhsul, xidmət, paket və icarə detallarına qoşulub", () => {
  for (const [file, type] of [
    ["product-detail.html", "product"],
    ["service-detail.html", "service"],
    ["package-detail.html", "package"],
    ["rental-detail.html", "rental"]
  ]) {
    const page = read(file);
    assert.match(page, /data-review-center/);
    assert.match(page, new RegExp(`data-review-target-type="${type}"`));
    assert.match(page, /assets\/js\/enterprise\.js/);
  }
  const reviews = read("api/_admin/reviews.js");
  assert.match(reviews, /verified_source_required/);
  assert.match(reviews, /orders\.status = 'completed'/);
  assert.match(reviews, /booking\.status = 'completed'/);
});

test("qaytarma, geri ödəniş və daxili qeydlərin qorunması tam axına daxildir", () => {
  const order = read("order-detail.html");
  const client = read("assets/js/enterprise.js");
  const adminClient = read("assets/js/enterprise-admin.js");
  const support = read("api/_admin/support.js");
  const smoke = read("scripts/smoke-trust.mjs");
  const migration = read("db/migrations/021_trust_analytics_quality.sql");

  assert.match(order, /data-order-support/);
  assert.match(client, /data-support-create/);
  assert.match(adminClient, /approve-refund/);
  assert.match(support, /refundPayment/);
  assert.match(support, /messages\.filter\(\(message\) => !message\.internalNote\)/);
  assert.match(smoke, /approved\.payload\?\.error\?\.code === "critical_two_factor_required"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS refund_transactions/);
});

test("AI smeta sənəd idxalı, səbət çevirməsi və satış hadisələri işlək interfeysə bağlanıb", () => {
  const page = read("ai-smeta.html");
  const marketplace = read("assets/js/marketplace.js");
  const integrations = read("api/_admin/integrations.js");
  const events = read("api/_admin/events.js");

  assert.match(page, /data-ai-smeta-file/);
  assert.match(page, /data-ai-smeta-import/);
  assert.match(marketplace, /importEstimateDocument/);
  assert.match(marketplace, /data-ai-smeta-cart/);
  assert.match(marketplace, /checkout_start/);
  assert.match(integrations, /estimate-document/);
  assert.match(events, /analytics_events/);
});

test("AI Mərhələ 1 limit, strukturlaşdırılmış cavab, audit və insan təsdiqini birləşdirir", () => {
  const admin = read("admin.html");
  const adminClient = read("assets/js/ai-admin.js");
  const marketplace = read("assets/js/marketplace.js");
  const production = read("assets/js/production.js");
  const aiApi = read("api/_admin/ai.js");
  const foundation = read("api/_lib/ai-foundation.js");
  const openai = read("api/_lib/openai.js");
  const migration = read("db/migrations/028_ai_foundation.sql");
  const vercel = JSON.parse(read("vercel.json"));

  assert.match(admin, /data-ai-foundation-panel/);
  assert.match(adminClient, /aiDashboard\("all"\)/);
  assert.match(marketplace, /data-ai-smeta-review/);
  assert.match(marketplace, /aiApprovalStatus/);
  assert.match(production, /request\("\/api\/ai"/);
  assert.match(aiApi, /generateAiEstimate/);
  assert.match(foundation, /AI_MONTHLY_TOKEN_BUDGET/);
  assert.match(foundation, /approval_status/);
  assert.match(openai, /store: false/);
  assert.match(openai, /type: "json_schema"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_runs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_usage_counters/);
  assert.equal(
    vercel.rewrites.some((route) => route.source === "/api/ai" && route.destination === "/api/admin?__route=ai"),
    true
  );
});

test("admin etibar mərkəzi keyfiyyət robotu və təchizatçı scorecard-ını birləşdirir", () => {
  const admin = read("admin.html");
  const client = read("assets/js/enterprise-admin.js");
  const quality = read("api/_lib/catalog-quality.js");
  const performance = read("api/_lib/supplier-performance.js");
  const vercel = read("vercel.json");

  assert.match(admin, /data-admin-tab="trust"/);
  assert.match(admin, /data-admin-trust-center/);
  assert.match(client, /scanCatalogQuality/);
  assert.match(client, /supplierPerformance/);
  assert.match(quality, /Promise\.all\(candidates\.map/);
  assert.match(performance, /dataQuality \* 0\.3/);
  assert.match(vercel, /\/api\/catalog-quality/);
  assert.match(vercel, /\/api\/supplier-performance/);
});

test("buraxılış növbəsi axtarış boşluğunu, atributları, backup-ı və SEO məhsul siyahısını birləşdirir", () => {
  const admin = read("admin.html");
  const launch = read("assets/js/launch-center.js");
  const marketplace = read("assets/js/marketplace.js");
  const launchApi = read("api/_admin/launch-center.js");

  assert.match(admin, /data-launch-queue/);
  assert.match(admin, /data-launch-zero-searches/);
  assert.match(admin, /data-launch-supplier-steps/);
  assert.match(admin, /data-launch-export-report/);
  assert.match(admin, /data-launch-export-media/);
  assert.match(launch, /releaseQueue/);
  assert.match(launch, /pilotSelections/);
  assert.match(launch, /constera-supplier-launch-report/);
  assert.match(launchApi, /backup_verifications/);
  assert.match(launchApi, /pilotSelections/);
  assert.match(launchApi, /resultCount/);
  assert.match(marketplace, /constera-catalog-item-list-schema/);
  assert.match(marketplace, /"@type": "ItemList"/);
  assert.match(marketplace, /additionalProperty/);
});
