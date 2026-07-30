import assert from "node:assert/strict";
import test from "node:test";
import {
  backupVerificationState,
  buildReleaseQueue
} from "../../api/_lib/release-queue.js";

test("buraxılış növbəsi kritik təhlükəsizlik və real kataloq boşluqlarını önə çəkir", () => {
  const queue = buildReleaseQueue({
    metrics: {
      realProducts: 100,
      structuredAttributeProducts: 40,
      licensedMediaProducts: 20,
      activeSuppliers: 4,
      onboardedSuppliers: 1,
      privilegedUsers: 2,
      adminsWithTwoFactor: 1,
      pendingPriceReviews: 3
    },
    qualityIssues: [{ type: "missing_image", severity: "high", count: 5 }],
    staging: [{ kind: "product", count: 6, invalidCount: 0 }],
    searches: [{ query: "sement", zeroResults: 2 }],
    backup: { status: "verified", createdAt: new Date().toISOString() },
    criticalTwoFactorEnforced: true
  });

  assert.equal(queue.items[0].key, "security:admin_2fa");
  assert.equal(queue.summary.critical, 1);
  assert.equal(queue.items.find((item) => item.key === "catalog:licensed_media").value, 80);
  assert.equal(queue.items.find((item) => item.key === "search:zero_results").value, 2);
});

test("yeddi gündən köhnə backup yoxlaması buraxılışı bloklayan növbəyə düşür", () => {
  const now = Date.parse("2026-07-30T00:00:00Z");
  const state = backupVerificationState({
    status: "verified",
    createdAt: "2026-07-20T00:00:00Z"
  }, now);
  assert.equal(state.ageDays, 10);
  assert.equal(state.ready, false);
});
