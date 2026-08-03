import { expect, test } from "@playwright/test";
import { navigationItems } from "../../scripts/site-shell.mjs";

const pages = [
  "index.html",
  "catalog.html",
  "category.html",
  "subcategory.html",
  "product-detail.html",
  "services.html",
  "service-detail.html",
  "packages.html",
  "package-detail.html",
  "rental.html",
  "rental-detail.html",
  "brands.html",
  "suppliers.html",
  "supplier-portal.html",
  "price-import.html",
  "customer-cabinet.html",
  "checkout.html",
  "order-detail.html",
  "proposal-detail.html",
  "rfq.html",
  "rfq-dashboard.html",
  "tender.html",
  "ai-smeta.html",
  "admin.html",
  "login.html",
  "offline.html"
];

const primaryViewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "menu-mobile", width: 1100, height: 800 },
  { name: "menu-desktop", width: 1101, height: 800 },
  { name: "desktop", width: 1280, height: 800 }
];

const rounded = (value) => Math.round(value * 10) / 10;

for (const viewport of primaryViewports) {
  test(`ümumi header bütün səhifələrdə sabitdir: ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));

    let reference = null;
    for (const file of pages) {
      await page.goto(`/${file}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-site-header]")).toBeVisible();

      const metrics = await page.evaluate(() => {
        const header = document.querySelector("[data-site-header]");
        const rect = header?.getBoundingClientRect();
        return {
          top: rect?.top ?? 0,
          left: rect?.left ?? 0,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
          headerCount: document.querySelectorAll("[data-site-header]").length,
          mainCount: document.querySelectorAll("#main-content").length
        };
      });

      const current = {
        top: rounded(metrics.top),
        left: rounded(metrics.left),
        width: rounded(metrics.width),
        height: rounded(metrics.height)
      };
      reference ||= current;
      expect(current, `${file}: header geometry`).toEqual(reference);
      expect(metrics.overflow, `${file}: horizontal overflow`).toBeLessThanOrEqual(0);
      expect(metrics.headerCount, `${file}: header count`).toBe(1);
      expect(metrics.mainCount, `${file}: main-content count`).toBe(1);

      if (!["admin.html", "login.html"].includes(file)) {
        await expect(page.locator("[data-site-footer]")).toHaveCount(1);
      }
    }

    expect(browserErrors, `browser errors at ${viewport.name}`).toEqual([]);
  });
}

test("tam naviqasiya desktop və mobile rejimlərində açılır", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/catalog.html", { waitUntil: "domcontentloaded" });
    const toggle = page.getByRole("button", { name: "Naviqasiya menyusunu aç", exact: true });
    await expect(toggle).toHaveCount(1);
    await toggle.click();
    await expect(page.locator("#site-nav")).toHaveClass(/\bis-open\b/);
    const visibleLinks = await page.locator("#site-nav").evaluate((nav) =>
      [...nav.querySelectorAll("a")].filter((link) => getComputedStyle(link).display !== "none").length);
    expect(visibleLinks).toBe(navigationItems.length + 1);
  }
});

test("əsas ekranların vizual artefaktları yaradılır", async ({ page }, testInfo) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const file of ["index.html", "catalog.html", "checkout.html"]) {
      await page.goto(`/${file}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-site-header]")).toBeVisible();
      const screenshot = await page.screenshot({ fullPage: false, animations: "disabled" });
      await testInfo.attach(`${file.replace(".html", "")}-${viewport.width}.png`, {
        body: screenshot,
        contentType: "image/png"
      });
    }
  }
});

test("mənbəli paket və texnika icarəsi axını responsiv işləyir", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/packages.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-package-grid] .market-card").first()).toHaveClass(/is-official-card/);
  await page.locator("[data-package-provider-filter]").selectOption({ label: "Hazırev" });
  await expect(page.locator("[data-package-count]")).toHaveText("3 paket");
  await expect(page.locator('[data-package-id^="az-market-hazirev-"]')).toHaveCount(3);

  await page.goto("/rental.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-rental-grid] .market-card").first()).toHaveClass(/is-sourced-card/);
  await page.locator("[data-rental-city-filter]").selectOption({ label: "Bakı və Azərbaycan" });
  const cityRentalCount = await page.evaluate(() =>
    window.CONSTERA_MARKETPLACE.rentals.filter((item) => item.city === "Bakı və Azərbaycan").length);
  expect(cityRentalCount).toBeGreaterThanOrEqual(3);
  await expect(page.locator("[data-rental-count]")).toHaveText(`${cityRentalCount} avadanlıq`);
  await expect(page.locator("[data-rental-grid] .market-card")).toHaveCount(cityRentalCount);
  await expect(page.locator('[data-rental-id^="az-rental-naf-"]')).toHaveCount(3);
  await expect.poll(() => page.locator('[data-rental-id^="az-rental-naf-"] img').evaluateAll((images) =>
    images.length === 3 && images.every((image) => image.complete && image.naturalWidth > 0)
  )).toBe(true);
  await testInfo.attach("rental-sourced-desktop.png", {
    body: await page.screenshot({ fullPage: false, animations: "disabled" }),
    contentType: "image/png"
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/rental-detail.html?rental=az-rental-avtokran-xcmg-25t", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".detail-media img")).toBeVisible();
  await expect(page.locator("[data-rental-booking-form]")).toBeVisible();
  await expect(page.locator('[data-rental-booking-form] [name="startDate"]')).toHaveAttribute("required", "");
  await expect(page.locator('[data-rental-booking-form] [name="endDate"]')).toHaveAttribute("required", "");
  await expect(page.locator("body")).not.toContainText("undefined");
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.goto("/rfq.html?rental=az-rental-avtokran-xcmg-25t", { waitUntil: "domcontentloaded" });
  for (const name of ["address", "rentalDuration", "operatorPreference"]) {
    await expect(page.locator(`[name="${name}"]`)).toBeVisible();
  }
  await expect(page.locator('[name="address"]')).toHaveAttribute("required", "");
  await expect(page.locator('[name="rentalDuration"]')).toHaveAttribute("required", "");
});

test("mənbəli məhsullar əsas səhifə və kataloqda əvvəl göstərilir", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-home-sourced-products] .is-sourced-card")).toHaveCount(3);
  await expect(page.locator("[data-home-sourced-packages] .is-official-card")).toHaveCount(3);
  await expect(page.locator("[data-home-sourced-rentals] .is-sourced-card")).toHaveCount(3);

  await page.goto("/catalog.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-product-grid] .market-card").first()).toHaveClass(/is-sourced-card/);
  await page.locator("[data-source-filter]").selectOption("sourced-image");
  await expect(page.locator("[data-active-filter-list]")).toContainText("Mənbə + hüquqlu foto");
  const licensedMediaCards = page.locator("[data-product-grid] .market-card.has-real-media");
  if (await licensedMediaCards.count()) {
    await expect(licensedMediaCards.first()).toBeVisible();
  } else {
    await expect(page.locator("[data-empty-state]")).toBeVisible();
  }
});

test("uzun kataloq siyahıları mərhələli render olunur", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844, catalogLimit: 18, listLimit: 10 },
    { width: 1280, height: 900, catalogLimit: 36, listLimit: 18 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/catalog.html", { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.locator("[data-product-grid] .market-card").count()).toBeGreaterThan(0);
    expect(await page.locator("[data-product-grid] .market-card").count()).toBeLessThanOrEqual(viewport.catalogLimit);

    for (const [file, selector] of [
      ["services.html", "[data-service-grid] .market-card"],
      ["packages.html", "[data-package-grid] .market-card"],
      ["rental.html", "[data-rental-grid] .market-card"]
    ]) {
      await page.goto(`/${file}`, { waitUntil: "domcontentloaded" });
      await expect.poll(() => page.locator(selector).count()).toBeGreaterThan(0);
      expect(await page.locator(selector).count(), file).toBeLessThanOrEqual(viewport.listLimit);
    }
  }
});

test("kataloq başlığı desktop filtr paneli ilə üst-üstə düşmür", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/catalog.html", { waitUntil: "domcontentloaded" });
  const geometry = await page.evaluate(() => {
    const heading = document.querySelector(".market-hero-copy h1")?.getBoundingClientRect();
    const panel = document.querySelector(".market-command")?.getBoundingClientRect();
    return {
      headingRight: heading?.right || 0,
      panelLeft: panel?.left || 0
    };
  });
  expect(geometry.headingRight).toBeLessThanOrEqual(geometry.panelLeft - 12);
});

test("mobil kataloq axtarış təklifləri klaviatura ilə seçilir", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalog.html", { waitUntil: "domcontentloaded" });
  await page.locator("[data-catalog-filter-toggle]").click();

  const search = page.locator("[data-search]");
  const suggestions = page.locator("[data-search-suggestions]");
  await search.fill("boya");
  await expect(suggestions).toBeVisible();
  await expect.poll(() => suggestions.locator("[data-search-suggestion]").count()).toBeGreaterThan(0);
  expect(await suggestions.locator("[data-search-suggestion]").count()).toBeLessThanOrEqual(7);

  await search.press("ArrowDown");
  await expect(suggestions.locator("[data-search-suggestion].is-active")).toHaveCount(1);
  await search.press("Enter");
  await expect(search).not.toHaveValue("boya");
  await expect(suggestions).toBeHidden();
  await expect(search).toHaveAttribute("aria-expanded", "false");

  const overflow = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("əlaqə və hüquqi səhifələr mobil ekranda tam işləyir", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const file of ["contact.html", "privacy.html", "terms.html", "delivery-returns.html"]) {
    await page.goto(`/${file}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("[data-site-footer]")).toBeVisible();
    const overflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }

  await page.goto("/contact.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-contact-form] [name="legalAccepted"]')).toHaveAttribute("required", "");
  await page.goto("/privacy.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator('.detail-panel [data-consent-choice="essential"]')).toBeVisible();
  await expect(page.locator('.detail-panel [data-consent-choice="analytics"]')).toBeVisible();
});

test("kataloq köməkçisi mobil və desktop görünüşdə işləyir", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/catalog.html", { waitUntil: "domcontentloaded" });
    await page.locator("[data-catalog-assistant-form] input").fill("120 m² ev tikintisi, real foto və qiymət");
    await page.locator("[data-catalog-assistant-form]").getByRole("button", { name: "Uyğun seçimləri tap" }).click();
    await expect(page.locator("[data-catalog-assistant-result]")).toBeVisible();
    await expect(page.locator("[data-catalog-assistant-result]")).toContainText("Tikinti materialları");
    await expect.poll(() => page.locator("[data-assistant-search]").count()).toBeGreaterThanOrEqual(4);

    await page.locator("[data-assistant-search]").first().click();
    await expect(page.locator("[data-source-filter]")).toHaveValue("sourced-image");
    const overflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test("məhsul, RFQ, təchizatçı və admin iş axınları responsivdir", async ({ page }, testInfo) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("constera-rfq-drafts", JSON.stringify([{
      id: "rfq-layout-test",
      type: "product",
      status: "Təklif alındı",
      product: "Holcim sement təchizatı",
      quantity: "100 kisə",
      company: "ConstEra test",
      contact: "test@constera.az",
      supplier: "Açıq sorğu",
      priority: "Qiymət müqayisəsi",
      createdAt: new Date().toISOString(),
      offers: [
        { id: "offer-layout-1", supplier: "TVIM", price: "809 AZN", leadTime: "1 gün", status: "submitted" },
        { id: "offer-layout-2", supplier: "ELEM", price: "825 AZN", leadTime: "2 gün", status: "submitted" }
      ]
    }]));
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/product-detail.html?product=tvim-qaradag-optimal-300-40kg", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-product-detail] h1")).toContainText("Qaradağ Optimal 300");
    await expect(page.locator(".detail-media img, .detail-media .product-image-fallback")).toBeVisible();
    await expect(page.locator("[data-product-detail]")).toContainText("Qiymət tarixçəsi");
    await expect.poll(() => page.locator("[data-product-detail] .market-card").count()).toBeGreaterThan(0);

    await page.goto("/rfq-dashboard.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-rfq-dashboard-rows] tr")).toHaveCount(1);
    await page.locator("[data-rfq-summary]").click();
    await expect(page.locator(".rfq-offer-card")).toHaveCount(2);
    await expect(page.locator("[data-rfq-offer-select]")).toHaveCount(2);

    await page.goto("/supplier-portal.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-inventory-bulk-input]")).toBeVisible();
    await expect(page.locator("[data-supplier-order-rows]")).toBeAttached();

    await page.goto("/admin.html", { waitUntil: "domcontentloaded" });
    await page.locator("[data-admin-quality-dialog]").evaluate((dialog) => dialog.showModal());
    await expect(page.locator("[data-admin-quality-dialog]")).toBeVisible();
    const dialogFits = await page.locator("[data-admin-quality-dialog]").evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect();
      return rect.width <= window.innerWidth && rect.height <= window.innerHeight;
    });
    expect(dialogFits).toBe(true);
    await page.locator("[data-admin-quality-dialog]").evaluate((dialog) => dialog.close());
    await page.locator('[data-admin-tab="launch"]').click();
    await expect(page.locator('[data-admin-panel="launch"]')).toBeVisible();
    await expect(page.locator("[data-launch-pilot-form]")).toBeVisible();
    await page.locator('[data-admin-tab="crm"]').click();
    await expect(page.locator('[data-admin-panel="crm"]')).toBeVisible();
    await expect(page.locator("[data-admin-v2-crm-form]")).toBeVisible();

    const overflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    if (viewport.width === 390) {
      await testInfo.attach("admin-quality-dialog-mobile.png", {
        body: await page.screenshot({ fullPage: false, animations: "disabled" }),
        contentType: "image/png"
      });
    }
  }
});

test("təchizatçı müraciəti və sifariş sənədi mobil ekrana uyğunlaşır", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/suppliers.html#supplier-application", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-supplier-application-form]")).toBeVisible();
  await expect(page.locator('[name="taxId"]')).toHaveAttribute("pattern", "[0-9]{10}");

  await page.route("**/api/auth?action=session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      authenticated: true,
      user: { id: "usr-layout", name: "Admin", email: "admin@constera.az", role: "admin" }
    })
  }));
  await page.route("**/api/orders?id=ord-layout", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      data: {
        id: "ord-layout",
        orderNumber: 42,
        companyName: "ConstEra Test",
        contactName: "Test istifadəçi",
        email: "test@constera.az",
        phone: "+994 00 000 00 00",
        city: "Bakı",
        address: "Test ünvanı",
        status: "confirmed",
        paymentStatus: "awaiting",
        subtotal: 809,
        deliveryAmount: 20,
        totalAmount: 829,
        currency: "AZN",
        trackingCode: "",
        deliveryProvider: "",
        createdAt: "2026-07-29T07:00:00.000Z",
        updatedAt: "2026-07-29T08:00:00.000Z",
        items: [{
          id: "ori-layout",
          sku: "TVIM-HOLCIM-OPTIMAL-300-40KG",
          title: "Qaradağ Optimal 300 sement 40 kq",
          quantity: 100,
          unit: "kisə",
          unitPrice: 8.09,
          lineTotal: 809,
          snapshot: { supplierName: "TVIM" }
        }],
        documents: [{
          id: "doc-layout",
          type: "proforma_invoice",
          number: "PF-2026-000042",
          issuedAt: "2026-07-29T08:00:00.000Z",
          payload: {
            marketplace: { note: "Proforma hesab" },
            order: {
              companyName: "ConstEra Test",
              contactName: "Test istifadəçi",
              email: "test@constera.az",
              phone: "+994 00 000 00 00",
              city: "Bakı",
              address: "Test ünvanı",
              subtotal: 809,
              deliveryAmount: 20,
              totalAmount: 829,
              currency: "AZN",
              items: [{
                id: "ori-layout",
                sku: "TVIM-HOLCIM-OPTIMAL-300-40KG",
                title: "Qaradağ Optimal 300 sement 40 kq",
                quantity: 100,
                unit: "kisə",
                unitPrice: 8.09,
                lineTotal: 809,
                snapshot: { supplierName: "TVIM" }
              }]
            }
          }
        }],
        history: [{
          id: "osh-layout",
          actorName: "Admin",
          fromStatus: "submitted",
          toStatus: "confirmed",
          fromPaymentStatus: "pending",
          toPaymentStatus: "awaiting",
          note: "Təsdiqləndi",
          createdAt: "2026-07-29T08:00:00.000Z"
        }]
      }
    })
  }));
  await page.goto("/order-detail.html?order=ord-layout", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-order-document]")).toBeVisible();
  await expect(page.locator("[data-order-document-number]")).toHaveText("PF-2026-000042");
  await expect(page.locator("[data-order-history] article")).toHaveCount(1);
  await expect(page.locator("[data-order-admin-panel]")).toBeVisible();
  const overflow = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("müqayisəli kommersiya təklifi mobil və desktopda qəbul axınını tamamlayır", async ({ page }, testInfo) => {
  const proposal = {
    id: "proposal-layout",
    documentNumber: "KT-2026-001001",
    rfqId: "rfq-layout",
    rfqTitle: "Villa üçün fasad materialları",
    selectedOfferId: "offer-two",
    customerId: "customer-layout",
    version: 1,
    status: "issued",
    currency: "AZN",
    subtotal: 12500,
    discountAmount: 500,
    deliveryAmount: 250,
    vatMode: "excluded",
    vatRate: 18,
    vatAmount: 2205,
    totalAmount: 14455,
    validUntil: "2026-08-17",
    paymentTerms: "Bank köçürməsi ilə, proforma əsasında",
    deliveryTerms: "Bakı daxilində 3 iş günü",
    warrantyTerms: "İstehsalçı zəmanəti",
    note: "Stok sifariş təsdiqində yenidən yoxlanılır.",
    customer: {
      companyName: "Test İnşaat MMC",
      contactName: "Müştəri nümayəndəsi",
      phone: "+994 50 000 00 00",
      email: "customer@example.test",
      city: "Bakı"
    },
    supplier: {
      name: "Seçilmiş Təchizatçı MMC",
      leadTime: "3 iş günü",
      delivery: "Daxildir",
      warranty: "12 ay"
    },
    items: [
      { title: "Fasad boyası 15 L", quantity: "40 vedrə", specs: ["Silikon əsaslı", "Ağ"] },
      { title: "Fasad astarı 15 L", quantity: "20 vedrə", specs: ["Xarici işlər üçün"] }
    ],
    comparisons: [
      { id: "offer-one", supplier: "Təchizatçı A", price: "13 100 AZN", leadTime: "2 gün", delivery: "Ayrıca", warranty: "12 ay", selected: false },
      { id: "offer-two", supplier: "Seçilmiş Təchizatçı MMC", price: "12 500 AZN", leadTime: "3 gün", delivery: "Daxildir", warranty: "12 ay", selected: true },
      { id: "offer-three", supplier: "Təchizatçı C", price: "12 900 AZN", leadTime: "5 gün", delivery: "Daxildir", warranty: "6 ay", selected: false }
    ],
    issuedAt: "2026-08-03T08:00:00.000Z",
    createdAt: "2026-08-03T08:00:00.000Z"
  };

  await page.route("**/api/auth?action=session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true, user: { id: "customer-layout", role: "customer", name: "Müştəri" } })
  }));
  await page.route("**/api/proposals**", async (route) => {
    if (route.request().method() === "PATCH") {
      proposal.status = "accepted";
      proposal.orderId = "ord-layout-proposal";
      proposal.orderNumber = 1007;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { proposal, order: { id: proposal.orderId, orderNumber: proposal.orderNumber } } })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: proposal })
    });
  });
  page.on("dialog", (dialog) => dialog.accept());

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    proposal.status = "issued";
    delete proposal.orderId;
    delete proposal.orderNumber;
    await page.setViewportSize(viewport);
    await page.goto("/proposal-detail.html?proposal=proposal-layout", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-proposal-document]")).toBeVisible();
    await expect(page.locator("[data-proposal-comparisons] tr")).toHaveCount(3);
    await expect(page.locator("[data-proposal-total]")).toContainText("14");
    await expect(page.locator("[data-proposal-accept]")).toBeVisible();
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(overflow, `proposal ${viewport.width}: horizontal overflow`).toBeLessThanOrEqual(0);
    await page.locator("[data-proposal-accept]").click();
    await expect(page.locator("[data-proposal-order-link]")).toBeVisible();
    await expect(page.locator("[data-proposal-order-link]")).toContainText("Sifariş #1007");
    await testInfo.attach(`proposal-${viewport.width}.png`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled" }),
      contentType: "image/png"
    });
  }
});
