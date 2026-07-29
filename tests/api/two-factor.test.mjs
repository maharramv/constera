import assert from "node:assert/strict";
import test from "node:test";
import {
  findRecoveryCode,
  generateRecoveryCodes,
  openTwoFactorSecret,
  recoveryCodeHash,
  sealTwoFactorSecret,
  verifyTotp
} from "../../api/_lib/two-factor.js";

test("TOTP RFC vektoru və vaxt pəncərəsi düzgün yoxlanılır", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(verifyTotp(secret, "287082", 59_000), true);
  assert.equal(verifyTotp(secret, "287082", 89_000), true);
  assert.equal(verifyTotp(secret, "000000", 59_000), false);
});

test("2FA sirri şifrəli saxlanılır və bərpa kodu bir dəfə tapılır", () => {
  const previous = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  process.env.TWO_FACTOR_ENCRYPTION_KEY = "test-only-two-factor-key-with-more-than-32-characters";
  try {
    const sealed = sealTwoFactorSecret("JBSWY3DPEHPK3PXP");
    assert.notEqual(sealed, "JBSWY3DPEHPK3PXP");
    assert.equal(openTwoFactorSecret(sealed), "JBSWY3DPEHPK3PXP");
    const codes = generateRecoveryCodes(4);
    assert.equal(codes.length, 4);
    assert.equal(new Set(codes).size, 4);
    const hashes = codes.map(recoveryCodeHash);
    assert.equal(findRecoveryCode(codes[2], hashes), 2);
    assert.equal(findRecoveryCode("AAAA-BBBB", hashes), -1);
  } finally {
    if (previous === undefined) delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    else process.env.TWO_FACTOR_ENCRYPTION_KEY = previous;
  }
});
