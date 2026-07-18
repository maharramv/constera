import { requireRole } from "../_lib/auth.js";
import { query } from "../_lib/db.js";
import { assertMethod, sendJson, withApiErrors } from "../_lib/http.js";
import { parseLimit, text } from "../_lib/validation.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  await requireRole(req, ["super_admin", "admin", "sales"]);
  const limit = parseLimit(req.query.limit, 100, 500);
  const entityType = text(req.query.entityType, { max: 120 });
  const action = text(req.query.action, { max: 120 });
  const values = [];
  const where = [];
  if (entityType) {
    values.push(entityType);
    where.push(`a.entity_type = $${values.length}`);
  }
  if (action) {
    values.push(action);
    where.push(`a.action = $${values.length}`);
  }
  values.push(limit);
  const rows = await query(
    `SELECT a.id, a.actor_id, u.name AS actor_name, u.email AS actor_email,
            a.action, a.entity_type, a.entity_id, a.details, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY a.created_at DESC LIMIT $${values.length}`,
    values
  );
  return sendJson(res, 200, { ok: true, data: rows });
});
