import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ApiError, getClientIp } from "./http.js";
import { query } from "./db.js";

const scrypt = promisify(scryptCallback);
const sessionDays = 7;
const allowedRoles = ["super_admin", "admin", "sales", "supplier", "customer"];

export const getCookieName = () => process.env.SESSION_COOKIE_NAME || "constera_session";
export const hashOpaque = (value) => createHash("sha256").update(String(value)).digest("hex");

export const hashPassword = async (password) => {
  const value = String(password || "");
  if (value.length < 12 || value.length > 128) {
    throw new ApiError(400, "weak_password", "Şifrə 12-128 simvol aralığında olmalıdır.");
  }
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(value, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString("base64url")}`;
};

export const verifyPassword = async (password, stored) => {
  const [algorithm, salt, encoded] = String(stored || "").split("$");
  if (algorithm !== "scrypt" || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, "base64url");
  const actual = Buffer.from(await scrypt(String(password || ""), salt, expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const parseCookies = (header) => String(header || "").split(";").reduce((cookies, part) => {
  const separator = part.indexOf("=");
  if (separator < 0) return cookies;
  const key = part.slice(0, separator).trim();
  const value = part.slice(separator + 1).trim();
  if (key) cookies[key] = decodeURIComponent(value);
  return cookies;
}, {});

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  companyId: user.company_id || null,
  companyName: user.company_name || null
});

export const getSessionUser = async (req) => {
  const token = parseCookies(req.headers.cookie)[getCookieName()];
  if (!token) return null;
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.role, u.company_id, c.name AS company_name, s.id AS session_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN companies c ON c.id = u.company_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'
      LIMIT 1`,
    [hashOpaque(token)]
  );
  return rows[0] ? { ...publicUser(rows[0]), sessionId: rows[0].session_id } : null;
};

export const requireRole = async (req, roles = allowedRoles) => {
  const user = await getSessionUser(req);
  if (!user) throw new ApiError(401, "authentication_required", "Bu əməliyyat üçün daxil olmaq lazımdır.");
  if (!roles.includes(user.role)) throw new ApiError(403, "permission_denied", "Bu əməliyyat üçün icazən yoxdur.");
  return user;
};

export const createSession = async (req, res, userId) => {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays * 86_400_000);
  const secure = process.env.NODE_ENV === "production" || String(req.headers["x-forwarded-proto"] || "").includes("https");
  await query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      `ses-${randomUUID()}`,
      userId,
      hashOpaque(token),
      expiresAt.toISOString(),
      String(req.headers["user-agent"] || "").slice(0, 500),
      hashOpaque(getClientIp(req))
    ]
  );
  res.setHeader(
    "Set-Cookie",
    `${getCookieName()}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionDays * 86_400}${secure ? "; Secure" : ""}`
  );
};

export const destroySession = async (req, res) => {
  const token = parseCookies(req.headers.cookie)[getCookieName()];
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [hashOpaque(token)]);
  res.setHeader("Set-Cookie", `${getCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
};

export const assertLoginAllowed = async (identityHash) => {
  const rows = await query(
    `SELECT count(*)::int AS failures
       FROM auth_attempts
      WHERE identity_hash = $1 AND succeeded = false AND created_at > now() - interval '15 minutes'`,
    [identityHash]
  );
  if ((rows[0]?.failures || 0) >= 10) {
    throw new ApiError(429, "too_many_attempts", "Çox sayda uğursuz cəhd edilib. 15 dəqiqə sonra yenidən yoxla.");
  }
};

export const recordLoginAttempt = async (identityHash, succeeded) => {
  await query("INSERT INTO auth_attempts (identity_hash, succeeded) VALUES ($1, $2)", [identityHash, succeeded]);
};

export const validateRole = (role) => allowedRoles.includes(role) ? role : "customer";
