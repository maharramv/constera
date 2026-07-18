import test from "node:test";
import assert from "node:assert/strict";
import { hashOpaque, hashPassword, verifyPassword } from "../../api/_lib/auth.js";
import { ApiError, assertSameOrigin } from "../../api/_lib/http.js";
import { categoryPublicId, categoryStorageId, parsePriceAmount, safeMediaUrl, safeUrl, slugify, stableItemSlug } from "../../api/_lib/validation.js";

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
