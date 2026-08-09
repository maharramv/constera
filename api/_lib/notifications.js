import { randomUUID } from "node:crypto";
import webPush from "web-push";
import { query } from "./db.js";

export const webPushReadiness = () => {
  try {
    const subject = new URL(String(process.env.VAPID_SUBJECT || ""));
    return ["mailto:", "https:"].includes(subject.protocol)
      && String(process.env.VAPID_PUBLIC_KEY || "").length >= 40
      && String(process.env.VAPID_PRIVATE_KEY || "").length >= 30;
  } catch {
    return false;
  }
};

export const queueNotification = async ({
  userId = null,
  channel = "in_app",
  recipient = null,
  subject = null,
  body,
  templateKey = null,
  payload = {},
  availableAt = null
}) => {
  const id = `ntf-${randomUUID()}`;
  await query(
    `INSERT INTO notifications (
       id, user_id, channel, recipient, subject, body, template_key, payload, available_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, COALESCE($9::timestamptz, now()))`,
    [id, userId, channel, recipient, subject, body, templateKey, JSON.stringify(payload), availableAt]
  );
  if (channel === "in_app" && userId) {
    await query(
      `INSERT INTO notifications (
         id, user_id, channel, recipient, subject, body, template_key, payload, available_at
       )
       SELECT $1, $2, 'web_push', NULL, $3, $4, $5, $6::jsonb, COALESCE($7::timestamptz, now())
       WHERE EXISTS (
         SELECT 1 FROM web_push_subscriptions
          WHERE user_id = $2 AND status = 'active'
       )`,
      [
        `ntf-${randomUUID()}`,
        userId,
        subject,
        body,
        templateKey,
        JSON.stringify(payload),
        availableAt
      ]
    );
  }
  return id;
};

const webhookFor = (channel) => channel === "email"
  ? process.env.EMAIL_WEBHOOK_URL
  : channel === "whatsapp"
    ? process.env.WHATSAPP_WEBHOOK_URL
    : "";

const postWebhook = async (item) => {
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

const deliverWebPush = async (item) => {
  if (!webPushReadiness()) {
    return { sent: false, skipped: true, reason: "Web push VAPID açarları qurulmayıb" };
  }
  if (!item.user_id) {
    return { sent: false, skipped: true, reason: "Web push istifadəçisi göstərilməyib" };
  }
  const subscriptions = await query(
    `SELECT id, endpoint, p256dh, auth
       FROM web_push_subscriptions
      WHERE user_id = $1 AND status = 'active'`,
    [item.user_id]
  );
  if (!subscriptions.length) {
    return { sent: true, recipients: 0 };
  }
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  const payload = JSON.stringify({
    title: item.subject || "ConstEra",
    body: item.body,
    url: item.payload?.url || "/customer-cabinet.html",
    tag: item.template_key || `constera-${item.id}`,
    data: item.payload || {}
  });
  const results = await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, payload, {
        TTL: 86_400,
        urgency: "normal"
      });
      await query(
        "UPDATE web_push_subscriptions SET last_used_at = now(), updated_at = now() WHERE id = $1",
        [subscription.id]
      );
      return true;
    } catch (error) {
      if ([404, 410].includes(Number(error?.statusCode))) {
        await query(
          "UPDATE web_push_subscriptions SET status = 'expired', updated_at = now() WHERE id = $1",
          [subscription.id]
        );
        return false;
      }
      throw error;
    }
  }));
  const sent = results.filter((result) => result.status === "fulfilled" && result.value).length;
  const failed = results.filter((result) => result.status === "rejected").length;
  if (!sent && failed) throw new Error("Web push provayderi bildirişi qəbul etmədi");
  if (!sent) return { sent: true, recipients: 0 };
  return { sent: true, recipients: sent };
};

export const deliverNotificationNow = async ({
  channel,
  recipient,
  subject,
  body,
  templateKey = null,
  payload = {}
}) => postWebhook({
  id: `direct-${randomUUID()}`,
  channel,
  recipient,
  subject,
  body,
  template_key: templateKey,
  payload
});

const deliverOne = async (item) => {
  if (item.channel === "in_app") return { sent: true };
  if (item.channel === "web_push") return deliverWebPush(item);
  return postWebhook(item);
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
