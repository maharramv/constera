import { randomBytes, randomUUID } from "node:crypto";
import { hashOpaque, hashPassword, requireRole, verifyPassword } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { recordSecurityEvent } from "../_lib/security-events.js";
import {
  createTwoFactorSetup,
  findRecoveryCode,
  generateRecoveryCodes,
  openTwoFactorSecret,
  recoveryCodeHash,
  twoFactorReadiness,
  verifyTotp
} from "../_lib/two-factor.js";
import { text } from "../_lib/validation.js";

const mapAccount = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  status: row.status,
  companyId: row.company_id || null,
  companyName: row.company_name || null,
  mustChangePassword: Boolean(row.must_change_password),
  twoFactorEnabled: Boolean(row.two_factor_enabled),
  twoFactorReady: twoFactorReadiness(),
  recoveryCodesRemaining: Array.isArray(row.two_factor_recovery_codes)
    ? row.two_factor_recovery_codes.length
    : 0,
  twoFactorEnabledAt: row.two_factor_enabled_at,
  passwordChangedAt: row.password_changed_at,
  lastLoginAt: row.last_login_at,
  activeSessions: Number(row.active_sessions || 0)
});

const loadAccount = async (userId) => {
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.company_id, u.must_change_password,
            u.two_factor_enabled, u.two_factor_recovery_codes, u.two_factor_enabled_at,
            u.password_changed_at, u.last_login_at, c.name AS company_name,
            count(s.id) FILTER (WHERE s.expires_at > now())::int AS active_sessions
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       LEFT JOIN sessions s ON s.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id, c.name
      LIMIT 1`,
    [userId]
  );
  if (!rows[0]) throw new ApiError(404, "account_not_found", "Hesab tapılmadı.");
  return rows[0];
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, undefined, { allowPasswordChange: true });
  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, data: mapAccount(await loadAccount(user.id)) });
  }

  assertMethod(req, ["PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 30_000);
  const action = text(body.action, { max: 80 }) || "profile";

  const verifyCurrentPassword = async () => {
    const currentPassword = text(body.currentPassword, { field: "Cari şifrə", required: true, max: 128 });
    const rows = await query(
      "SELECT password_hash, two_factor_enabled, two_factor_secret, two_factor_recovery_codes FROM users WHERE id = $1 LIMIT 1",
      [user.id]
    );
    if (!rows[0] || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
      throw new ApiError(401, "current_password_invalid", "Cari şifrə düzgün deyil.");
    }
    return { currentPassword, account: rows[0] };
  };

  if (action === "change_password") {
    const { currentPassword } = await verifyCurrentPassword();
    const newPassword = text(body.newPassword, { field: "Yeni şifrə", required: true, max: 128 });
    if (newPassword !== String(body.confirmPassword || "")) {
      throw new ApiError(400, "password_mismatch", "Yeni şifrə və təsdiq eyni deyil.");
    }
    if (currentPassword === newPassword) {
      throw new ApiError(400, "password_unchanged", "Yeni şifrə cari şifrədən fərqli olmalıdır.");
    }
    const passwordHash = await hashPassword(newPassword);
    await query(
      `UPDATE users
          SET password_hash = $2, must_change_password = false, password_changed_at = now(), updated_at = now()
        WHERE id = $1`,
      [user.id, passwordHash]
    );
    await query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [user.id, user.sessionId]);
    await recordAudit({ actorId: user.id, action: "change_password", entityType: "user", entityId: user.id });
    await recordSecurityEvent({
      req,
      userId: user.id,
      email: user.email,
      eventType: "sessions_revoked",
      succeeded: true,
      riskLevel: "medium",
      metadata: { reason: "password_changed" }
    });
    return sendJson(res, 200, { ok: true, data: mapAccount(await loadAccount(user.id)) });
  }

  if (action === "setup_2fa") {
    if (!twoFactorReadiness()) {
      throw new ApiError(503, "two_factor_not_configured", "İki mərhələli giriş serverdə hələ aktivləşdirilməyib.");
    }
    const { account } = await verifyCurrentPassword();
    if (account.two_factor_enabled) {
      throw new ApiError(409, "two_factor_already_enabled", "İki mərhələli giriş artıq aktivdir.");
    }
    await query(
      "DELETE FROM auth_challenges WHERE user_id = $1 AND challenge_type = 'setup_2fa'",
      [user.id]
    );
    const setup = createTwoFactorSetup({ email: user.email });
    const setupToken = randomBytes(32).toString("base64url");
    await query(
      `INSERT INTO auth_challenges (
         id, user_id, token_hash, challenge_type, payload, expires_at
       ) VALUES (
         $1, $2, $3, 'setup_2fa', $4::jsonb, now() + interval '10 minutes'
       )`,
      [
        `ach-${randomUUID()}`,
        user.id,
        hashOpaque(setupToken),
        JSON.stringify({ sealedSecret: setup.sealedSecret })
      ]
    );
    await recordAudit({ actorId: user.id, action: "start_2fa_setup", entityType: "user", entityId: user.id });
    return sendJson(res, 200, {
      ok: true,
      data: {
        setupToken,
        secret: setup.secret,
        otpauthUrl: setup.otpauthUrl,
        expiresInSeconds: 600
      }
    });
  }

  if (action === "confirm_2fa") {
    const setupToken = text(body.setupToken, { field: "Quraşdırma açarı", required: true, max: 200 });
    const code = text(body.code, { field: "Authenticator kodu", required: true, max: 20 });
    const rows = await query(
      `UPDATE auth_challenges
          SET attempts = attempts + 1
        WHERE token_hash = $1
          AND user_id = $2
          AND challenge_type = 'setup_2fa'
          AND consumed_at IS NULL
          AND expires_at > now()
          AND attempts < 10
      RETURNING id, payload`,
      [hashOpaque(setupToken), user.id]
    );
    const challenge = rows[0];
    const sealedSecret = challenge?.payload?.sealedSecret;
    if (!challenge || !sealedSecret) {
      throw new ApiError(400, "two_factor_setup_invalid", "Quraşdırma sessiyasının vaxtı bitib. Yenidən başla.");
    }
    const secret = openTwoFactorSecret(sealedSecret);
    if (!verifyTotp(secret, code)) {
      throw new ApiError(400, "two_factor_invalid", "Authenticator kodu düzgün deyil.");
    }
    const consumed = await query(
      `UPDATE auth_challenges SET consumed_at = now()
        WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
      [challenge.id]
    );
    if (!consumed[0]) {
      throw new ApiError(409, "two_factor_setup_used", "Bu quraşdırma təsdiqi artıq istifadə olunub.");
    }
    const recoveryCodes = generateRecoveryCodes();
    await query(
      `UPDATE users
          SET two_factor_enabled = true,
              two_factor_secret = $2,
              two_factor_recovery_codes = $3::jsonb,
              two_factor_enabled_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [user.id, sealedSecret, JSON.stringify(recoveryCodes.map(recoveryCodeHash))]
    );
    await query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [user.id, user.sessionId]);
    await recordAudit({ actorId: user.id, action: "enable_2fa", entityType: "user", entityId: user.id });
    return sendJson(res, 200, {
      ok: true,
      data: {
        account: mapAccount(await loadAccount(user.id)),
        recoveryCodes
      }
    });
  }

  if (action === "disable_2fa" || action === "regenerate_recovery_codes") {
    const { account } = await verifyCurrentPassword();
    if (!account.two_factor_secret) {
      throw new ApiError(409, "two_factor_not_enabled", "İki mərhələli giriş aktiv deyil.");
    }
    const code = text(body.code, { field: "Authenticator və ya bərpa kodu", required: true, max: 32 });
    const recoveryIndex = findRecoveryCode(code, account.two_factor_recovery_codes);
    if (!verifyTotp(openTwoFactorSecret(account.two_factor_secret), code) && recoveryIndex < 0) {
      throw new ApiError(401, "two_factor_invalid", "Authenticator və ya bərpa kodu düzgün deyil.");
    }
    if (action === "disable_2fa") {
      await query(
        `UPDATE users
            SET two_factor_enabled = false, two_factor_secret = NULL,
                two_factor_recovery_codes = '[]'::jsonb,
                two_factor_enabled_at = NULL, updated_at = now()
          WHERE id = $1`,
        [user.id]
      );
      await query("DELETE FROM auth_challenges WHERE user_id = $1", [user.id]);
      await query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [user.id, user.sessionId]);
      await recordAudit({ actorId: user.id, action: "disable_2fa", entityType: "user", entityId: user.id });
      return sendJson(res, 200, { ok: true, data: mapAccount(await loadAccount(user.id)) });
    }
    const recoveryCodes = generateRecoveryCodes();
    await query(
      "UPDATE users SET two_factor_recovery_codes = $2::jsonb, updated_at = now() WHERE id = $1",
      [user.id, JSON.stringify(recoveryCodes.map(recoveryCodeHash))]
    );
    await recordAudit({ actorId: user.id, action: "regenerate_2fa_recovery", entityType: "user", entityId: user.id });
    return sendJson(res, 200, {
      ok: true,
      data: {
        account: mapAccount(await loadAccount(user.id)),
        recoveryCodes
      }
    });
  }

  if (action === "revoke_other_sessions") {
    const rows = await query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2 RETURNING id", [user.id, user.sessionId]);
    await recordAudit({
      actorId: user.id,
      action: "revoke_sessions",
      entityType: "session",
      details: { revoked: rows.length }
    });
    await recordSecurityEvent({
      req,
      userId: user.id,
      email: user.email,
      eventType: "sessions_revoked",
      succeeded: true,
      riskLevel: "medium",
      metadata: { revoked: rows.length }
    });
    return sendJson(res, 200, { ok: true, data: { revoked: rows.length } });
  }

  if (action !== "profile") throw new ApiError(400, "unknown_action", "Hesab əməliyyatı tanınmadı.");
  const name = text(body.name, { field: "Ad", required: true, min: 2, max: 120 });
  await query("UPDATE users SET name = $2, updated_at = now() WHERE id = $1", [user.id, name]);
  await recordAudit({ actorId: user.id, action: "update_profile", entityType: "user", entityId: user.id });
  return sendJson(res, 200, { ok: true, data: mapAccount(await loadAccount(user.id)) });
});
