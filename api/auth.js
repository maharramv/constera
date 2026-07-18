import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  assertLoginAllowed,
  createSession,
  destroySession,
  getSessionUser,
  hashOpaque,
  hashPassword,
  recordLoginAttempt,
  verifyPassword
} from "./_lib/auth.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, getClientIp, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { email, text } from "./_lib/validation.js";

const tokenMatches = (provided, expected) => {
  const left = Buffer.from(String(provided || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
};

const sessionResponse = (user) => ({
  ok: true,
  authenticated: Boolean(user),
  user: user ? {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    companyName: user.companyName
  } : null
});

export default withApiErrors(async (req, res) => {
  const action = String(req.query.action || (req.method === "GET" ? "session" : ""));

  if (action === "session") {
    assertMethod(req, ["GET"]);
    return sendJson(res, 200, sessionResponse(await getSessionUser(req)));
  }

  assertMethod(req, ["POST"]);
  assertSameOrigin(req);
  const body = await readJson(req, 20_000);

  if (action === "setup") {
    const setupToken = process.env.ADMIN_SETUP_TOKEN || "";
    if (setupToken.length < 32) {
      throw new ApiError(503, "setup_not_configured", "ADMIN_SETUP_TOKEN ən azı 32 simvol ilə qurulmalıdır.");
    }
    const provided = req.headers.authorization?.replace(/^Bearer\s+/i, "") || body.setupToken;
    if (!tokenMatches(provided, setupToken)) throw new ApiError(403, "setup_token_invalid", "Quraşdırma açarı düzgün deyil.");

    const existing = await query("SELECT count(*)::int AS count FROM users");
    if ((existing[0]?.count || 0) > 0) throw new ApiError(409, "setup_complete", "İlk administrator artıq yaradılıb.");

    const userId = `usr-${randomUUID()}`;
    const companyId = `com-${randomUUID()}`;
    const userEmail = email(body.email);
    const name = text(body.name, { field: "Ad", required: true, min: 2, max: 120 });
    const passwordHash = await hashPassword(body.password);
    await query(
      `WITH company AS (
         INSERT INTO companies (id, name, company_type) VALUES ($1, $2, 'internal') RETURNING id
       )
       INSERT INTO users (id, company_id, email, name, password_hash, role)
       SELECT $3, company.id, $4, $5, $6, 'super_admin' FROM company`,
      [companyId, "ConstEra", userId, userEmail, name, passwordHash]
    );
    await createSession(req, res, userId);
    await recordAudit({ actorId: userId, action: "setup", entityType: "user", entityId: userId });
    return sendJson(res, 201, sessionResponse({ id: userId, name, email: userEmail, role: "super_admin", companyId, companyName: "ConstEra" }));
  }

  if (action === "login") {
    const userEmail = email(body.email);
    const password = text(body.password, { field: "Şifrə", required: true, max: 128 });
    const identityHash = hashOpaque(`${userEmail}:${getClientIp(req)}`);
    await assertLoginAllowed(identityHash);
    const rows = await query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.company_id, c.name AS company_name
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id
        WHERE lower(u.email) = lower($1) AND u.status = 'active'
        LIMIT 1`,
      [userEmail]
    );
    const user = rows[0];
    const valid = user ? await verifyPassword(password, user.password_hash) : false;
    await recordLoginAttempt(identityHash, valid);
    if (!valid) throw new ApiError(401, "invalid_credentials", "E-poçt və ya şifrə düzgün deyil.");

    await query("UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1", [user.id]);
    await query("DELETE FROM sessions WHERE expires_at <= now()");
    await createSession(req, res, user.id);
    await recordAudit({ actorId: user.id, action: "login", entityType: "session", details: { ipHash: hashOpaque(getClientIp(req)) } });
    return sendJson(res, 200, sessionResponse({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.company_id,
      companyName: user.company_name
    }));
  }

  if (action === "logout") {
    const user = await getSessionUser(req);
    await destroySession(req, res);
    if (user) await recordAudit({ actorId: user.id, action: "logout", entityType: "session", entityId: user.sessionId });
    return sendJson(res, 200, { ok: true, authenticated: false, user: null });
  }

  throw new ApiError(404, "unknown_action", "Auth əməliyyatı tapılmadı.");
});
