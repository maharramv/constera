import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCriticalTwoFactor,
  criticalAdminTwoFactorRequired
} from "../../api/_lib/auth.js";

const withEnvironment = (values, callback) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  try {
    return callback();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
};

test("kritik admin yazmaları standart olaraq 2FA tələb edir", () =>
  withEnvironment({
    NODE_ENV: "development",
    ADMIN_CRITICAL_2FA_REQUIRED: undefined
  }, () => {
    assert.equal(criticalAdminTwoFactorRequired(), true);
    assert.throws(
      () => assertCriticalTwoFactor({ role: "admin", twoFactorEnabled: false }),
      (error) => error.code === "critical_two_factor_required"
    );
    assert.doesNotThrow(() => assertCriticalTwoFactor({ role: "admin", twoFactorEnabled: true }));
    assert.doesNotThrow(() => assertCriticalTwoFactor({ role: "supplier", twoFactorEnabled: false }));
  }));

test("lokal inkişafda siyasət açıq şəkildə aktiv və ya söndürülə bilir", () =>
  withEnvironment({
    NODE_ENV: "development",
    ADMIN_CRITICAL_2FA_REQUIRED: "true"
  }, () => {
    assert.equal(criticalAdminTwoFactorRequired(), true);
    process.env.ADMIN_CRITICAL_2FA_REQUIRED = "false";
    assert.equal(criticalAdminTwoFactorRequired(), false);
    assert.doesNotThrow(() => assertCriticalTwoFactor({ role: "super_admin", twoFactorEnabled: false }));
  }));
