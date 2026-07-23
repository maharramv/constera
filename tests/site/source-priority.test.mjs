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
const ranking = context.window.CONSTERA_MARKETPLACE_RANKING;

test("mənbəli məlumat prioriteti bütün kataloq tiplərində sabitdir", () => {
  assert.equal(typeof ranking?.getSourceQualityScore, "function");
  [
    ["products", "product"],
    ["services", "service"],
    ["packages", "package"],
    ["rentals", "rental"]
  ].forEach(([collection, kind]) => {
    const items = marketplace[collection];
    assert.ok(items.length > 0, collection);
    items.forEach((item, index) => {
      if (!index) return;
      assert.ok(
        ranking.getSourceQualityScore(items[index - 1], kind) >= ranking.getSourceQualityScore(item, kind),
        `${collection}: ${item.id}`
      );
    });
  });
});

test("ilk nəticələr real mənbə və media keyfiyyətini daşıyır", () => {
  assert.match(marketplace.products[0].sourceUrl, /^https:\/\//);
  assert.ok(marketplace.products[0].imageUrl);
  assert.equal(marketplace.products[0].priceStatus, "confirmed");

  marketplace.packages.slice(0, 3).forEach((item) => {
    assert.equal(item.providerVerified, true, item.id);
    assert.match(item.sourceUrl, /^https:\/\//, item.id);
  });
  marketplace.rentals.slice(0, 5).forEach((item) => {
    assert.match(item.sourceUrl, /^https:\/\//, item.id);
    assert.ok(item.imageUrl, item.id);
  });
});

test("kataloq və ana səhifə mənbəli məlumat görünüşünü təqdim edir", () => {
  const catalog = readFileSync("catalog.html", "utf8");
  const services = readFileSync("services.html", "utf8");
  const packages = readFileSync("packages.html", "utf8");
  const rentals = readFileSync("rental.html", "utf8");
  const home = readFileSync("index.html", "utf8");
  const catalogApi = readFileSync("api/catalog.js", "utf8");

  ["data-source-filter", "data-catalog-sort"].forEach((attribute) => assert.match(catalog, new RegExp(attribute)));
  assert.match(services, /data-service-source-filter/);
  assert.match(packages, /data-package-source-filter/);
  assert.match(rentals, /data-rental-source-filter/);
  ["data-home-sourced-products", "data-home-sourced-packages", "data-home-sourced-rentals"]
    .forEach((attribute) => assert.match(home, new RegExp(attribute)));
  assert.match(catalogApi, /sourceStatus/);
  assert.match(catalogApi, /qualityExpression/);
});
