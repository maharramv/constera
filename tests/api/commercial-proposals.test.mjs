import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCommercialProposalTotals,
  effectiveProposalStatus,
  formatCommercialProposalNumber
} from "../../api/_lib/commercial-proposals.js";

test("kommersiya təklifi ƏDV xaric məbləği dəqiq hesablayır", () => {
  assert.deepEqual(calculateCommercialProposalTotals({
    subtotal: 1_000,
    discountAmount: 100,
    deliveryAmount: 50,
    vatMode: "excluded",
    vatRate: 18
  }), {
    subtotal: 1_000,
    discountAmount: 100,
    deliveryAmount: 50,
    taxableAmount: 950,
    vatMode: "excluded",
    vatRate: 18,
    vatAmount: 171,
    totalAmount: 1_121
  });
});

test("qiymətə daxil olan ƏDV yekuna ikinci dəfə əlavə edilmir", () => {
  const totals = calculateCommercialProposalTotals({
    subtotal: 118,
    vatMode: "included",
    vatRate: 18
  });
  assert.equal(totals.vatAmount, 18);
  assert.equal(totals.totalAmount, 118);
});

test("təklif nömrəsi və etibarlılıq vəziyyəti Bakı vaxtına görə formalaşır", () => {
  const date = new Date("2026-08-03T12:00:00.000Z");
  assert.equal(formatCommercialProposalNumber(42, date), "KT-2026-000042");
  assert.equal(effectiveProposalStatus("issued", "2026-08-02", date), "expired");
  assert.equal(effectiveProposalStatus("issued", "2026-08-03", date), "issued");
  assert.equal(effectiveProposalStatus("accepted", "2026-08-01", date), "accepted");
});
