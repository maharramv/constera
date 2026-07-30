import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLaunchReadiness,
  buildSupplierOnboarding
} from "../../api/_lib/launch-readiness.js";

test("buraxılış mərkəzi boş məlumatı istehsala hazır kimi göstərmir", () => {
  const readiness = buildLaunchReadiness();
  assert.equal(readiness.status, "blocked");
  assert.ok(readiness.blockerCount > 0);
  assert.ok(readiness.score < 50);
  assert.equal(
    readiness.sections.flatMap((section) => section.items)
      .find((item) => item.key === "pilot_candidate").ready,
    false
  );
});

test("məcburi hazırlıq tamamlandıqda yalnız könüllü inteqrasiyalar xəbərdarlıq yaradır", () => {
  const readiness = buildLaunchReadiness({
    metrics: {
      realProducts: 20,
      eligibleProducts: 3,
      licensedMediaProducts: 3,
      eligibleOffers: 3,
      activeSuppliers: 2,
      onboardedSuppliers: 1,
      healthyFeeds: 0,
      logisticsZones: 1,
      privilegedUsers: 1,
      adminsWithTwoFactor: 1,
      criticalSecurityEvents: 0
    },
    providers: {
      payment: false,
      bankTransfer: false,
      electronicInvoice: false,
      logistics: false,
      email: false,
      whatsapp: false
    },
    backup: { ready: true, label: "Özəl backup" },
    pilotCandidate: { name: "Real məhsul" }
  });
  assert.equal(readiness.status, "attention");
  assert.equal(readiness.blockerCount, 0);
  assert.ok(readiness.warningCount > 0);
});

test("təchizatçı pilot hazırlığı profil, hesab, müqavilə, təklif və media tələb edir", () => {
  const incomplete = buildSupplierOnboarding({
    website: "https://supplier.example",
    contact: "sales@example.test",
    supplier_user_count: 1,
    active_contract_count: 1,
    eligible_offer_count: 1,
    licensed_media_count: 0,
    healthy_feed_count: 1
  });
  assert.equal(incomplete.readyForPilot, false);
  assert.match(
    incomplete.checks.filter((item) => !item.ready).map((item) => item.label).join(" "),
    /media/i
  );

  const ready = buildSupplierOnboarding({
    website: "https://supplier.example",
    contact: "sales@example.test",
    supplier_user_count: 1,
    active_contract_count: 1,
    eligible_offer_count: 1,
    licensed_media_count: 2,
    healthy_feed_count: 0
  });
  assert.equal(ready.readyForPilot, true);
  assert.ok(ready.score < 100);
});
