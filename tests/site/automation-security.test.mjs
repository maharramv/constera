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
