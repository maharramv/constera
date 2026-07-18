import { hashPassword, requireRole, verifyPassword } from "./_lib/auth.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { text } from "./_lib/validation.js";

const mapAccount = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  status: row.status,
  companyId: row.company_id || null,
  companyName: row.company_name || null,
  mustChangePassword: Boolean(row.must_change_password),
  passwordChangedAt: row.password_changed_at,
  lastLoginAt: row.last_login_at,
  activeSessions: Number(row.active_sessions || 0)
});

const loadAccount = async (userId) => {
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.company_id, u.must_change_password,
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

  if (action === "change_password") {
    const currentPassword = text(body.currentPassword, { field: "Cari şifrə", required: true, max: 128 });
    const newPassword = text(body.newPassword, { field: "Yeni şifrə", required: true, max: 128 });
    if (newPassword !== String(body.confirmPassword || "")) {
      throw new ApiError(400, "password_mismatch", "Yeni şifrə və təsdiq eyni deyil.");
    }
    const rows = await query("SELECT password_hash FROM users WHERE id = $1 LIMIT 1", [user.id]);
    if (!rows[0] || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
      throw new ApiError(401, "current_password_invalid", "Cari şifrə düzgün deyil.");
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
    return sendJson(res, 200, { ok: true, data: mapAccount(await loadAccount(user.id)) });
  }

  if (action === "revoke_other_sessions") {
    const rows = await query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2 RETURNING id", [user.id, user.sessionId]);
    await recordAudit({
      actorId: user.id,
      action: "revoke_sessions",
      entityType: "session",
      details: { revoked: rows.length }
    });
    return sendJson(res, 200, { ok: true, data: { revoked: rows.length } });
  }

  if (action !== "profile") throw new ApiError(400, "unknown_action", "Hesab əməliyyatı tanınmadı.");
  const name = text(body.name, { field: "Ad", required: true, min: 2, max: 120 });
  await query("UPDATE users SET name = $2, updated_at = now() WHERE id = $1", [user.id, name]);
  await recordAudit({ actorId: user.id, action: "update_profile", entityType: "user", entityId: user.id });
  return sendJson(res, 200, { ok: true, data: mapAccount(await loadAccount(user.id)) });
});
