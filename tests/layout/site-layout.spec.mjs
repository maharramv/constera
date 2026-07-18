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
