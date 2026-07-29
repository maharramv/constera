import assert from "node:assert/strict";
import test from "node:test";
import { parseSupplierFeedRows } from "../../api/_lib/supplier-feeds.js";

test("təchizatçı CSV feed-i Azərbaycan başlıqlarını normallaşdırır", () => {
  const rows = parseSupplierFeedRows(
    "təchizatçı sku,qiymət,stok,minimum sifariş\nABC-1,12.40,18,2",
    "csv"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["təchizatçısku"], "ABC-1");
  assert.equal(rows[0]["qiymət"], "12.40");
  assert.equal(rows[0].stok, "18");
});

test("təchizatçı JSON feed-i items, products və data kolleksiyalarını qəbul edir", () => {
  const rows = parseSupplierFeedRows(JSON.stringify({
    items: [{ SKU: "ABC-2", price: 7.5 }]
  }), "json");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, "ABC-2");
  assert.equal(rows[0].price, 7.5);
});
