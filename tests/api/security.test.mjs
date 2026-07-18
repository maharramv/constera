import test from "node:test";
import assert from "node:assert/strict";
import { hashOpaque, hashPassword, verifyPassword } from "../../api/_lib/auth.js";
import { ApiError, assertSameOrigin } from "../../api/_lib/http.js";
import { matrixToObjects, parseCsv, readAliased } from "../../api/_lib/imports.js";
import { categoryPublicId, categoryStorageId, parsePriceAmount, safeMediaUrl, safeUrl, slugify, stableItemSlug } from "../../api/_lib/validation.js";
import { hasExpectedSignature } from "../../api/_admin/media.js";
import { parseOrderQuantity } from "../../api/_admin/orders.js";

test("şifrə scrypt ilə heşlənir və yoxlanır", async () => {
  const hash = await hashPassword("CoxGucluSifre-2026!");
  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword("CoxGucluSifre-2026!", hash), true);
  assert.equal(await verifyPassword("yanlis-sifre", hash), false);
});

test("qısa şifrə qəbul edilmir", async () => {
  await assert.rejects(() => hashPassword("qisa"), (error) => error instanceof ApiError && error.code === "weak_password");
});

test("origin yoxlaması fərqli domeni rədd edir", () => {
  assert.doesNotThrow(() => assertSameOrigin({ headers: { origin: "https://constera.az", host: "constera.az" } }));
  assert.throws(
    () => assertSameOrigin({ headers: { origin: "https://example.com", host: "constera.az" } }),
    (error) => error instanceof ApiError && error.code === "origin_rejected"
  );
});

test("URL və media yoxlaması yalnız təhlükəsiz ünvanları saxlayır", () => {
  assert.equal(safeUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeMediaUrl("assets/images/hero.webp"), "assets/images/hero.webp");
  assert.throws(() => safeUrl("http://example.com"), ApiError);
  assert.throws(() => safeMediaUrl("javascript:alert(1)"), ApiError);
});

test("qiymət, slug və opaque heş deterministikdir", () => {
  assert.equal(parsePriceAmount("74,40 AZN"), 74.4);
  assert.equal(parsePriceAmount("Sorğu əsasında"), null);
  assert.equal(slugify("Boya və örtüklər"), "boya-ve-ortukler");
  assert.equal(hashOpaque("test"), hashOpaque("test"));
});

test("eyni açıq kateqoriya ID-si növlər üzrə bazada toqquşmur", () => {
  assert.equal(categoryStorageId("material", "concrete-equipment"), "material:concrete-equipment");
  assert.equal(categoryStorageId("rental", "concrete-equipment"), "rental:concrete-equipment");
  assert.equal(categoryPublicId("rental:concrete-equipment"), "concrete-equipment");
});

test("eyni adlı bazar kartları fərqli sabit slug alır", () => {
  const first = stableItemSlug("Sənaye döşəməsi xidməti", "service-floor-a");
  const second = stableItemSlug("Sənaye döşəməsi xidməti", "service-floor-b");
  assert.notEqual(first, second);
  assert.equal(first, "senaye-dosemesi-xidmeti-service-floor-a");
});

test("CSV parser dırnaqlı sahələri və Azərbaycan başlıqlarını düzgün oxuyur", () => {
  const matrix = parseCsv('sku,ad,qiymət,xüsusiyyətlər\nP-1,"Boya, ağ",74.40,"15 L; daxili"');
  const rows = matrixToObjects(matrix);
  assert.equal(rows.length, 1);
  assert.equal(readAliased(rows[0], "sku"), "P-1");
  assert.equal(readAliased(rows[0], "name"), "Boya, ağ");
  assert.equal(readAliased(rows[0], "price"), "74.40");
});

test("xidmət idxalı kod sütununu sabit identifikator kimi tanıyır", () => {
  const rows = matrixToObjects(parseCsv("kod,ad,kateqoriya,subkateqoriya\nXID-0001,Təmir,Təmir işləri,Mənzil təmiri"));
  assert.equal(readAliased(rows[0], "id"), "XID-0001");
  assert.equal(readAliased(rows[0], "title"), "Təmir");
});

test("media yoxlaması fayl imzası ilə saxta MIME dəyərini ayırır", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(hasExpectedSignature(png, "image/png"), true);
  assert.equal(hasExpectedSignature(Buffer.from("%PDF-1.7"), "application/pdf"), true);
  assert.equal(hasExpectedSignature(Buffer.from("not an image"), "image/png"), false);
});

test("sifariş miqdarı üç onluq dəqiqliyə normallaşdırılır", () => {
  assert.equal(parseOrderQuantity("2,3456"), 2.346);
  assert.equal(parseOrderQuantity(1), 1);
  assert.throws(() => parseOrderQuantity(0), ApiError);
  assert.throws(() => parseOrderQuantity(1_000_001), ApiError);
});
