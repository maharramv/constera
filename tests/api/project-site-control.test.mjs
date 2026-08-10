import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectMaterialSummary, receiptStatus } from "../../api/_lib/project-site-control.js";

const item = { rowId: "item-1", id: "product-1", title: "Norm Sement CEM II 40 kq", quantity: 100, unit: "kisə" };

test("qəbul statusu tam, qismən və rədd edilmiş miqdarı ayırır", () => {
  assert.equal(receiptStatus({ deliveredQuantity: 10, acceptedQuantity: 10, rejectedQuantity: 0 }), "accepted");
  assert.equal(receiptStatus({ deliveredQuantity: 10, acceptedQuantity: 8, rejectedQuantity: 2 }), "partial");
  assert.equal(receiptStatus({ deliveredQuantity: 10, acceptedQuantity: 0, rejectedQuantity: 10 }), "rejected");
  assert.equal(receiptStatus({ deliveredQuantity: 10, acceptedQuantity: 9, rejectedQuantity: 2 }), "invalid");
});

test("plan-fakt balansı qəbul, istifadə, israf və qaytarmanı hesablayır", () => {
  const summary = buildProjectMaterialSummary(
    [item],
    [{ projectItemId: "item-1", deliveredQuantity: 80, acceptedQuantity: 78, rejectedQuantity: 2 }],
    [
      { projectItemId: "item-1", type: "use", quantity: 50 },
      { projectItemId: "item-1", type: "waste", quantity: 3 },
      { projectItemId: "item-1", type: "return", quantity: 2 }
    ]
  );
  assert.deepEqual(summary.items[0], {
    projectItemId: "item-1",
    itemId: "product-1",
    title: "Norm Sement CEM II 40 kq",
    unit: "kisə",
    planned: 100,
    delivered: 80,
    accepted: 78,
    rejected: 2,
    used: 50,
    waste: 3,
    returned: 2,
    available: 27,
    planVariance: 49,
    receiptProgress: 78,
    wasteRate: 5.7,
    hasNegativeBalance: false
  });
  assert.equal(summary.totals.available, 27);
  assert.equal(summary.totals.wasteRate, 5.7);
});

test("mənfi obyekt qalığı ayrıca risk kimi işarələnir", () => {
  const summary = buildProjectMaterialSummary(
    [item],
    [{ projectItemId: "item-1", deliveredQuantity: 5, acceptedQuantity: 5, rejectedQuantity: 0 }],
    [{ projectItemId: "item-1", type: "use", quantity: 6 }]
  );
  assert.equal(summary.items[0].hasNegativeBalance, true);
  assert.equal(summary.totals.negativeBalanceItems, 1);
});
