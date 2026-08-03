import { randomUUID } from "node:crypto";
import { getSessionUser, hashOpaque, requireRole } from "../_lib/auth.js";
import { query } from "../_lib/db.js";
import { forwardGoogleAnalyticsEvent } from "../_lib/google-marketing.js";
import { ApiError, assertMethod, assertSameOrigin, getClientIp, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { oneOf, parseLimit, text } from "../_lib/validation.js";

const eventTypes = [
  "page_view", "search", "product_view", "add_to_cart", "checkout_start",
  "order_created", "rfq_created", "estimate_created", "review_submitted",
  "support_case_created"
];

const cleanPayload = (value) => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const payload = Object.fromEntries(Object.entries(source).slice(0, 20).map(([key, item]) => [
    text(key, { max: 80 }),
    typeof item === "number" || typeof item === "boolean"
      ? item
      : text(item, { max: 300 })
  ]).filter(([key]) => key));
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 5_000) {
    throw new ApiError(413, "event_payload_too_large", "Analitika hadisəsinin məlumatı çox böyükdür.");
  }
  return payload;
};

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    await requireRole(req, ["super_admin", "admin", "sales"]);
    const rows = await query(
      `SELECT event_type, count(*)::int AS events,
              count(DISTINCT visitor_hash)::int AS visitors,
              count(DISTINCT session_hash)::int AS sessions
         FROM analytics_events
        WHERE created_at >= now() - interval '30 days'
        GROUP BY event_type ORDER BY events DESC`
    );
    const recent = await query(
      `SELECT event_type, path, entity_type, entity_id, payload, created_at
         FROM analytics_events ORDER BY created_at DESC LIMIT $1`,
      [parseLimit(req.query.limit, 50, 200)]
    );
    return sendJson(res, 200, { ok: true, data: { summary: rows, recent } });
  }

  assertMethod(req, ["POST"]);
  assertSameOrigin(req);
  const body = await readJson(req, 20_000);
  const eventType = oneOf(body.eventType, eventTypes, "page_view", "Hadisə tipi");
  const visitorId = text(body.visitorId, { field: "Ziyarətçi ID-si", required: true, max: 100 });
  const sessionId = text(body.sessionId, { field: "Sessiya ID-si", required: true, max: 100 });
  const eventId = text(body.eventId, { field: "Hadisə ID-si", required: true, max: 120 });
  if (!/^[a-zA-Z0-9._:-]+$/.test(visitorId + sessionId + eventId)) {
    throw new ApiError(400, "invalid_event_identity", "Analitika hadisəsinin identifikatoru düzgün deyil.");
  }
  const ipHash = hashOpaque(getClientIp(req));
  const visitorHash = hashOpaque(`${visitorId}:${ipHash}`);
  const sessionHash = hashOpaque(`${sessionId}:${ipHash}`);
  const recent = await query(
    "SELECT count(*)::int AS count FROM analytics_events WHERE visitor_hash = $1 AND created_at > now() - interval '1 minute'",
    [visitorHash]
  );
  if (Number(recent[0]?.count || 0) >= 60) throw new ApiError(429, "analytics_rate_limited", "Analitika hadisəsi limiti dolub.");
  const user = await getSessionUser(req);
  const payload = cleanPayload(body.payload);
  const rows = await query(
    `INSERT INTO analytics_events (
       id, event_type, user_id, visitor_hash, session_hash,
       path, entity_type, entity_id, payload, dedupe_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      `ane-${randomUUID()}`, eventType, user?.id || null, visitorHash, sessionHash,
      text(body.path, { max: 500 }) || null,
      text(body.entityType, { max: 80 }) || null,
      text(body.entityId, { max: 160 }) || null,
      JSON.stringify(payload),
      hashOpaque(`${visitorHash}:${eventId}`)
    ]
  );
  let googleForwarded = false;
  if (rows[0]) {
    try {
      const google = await forwardGoogleAnalyticsEvent({
        consent: body.consent,
        visitorHash,
        eventType,
        path: text(body.path, { max: 500 }) || "/",
        entityType: text(body.entityType, { max: 80 }),
        entityId: text(body.entityId, { max: 160 }),
        payload
      });
      googleForwarded = google.forwarded;
    } catch {
      // Xarici analitika nasazlığı ConstEra-nın öz hadisə qeydini dayandırmır.
    }
  }
  return sendJson(res, rows[0] ? 201 : 200, {
    ok: true,
    data: { accepted: Boolean(rows[0]), googleForwarded }
  });
});
