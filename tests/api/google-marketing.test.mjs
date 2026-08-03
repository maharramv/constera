import assert from "node:assert/strict";
import test from "node:test";
import {
  googleMarketingReadiness,
  normalizeGoogleMeasurementId,
  normalizeGoogleVerificationToken
} from "../../api/_lib/google-marketing.js";

test("Google marketinq açarları təhlükəsiz formatda yoxlanır", () => {
  assert.equal(normalizeGoogleMeasurementId("G-ABC12345"), "G-ABC12345");
  assert.equal(normalizeGoogleMeasurementId("UA-123"), "");
  assert.equal(normalizeGoogleVerificationToken("valid_verification-token_12345"), "valid_verification-token_12345");
  assert.equal(normalizeGoogleVerificationToken("<script>alert(1)</script>"), "");
});

test("marketinq hazırlığı məxfi açarı cavaba daxil etmir", () => {
  const previous = {
    id: process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID,
    secret: process.env.GOOGLE_ANALYTICS_API_SECRET,
    verification: process.env.GOOGLE_SEARCH_CONSOLE_VERIFICATION
  };
  process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-ABC12345";
  process.env.GOOGLE_ANALYTICS_API_SECRET = "very-private-secret";
  process.env.GOOGLE_SEARCH_CONSOLE_VERIFICATION = "valid_verification-token_12345";
  try {
    const readiness = googleMarketingReadiness();
    assert.equal(readiness.analytics, true);
    assert.equal(readiness.searchConsole, true);
    assert.equal(JSON.stringify(readiness).includes("very-private-secret"), false);
  } finally {
    if (previous.id === undefined) delete process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID;
    else process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID = previous.id;
    if (previous.secret === undefined) delete process.env.GOOGLE_ANALYTICS_API_SECRET;
    else process.env.GOOGLE_ANALYTICS_API_SECRET = previous.secret;
    if (previous.verification === undefined) delete process.env.GOOGLE_SEARCH_CONSOLE_VERIFICATION;
    else process.env.GOOGLE_SEARCH_CONSOLE_VERIFICATION = previous.verification;
  }
});
