import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { deliverPendingNotifications, queueNotification } from "../_lib/notifications.js";
import { oneOf, parseLimit, text } from "../_lib/validation.js";

const channels = ["in_app", "email", "whatsapp"];
const statuses = ["pending", "processing", "sent", "failed", "cancelled"];

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, ["super_admin", "admin", "sales"]);
  if (req.method === "GET") {
    const limit = parseLimit(req.query.limit, 100, 500);
    const status = text(req.query.status, { max: 40 });
    const values = [];
    const where = [];
    if (status) {
      values.push(oneOf(status, statuses, "pending", "Status"));
      where.push(`status = $${values.length}`);
    }
    values.push(limit);
    const rows = await query(
      `SELECT id, user_id, channel, recipient, subject, body, template_key, payload,
              status, attempts, last_error, available_at, sent_at, created_at
         FROM notifications ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC LIMIT $${values.length}`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 40_000);
  if (req.method === "POST" && body.action === "process") {
    const result = await deliverPendingNotifications(body.limit);
    await recordAudit({ actorId: user.id, action: "process", entityType: "notification", details: result });
    return sendJson(res, 200, { ok: true, data: result });
  }
  if (req.method === "POST") {
    const channel = oneOf(body.channel, channels, "in_app", "Kanal");
    const id = await queueNotification({
      userId: text(body.userId, { max: 160 }) || null,
      channel,
      recipient: text(body.recipient, { max: 300 }) || null,
      subject: text(body.subject, { max: 240 }) || null,
      body: text(body.body, { field: "Bildiriş mətni", required: true, max: 3_000 }),
      templateKey: text(body.templateKey, { max: 120 }) || null,
      payload: body.payload && typeof body.payload === "object" ? body.payload : {}
    });
    await recordAudit({ actorId: user.id, action: "queue", entityType: "notification", entityId: id, details: { channel } });
    return sendJson(res, 201, { ok: true, data: { id, status: "pending" } });
  }

  const id = text(body.id || req.query.id, { field: "Bildiriş ID-si", required: true, max: 160 });
  const action = oneOf(body.action, ["retry", "cancel"], "retry", "Əməliyyat");
  const rows = await query(
    action === "retry"
      ? "UPDATE notifications SET status = 'pending', attempts = 0, last_error = NULL, available_at = now(), updated_at = now() WHERE id = $1 RETURNING id"
      : "UPDATE notifications SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING id",
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "notification_not_found", "Bildiriş tapılmadı.");
  await recordAudit({ actorId: user.id, action, entityType: "notification", entityId: id });
  return sendJson(res, 200, { ok: true, data: { id, status: action === "retry" ? "pending" : "cancelled" } });
});
