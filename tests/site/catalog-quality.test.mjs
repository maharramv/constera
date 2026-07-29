import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("kataloq standart olaraq yüngül məhsul cavabı və açıq tam sinxronizasiya rejimi istifadə edir", () => {
  const catalogApi = readFileSync("api/catalog.js", "utf8");
  const production = readFileSync("assets/js/production.js", "utf8");

  assert.match(catalogApi, /req\.query\.scope \|\| "products"/);
  assert.match(catalogApi, /scope === "facets" \|\| scope === "full"/);
  assert.match(catalogApi, /scope === "full"/);
  assert.match(production, /scope:\s*"products"/);
  assert.match(production, /api\.catalog\(\{ limit: "1000", scope: "full" \}\)/);
});

test("kataloq Azərbaycan hərfləri, sinonimlər və əlçatan təkliflər ilə axtarılır", () => {
  const catalog = readFileSync("catalog.html", "utf8");
  const marketplace = readFileSync("assets/js/marketplace.js", "utf8");

  assert.match(catalog, /data-search-suggestions/);
  assert.match(catalog, /role="combobox"/);
  assert.match(catalog, /aria-autocomplete="list"/);
  assert.match(marketplace, /normalizeSearchText/);
  assert.match(marketplace, /groups\.every/);
  assert.match(marketplace, /data-search-suggestion/);
  assert.match(marketplace, /краска/);
});

test("admin panel məhsul məlumatı keyfiyyətini API-dən göstərir", () => {
  const admin = readFileSync("admin.html", "utf8");
  const adminJs = readFileSync("assets/js/admin-v2.js", "utf8");
  const analytics = readFileSync("api/_admin/analytics.js", "utf8");

  for (const selector of [
    "data-admin-v2-quality-score",
    "data-admin-v2-quality-summary",
    "data-admin-v2-quality-bars",
    "data-admin-v2-quality-items"
  ]) {
    assert.match(admin, new RegExp(selector));
    assert.match(adminJs, new RegExp(selector));
  }
  assert.match(analytics, /missing_image/);
  assert.match(analytics, /duplicate_names/);
  assert.match(analytics, /qualityScore/);
  assert.doesNotMatch(adminJs, /style="--admin-progress/);
});

test("Neon üçün qatlanmış trigram axtarış indeksi mövcuddur", () => {
  const migration = readFileSync("db/migrations/010_catalog_search_quality.sql", "utf8");
  const audit = readFileSync("scripts/audit-database.mjs", "utf8");

  assert.match(migration, /products_search_folded_trgm_idx/);
  assert.match(migration, /translate\(/);
  assert.match(migration, /gin_trgm_ops/);
  assert.match(audit, /folded_search_ready/);
});
