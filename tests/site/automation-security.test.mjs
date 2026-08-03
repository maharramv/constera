import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");

test("təchizatçı feed-ləri təhlükəsiz SKU sinxronizasiyası ilə portala bağlanıb", () => {
  assert.match(read("supplier-portal.html"), /data-supplier-feed-panel/);
  assert.match(read("assets/js/supplier-automation.js"), /runSupplierFeed/);
  assert.match(read("api/_lib/supplier-feeds.js"), /SKU kataloqda tapılmadı/);
  assert.match(read("api/_lib/supplier-feeds.js"), /validatePublicUrl/);
  assert.match(read("vercel.json"), /\/api\/supplier-feeds/);
});

test("2FA, push bildirişi və yeni logistika zonaları production qatında mövcuddur", () => {
  const migration = read("db/migrations/022_automation_security_pwa.sql");
  const serviceWorker = read("service-worker.js");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS auth_challenges/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS web_push_subscriptions/);
  assert.match(migration, /Gəncə-Qazax iqtisadi rayonu/);
  assert.match(read("login.html"), /data-two-factor-form/);
  assert.match(read("customer-cabinet.html"), /data-push-toggle/);
  assert.match(serviceWorker, /addEventListener\("push"/);
  assert.match(serviceWorker, /addEventListener\("notificationclick"/);
});

test("kommersiya əməliyyat mərkəzi müqavilə, hesablaşma, logistika və təhlükəsizliyi birləşdirir", () => {
  const migration = read("db/migrations/023_commercial_security_operations.sql");
  const api = read("api/_admin/operations-center.js");
  const admin = read("admin.html");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS supplier_contracts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS supplier_settlements/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS delivery_tracking_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS security_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS backup_verifications/);
  assert.match(api, /generateSettlement/);
  assert.match(api, /verifyCloudBackup/);
  assert.match(admin, /data-admin-panel="operations"/);
  assert.match(read("vercel.json"), /\/api\/operations-center/);
});

test("feed rollback snapshot-u və media hüquq metadatası idarə olunur", () => {
  const feed = read("api/_lib/supplier-feeds.js");
  const media = read("api/_admin/media.js");
  const migration = read("db/migrations/023_commercial_security_operations.sql");
  assert.match(feed, /previewSupplierFeed/);
  assert.match(feed, /rollbackSupplierFeedRun/);
  assert.match(feed, /supplier_feed_changes/);
  assert.match(migration, /rollback_status/);
  assert.match(media, /checksum_sha256/);
  assert.match(media, /license_type/);
  assert.match(media, /markPrimary/);
  assert.match(media, /assertSupplierMediaScope/);
  assert.match(media, /media_scope_denied/);
});

test("production kataloqu sıxılmış və versiyalanmış data resursundan yüklənir", () => {
  const build = read("scripts/vercel-build.mjs");
  const loader = read("assets/js/catalog-loader.js");
  const marketplace = read("assets/js/marketplace.js");
  const serviceWorker = read("service-worker.js");
  assert.match(build, /gzipSync\(Buffer\.from\(JSON\.stringify\(marketplace\)\)/);
  assert.match(build, /dist\/assets\/data\/marketplace\.data/);
  assert.match(build, /catalog-loader\.js/);
  assert.match(loader, /DecompressionStream\("gzip"\)/);
  assert.match(loader, /ConstEraCatalogReady/);
  assert.match(marketplace, /await window\.ConstEraCatalogReady/);
  assert.match(serviceWorker, /assets\/data\/marketplace\.data/);
});

test("Vercel production monitorinqi və deploy keyfiyyət qapısını avtomatik işlədir", () => {
  const monitor = read("api/_admin/production-monitor.js");
  const sharedMonitor = read("api/_lib/production-monitor.js");
  const vercel = JSON.parse(read("vercel.json"));
  assert.match(monitor, /runProductionMonitor/);
  assert.match(monitor, /cron_unauthorized/);
  assert.match(sharedMonitor, /database === "ready"/);
  assert.match(sharedMonitor, /Promise\.all/);
  assert.equal(vercel.installCommand, "npm ci && npm run verify:deploy");
  assert.ok(vercel.crons.some((item) =>
    item.path === "/api/cron-production-monitor" && item.schedule === "17 4 * * *"
  ));
});

test("kritik kataloq, müqavilə, ödəniş və logistika yazmaları administrator 2FA qorumasındadır", () => {
  assert.match(read("api/_admin/catalog-quality.js"), /assertCriticalTwoFactor\(user\)/);
  assert.match(read("api/_admin/catalog-staging.js"), /assertCriticalTwoFactor\(user\)/);
  assert.match(read("api/_admin/operations-center.js"), /assertCriticalTwoFactor\(user\)/);
  assert.match(read("api/_admin/logistics.js"), /previousZone\?\.rateStatus === "verified"/);
  assert.match(read("api/_admin/logistics.js"), /req\.method === "DELETE"[\s\S]+assertCriticalTwoFactor\(user\)/);
  assert.match(read("api/_admin/integrations.js"), /create-shipment[\s\S]+assertCriticalTwoFactor\(user\)/);
  assert.match(read("api/_admin/support.js"), /approve-refund[\s\S]+assertCriticalTwoFactor\(user\)/);
});
