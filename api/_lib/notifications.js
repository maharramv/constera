import { randomUUID } from "node:crypto";
import { query } from "./db.js";

export const queueNotification = async ({
  userId = null,
  channel = "in_app",
  recipient = null,
  subject = null,
  body,
  templateKey = null,
  payload = {}
}) => {
  const id = `ntf-${randomUUID()}`;
  await query(
    `INSERT INTO notifications (id, user_id, channel, recipient, subject, body, template_key, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [id, userId, channel, recipient, subject, body, templateKey, JSON.stringify(payload)]
  );
  return id;
};

const webhookFor = (channel) => channel === "email"
  ? process.env.EMAIL_WEBHOOK_URL
  : channel === "whatsapp"
    ? process.env.WHATSAPP_WEBHOOK_URL
    : "";

const deliverOne = async (item) => {
  if (item.channel === "in_app") return { sent: true };
  const webhook = webhookFor(item.channel);
  if (!webhook) return { sent: false, skipped: true, reason: `${item.channel} webhook-u qurulmayıb` };
  const response = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.NOTIFICATION_WEBHOOK_SECRET
        ? { Authorization: `Bearer ${process.env.NOTIFICATION_WEBHOOK_SECRET}` }
        : {})
    },
    body: JSON.stringify({
      id: item.id,
      channel: item.channel,
      recipient: item.recipient,
      subject: item.subject,
      body: item.body,
      templateKey: item.template_key,
      payload: item.payload || {},
      source: "ConstEra"
    })
  });
  if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
  return { sent: true };
};

export const deliverPendingNotifications = async (limit = 25) => {
  const rows = await query(
    `SELECT * FROM notifications
      WHERE status IN ('pending', 'failed') AND available_at <= now() AND attempts < 5
      ORDER BY created_at
      LIMIT $1`,
    [Math.max(1, Math.min(Number(limit) || 25, 100))]
  );
  const result = { selected: rows.length, sent: 0, failed: 0, skipped: 0 };
  for (const item of rows) {
    const claimed = await query(
      `UPDATE notifications SET status = 'processing', updated_at = now()
        WHERE id = $1 AND status IN ('pending', 'failed') RETURNING id`,
      [item.id]
    );
    if (!claimed[0]) continue;
    try {
      const delivery = await deliverOne(item);
      if (delivery.skipped) {
        result.skipped += 1;
        await query(
          "UPDATE notifications SET status = 'pending', last_error = $2, available_at = now() + interval '1 hour', updated_at = now() WHERE id = $1",
          [item.id, delivery.reason]
        );
      } else {
        result.sent += 1;
        await query(
          "UPDATE notifications SET status = 'sent', attempts = attempts + 1, last_error = NULL, sent_at = now(), updated_at = now() WHERE id = $1",
          [item.id]
        );
      }
    } catch (error) {
      result.failed += 1;
      const attempts = Number(item.attempts || 0) + 1;
      await query(
        `UPDATE notifications
            SET status = CASE WHEN $2 >= 5 THEN 'failed' ELSE 'pending' END,
                attempts = $2, last_error = $3,
                available_at = now() + (($4::int)::text || ' minutes')::interval,
                updated_at = now()
          WHERE id = $1`,
        [item.id, attempts, String(error.message || "Göndəriş xətası").slice(0, 500), Math.min(60, 2 ** attempts)]
      );
    }
  }
  return result;
};
