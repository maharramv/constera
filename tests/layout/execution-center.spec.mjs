import { expect, test } from "@playwright/test";

const executionData = {
  actor: { id: "owner-1", name: "ConstEra Admin", role: "admin", companyId: "company-1" },
  stats: { contracts: 1, boqItems: 1, submittedMeasurements: 1, certifiedCertificates: 1, payableTotal: 901.5 },
  projects: [{ id: "project-1", title: "Nərimanov ofis layihəsi", status: "active", currency: "AZN" }],
  suppliers: [{ id: "supplier-1", name: "Test Podratçı MMC", region: "Bakı", companyId: "company-2" }],
  changes: [],
  contracts: [{
    id: "contract-1", contractNumber: 1001, projectId: "project-1", projectTitle: "Nərimanov ofis layihəsi",
    customerId: "owner-1", contractorSupplierId: "supplier-1", contractorName: "Test Podratçı MMC",
    title: "Daxili tamamlama işləri", status: "active", contractAmount: 50000, boqAmount: 48000,
    acceptedAmount: 1000, paidNet: 0, currency: "AZN", advancePercent: 10, retentionPercent: 5,
    progressPercent: 2.1
  }],
  boqItems: [{
    id: "boq-1", contractId: "contract-1", projectId: "project-1", contractTitle: "Daxili tamamlama işləri",
    itemCode: "BOQ-001", title: "Divar suvağı", workCategory: "Suvaq işləri", unit: "m²",
    contractQuantity: 500, acceptedQuantity: 100, unitRate: 10, status: "active"
  }],
  measurements: [{
    id: "measurement-1", measurementNumber: 1001, contractId: "contract-1", boqItemId: "boq-1",
    projectTitle: "Nərimanov ofis layihəsi", contractTitle: "Daxili tamamlama işləri", customerId: "owner-1",
    itemTitle: "Divar suvağı", unit: "m²", unitRate: 10, measuredQuantity: 100,
    workDate: "2026-08-15", locationText: "A blok, 2-ci mərtəbə", note: "Sahədə ölçülüb.",
    submittedBy: "contractor-1", status: "submitted"
  }],
  certificates: [{
    id: "certificate-1", certificateNumber: 1001, contractId: "contract-1", certificateType: "interim",
    projectTitle: "Nərimanov ofis layihəsi", contractorName: "Test Podratçı MMC", customerId: "owner-1",
    status: "certified", workAmount: 1000, advanceRecoveryAmount: 200, retentionAmount: 50,
    netPayable: 901.5, currency: "AZN", periodStart: "2026-08-01", periodEnd: "2026-08-15",
    lineCount: 1, submittedBy: "contractor-1"
  }]
};

test("icra və ödəniş mərkəzi mobil və desktop görünüşdə dörd axını göstərir", async ({ page }, testInfo) => {
  await page.route("**/api/auth?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: executionData.actor })
  }));
  await page.route("**/api/execution", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: executionData })
  }));

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/execution-center.html", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "İcra və ödəniş mərkəzi", exact: true })).toBeVisible();
    await expect(page.locator("[data-execution-stats] .admin-stat-card")).toHaveCount(5);
    await expect(page.locator('[data-execution-records="contracts"] .lifecycle-record')).toHaveCount(1);

    const tabs = page.locator("[data-execution-tab]");
    await expect(tabs).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await tabs.nth(index).click();
      const panelName = await tabs.nth(index).getAttribute("data-execution-tab");
      await expect(page.locator(`[data-execution-panel="${panelName}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-execution-records="certificates"] .lifecycle-record')).toHaveCount(1);

    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await testInfo.attach(`execution-center-${viewport.width}.png`, {
      body: await page.screenshot({ fullPage: false, animations: "disabled" }),
      contentType: "image/png"
    });
  }
});
