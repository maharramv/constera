import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../../api/_lib/http.js";
import { POLICY_VERSION, assertPolicyConsent } from "../../api/_lib/policy-consent.js";

test("hüquqi razılıq yalnız açıq qəbul dəyəri ilə təsdiqlənir", () => {
  assert.deepEqual(assertPolicyConsent({ legalAccepted: true }), {
    legalAccepted: true,
    policyVersion: POLICY_VERSION
  });
  assert.equal(assertPolicyConsent({ legalAccepted: "true" }).legalAccepted, true);
  assert.equal(assertPolicyConsent({ consent: "on" }, { legacyField: "consent" }).legalAccepted, true);
});

test("boş və ya rədd edilmiş hüquqi razılıq sorğunu dayandırır", () => {
  for (const value of [undefined, "", false, "false", "0"]) {
    assert.throws(
      () => assertPolicyConsent({ legalAccepted: value }),
      (error) => error instanceof ApiError && error.code === "policy_consent_required"
    );
  }
});

test("siyasət versiyası sabit tarixlə audit sübutuna bağlanır", () => {
  assert.match(POLICY_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});
