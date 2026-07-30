import { randomUUID } from "node:crypto";
import { hashOpaque } from "../_lib/auth.js";
import { assertPolicyConsent, recordPolicyConsent } from "../_lib/policy-consent.js";
import { query, recordAudit } from "../_lib/db.js";
import {
  ApiError,
  assertMethod,
  assertSameOrigin,
  getClientIp,
  readJson,
  sendJson,
  withApiErrors
} from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { email, text } from "../_lib/validation.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["POST"]);
  assertSameOrigin(req);
  const body = await readJson(req, 20_000);
  if (text(body.website, { max: 200 })) {
    return sendJson(res, 201, { ok: true, data: { accepted: true } });
  }
  assertPolicyConsent(body);

  const contactEmail = email(body.email);
  const submissionHash = hashOpaque(getClientIp(req));
  const recent = await query(
    `SELECT count(*)::int AS count
       FROM crm_leads lead
       LEFT JOIN policy_consents consent
         ON consent.entity_type = 'contact'
        AND consent.entity_id = lead.source_id
      WHERE lead.source_type = 'contact'
        AND (
          lower(coalesce(lead.email, '')) = lower($1)
          OR consent.submission_hash = $2
        )
        AND lead.created_at > now() - interval '1 hour'`,
    [contactEmail, submissionHash]
  );
  if (Number(recent[0]?.count || 0) >= 5) {
    throw new ApiError(429, "contact_rate_limited", "Bir saat ərzində müraciət limiti dolub.");
  }

  const contactId = `cnt-${randomUUID()}`;
  const leadId = `lead-${randomUUID()}`;
  const name = text(body.name, { field: "Ad", required: true, min: 2, max: 120 });
  const company = text(body.company, { field: "Şirkət", max: 200 }) || "Fərdi müraciət";
  const phone = text(body.phone, { field: "Telefon", max: 80 }) || null;
  const message = text(body.message, { field: "Sorğu", required: true, min: 10, max: 3_000 });

  await query(
    `INSERT INTO crm_leads (
       id, source_type, source_id, company_name, contact_name,
       email, phone, title, stage, note
     ) VALUES ($1, 'contact', $2, $3, $4, $5, $6, $7, 'new', $8)`,
    [leadId, contactId, company, name, contactEmail, phone, "Sayt əlaqə müraciəti", message]
  );
  await recordPolicyConsent({
    entityType: "contact",
    entityId: contactId,
    submissionHash,
    sourcePath: text(body.sourcePath, { max: 500 })
  });
  await recordAudit({
    action: "create",
    entityType: "contact",
    entityId: contactId,
    details: { leadId, company }
  });

  const admins = await query(
    "SELECT id FROM users WHERE role IN ('super_admin', 'admin', 'sales') AND status = 'active'"
  );
  await Promise.allSettled(admins.map((admin) => queueNotification({
    userId: admin.id,
    channel: "in_app",
    subject: "Yeni əlaqə müraciəti",
    body: `${company}: ${message.slice(0, 180)}`,
    templateKey: "contact_created",
    payload: { contactId, leadId }
  })));

  return sendJson(res, 201, {
    ok: true,
    data: { id: contactId, status: "accepted" },
    message: "Müraciət qəbul edildi. Komanda əlaqə məlumatları üzrə geri dönüş edəcək."
  });
});
