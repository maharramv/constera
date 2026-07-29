import assert from "node:assert/strict";
import test from "node:test";
import { backupDeliveryReadiness } from "../../api/_lib/cloud-backup.js";
import { buildMerchantFeedXml } from "../../api/_lib/merchant-feed.js";
import { providerConfigurationStatus } from "../../api/_lib/provider-adapters.js";
import { contractActivationReadiness } from "../../api/_admin/operations-center.js";

test("Merchant XML xüsusi simvolları qoruyur və yalnız doğru identifikatoru yazır", () => {
  const xml = buildMerchantFeedXml([
    {
      id: "product-one",
      sku: "SKU&1",
      barcode: "8691234567890",
      name: "Boya & Astar <Premium>",
      brand: "Penguin",
      category_title: "Boya",
      subcategory: "Daxili boya",
      package_text: "15 L",
      origin: "Azərbaycan",
      specs: ["Mat", "Su əsaslı"],
      media_url: "https://cdn.example.test/product.webp?a=1&b=2",
      stock_quantity: 4,
      price_amount: 72.9,
      price_currency: "AZN"
    },
    {
      id: "product-two",
      sku: "SKU-2",
      barcode: "123",
      name: "Barkodsuz məhsul",
      brand: "Brendsiz",
      category_title: "Material",
      subcategory: "Ümumi",
      specs: [],
      media_url: "https://cdn.example.test/two.webp",
      stock_quantity: 0,
      price_amount: 10,
      price_currency: "AZN"
    }
  ]);

  assert.match(xml, /Boya &amp; Astar &lt;Premium&gt;/);
  assert.match(xml, /<g:gtin>8691234567890<\/g:gtin>/);
  assert.match(xml, /<g:identifier_exists>no<\/g:identifier_exists>/);
  assert.match(xml, /<g:availability>in_stock<\/g:availability>/);
  assert.match(xml, /<g:availability>out_of_stock<\/g:availability>/);
  assert.match(xml, /72\.90 AZN/);
  assert.doesNotMatch(xml, /<g:brand>Brendsiz<\/g:brand>/);
});

test("müqavilə sənədsiz və vaxtı bitmiş halda aktivləşməyə hazır sayılmır", () => {
  const missingDocument = contractActivationReadiness({
    startsOn: "2020-01-01",
    endsOn: "2999-12-31"
  });
  assert.equal(missingDocument.ready, false);
  assert.match(missingDocument.missing.join(" "), /İmzalanmış müqavilə sənədi/);

  const ready = contractActivationReadiness({
    documentUrl: "https://files.example.test/contract.pdf",
    startsOn: "2020-01-01",
    endsOn: "2999-12-31"
  });
  assert.equal(ready.ready, true);
});

test("backup ayrıca özəl Blob token-i ilə hazır olur və provider statusu sirr qaytarmır", () => {
  const keys = [
    "BACKUP_WEBHOOK_URL",
    "BACKUP_WEBHOOK_SECRET",
    "BACKUP_BLOB_READ_WRITE_TOKEN",
    "PAYMENT_WEBHOOK_URL",
    "PAYMENT_WEBHOOK_SECRET"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  try {
    assert.deepEqual(backupDeliveryReadiness(), {
      ready: false,
      channel: "none",
      label: "Qurulmayıb"
    });
    process.env.BACKUP_BLOB_READ_WRITE_TOKEN = "private-test-token";
    assert.equal(backupDeliveryReadiness().channel, "private_blob");

    process.env.PAYMENT_WEBHOOK_URL = "https://provider.example.test/payment";
    process.env.PAYMENT_WEBHOOK_SECRET = "do-not-expose";
    const payment = providerConfigurationStatus().find((item) => item.key === "payment");
    assert.equal(payment.ready, true);
    assert.equal(JSON.stringify(payment).includes("do-not-expose"), false);
    assert.equal(JSON.stringify(payment).includes("provider.example.test"), false);
  } finally {
    keys.forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
});
