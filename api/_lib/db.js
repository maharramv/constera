import { neon } from "@neondatabase/serverless";
import { ApiError } from "./http.js";

let client;
let clientUrl;

export const getDatabaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
export const isDatabaseConfigured = () => Boolean(getDatabaseUrl());

export const getSql = () => {
  const url = getDatabaseUrl();
  if (!url) {
    throw new ApiError(
      503,
      "database_not_configured",
      "PostgreSQL hələ qoşulmayıb. Vercel Marketplace üzərindən Neon inteqrasiyasını əlavə et."
    );
  }

  if (!client || clientUrl !== url) {
    client = neon(url, { fullResults: false });
    clientUrl = url;
  }
  return client;
};

export const query = async (text, values = []) => getSql().query(text, values);

export const recordAudit = async ({ actorId, action, entityType, entityId, details = {} }) => {
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId || null, action, entityType, entityId || null, JSON.stringify(details)]
  );
};
