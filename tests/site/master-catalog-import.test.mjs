import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const context = { window: {}, console, Intl, Date, URL };
vm.createContext(context);
[
  "assets/js/catalog-data.js",
  "assets/js/taxonomy-expansion.js",
  "assets/js/azerbaijan-real-products.js"
].forEach((file) => vm.runInContext(readFileSync(file, "utf8"), context, { filename: file }));

const marketplace = context.window.CONSTERA_MARKETPLACE;
const importMeta = marketplace.masterCatalogImport;
const source = JSON.parse(readFileSync("data/imports/constera-master-catalog-v1-v3.json", "utf8"));

const collectionByKind = {
  product: "products",
  service: "services",
  rental: "rentals",
  package: "packages"
};

test("v1, v2 və v3 kumulyativ mənbə arxivi tam saxlanır", () => {
  assert.deepEqual([...importMeta.sourceVersions], ["v1", "v2", "v3"]);
  ["categories", "products", "services", "rentals", "packages"].forEach((collection) => {
    assert.equal(source[collection].length, importMeta.sourceRecordCounts[collection], collection);
  });
});

test("bütün mənbə qeydləri publik, birləşdirilmiş və ya karantin qərarı daşıyır", () => {
  const merged = new Map(importMeta.mergedRecords.map((item) => [`${item.kind}:${item.sourceId}`, item.targetId]));
  const quarantined = new Set(importMeta.quarantinedRecords.map((item) => `${item.kind}:${item.id}`));

  Object.entries(collectionByKind).forEach(([kind, collection]) => {
    const publicIds = new Set(importMeta.publicRecordIds[collection]);
    const marketplaceIds = new Set(marketplace[collection].map((item) => item.id));

    source[collection].forEach((item) => {
      const key = `${kind}:${item.id}`;
      const decisions = [
        publicIds.has(item.id),
        merged.has(key),
        quarantined.has(key)
      ].filter(Boolean);
      assert.equal(decisions.length, 1, `${key} üçün tək import qərarı olmalıdır`);

      if (publicIds.has(item.id)) assert.ok(marketplaceIds.has(item.id), `${key} publik kataloqda yoxdur`);
      if (merged.has(key)) assert.ok(marketplaceIds.has(merged.get(key)), `${key} birləşmə hədəfi yoxdur`);
      if (quarantined.has(key)) assert.ok(!marketplaceIds.has(item.id), `${key} publik kataloqa çıxmamalıdır`);
    });
  });
});

test("master məhsullar real mənbə, qiymət vəziyyəti və mümkün olduqda rəsmi media daşıyır", () => {
  const ids = new Set(importMeta.publicRecordIds.products);
  const products = marketplace.products.filter((item) => ids.has(item.id));

  assert.equal(products.length, 21);
  assert.equal(products.filter((item) => item.imageUrl).length, 19);
  assert.equal(products.filter((item) => item.priceStatus === "confirmed").length, 20);
  products.forEach((item) => {
    assert.match(item.sourceUrl, /^https:\/\//, item.id);
    assert.ok(item.sourceLabel, item.id);
    assert.ok(item.sku, item.id);
  });
});

test("master xidmət, paket və icarə qeydlərində şərti qiymət açıq göstərilir", () => {
  ["services", "packages", "rentals"].forEach((collection) => {
    const ids = new Set(importMeta.publicRecordIds[collection]);
    marketplace[collection]
      .filter((item) => ids.has(item.id))
      .forEach((item) => {
        assert.equal(item.priceConfirmationRequired, true, item.id);
        assert.match(item.sourceUrl, /^https:\/\//, item.id);
      });
  });
});
