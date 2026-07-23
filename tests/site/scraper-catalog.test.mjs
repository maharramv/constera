import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeScraperCatalog,
  scraperItemId,
  scraperRunId
} from "../../scripts/lib/scraper-catalog.mjs";

const validProduct = {
  id: "omid-demo",
  kind: "product",
  name: "Sınaq məhsulu",
  source_id: "omid",
  source_label: "OMID",
  source_url: "https://omid.az/products/sinaq",
  brand: "Demo",
  sku: "DEMO-1",
  price: 12.5,
  currency: "AZN",
  price_status: "confirmed",
  verified_at: "2026-07-23T08:00:00Z",
  image_urls: ["https://omid.az/cdn/shop/files/demo.webp"]
};

test("scraper staging yalnız 4.0 sxemini qəbul edir", () => {
  assert.throws(
    () => normalizeScraperCatalog({ schema_version: "2.0", items: [] }),
    /schema_version 4\.0/
  );
});

test("etibarlı mənbəli qiymət staging üçün saxlanılır", () => {
  const result = normalizeScraperCatalog({ schema_version: "4.0", items: [validProduct] });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].item.price, 12.5);
  assert.equal(result.records[0].item.price_status, "confirmed");
  assert.equal(result.records[0].item.status, "pending");
});

test("mənbə domeni uyğun gəlməyən qeyd rədd edilir", () => {
  const result = normalizeScraperCatalog({
    schema_version: "4.0",
    items: [{ ...validProduct, source_url: "https://example.com/fake" }]
  });
  assert.equal(result.records.length, 0);
  assert.equal(result.rejected.length, 1);
});

test("kənar domenli şəkil staging-dən çıxarılır", () => {
  const normalized = normalizeScraperCatalog({
    schema_version: "4.0",
    items: [{
      ...validProduct,
      image_urls: [
        "https://omid.az/cdn/shop/files/real.webp",
        "https://example.com/tracker.gif"
      ]
    }]
  });
  assert.deepEqual(normalized.records[0].item.image_urls, [
    "https://omid.az/cdn/shop/files/real.webp"
  ]);
});

test("yoxlama vaxtı olmayan qiymət request vəziyyətinə endirilir", () => {
  const result = normalizeScraperCatalog({
    schema_version: "4.0",
    items: [{ ...validProduct, verified_at: null }]
  });
  assert.equal(result.records[0].item.price, null);
  assert.equal(result.records[0].item.price_status, "request");
  assert.match(result.records[0].validationErrors.join(" "), /yoxlama vaxtı/);
});

test("təkrar SKU-lardan daha keyfiyyətli qeyd saxlanılır", () => {
  const result = normalizeScraperCatalog({
    schema_version: "4.0",
    items: [
      { ...validProduct, id: "first", source_url: "https://omid.az/products/first", image_urls: [] },
      { ...validProduct, id: "second", source_url: "https://omid.az/products/second" }
    ]
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].item.id, "second");
  assert.equal(result.duplicates.length, 1);
});

test("run və item identifikatorları deterministikdir", () => {
  const runId = scraperRunId("a".repeat(64));
  const record = normalizeScraperCatalog({ schema_version: "4.0", items: [validProduct] }).records[0];
  assert.equal(runId, scraperRunId("a".repeat(64)));
  assert.equal(scraperItemId(runId, record), scraperItemId(runId, record));
});
