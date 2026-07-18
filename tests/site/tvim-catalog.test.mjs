import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const context = { window: {}, console };
vm.createContext(context);
[
  "assets/js/catalog-data.js",
  "assets/js/taxonomy-expansion.js",
  "assets/js/azerbaijan-real-products.js"
].forEach((file) => vm.runInContext(readFileSync(file, "utf8"), context, { filename: file }));

const marketplace = context.window.CONSTERA_MARKETPLACE;
const products = marketplace.products.filter((product) => product.id.startsWith("tvim-20260718-"));

test("TVIM cədvəli 40 Azərbaycan dilli məhsula çevrilir", () => {
  assert.equal(products.length, 40);
  assert.equal(products.filter((product) => product.imageUrl).length, 37);
  assert.equal(products.some((product) => /[А-Яа-яЁё]/.test(product.name)), false);
  assert.equal(new Set(products.map((product) => product.sku)).size, products.length);
});

test("TVIM qiymət və mənbə metadatası tamdır", () => {
  products.forEach((product) => {
    assert.equal(product.priceStatus, "confirmed", product.sku);
    assert.equal(product.priceVerifiedAt, "2026-07-18T00:00:00.000Z", product.sku);
    assert.ok(Number.isFinite(product.priceAmount) && product.priceAmount > 0, product.sku);
    assert.match(product.price, / AZN$/, product.sku);
    assert.match(product.sourceUrl, /^https:\/\/tvim\.az\//, product.sku);
    assert.doesNotMatch(product.imageUrl, /placeholder/i, product.sku);
  });
});

test("TVIM məhsulları mövcud kateqoriya ağacına bağlıdır", () => {
  const categories = new Map(marketplace.categories.map((category) => [category.id, category]));
  products.forEach((product) => {
    const category = categories.get(product.category);
    assert.ok(category, `${product.sku}: kateqoriya tapılmadı`);
    assert.ok(category.subcategories.includes(product.subcategory), `${product.sku}: subkateqoriya tapılmadı`);
  });
});
