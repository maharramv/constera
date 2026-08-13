import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import { buildCommercialLaunchProgram } from "../../api/_lib/commercial-launch.js";
import { navigationItems } from "../../scripts/site-shell.mjs";

const pages = readdirSync(process.cwd())
  .filter((file) => file.endsWith(".html"))
  .sort((left, right) => left.localeCompare(right, "az"));

const primaryViewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "menu-mobile", width: 1100, height: 800 },
  { name: "menu-desktop", width: 1101, height: 800 },
  { name: "desktop", width: 1280, height: 800 }
];

const rounded = (value) => Math.round(value * 10) / 10;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.CONSTERA_STATIC_PREVIEW = true;
  });
});

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

test("dinamik idarəetmələr əlçatan ad və təhlükəsiz xarici link alır", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const file of pages) {
      await page.goto(`/${file}`, { waitUntil: "domcontentloaded" });
      const issues = await page.evaluate(() => {
        const visible = (element) => {
          if (element.closest('[aria-hidden="true"], [inert]')) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none"
            && style.visibility !== "hidden"
            && Number(style.opacity || 1) !== 0
            && rect.width > 0
            && rect.height > 0;
        };
        const hasLabel = (element) => {
          if (element.getAttribute("aria-label")?.trim()) return true;
          const labelledBy = element.getAttribute("aria-labelledby")?.trim();
          if (labelledBy && labelledBy.split(/\s+/).every((id) => document.getElementById(id)?.textContent?.trim())) return true;
          if (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim()) return true;
          return Boolean(element.closest("label")?.textContent?.trim());
        };
        const result = [];
        document.querySelectorAll("img:not([alt])").forEach((element) => result.push(`img without alt: ${element.src}`));
        document.querySelectorAll("button, a[href]").forEach((element) => {
          if (!visible(element)) return;
          const name = element.getAttribute("aria-label")
            || element.getAttribute("title")
            || element.textContent
            || element.querySelector("img")?.alt;
          if (!String(name || "").trim()) result.push(`${element.tagName.toLowerCase()} without name`);
        });
        document.querySelectorAll("input:not([type='hidden']), select, textarea").forEach((element) => {
          if (visible(element) && !hasLabel(element)) {
            result.push(`${element.tagName.toLowerCase()} without label: ${element.getAttribute("name") || element.id || "unknown"}`);
          }
        });
        document.querySelectorAll('a[target="_blank"]').forEach((element) => {
          if (!String(element.getAttribute("rel") || "").split(/\s+/).includes("noopener")) {
            result.push(`external link without noopener: ${element.getAttribute("href")}`);
          }
        });
        return result;
      });
      expect(issues, `${file} @ ${viewport.width}px`).toEqual([]);
    }
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
  for (const key of ["categories", "products", "services", "rentals"]) {
    await expect(page.locator(`[data-marketplace-count="${key}"]`).first()).not.toHaveText("0");
  }
  await expect(page.locator("[data-home-sourced-products] .is-sourced-card")).toHaveCount(3);
  await expect(page.locator("[data-home-sourced-packages] .is-official-card")).toHaveCount(3);
  await expect(page.locator("[data-home-sourced-rentals] .is-sourced-card")).toHaveCount(3);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const selector of ["[data-home-sourced-products]", "[data-home-sourced-packages]", "[data-home-sourced-rentals]"]) {
    const visibleCards = await page.locator(`${selector} .market-card`).evaluateAll((cards) =>
      cards.filter((card) => getComputedStyle(card).display !== "none").length);
    expect(visibleCards, `${selector}: mobil vitrin sayı`).toBe(1);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
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
    await page.locator("[data-catalog-ai-submit]").click();
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

test("AI smeta sənəddən çoxməhsullu RFQ-yə mobil və desktop axını göstərir", async ({ page }, testInfo) => {
  await page.route("**/api/auth**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: null }) });
  });
  await page.route("**/api/integrations", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { readiness: { aiEstimate: false } } })
      });
      return;
    }
    const payload = route.request().postDataJSON();
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const pricedRows = rows.map((row, index) => ({
      key: row.key,
      title: row.title,
      selected: {
        id: `phase-three-product-${index + 1}`,
        name: `${row.title} · real kataloq məhsulu`,
        brand: "ConstEra tərəfdaşı",
        price: "10.00 AZN",
        priceStatus: "confirmed",
        unitPrice: 10,
        offerId: `offer-${index + 1}`,
        sourceLabel: "Yoxlanmış təchizatçı"
      },
      alternatives: [],
      matchedBy: "catalog_search",
      packageCount: 1,
      packageSize: 1,
      lineTotal: 10,
      pricingConfidence: "high"
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          rows: pricedRows,
          materialSubtotal: pricedRows.length * 10,
          pricedRows: pricedRows.length,
          matchedRows: pricedRows.length,
          searchMatchedRows: pricedRows.length,
          unresolvedRows: [],
          totalRows: pricedRows.length,
          coveragePercent: 100,
          matchPercent: 100,
          currency: "AZN"
        }
      })
    });
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/ai-smeta.html", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("AI Mərhələ 6 · Smetadan satınalma təqviminə")).toBeVisible();
    await page.locator('[data-ai-smeta-form] [name="city"]').fill("Bakı");
    await page.locator('[data-ai-smeta-form] button[type="submit"]').click();
    await expect(page.locator("[data-ai-smeta-output]")).toBeVisible();
    await expect(page.locator("[data-ai-smeta-output]")).toContainText("real məhsul uyğunluğu");
    await expect(page.locator("[data-ai-smeta-output]")).toContainText("Yoxlanmış təchizatçı");
    await expect(page.locator("[data-ai-smeta-row-include]").first()).toBeVisible();
    await expect(page.locator("[data-ai-smeta-row-quantity]").first()).toBeVisible();
    await expect(page.locator("[data-ai-smeta-output]")).toContainText("Bünövrə və konstruksiya");
    await page.locator("[data-ai-smeta-legal]").check();
    await page.locator("[data-ai-smeta-rfq]").click();
    const rfqItemCount = await page.evaluate(() => {
      const drafts = JSON.parse(localStorage.getItem("constera-rfq-drafts") || "[]");
      return drafts[0]?.items?.length || 0;
    });
    expect(rfqItemCount).toBeGreaterThan(1);
    expect(rfqItemCount).toBeLessThanOrEqual(20);
    const overflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await testInfo.attach(`ai-smeta-phase-three-${viewport.width}.png`, {
      body: await page.screenshot({ fullPage: false, animations: "disabled" }),
      contentType: "image/png"
    });
  }
});

test("AI satınalma planı redaktə, təsdiq və mərhələli RFQ axınını tamamlayır", async ({ page }, testInfo) => {
  const estimate = {
    id: "estimate-plan-layout",
    projectLabel: "Villa layihəsi",
    projectType: "villa",
    area: 180,
    scopeLabel: "Tam tikinti + təmir",
    finishLabel: "Standart",
    floors: 2,
    rooms: 6,
    wetZones: 3,
    wastePercent: 8,
    riskReserve: 10,
    deliveryPercent: 4,
    laborPercent: 18,
    city: "Bakı",
    workflowStatus: "approved",
    createdAt: "2026-08-04T08:00:00.000Z",
    rows: [
      {
        key: "concrete", title: "Hazır beton", category: "Konstruksiya",
        phase: "Bünövrə və konstruksiya", criticality: "Yüksək", included: true,
        quantity: 32, baseQuantity: 30, unit: "m³", confidence: "Yüksək", products: []
      },
      {
        key: "cable", title: "Elektrik kabeli", category: "Elektrik",
        phase: "MEP sistemləri", criticality: "Yüksək", included: true,
        quantity: 950, baseQuantity: 900, unit: "metr", confidence: "Orta", products: []
      }
    ]
  };
  const initialPlan = () => ({
    id: "ppl-layout",
    estimateId: estimate.id,
    aiRunId: "air-plan-layout",
    title: "Villa layihəsi · satınalma planı",
    status: "review_pending",
    projectStartDate: "2026-09-01",
    targetEndDate: "2027-01-28",
    durationDays: 150,
    currency: "AZN",
    totalBudget: 18_400,
    pricedRows: 1,
    unpricedRows: 1,
    summary: "2 material mövqeyi 2 satınalma dalğasına bölündü.",
    warnings: ["1 mövqenin təsdiqli qiyməti yoxdur."],
    confidence: 0.88,
    version: 1,
    waves: [
      {
        id: "pph-structure", key: "structure-1", phaseKey: "structure",
        title: "Bünövrə və konstruksiya", sequence: 1,
        startDate: "2026-09-01", endDate: "2026-10-21", needByDate: "2026-08-18",
        leadTimeDays: 14, budget: 18_400, currency: "AZN", riskLevel: "high",
        rowKeys: ["concrete"], rowCount: 1, unpricedCount: 0, included: true,
        status: "planned", reason: "Daşıyıcı konstruksiya işlərindən əvvəl alınmalıdır.", checks: []
      },
      {
        id: "pph-mep", key: "mep-1", phaseKey: "mep",
        title: "MEP sistemləri", sequence: 2,
        startDate: "2026-10-31", endDate: "2026-12-14", needByDate: "2026-10-10",
        leadTimeDays: 21, budget: null, currency: "AZN", riskLevel: "medium",
        rowKeys: ["cable"], rowCount: 1, unpricedCount: 1, included: true,
        status: "planned", reason: "Kabel stoku iş başlanğıcından əvvəl təsdiqlənməlidir.", checks: ["Stoku təsdiqlə."]
      }
    ]
  });
  let plan = initialPlan();
  let savedWaveCount = 0;

  await page.addInitScript((payload) => {
    localStorage.setItem("constera-ai-estimates", JSON.stringify([payload]));
  }, estimate);
  await page.route("**/api/auth**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "customer-layout", role: "customer", name: "Müştəri", email: "customer@example.test" } })
  }));
  await page.route("**/api/integrations", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { readiness: { aiEstimate: true } } })
  }));
  await page.route("**/api/ai", async (route) => {
    plan.status = "approved";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { id: plan.aiRunId, approvalStatus: "approved" } })
    });
  });
  await page.route("**/api/procurement-plans**", async (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      const payload = route.request().postDataJSON();
      savedWaveCount = payload.waves?.length || 0;
      plan.waves = plan.waves.map((wave) => ({
        ...wave,
        ...(payload.waves || []).find((entry) => entry.id === wave.id)
      }));
      plan.status = "review_pending";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { plan } })
      });
    }
    if (method === "POST") {
      plan.status = "activated";
      plan.waves = plan.waves.map((wave, index) => ({
        ...wave,
        status: "rfq_created",
        rfqId: `rfq-plan-${index + 1}`,
        rfqStatus: "Yeni"
      }));
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { plan, duplicate: false } })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: [plan] })
    });
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    plan = initialPlan();
    savedWaveCount = 0;
    await page.setViewportSize(viewport);
    await page.goto(`/ai-smeta.html?estimate=${estimate.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-ai-plan-wave]")).toHaveCount(2);
    await expect(page.locator(".ai-procurement-kpis article").first()).toContainText("aktiv dalğa");
    await expect(page.locator(".ai-procurement-kpis article").first().locator("strong")).toHaveText("2");
    await page.locator("[data-ai-plan-need]").first().fill("2026-08-17");
    await page.locator("[data-ai-plan-save]").click();
    await expect.poll(() => savedWaveCount).toBe(2);
    await page.locator('[data-ai-plan-review="approve"]').click();
    await expect(page.locator("[data-ai-plan-activate]")).toBeVisible();
    await page.locator("[data-ai-smeta-legal]").check();
    await page.locator("[data-ai-plan-activate]").click();
    await expect(page.locator('[data-plan-status="activated"]')).toContainText("RFQ-lər yaradılıb");
    await expect(page.locator('[href*="rfq=rfq-plan-"]')).toHaveCount(2);
    const overflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(overflow, `procurement plan ${viewport.width}: horizontal overflow`).toBeLessThanOrEqual(0);
    await testInfo.attach(`ai-procurement-plan-${viewport.width}.png`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled" }),
      contentType: "image/png"
    });
  }
});

test("məhsul, RFQ, təchizatçı və admin iş axınları responsivdir", async ({ page }, testInfo) => {
  const launchMetrics = {
    onboardedSuppliers: 3,
    eligibleProducts: 100,
    pilotEngagedCustomers: 10,
    completedOrders: 0,
    activeCustomers: 10,
    privilegedUsers: 1,
    adminsWithTwoFactor: 1,
    criticalTwoFactorEnforced: true,
    verifiedLogisticsZones: 1,
    criticalSecurityEvents: 0
  };
  const pilotAssortment = [{
    productId: "pilot-product",
    sku: "PILOT-001",
    name: "Pilot sement məhsulu",
    brand: "ConstEra",
    package: "40 kq",
    supplierName: "Pilot təchizatçı",
    unitPrice: 12.5,
    currency: "AZN",
    stockQuantity: 100,
    priceVerifiedAt: new Date().toISOString(),
    sourceUrl: "https://example.com/pilot-product",
    missing: [],
    ready: true
  }];
  const commercialLaunch = buildCommercialLaunchProgram({
    metrics: launchMetrics,
    providers: { bankTransfer: true },
    backup: { ready: true, recentVerified: true },
    monitoring: { scheduledWorkflow: true },
    assortment: pilotAssortment
  });
  await page.route((url) => url.pathname === "/api/auth" && url.searchParams.get("action") === "session", (route) =>
    route.fulfill({ json: { ok: true, user: { id: "layout-admin", role: "super_admin" } } }));
  await page.route("**/api/launch-center", (route) => route.fulfill({
    json: {
      ok: true,
      data: {
        commercialLaunch,
        metrics: launchMetrics,
        readiness: { status: "attention", score: commercialLaunch.score, blockerCount: 1, warningCount: 0, sections: [], priorities: [] },
        providers: { bankTransfer: true },
        monitoring: { scheduledWorkflow: true },
        backup: { ready: true, verification: { ready: true }, latest: {} },
        suppliers: [],
        pilotSelections: pilotAssortment,
        readyFulfillments: [],
        pilotHistory: []
      }
    }
  }));
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
    await expect(page.locator("[data-commercial-launch-decision]")).toBeVisible();
    await expect(page.locator("[data-commercial-launch-kpis]")).toBeVisible();
    await expect(page.locator("[data-commercial-launch-milestones]")).toBeVisible();
    await expect(page.locator("[data-commercial-launch-assortment]")).toBeVisible();
    await expect(page.locator("[data-commercial-launch-export-plan]")).toBeVisible();
    await expect(page.locator("[data-launch-pilot-form]")).toBeVisible();
    await page.locator('[data-admin-tab="crm"]').click();
    await expect(page.locator('[data-admin-panel="crm"]')).toBeVisible();
    await expect(page.locator("[data-admin-v2-crm-form]")).toBeVisible();
    await page.locator('[data-admin-tab="operations"]').click();
    await expect(page.locator('[data-admin-panel="operations"]')).toBeVisible();
    await expect(page.locator("[data-procurement-control]")).toBeVisible();
    await expect(page.locator("[data-goods-receipt-form]")).toBeVisible();
    await expect(page.locator("[data-supplier-invoice-form]")).toBeVisible();

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

test("AI təklif müqayisəsi mobil və desktop görünüşdə insan təsdiqini tələb edir", async ({ page }, testInfo) => {
  const rfq = {
    id: "rfq-ai-layout",
    customer_id: "customer-layout",
    rfq_type: "product",
    title: "Sement təchizatı",
    company_name: "Test İnşaat MMC",
    contact: "Müştəri · +994 50 000 00 00",
    city: "Bakı",
    status: "Təklif alındı",
    priority: "Qiymət müqayisəsi",
    items: [{ id: "item-ai-layout", title: "Norm sement 40 kq", quantity: "100 kisə", specs: [] }],
    offers: [
      {
        id: "offer-ai-a", supplierId: "supplier-a", supplier: "Təchizatçı A",
        priceAmount: 1_000, price: "1000 AZN", currency: "AZN", leadTime: "2 gün",
        delivery: "Daxildir", warranty: "12 ay", note: "Stok təsdiqlənsin", status: "submitted"
      },
      {
        id: "offer-ai-b", supplierId: "supplier-b", supplier: "Təchizatçı B",
        priceAmount: 1_080, price: "1080 AZN", currency: "AZN", leadTime: "1 gün",
        delivery: "Ayrıca", warranty: "6 ay", note: "", status: "submitted"
      }
    ],
    proposals: []
  };
  const comparisonResponse = {
    runId: "air-layout-comparison",
    comparison: {
      summary: "A təklifi qiymət, çatdırılma və zəmanət balansına görə daha uyğundur.",
      confidence: 0.86,
      decision: "recommend",
      recommendedOfferId: "offer-ai-a",
      locked: false,
      humanDecisionRequired: true,
      warnings: ["Stok sifarişdən əvvəl təsdiqlənməlidir."],
      questions: ["Qiymətin etibarlılıq müddəti neçə gündür?"],
      rankedOffers: [
        {
          offerId: "offer-ai-a", supplierId: "supplier-a", supplier: "Təchizatçı A",
          priceAmount: 1_000, price: "1000 AZN", currency: "AZN", leadTime: "2 gün",
          delivery: "Daxildir", warranty: "12 ay", status: "submitted", supplierScore: 88,
          deterministicScore: 91, score: 0.9, reason: "Ümumi kommersiya şərtləri daha balanslıdır.",
          strengths: ["Ən aşağı qiymət", "Çatdırılma daxildir"], risks: ["Stok ayrıca təsdiqlənməlidir"]
        },
        {
          offerId: "offer-ai-b", supplierId: "supplier-b", supplier: "Təchizatçı B",
          priceAmount: 1_080, price: "1080 AZN", currency: "AZN", leadTime: "1 gün",
          delivery: "Ayrıca", warranty: "6 ay", status: "submitted", supplierScore: 80,
          deterministicScore: 82, score: 0.8, reason: "Müddət qısadır, lakin yekun xərc açıq deyil.",
          strengths: ["Qısa müddət"], risks: ["Çatdırılma ayrıca hesablanır"]
        }
      ]
    },
    sources: [],
    approval: { required: true, status: "pending" }
  };

  await page.route("**/api/auth?action=session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true, user: { id: "customer-layout", role: "customer", name: "Müştəri" } })
  }));
  await page.route("**/api/rfqs?limit=500", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: [rfq] })
  }));
  await page.route("**/api/ai**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { readiness: { structuredOutput: true }, runs: [] } })
      });
    }
    if (route.request().method() === "PATCH") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { id: "air-layout-comparison", approvalStatus: "approved" } })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: comparisonResponse })
    });
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/rfq-dashboard.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-rfq-dashboard-rows] tr")).toHaveCount(1);
    await page.locator("[data-rfq-summary]").click();
    await expect(page.locator("[data-rfq-ai-compare]")).toBeVisible();
    await page.locator("[data-rfq-ai-compare]").click();
    await expect(page.locator("[data-rfq-ai-comparison]")).toBeVisible();
    await expect(page.locator(".rfq-ai-rank-row")).toHaveCount(2);
    await expect(page.locator("[data-rfq-offer-select]")).toHaveCount(0);
    await page.locator('[data-rfq-ai-review="approve"]').click();
    await expect(page.locator("[data-rfq-offer-select]")).toBeVisible();
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(overflow, `AI RFQ ${viewport.width}: horizontal overflow`).toBeLessThanOrEqual(0);
    await testInfo.attach(`ai-offer-comparison-${viewport.width}.png`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled" }),
      contentType: "image/png"
    });
  }
});
