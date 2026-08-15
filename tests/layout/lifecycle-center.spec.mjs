import { expect, test } from "@playwright/test";

const lifecycleData = {
  actor: { id: "user-1", name: "ConstEra Admin", role: "admin", companyId: "company-1" },
  stats: { passports: 1, models: 1, changes: 1, warranties: 1, surplus: 1, handovers: 1, contractors: 1, locks: 1 },
  projects: [{ id: "project-1", title: "Nərimanov ofis layihəsi", status: "active" }],
  products: [{ id: "product-1", name: "Norm Sement CEM II 50 kq", sku: "NORM-CEM-II-50", canManage: true }],
  orders: [{ id: "order-1", orderNumber: 1042, companyName: "Test MMC", status: "completed", totalAmount: 500, currency: "AZN" }],
  offers: [{ id: "offer-1", productName: "Norm Sement CEM II 50 kq", supplierName: "Norm", unitPrice: 10.5, currency: "AZN" }],
  bookings: [{ id: "booking-1", rentalTitle: "JCB 3CX", startDate: "2026-08-15", endDate: "2026-08-17" }],
  suppliers: [{ id: "supplier-1", name: "Norm", region: "Bakı", canManage: true }],
  passports: [{ id: "dpp-1", productName: "Norm Sement CEM II 50 kq", passportCode: "DPP-TEST", manufacturer: "Norm", originCountry: "Azərbaycan", warrantyMonths: 12, certificateData: [{ label: "AZS" }], status: "published", updatedAt: "2026-08-15T08:00:00Z" }],
  models: [{ id: "model-1", filename: "office.ifc", projectTitle: "Nərimanov ofis layihəsi", modelFormat: "ifc", elementCount: 128, materialCount: 14, extractedItems: [{ name: "Beton" }], status: "analyzed", createdAt: "2026-08-15T08:00:00Z" }],
  changes: [{ id: "change-1", changeNumber: 1001, title: "Arakəsmə dəyişikliyi", projectTitle: "Nərimanov ofis layihəsi", status: "submitted", costDelta: 1200, currency: "AZN", daysDelta: 2, reason: "Plan yenilənib", scopeDescription: "İki arakəsmə dəyişir", requestedBy: "user-1", createdAt: "2026-08-15T08:00:00Z" }],
  warranties: [{ id: "warranty-1", caseNumber: 1001, title: "Qablaşdırma zədəsi", productName: "Norm Sement CEM II 50 kq", status: "open", severity: "medium", supplierName: "Norm", description: "Təhvil zamanı iki kisə zədələnib", customerId: "user-1", createdAt: "2026-08-15T08:00:00Z" }],
  surplus: [{ id: "surplus-1", title: "Artıq qalan sement", projectTitle: "Nərimanov ofis layihəsi", status: "published", quantity: 8, unit: "kisə", condition: "unused", unitPrice: 9, currency: "AZN", city: "Bakı", ownerId: "user-1", description: "Quru anbarda saxlanılıb" }],
  handovers: [{ id: "handover-1", rentalTitle: "JCB 3CX", reportType: "checkout", equipmentCondition: "good", engineHours: 1240, fuelLevel: 80, locationText: "Bakı", createdAt: "2026-08-15T08:00:00Z" }],
  contractors: [{ id: "contractor-1", supplierName: "Norm", contractorType: "general", status: "verified", voen: "1234567891", teamSize: 25, regions: ["Bakı"], specialties: ["Beton işləri"] }],
  locks: [{ id: "lock-1", productName: "Norm Sement CEM II 50 kq", supplierName: "Norm", status: "active", quantity: 50, lockedUnitPrice: 10.5, currency: "AZN", projectTitle: "Nərimanov ofis layihəsi", customerId: "user-1", expiresAt: "2026-08-17T08:00:00Z" }]
};

test("həyat dövrü mərkəzi desktop və mobil görünüşdə səkkiz axını göstərir", async ({ page }, testInfo) => {
  await page.route("**/api/auth?*", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ user: { id: "user-1", name: "ConstEra Admin", role: "admin" } })
  }));
  await page.route("**/api/lifecycle", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: lifecycleData })
  }));

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/lifecycle-center.html", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Həyat dövrü mərkəzi", exact: true })).toBeVisible();
    await expect(page.locator("[data-lifecycle-stats] .admin-stat-card")).toHaveCount(8);
    await expect(page.locator('[data-lifecycle-records="passports"] .lifecycle-record')).toHaveCount(1);

    const tabs = page.locator("[data-lifecycle-tab]");
    await expect(tabs).toHaveCount(8);
    for (let index = 0; index < 8; index += 1) {
      await tabs.nth(index).click();
      const panelName = await tabs.nth(index).getAttribute("data-lifecycle-tab");
      await expect(page.locator(`[data-lifecycle-panel="${panelName}"]`)).toBeVisible();
    }

    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await testInfo.attach(`lifecycle-center-${viewport.width}.png`, {
      body: await page.screenshot({ fullPage: false, animations: "disabled" }),
      contentType: "image/png"
    });
  }
});
