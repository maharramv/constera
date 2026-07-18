import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
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
import { deliverNotificationNow } from "./_lib/notifications.js";
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
    status: user.status || "active",
    mustChangePassword: Boolean(user.mustChangePassword),
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

  if (action === "request-reset") {
    const userEmail = email(body.email);
    const rows = await query(
      "SELECT id, name, email FROM users WHERE lower(email) = lower($1) AND status = 'active' LIMIT 1",
      [userEmail]
    );
    const user = rows[0];
    await query("DELETE FROM password_reset_tokens WHERE expires_at <= now() OR used_at IS NOT NULL");
    if (user && process.env.EMAIL_WEBHOOK_URL) {
      const recent = await query(
        "SELECT count(*)::int AS count FROM password_reset_tokens WHERE user_id = $1 AND created_at > now() - interval '1 hour'",
        [user.id]
      );
      if ((recent[0]?.count || 0) < 3) {
        const token = randomBytes(32).toString("base64url");
        const resetId = `rst-${randomUUID()}`;
        await query(
          `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
           VALUES ($1, $2, $3, now() + interval '30 minutes')`,
          [resetId, user.id, hashOpaque(token)]
        );
        const origin = String(process.env.APP_ORIGIN || "https://constera.az").replace(/\/$/, "");
        const resetUrl = `${origin}/login.html?reset=${encodeURIComponent(token)}`;
        try {
          await deliverNotificationNow({
            channel: "email",
            recipient: user.email,
            subject: "ConstEra şifrəsinin bərpası",
            body: `Salam, ${user.name}. Şifrəni 30 dəqiqə ərzində bu keçiddən yenilə: ${resetUrl}`,
            templateKey: "password_reset",
            payload: { resetUrl, expiresInMinutes: 30 }
          });
          await recordAudit({ actorId: user.id, action: "request_password_reset", entityType: "user", entityId: user.id });
        } catch {
          await query("DELETE FROM password_reset_tokens WHERE id = $1", [resetId]);
        }
      }
    }
    return sendJson(res, 200, {
      ok: true,
      message: "Hesab mövcuddursa, şifrə bərpası təlimatı göndərildi."
    });
  }

  if (action === "reset-password") {
    const token = text(body.token, { field: "Bərpa açarı", required: true, max: 200 });
    const passwordHash = await hashPassword(body.password);
    const rows = await query(
      `WITH valid_token AS (
         UPDATE password_reset_tokens
            SET used_at = now()
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
          RETURNING user_id
       )
       UPDATE users u
          SET password_hash = $2, must_change_password = false,
              password_changed_at = now(), updated_at = now()
         FROM valid_token v
        WHERE u.id = v.user_id AND u.status = 'active'
        RETURNING u.id, u.name, u.email`,
      [hashOpaque(token), passwordHash]
    );
    const user = rows[0];
    if (!user) throw new ApiError(400, "reset_token_invalid", "Bərpa keçidi yanlışdır və ya vaxtı bitib.");
    await query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
    await recordAudit({ actorId: user.id, action: "reset_password", entityType: "user", entityId: user.id });
    return sendJson(res, 200, { ok: true, message: "Şifrə yeniləndi. Yeni şifrə ilə daxil ola bilərsən." });
  }

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
       INSERT INTO users (id, company_id, email, name, password_hash, role, password_changed_at)
       SELECT $3, company.id, $4, $5, $6, 'super_admin', now() FROM company`,
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
      `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.status, u.must_change_password,
              u.company_id, c.name AS company_name
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
      status: user.status,
      mustChangePassword: user.must_change_password,
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
