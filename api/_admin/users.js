import { randomBytes, randomUUID } from "node:crypto";
import { availableRoles, hashPassword, requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { email, oneOf, parseLimit, text } from "../_lib/validation.js";

const editableStatuses = ["active", "invited", "suspended"];
const lowerRoles = ["sales", "supplier", "customer"];

const mapUser = (row) => ({
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
  createdAt: row.created_at
});

const assertCanManageRole = (actor, targetRole) => {
  if (actor.role === "super_admin") return;
  if (!lowerRoles.includes(targetRole)) {
    throw new ApiError(403, "permission_denied", "Administrator yalnız satış, təchizatçı və müştəri rollarını idarə edə bilər.");
  }
};

const assertSuperAdminContinuity = async (target, nextRole, nextStatus) => {
  if (target.role !== "super_admin" || (nextRole === "super_admin" && nextStatus === "active")) return;
  const rows = await query("SELECT count(*)::int AS count FROM users WHERE role = 'super_admin' AND status = 'active'");
  if ((rows[0]?.count || 0) <= 1) {
    throw new ApiError(409, "last_super_admin", "Son aktiv super administratoru dayandırmaq və ya rolunu dəyişmək olmaz.");
  }
};

const createTemporaryPassword = () => `${randomBytes(9).toString("base64url")}Aa7!`;

export default withApiErrors(async (req, res) => {
  const actor = await requireRole(req, ["super_admin", "admin"]);
  if (req.method === "GET") {
    const limit = parseLimit(req.query.limit, 100, 500);
    const rows = await query(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.company_id, u.must_change_password,
              u.password_changed_at, u.last_login_at, u.created_at, c.name AS company_name
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id
        ORDER BY u.created_at DESC
        LIMIT $1`,
      [limit]
    );
    return sendJson(res, 200, { ok: true, data: rows.map(mapUser) });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 40_000);

  if (req.method === "POST") {
    const role = oneOf(body.role, availableRoles, "customer", "Rol");
    assertCanManageRole(actor, role);
    const userEmail = email(body.email);
    const name = text(body.name, { field: "Ad", required: true, min: 2, max: 120 });
    const status = oneOf(body.status, editableStatuses, "invited", "Status");
    const temporaryPassword = text(body.temporaryPassword, { max: 128 }) || createTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const duplicate = await query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [userEmail]);
    if (duplicate[0]) throw new ApiError(409, "duplicate_user", "Bu e-poçtla istifadəçi artıq mövcuddur.");
    let companyId = text(body.companyId, { max: 160 }) || null;
    const companyName = text(body.companyName, { max: 200 });
    if (role === "supplier" && !companyId && !companyName) {
      throw new ApiError(400, "supplier_company_required", "Təchizatçı hesabı üçün şirkət seçilməli və ya yaradılmalıdır.");
    }
    if (role === "supplier" && !companyId && companyName) {
      const linkedSupplier = await query(
        "SELECT id FROM suppliers WHERE lower(name) = lower($1) AND company_id IS NOT NULL LIMIT 1",
        [companyName]
      );
      if (linkedSupplier[0]) {
        throw new ApiError(409, "supplier_company_conflict", "Bu adlı təchizatçı artıq başqa şirkət hesabına bağlıdır.");
      }
    }
    if (!companyId && companyName) {
      companyId = `com-${randomUUID()}`;
      const companyType = role === "supplier" ? "supplier" : role === "customer" ? "customer" : "internal";
      await query(
        "INSERT INTO companies (id, name, company_type, contact_email) VALUES ($1, $2, $3, $4)",
        [companyId, companyName, companyType, userEmail]
      );
    }
    let resolvedCompanyName = companyName;
    if (companyId && !resolvedCompanyName) {
      const companies = await query("SELECT name FROM companies WHERE id = $1 LIMIT 1", [companyId]);
      resolvedCompanyName = companies[0]?.name || "";
    }
    if (role === "supplier" && companyId && resolvedCompanyName) {
      const conflicting = await query(
        "SELECT id, company_id FROM suppliers WHERE lower(name) = lower($1) AND company_id IS NOT NULL AND company_id <> $2 LIMIT 1",
        [resolvedCompanyName, companyId]
      );
      if (conflicting[0]) throw new ApiError(409, "supplier_company_conflict", "Bu adlı təchizatçı başqa şirkət hesabına bağlıdır.");
    }
    const id = `usr-${randomUUID()}`;
    try {
      const rows = await query(
        `INSERT INTO users (
           id, company_id, email, name, password_hash, role, status, must_change_password, password_changed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, now())
         RETURNING id, name, email, role, status, company_id, must_change_password,
                   password_changed_at, last_login_at, created_at`,
        [id, companyId, userEmail, name, passwordHash, role, status]
      );
      if (role === "supplier" && companyId) {
        const linked = await query("SELECT id FROM suppliers WHERE company_id = $1 LIMIT 1", [companyId]);
        if (!linked[0]) {
          const named = await query("SELECT id, company_id FROM suppliers WHERE lower(name) = lower($1) LIMIT 1", [resolvedCompanyName || name]);
          if (named[0]) {
            await query("UPDATE suppliers SET company_id = $2, contact = COALESCE(contact, $3), updated_at = now() WHERE id = $1", [named[0].id, companyId, userEmail]);
          } else {
            await query(
              `INSERT INTO suppliers (id, company_id, name, supplier_type, status, region, contact)
               VALUES ($1, $2, $3, 'Təchizatçı', 'Aktiv', 'Azərbaycan', $4)`,
              [`sup-${randomUUID()}`, companyId, resolvedCompanyName || name, userEmail]
            );
          }
        }
      }
      await recordAudit({ actorId: actor.id, action: "create", entityType: "user", entityId: id, details: { role, status } });
      return sendJson(res, 201, {
        ok: true,
        data: { ...mapUser({ ...rows[0], company_name: resolvedCompanyName || null }), temporaryPassword }
      });
    } catch (error) {
      if (error?.code === "23505") throw new ApiError(409, "duplicate_user", "Bu e-poçtla istifadəçi artıq mövcuddur.");
      if (error?.code === "23503") throw new ApiError(400, "company_not_found", "Seçilmiş şirkət tapılmadı.");
      throw error;
    }
  }

  const id = text(body.id || req.query.id, { field: "İstifadəçi ID-si", required: true, max: 160 });
  const existingRows = await query(
    "SELECT u.*, c.name AS company_name FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.id = $1 LIMIT 1",
    [id]
  );
  const existing = existingRows[0];
  if (!existing) throw new ApiError(404, "user_not_found", "İstifadəçi tapılmadı.");
  assertCanManageRole(actor, existing.role);

  if (body.action === "reset_password") {
    const temporaryPassword = text(body.temporaryPassword, { max: 128 }) || createTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await query(
      `UPDATE users
          SET password_hash = $2, must_change_password = true, password_changed_at = now(), updated_at = now()
        WHERE id = $1`,
      [id, passwordHash]
    );
    await query("DELETE FROM sessions WHERE user_id = $1", [id]);
    await recordAudit({ actorId: actor.id, action: "reset_password", entityType: "user", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, temporaryPassword, mustChangePassword: true } });
  }

  const role = oneOf(body.role ?? existing.role, availableRoles, existing.role, "Rol");
  const status = oneOf(body.status ?? existing.status, editableStatuses, existing.status, "Status");
  assertCanManageRole(actor, role);
  if (id === actor.id && (status !== "active" || role !== actor.role)) {
    throw new ApiError(409, "self_lockout", "Öz aktiv hesabını dayandırmaq və ya rolunu dəyişmək olmaz.");
  }
  await assertSuperAdminContinuity(existing, role, status);
  const name = text(body.name ?? existing.name, { field: "Ad", required: true, min: 2, max: 120 });
  await query("UPDATE users SET name = $2, role = $3, status = $4, updated_at = now() WHERE id = $1", [id, name, role, status]);
  if (status !== "active") await query("DELETE FROM sessions WHERE user_id = $1", [id]);
  await recordAudit({ actorId: actor.id, action: "update", entityType: "user", entityId: id, details: { role, status } });
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.company_id, u.must_change_password,
            u.password_changed_at, u.last_login_at, u.created_at, c.name AS company_name
       FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.id = $1`,
    [id]
  );
  return sendJson(res, 200, { ok: true, data: mapUser(rows[0]) });
});
