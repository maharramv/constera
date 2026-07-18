import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
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
const packages = marketplace.packages.filter((item) => item.id.startsWith("az-market-"));
const rentals = marketplace.rentals.filter((item) => item.id.startsWith("az-rental-"));
const packageSource = JSON.parse(readFileSync("assets/data/azerbaycan-tikinti-temir-paketleri.json", "utf8"));
const rentalSource = JSON.parse(readFileSync("assets/data/azerbaycan-tikinti-texnikasi-icaresi.json", "utf8"));

test("mənbəli tikinti və təmir paketləri kataloqa tam qoşulur", () => {
  const sourceCount = packageSource.providers.reduce((sum, provider) => sum + provider.packages.length, 0);
  assert.equal(sourceCount, 9);
  assert.equal(packages.length, sourceCount);
  assert.equal(packages.filter((item) => item.providerVerified).length, 3);
  packages.forEach((item) => {
    assert.equal(item.priceConfirmationRequired, true, item.id);
    assert.ok(Number.isFinite(item.priceAmount) && item.priceAmount > 0, item.id);
    assert.match(item.sourceUrl, /^https:\/\//, item.id);
    assert.ok(item.providerName, item.id);
  });
});

test("mənbəli icarə texnikaları qiymət təsdiqi və şəkil krediti ilə saxlanır", () => {
  assert.equal(rentalSource.equipment.length, 8);
  assert.equal(rentals.length, rentalSource.equipment.length);
  assert.equal(rentals.filter((item) => item.priceAmount !== null).length, 5);
  assert.equal(rentals.filter((item) => item.imageUrl).length, 5);
  rentals.forEach((item) => {
    assert.equal(item.priceConfirmationRequired, true, item.id);
    assert.match(item.sourceUrl, /^https:\/\//, item.id);
  });
});

test("icarə şəkilləri build üçün lokal və etibarlı fayllardır", () => {
  const imagePaths = rentals.map((item) => item.imageUrl).filter(Boolean);
  imagePaths.forEach((path) => {
    assert.match(path, /^assets\/images\/equipment\//);
    assert.equal(existsSync(path), true, path);
    assert.ok(statSync(path).size > 10_000, path);
  });
});

test("paket və icarə səhifələri geniş filtr və sifariş sahələrini təqdim edir", () => {
  const packagePage = readFileSync("packages.html", "utf8");
  const rentalPage = readFileSync("rental.html", "utf8");
  const rfqPage = readFileSync("rfq.html", "utf8");
  ["data-package-level-filter", "data-package-provider-filter", "data-package-price-filter"]
    .forEach((attribute) => assert.match(packagePage, new RegExp(attribute)));
  ["data-rental-city-filter", "data-rental-period-filter", "data-rental-price-filter"]
    .forEach((attribute) => assert.match(rentalPage, new RegExp(attribute)));
  ["contactName", "phone", "address", "rentalDuration", "operatorPreference"]
    .forEach((name) => assert.match(rfqPage, new RegExp(`name="${name}"`)));
});
