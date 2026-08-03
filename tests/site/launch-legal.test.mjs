import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");

test("məxfilik, şərtlər, çatdırılma və əlaqə səhifələri Azərbaycan dilində yayımlanır", () => {
  for (const file of ["privacy.html", "terms.html", "delivery-returns.html", "contact.html"]) {
    const html = read(file);
    assert.match(html, /<html lang="az">/);
    assert.match(html, /<h1>/);
    assert.match(html, /https:\/\/constera\.az\//);
  }
  assert.match(read("privacy.html"), /data-consent-choice="essential"/);
  assert.match(read("privacy.html"), /Fərdi məlumatlar haqqında/);
  assert.match(read("terms.html"), /sifariş sorğusu/i);
  assert.match(read("delivery-returns.html"), /Qaytarma və dəyişdirmə/);
});

test("məxfilik seçimi mobil məzmunu örtməyən axın panelində göstərilir", () => {
  const script = read("assets/js/script.js");
  assert.match(script, /notice\.className = "pwa-controls privacy-consent glass"/);
  assert.match(script, /main\.prepend\(notice\)/);
  assert.match(script, /position: "relative"/);
});

test("bütün açıq kommersiya formaları versiyalanan hüquqi razılıq göndərir", () => {
  for (const file of ["checkout.html", "rfq.html", "suppliers.html", "index.html", "contact.html"]) {
    const html = read(file);
    assert.match(html, /name="legalAccepted"[^>]*required/, `${file}: hüquqi razılıq`);
    assert.match(html, /href="terms\.html"/, `${file}: şərtlər linki`);
    assert.match(html, /href="privacy\.html"/, `${file}: məxfilik linki`);
  }
  const marketplace = read("assets/js/marketplace.js");
  assert.match(marketplace, /data-rental-booking-form[\s\S]*name="legalAccepted"/);
  assert.match(marketplace, /payload\.sourcePath/);
  assert.match(marketplace, /legalAccepted:\s*data\.get\("legalAccepted"\) === "true"/);
});

test("əlaqə forması CRM route-u və siyasət sübutu ilə serverə bağlıdır", () => {
  assert.match(read("api/admin.js"), /contact:\s*\(\) => import\("\.\/_admin\/contact\.js"\)/);
  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(vercel.rewrites.some((route) =>
    route.source === "/api/contact" && route.destination === "/api/admin?__route=contact"));
  assert.match(read("assets/js/production.js"), /contact:\s*\(data\) => request\("\/api\/contact"/);
  assert.match(read("api/_admin/contact.js"), /recordPolicyConsent/);
  assert.match(read("db/migrations/024_launch_legal_consent.sql"), /CREATE TABLE IF NOT EXISTS policy_consents/);
});

test("analitika razılıqdan əvvəl identifikator və hadisə yaratmır", () => {
  const script = read("assets/js/script.js");
  const analyticsStart = script.indexOf("const initAnalytics");
  const analyticsBody = script.slice(analyticsStart, script.indexOf("initAccessibility();", analyticsStart));
  assert.match(script, /const privacyChoiceKey = "constera-privacy-choice-v1"/);
  assert.match(analyticsBody, /applyChoice\(readPrivacyChoice\(\)\)/);
  assert.match(analyticsBody, /if \(choice === "analytics"\) enable\(\)/);
  assert.match(analyticsBody, /localStorage\.removeItem\("constera-visitor-id"\)/);
  assert.ok(script.indexOf("initPrivacyConsent();") < script.indexOf("initAnalytics();"));
});

test("kommersiya yoxlamasından keçməyən təklif rezerv, PO və Offer sxemi yaratmır", () => {
  const offers = read("api/_lib/product-offers.js");
  const orders = read("api/_admin/orders.js");
  const operations = read("api/_lib/order-operations.js");
  const purchaseOrders = read("api/_lib/purchase-orders.js");
  const marketplace = read("assets/js/marketplace.js");
  const catalog = read("api/catalog.js");

  assert.match(offers, /hasActiveContract/);
  assert.match(offers, /hasLicensedMedia/);
  assert.match(offers, /commercialReady:\s*commercialIssues\.length === 0/);
  assert.match(orders, /selectedOffer\?\.commercialReady === true/);
  assert.match(orders, /commercialReady,/);
  assert.match(operations, /snapshot->>'commercialReady'/);
  assert.match(purchaseOrders, /snapshot->>'commercialReady'/);
  assert.match(marketplace, /item\.commerceReady !== true[\s\S]*"@type": "Offer"/);
  assert.match(catalog, /license_type IN \('own', 'supplier', 'official', 'licensed'\)/);
  assert.match(catalog, /rights_status = 'verified'/);
  assert.match(catalog, /contract\.legal_confirmed = true/);
});
