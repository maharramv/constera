import { randomUUID } from "node:crypto";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { oneOf, parseLimit, parsePriceAmount, text } from "../_lib/validation.js";

const roles = ["super_admin", "admin", "sales"];
const stages = ["new", "qualified", "proposal", "won", "lost"];
const activityTypes = ["note", "call", "email", "meeting", "status"];

const optionalTimestamp = (value, field) => {
  const normalized = text(value, { field, max: 40 });
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw new ApiError(400, "validation_error", `${field} düzgün tarix və saat olmalıdır.`);
  }
  return parsed.toISOString();
};

const validateOwner = async (ownerId) => {
  if (!ownerId) return null;
  const rows = await query(
    "SELECT id FROM users WHERE id = $1 AND role = ANY($2::text[]) AND status = 'active' LIMIT 1",
    [ownerId, roles]
  );
  if (!rows[0]) throw new ApiError(400, "crm_owner_not_found", "Seçilmiş CRM məsulu aktiv idarəetmə istifadəçisi deyil.");
  return ownerId;
};

const mapLead = (row) => ({
  id: row.id,
  sourceType: row.source_type,
  sourceId: row.source_id || null,
  customerId: row.customer_id || null,
  companyName: row.company_name,
  contactName: row.contact_name,
  email: row.email || "",
  phone: row.phone || "",
  city: row.city || "",
  title: row.title,
  valueAmount: row.value_amount === null ? null : Number(row.value_amount),
  currency: row.currency,
  stage: row.stage,
  ownerId: row.owner_id || null,
  ownerName: row.owner_name || "",
  nextActionAt: row.next_action_at,
  note: row.note || "",
  activityCount: Number(row.activity_count || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const readPipeline = async (limit = 500) => {
  const [leads, stagesResult, activities] = await Promise.all([
    query(
      `SELECT lead.*, owner.name AS owner_name,
              (SELECT count(*) FROM crm_activities activity WHERE activity.lead_id = lead.id)::int AS activity_count
         FROM crm_leads lead
         LEFT JOIN users owner ON owner.id = lead.owner_id
        ORDER BY
          CASE lead.stage WHEN 'new' THEN 1 WHEN 'qualified' THEN 2 WHEN 'proposal' THEN 3 WHEN 'won' THEN 4 ELSE 5 END,
          lead.next_action_at NULLS LAST,
          lead.updated_at DESC
        LIMIT $1`,
      [limit]
    ),
    query(
      `SELECT stage, count(*)::int AS count, COALESCE(sum(value_amount), 0) AS value
         FROM crm_leads
        GROUP BY stage`
    ),
    query(
      `SELECT activity.*, actor.name AS actor_name, lead.title AS lead_title
         FROM crm_activities activity
         LEFT JOIN users actor ON actor.id = activity.actor_id
         JOIN crm_leads lead ON lead.id = activity.lead_id
        ORDER BY activity.created_at DESC
        LIMIT 100`
    )
  ]);
  return {
    leads: leads.map(mapLead),
    stages: stagesResult.map((item) => ({
      stage: item.stage,
      count: Number(item.count || 0),
      value: Number(item.value || 0)
    })),
    activities: activities.map((item) => ({
      id: item.id,
      leadId: item.lead_id,
      leadTitle: item.lead_title,
      actorName: item.actor_name || "Sistem",
      type: item.activity_type,
      subject: item.subject,
      note: item.note || "",
      dueAt: item.due_at,
      completedAt: item.completed_at,
      createdAt: item.created_at
    }))
  };
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, roles);
  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, data: await readPipeline(parseLimit(req.query.limit, 500, 1_000)) });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 40_000);
  if (req.method === "POST") {
    const action = oneOf(body.action, ["lead", "activity"], "lead", "Əməliyyat");
    if (action === "activity") {
      const leadId = text(body.leadId, { field: "Lead ID-si", required: true, max: 160 });
      const leadRows = await query("SELECT id FROM crm_leads WHERE id = $1 LIMIT 1", [leadId]);
      if (!leadRows[0]) throw new ApiError(404, "lead_not_found", "CRM lead tapılmadı.");
      const id = `act-${randomUUID()}`;
      await query(
        `INSERT INTO crm_activities (
           id, lead_id, actor_id, activity_type, subject, note, due_at, completed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id, leadId, user.id,
          oneOf(body.type, activityTypes, "note", "Fəaliyyət növü"),
          text(body.subject, { field: "Mövzu", required: true, max: 240 }),
          text(body.note, { max: 2_000 }) || null,
          optionalTimestamp(body.dueAt, "Son tarix"),
          body.completed ? new Date().toISOString() : null
        ]
      );
      await query("UPDATE crm_leads SET updated_at = now() WHERE id = $1", [leadId]);
      await recordAudit({ actorId: user.id, action: "create", entityType: "crm_activity", entityId: id, details: { leadId } });
      return sendJson(res, 201, { ok: true, data: await readPipeline() });
    }
    const id = `lead-${randomUUID()}`;
    const ownerId = await validateOwner(text(body.ownerId, { max: 160 }) || user.id);
    await query(
      `INSERT INTO crm_leads (
         id, source_type, company_name, contact_name, email, phone, city,
         title, value_amount, currency, stage, owner_id, next_action_at, note
       ) VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        text(body.companyName, { field: "Şirkət", required: true, max: 200 }),
        text(body.contactName, { field: "Əlaqələndirici şəxs", required: true, max: 160 }),
        text(body.email, { max: 254 }) || null,
        text(body.phone, { max: 80 }) || null,
        text(body.city, { max: 160 }) || null,
        text(body.title, { field: "Lead mövzusu", required: true, max: 300 }),
        parsePriceAmount(body.valueAmount),
        oneOf(body.currency, ["AZN", "USD", "EUR"], "AZN", "Valyuta"),
        oneOf(body.stage, stages, "new", "Mərhələ"),
        ownerId,
        optionalTimestamp(body.nextActionAt, "Növbəti addım tarixi"),
        text(body.note, { max: 2_000 }) || null
      ]
    );
    await recordAudit({ actorId: user.id, action: "create", entityType: "crm_lead", entityId: id });
    return sendJson(res, 201, { ok: true, data: await readPipeline() });
  }

  const id = text(body.id || req.query.id, { field: "Lead ID-si", required: true, max: 160 });
  const currentRows = await query("SELECT * FROM crm_leads WHERE id = $1 LIMIT 1", [id]);
  if (!currentRows[0]) throw new ApiError(404, "lead_not_found", "CRM lead tapılmadı.");
  const current = currentRows[0];
  const stage = oneOf(body.stage, stages, current.stage, "Mərhələ");
  const ownerId = Object.prototype.hasOwnProperty.call(body, "ownerId")
    ? await validateOwner(text(body.ownerId, { max: 160 }) || null)
    : current.owner_id;
  await query(
    `UPDATE crm_leads
        SET stage = $2,
            owner_id = $3,
            next_action_at = $4,
            note = $5,
            updated_at = now()
      WHERE id = $1`,
    [
      id,
      stage,
      ownerId,
      Object.prototype.hasOwnProperty.call(body, "nextActionAt")
        ? optionalTimestamp(body.nextActionAt, "Növbəti addım tarixi")
        : current.next_action_at,
      Object.prototype.hasOwnProperty.call(body, "note") ? text(body.note, { max: 2_000 }) || null : current.note
    ]
  );
  if (stage !== current.stage) {
    await query(
      `INSERT INTO crm_activities (id, lead_id, actor_id, activity_type, subject, note)
       VALUES ($1, $2, $3, 'status', $4, $5)`,
      [`act-${randomUUID()}`, id, user.id, `Mərhələ: ${stage}`, `${current.stage} → ${stage}`]
    );
  }
  await recordAudit({ actorId: user.id, action: "status_update", entityType: "crm_lead", entityId: id, details: { stage } });
  return sendJson(res, 200, { ok: true, data: await readPipeline() });
});
