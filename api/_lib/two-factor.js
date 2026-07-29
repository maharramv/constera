import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { ApiError } from "./http.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const keyMaterial = () => String(process.env.TWO_FACTOR_ENCRYPTION_KEY || "");

export const twoFactorReadiness = () => keyMaterial().length >= 32;

const encryptionKey = () => {
  if (!twoFactorReadiness()) {
    throw new ApiError(
      503,
      "two_factor_not_configured",
      "İki mərhələli giriş üçün TWO_FACTOR_ENCRYPTION_KEY qurulmalıdır."
    );
  }
  return createHash("sha256").update(keyMaterial()).digest();
};

export const encodeBase32 = (input) => {
  const bytes = Buffer.from(input);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
};

export const decodeBase32 = (input) => {
  const source = String(input || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of source) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const codeAt = (secret, timestamp) => {
  const counter = Math.floor(Number(timestamp) / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (
    ((digest[offset] & 127) << 24)
    | ((digest[offset + 1] & 255) << 16)
    | ((digest[offset + 2] & 255) << 8)
    | (digest[offset + 3] & 255)
  ) % 1_000_000;
  return String(value).padStart(6, "0");
};

const safeEqual = (left, right) => {
  const first = Buffer.from(String(left || ""));
  const second = Buffer.from(String(right || ""));
  return first.length > 0 && first.length === second.length && timingSafeEqual(first, second);
};

export const verifyTotp = (secret, code, now = Date.now()) => {
  const candidate = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(candidate)) return false;
  return [-1, 0, 1].some((offset) => safeEqual(codeAt(secret, now + offset * 30_000), candidate));
};

export const sealTwoFactorSecret = (secret) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
};

export const openTwoFactorSecret = (sealed) => {
  const [version, ivValue, tagValue, encryptedValue] = String(sealed || "").split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new ApiError(500, "two_factor_secret_invalid", "İki mərhələli giriş açarı oxunmadı.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new ApiError(500, "two_factor_secret_invalid", "İki mərhələli giriş açarı açıla bilmədi.");
  }
};

export const recoveryCodeHash = (code) =>
  createHash("sha256").update(String(code || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase()).digest("hex");

export const generateRecoveryCodes = (count = 10) =>
  Array.from({ length: count }, () => {
    const value = encodeBase32(randomBytes(5)).slice(0, 8);
    return `${value.slice(0, 4)}-${value.slice(4)}`;
  });

export const findRecoveryCode = (code, storedHashes) => {
  const hash = recoveryCodeHash(code);
  return (Array.isArray(storedHashes) ? storedHashes : []).findIndex((stored) => safeEqual(stored, hash));
};

export const createTwoFactorSetup = ({ email, issuer = "ConstEra" }) => {
  const secret = encodeBase32(randomBytes(20));
  const label = `${issuer}:${String(email || "").trim().toLowerCase()}`;
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return { secret, otpauthUrl, sealedSecret: sealTwoFactorSecret(secret) };
};
