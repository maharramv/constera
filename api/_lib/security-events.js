import { createHash, randomUUID } from "node:crypto";
import { query } from "./db.js";
import { getClientIp } from "./http.js";

const hash = (value) => value ? createHash("sha256").update(String(value)).digest("hex") : null;

export const recordSecurityEvent = async ({
  req,
  userId = null,
  email = "",
  eventType,
  succeeded = false,
  riskLevel = "low",
  metadata = {}
}) => {
  await query(
    `INSERT INTO security_events (
       id, user_id, email_hash, event_type, succeeded,
       ip_hash, user_agent_hash, risk_level, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      `sec-${randomUUID()}`,
      userId,
      hash(String(email || "").trim().toLowerCase()),
      eventType,
      Boolean(succeeded),
      hash(getClientIp(req)),
      hash(String(req?.headers?.["user-agent"] || "").slice(0, 500)),
      riskLevel,
      JSON.stringify(metadata)
    ]
  );
};
