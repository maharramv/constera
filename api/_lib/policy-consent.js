import { randomUUID } from "node:crypto";
import { query } from "./db.js";
import { ApiError } from "./http.js";

export const POLICY_VERSION = "2026-07-30";

const accepted = (value) =>
  value === true || ["1", "on", "true", "yes"].includes(String(value || "").trim().toLowerCase());

export const assertPolicyConsent = (body = {}, { legacyField = "" } = {}) => {
  const legalAccepted = accepted(body.legalAccepted)
    || (legacyField ? accepted(body[legacyField]) : false);
  if (!legalAccepted) {
    throw new ApiError(
      400,
      "policy_consent_required",
      "Məxfilik siyasəti və istifadə şərtləri qəbul edilməlidir."
    );
  }
  return { legalAccepted: true, policyVersion: POLICY_VERSION };
};

export const recordPolicyConsent = async ({
  entityType,
  entityId,
  userId = null,
  submissionHash = null,
  sourcePath = ""
}) => {
  await query(
    `INSERT INTO policy_consents (
       id, entity_type, entity_id, user_id, submission_hash,
       policy_version, accepted_terms, accepted_privacy, source_path
     ) VALUES ($1, $2, $3, $4, $5, $6, true, true, $7)
     ON CONFLICT (entity_type, entity_id, policy_version) DO NOTHING`,
    [
      `plc-${randomUUID()}`,
      entityType,
      entityId,
      userId,
      submissionHash,
      POLICY_VERSION,
      String(sourcePath || "").slice(0, 500) || null
    ]
  );
};
