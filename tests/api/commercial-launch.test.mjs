import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommercialLaunchProgram,
  commercialLaunchTargets
} from "../../api/_lib/commercial-launch.js";

const productionControls = {
  metrics: {
    privilegedUsers: 1,
    adminsWithTwoFactor: 1,
    criticalTwoFactorEnforced: true,
    verifiedLogisticsZones: 1,
    criticalSecurityEvents: 0
  },
  backup: { ready: true, recentVerified: true },
  monitoring: { scheduledWorkflow: true }
};

test("kommersiya buraxılışı boş məlumatı GO kimi göstərmir", () => {
  const program = buildCommercialLaunchProgram();
  assert.equal(program.decision, "no_go");
  assert.equal(program.phase, "foundation");
  assert.equal(program.canStartPilot, false);
  assert.equal(program.canGoLive, false);
  assert.ok(program.blockers.length > 0);
});

test("minimum real komanda qapalı pilotu açır, ictimai buraxılışı yox", () => {
  const program = buildCommercialLaunchProgram({
    ...productionControls,
    metrics: {
      ...productionControls.metrics,
      onboardedSuppliers: 1,
      eligibleProducts: 1,
      pilotEngagedCustomers: 1,
      completedOrders: 0
    },
    assortment: [{ sku: "REAL-1", ready: true }]
  });
  assert.equal(program.decision, "pilot");
  assert.equal(program.phase, "pilot");
  assert.equal(program.canStartPilot, true);
  assert.equal(program.canGoLive, false);
  assert.equal(program.assortment.readyCount, 1);
});

test("bütün kommersiya hədəfləri və nəzarətlər GO-LIVE qərarı verir", () => {
  const program = buildCommercialLaunchProgram({
    ...productionControls,
    metrics: {
      ...productionControls.metrics,
      onboardedSuppliers: commercialLaunchTargets.suppliers,
      eligibleProducts: commercialLaunchTargets.products,
      pilotEngagedCustomers: commercialLaunchTargets.customers,
      completedOrders: commercialLaunchTargets.completedOrders
    }
  });
  assert.equal(program.decision, "go");
  assert.equal(program.phase, "live");
  assert.equal(program.score, 100);
  assert.equal(program.canGoLive, true);
});

test("pilot assortiment ixracı ilk 100 namizədlə məhdudlaşır", () => {
  const assortment = Array.from({ length: 130 }, (_, index) => ({
    sku: `SKU-${index + 1}`,
    ready: index % 2 === 0
  }));
  const program = buildCommercialLaunchProgram({ assortment });
  assert.equal(program.assortment.items.length, 100);
  assert.equal(program.assortment.readyCount, 50);
  assert.equal(program.assortment.reviewCount, 50);
});
