import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("kataloq standart olaraq yüngül məhsul cavabı və açıq tam sinxronizasiya rejimi istifadə edir", () => {
  const catalogApi = readFileSync("api/catalog.js", "utf8");
  const productsApi = readFileSync("api/products.js", "utf8");
  const production = readFileSync("assets/js/production.js", "utf8");

  assert.match(catalogApi, /req\.query\.scope \|\| "products"/);
  assert.match(catalogApi, /scope === "facets" \|\| scope === "full"/);
  assert.match(catalogApi, /scope === "full"/);
  assert.match(catalogApi, /scope === "summary"/);
  assert.match(catalogApi, /commerceReadyProducts/);
  assert.match(catalogApi, /requestGroupExpression/);
  assert.match(catalogApi, /requestGroupExpression\} ASC/);
  assert.match(catalogApi, /normalizeProductAttributes\(\{\s*name: row\.name/);
  assert.match(productsApi, /normalizeProductAttributes\(\{\s*name: row\.name/);
  assert.match(production, /scope:\s*"products"/);
  assert.match(production, /catalogSummary:\s*\(\) => request\("\/api\/catalog\?scope=summary"\)/);
  assert.match(production, /api\.catalog\(\{ limit: "1000", scope: "full" \}\)/);
});

test("ictimai kataloq satış hazırlığını, stoku və təslimatı açıq göstərir", () => {
  const catalog = readFileSync("catalog.html", "utf8");
  const marketplace = readFileSync("assets/js/marketplace.js", "utf8");

  assert.match(catalog, /value="commercial-ready">Satışa tam hazır/);
  assert.match(marketplace, /product-commerce-status/);
  assert.match(marketplace, /Təchizatçı təsdiqi tələb olunur/);
  assert.match(marketplace, /vahid stokda/);
  assert.match(marketplace, /günə təslimat/);
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

test("production kataloqu hazır olmadan idarəetmələri açmır və rəsmi mənbələri önə çəkir", () => {
  const catalog = readFileSync("catalog.html", "utf8");
  const marketplace = readFileSync("assets/js/marketplace.js", "utf8");

  assert.match(catalog, /data-search[^>]*disabled/);
  assert.match(catalog, /data-catalog-filter-toggle[^>]*disabled/);
  assert.match(catalog, /data-catalog-category-toggle[^>]*disabled/);
  assert.match(marketplace, /fallbackSourceQualityScore/);
  assert.match(marketplace, /kind === "package" && item\?\.providerVerified\) score \+= 160/);
  assert.match(marketplace, /control\.disabled = false/);
});

test("kataloq və satış qrafiki CSP-yə uyğun siniflərdən istifadə edir", () => {
  const marketplace = readFileSync("assets/js/marketplace.js", "utf8");
  const launchCenter = readFileSync("assets/js/launch-center.js", "utf8");
  const buildAudit = readFileSync("scripts/audit-build.mjs", "utf8");

  assert.match(marketplace, /<progress/);
  assert.match(launchCenter, /launch-sales-bar-/);
  assert.doesNotMatch(marketplace, /<[^>]*\sstyle\s*=/i);
  assert.doesNotMatch(launchCenter, /<[^>]*\sstyle\s*=/i);
  assert.match(buildAudit, /CSP-ni pozan dinamik inline stil tapıldı/);
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

test("statik build JS və CSS fayllarını məzmun hash-i ilə versiyalayır", () => {
  const build = readFileSync("scripts/vercel-build.mjs", "utf8");
  const buildAudit = readFileSync("scripts/audit-build.mjs", "utf8");
  const serviceWorker = readFileSync("service-worker.js", "utf8");

  assert.match(build, /createHash\("sha256"\)/);
  assert.match(build, /readdirSync\("dist\/assets\/css"\)/);
  assert.match(build, /\?v=\$\{revision\}/);
  assert.match(build, /constera-shell-\$\{revision\}/);
  assert.match(buildAudit, /asset versiyası yoxdur/);
  assert.match(serviceWorker, /constera-shell-v\d+/);
});
