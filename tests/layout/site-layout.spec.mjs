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
  "rfq.html",
  "rfq-dashboard.html",
  "tender.html",
  "ai-smeta.html",
  "admin.html",
  "login.html"
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
  await expect(page.locator("[data-rental-count]")).toHaveText("3 avadanlıq");
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
  await expect(page.locator("[data-product-grid] .market-card").first()).toHaveClass(/has-real-media/);
  await expect(page.locator("[data-active-filter-list]")).toContainText("Mənbə + real foto");
});
