import assert from "node:assert/strict";
import test from "node:test";
import { calculatePaymentCertificate, canTransitionExecution, lineAmount, progressPercent } from "../../api/_lib/project-execution.js";

test("Forma 2/3 məbləği avans, zəmanət saxlaması və ƏDV-ni serverdə hesablayır", () => {
  const result = calculatePaymentCertificate({
    workAmount: 10_000,
    contractAmount: 100_000,
    advancePercent: 10,
    advanceRecoveryPercent: 20,
    retentionPercent: 5,
    taxPercent: 18,
    priorAdvanceRecovery: 1_000,
    otherDeductions: 250
  });
  assert.equal(result.advanceTotal, 10_000);
  assert.equal(result.advanceRecoveryAmount, 2_000);
  assert.equal(result.retentionAmount, 500);
  assert.equal(result.taxAmount, 1_800);
  assert.equal(result.netPayable, 9_050);
});

test("yekun akt saxlanmış zəmanəti ikinci ƏDV hesablamadan azad edir", () => {
  const result = calculatePaymentCertificate({
    workAmount: 0,
    contractAmount: 80_000,
    priorRetention: 3_500,
    priorRetentionRelease: 500,
    releaseRetention: true,
    taxPercent: 18
  });
  assert.equal(result.retentionReleaseAmount, 3_000);
  assert.equal(result.taxAmount, 0);
  assert.equal(result.netPayable, 3_000);
});

test("icra statusları yalnız iki tərəfli təsdiq ardıcıllığı ilə dəyişir", () => {
  assert.equal(canTransitionExecution("measurement", "draft", "submitted"), true);
  assert.equal(canTransitionExecution("measurement", "draft", "accepted"), false);
  assert.equal(canTransitionExecution("certificate", "submitted", "certified"), true);
  assert.equal(canTransitionExecution("certificate", "draft", "paid"), false);
  assert.equal(canTransitionExecution("contract", "completed", "active"), false);
});

test("BOQ sətir məbləği və irəliləyiş faizi deterministikdir", () => {
  assert.equal(lineAmount(12.345, 18.7), 230.85);
  assert.equal(progressPercent(25_000, 100_000), 25);
  assert.equal(progressPercent(120_000, 100_000), 100);
});
