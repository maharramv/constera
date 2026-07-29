import { createHash } from "node:crypto";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { validatePublicUrl } from "../_lib/catalog-quality.js";
import {
  deliverPendingNotifications,
  queueNotification,
  webPushReadiness
} from "../_lib/notifications.js";
import { oneOf, parseLimit, text } from "../_lib/validation.js";

const channels = ["in_app", "email", "whatsapp", "web_push"];
const statuses = ["pending", "processing", "sent", "failed", "cancelled"];
const adminRoles = ["super_admin", "admin", "sales"];

const subscriptionId = (endpoint) =>
  `wps-${createHash("sha256").update(endpoint).digest("hex").slice(0, 28)}`;

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req);
  if (req.method === "GET") {
    if (req.query.scope === "push") {
      const rows = await query(
        "SELECT count(*)::int AS count FROM web_push_subscriptions WHERE user_id = $1 AND status = 'active'",
        [user.id]
      );
      return sendJson(res, 200, {
        ok: true,
        data: {
          ready: webPushReadiness(),
          publicKey: webPushReadiness() ? process.env.VAPID_PUBLIC_KEY : "",
          subscriptions: Number(rows[0]?.count || 0)
        }
      });
    }
    if (req.query.scope === "mine") {
      const rows = await query(
        `SELECT id, channel, subject, body, template_key, payload, status, sent_at, created_at
           FROM notifications
          WHERE user_id = $1 AND channel IN ('in_app', 'web_push')
          ORDER BY created_at DESC
          LIMIT $2`,
        [user.id, parseLimit(req.query.limit, 100, 250)]
      );
      return sendJson(res, 200, { ok: true, data: rows });
    }
    if (!adminRoles.includes(user.role)) {
      throw new ApiError(403, "permission_denied", "Bu əməliyyat üçün icazən yoxdur.");
    }
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
  if (req.method === "POST" && body.action === "subscribe-push") {
    if (!webPushReadiness()) {
      throw new ApiError(503, "web_push_not_configured", "Brauzer bildirişləri serverdə hələ aktiv deyil.");
    }
    const endpoint = text(body.subscription?.endpoint, {
      field: "Push endpoint-i",
      required: true,
      max: 3_000
    });
    const checkedEndpoint = await validatePublicUrl(endpoint);
    if (!checkedEndpoint.ok) {
      throw new ApiError(400, "push_endpoint_invalid", checkedEndpoint.reason);
    }
    const p256dh = text(body.subscription?.keys?.p256dh, {
      field: "Push açarı",
      required: true,
      max: 500
    });
    const auth = text(body.subscription?.keys?.auth, {
      field: "Push təsdiqi",
      required: true,
      max: 500
    });
    const id = subscriptionId(checkedEndpoint.url.toString());
    await query(
      `INSERT INTO web_push_subscriptions (
         id, user_id, endpoint, p256dh, auth, user_agent, status, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'active', now())
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         status = 'active',
         updated_at = now()`,
      [
        id,
        user.id,
        checkedEndpoint.url.toString(),
        p256dh,
        auth,
        String(req.headers["user-agent"] || "").slice(0, 500)
      ]
    );
    await recordAudit({ actorId: user.id, action: "subscribe", entityType: "web_push", entityId: id });
    return sendJson(res, 201, { ok: true, data: { id, active: true } });
  }
  if (req.method === "POST" && body.action === "unsubscribe-push") {
    const endpoint = text(body.endpoint, { max: 3_000 });
    const values = [user.id];
    let filter = "";
    if (endpoint) {
      values.push(endpoint);
      filter = "AND endpoint = $2";
    }
    const rows = await query(
      `UPDATE web_push_subscriptions
          SET status = 'revoked', updated_at = now()
        WHERE user_id = $1 ${filter}
        RETURNING id`,
      values
    );
    await recordAudit({
      actorId: user.id,
      action: "unsubscribe",
      entityType: "web_push",
      details: { revoked: rows.length }
    });
    return sendJson(res, 200, { ok: true, data: { revoked: rows.length } });
  }
  if (!adminRoles.includes(user.role)) {
    throw new ApiError(403, "permission_denied", "Bu əməliyyat üçün icazən yoxdur.");
  }
  if (req.method === "POST" && body.action === "process") {
    const result = await deliverPendingNotifications(body.limit);
    await recordAudit({ actorId: user.id, action: "process", entityType: "notification", details: result });
    return sendJson(res, 200, { ok: true, data: result });
  }
  if (req.method === "POST") {
    const channel = oneOf(body.channel, channels, "in_app", "Kanal");
    const userId = text(body.userId, { max: 160 }) || null;
    if (channel === "web_push" && !userId) {
      throw new ApiError(400, "validation_error", "Web push üçün istifadəçi seçilməlidir.");
    }
    const id = await queueNotification({
      userId,
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
