import { randomUUID } from "node:crypto";
import { getClientIp, ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { hashOpaque, requireRole } from "../_lib/auth.js";
import { generateAiProcurementPlan } from "../_lib/ai-foundation.js";
import { syncRfqLead } from "../_lib/crm.js";
import { query, recordAudit } from "../_lib/db.js";
import { queueNotification } from "../_lib/notifications.js";
import { assertPolicyConsent, recordPolicyConsent } from "../_lib/policy-consent.js";
import { prepareProcurementEstimateRows } from "../_lib/procurement-plan.js";
import { entityId, oneOf, stringList, text } from "../_lib/validation.js";

const allowedRoles = ["super_admin", "admin", "sales", "customer"];
const riskLevels = ["low", "medium", "high"];

const isoDate = (value, field) => {
  const candidate = text(value, { field, required: true, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    throw new ApiError(400, "validation_error", `${field} düzgün tarix olmalıdır.`);
  }
  const date = new Date(`${candidate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== candidate) {
    throw new ApiError(400, "validation_error", `${field} düzgün tarix olmalıdır.`);
  }
  return candidate;
};

const integer = (value, fallback, minimum, maximum, field) => {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiError(400, "validation_error", `${field} ${minimum}-${maximum} aralığında olmalıdır.`);
  }
  return parsed;
};

const mapPlan = (row) => ({
  id: row.id,
  estimateId: row.estimate_id,
  aiRunId: row.ai_run_id || null,
  title: row.title,
  estimateTitle: row.estimate_title || row.title,
  status: row.status,
  projectStartDate: row.project_start_date,
  targetEndDate: row.target_end_date,
  durationDays: Number(row.duration_days || 0),
  currency: row.currency,
  totalBudget: Number(row.total_budget || 0),
  pricedRows: Number(row.priced_rows || 0),
  unpricedRows: Number(row.unpriced_rows || 0),
  summary: row.summary || "",
  warnings: Array.isArray(row.warnings) ? row.warnings : [],
  confidence: row.confidence === null ? null : Number(row.confidence),
  version: Number(row.version || 1),
  humanEditedAt: row.human_edited_at || null,
  approvedAt: row.approved_at || null,
  activatedAt: row.activated_at || null,
  waves: (Array.isArray(row.waves) ? row.waves : []).map((wave) => ({
    id: wave.id,
    key: wave.key,
    phaseKey: wave.phaseKey,
    title: wave.title,
    sequence: Number(wave.sequence || 0),
    startDate: wave.startDate,
    endDate: wave.endDate,
    needByDate: wave.needByDate,
    leadTimeDays: Number(wave.leadTimeDays || 0),
    budget: wave.budget === null ? null : Number(wave.budget),
    currency: wave.currency,
    riskLevel: wave.riskLevel,
    rowKeys: Array.isArray(wave.rowKeys) ? wave.rowKeys : [],
    rowCount: Number(wave.rowCount || 0),
    unpricedCount: Number(wave.unpricedCount || 0),
    included: wave.included !== false,
    status: wave.status,
    reason: wave.reason || "",
    checks: Array.isArray(wave.checks) ? wave.checks : [],
    rfqId: wave.rfqId || null,
    rfqStatus: wave.rfqStatus || null
  })),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const readPlans = async ({ user, planId = "", estimateId = "", limit = 30 }) => {
  const values = [user.id];
  const where = ["plan.customer_id = $1"];
  if (planId) {
    values.push(planId);
    where.push(`plan.id = $${values.length}`);
  }
  if (estimateId) {
    values.push(estimateId);
    where.push(`plan.estimate_id = $${values.length}`);
  }
  values.push(Math.min(100, Math.max(1, Number(limit || 30))));
  const rows = await query(
    `SELECT plan.*, estimate.title AS estimate_title,
            COALESCE(json_agg(json_build_object(
              'id', phase.id,
              'key', phase.wave_key,
              'phaseKey', phase.phase_key,
              'title', phase.title,
              'sequence', phase.sequence,
              'startDate', phase.start_date,
              'endDate', phase.end_date,
              'needByDate', phase.need_by_date,
              'leadTimeDays', phase.lead_time_days,
              'budget', phase.budget,
              'currency', phase.currency,
              'riskLevel', phase.risk_level,
              'rowKeys', phase.row_keys,
              'rowCount', phase.row_count,
              'unpricedCount', phase.unpriced_count,
              'included', phase.included,
              'status', phase.status,
              'reason', phase.reason,
              'checks', phase.checks,
              'rfqId', phase.rfq_id,
              'rfqStatus', rfq.status
            ) ORDER BY phase.sequence) FILTER (WHERE phase.id IS NOT NULL), '[]'::json) AS waves
       FROM procurement_plans plan
       JOIN customer_estimates estimate ON estimate.id = plan.estimate_id
       LEFT JOIN procurement_plan_phases phase ON phase.plan_id = plan.id
       LEFT JOIN rfqs rfq ON rfq.id = phase.rfq_id
      WHERE ${where.join(" AND ")}
      GROUP BY plan.id, estimate.title
      ORDER BY plan.updated_at DESC
      LIMIT $${values.length}`,
    values
  );
  return rows.map(mapPlan);
};

const formatQuantity = (value) => Number(value || 0).toLocaleString("az-AZ", { maximumFractionDigits: 3 });

const preparePhaseItems = (phase, estimate) => {
  const rowsByKey = new Map(prepareProcurementEstimateRows(estimate)
    .map((row) => [row.planRowKey, row]));
  const rows = phase.row_keys.map((key) => rowsByKey.get(String(key))).filter((row) => row && row.included !== false).slice(0, 20);
  if (!rows.length) throw new ApiError(409, "procurement_phase_empty", `${phase.title} dalğasında RFQ üçün material yoxdur.`);
  return rows.map((row) => {
    const selected = row?.catalog?.selected || null;
    const packageCount = Number(row?.catalog?.packageCount);
    const usePackage = Boolean(selected?.id && Number.isFinite(packageCount) && packageCount > 0);
    const quantity = usePackage ? packageCount : Number(row?.quantity || 1);
    const unit = usePackage ? "paket" : text(row?.unit || "ədəd", { max: 40 });
    return {
      id: `rfi-${randomUUID()}`,
      kind: selected?.id ? "product" : "custom",
      item_id: text(selected?.id, { max: 160 }) || null,
      title: text(selected?.name || row?.title || "Material", { max: 300 }),
      quantity_text: `${formatQuantity(quantity)} ${unit}`.slice(0, 160),
      unit,
      specs: [
        selected?.id ? `Smeta mövqeyi: ${text(row?.title, { max: 240 })}` : "Kataloq uyğunluğu tapılmayıb",
        `İlkin tələb: ${formatQuantity(row?.quantity)} ${text(row?.unit || "ədəd", { max: 40 })}`,
        `Satınalma mərhələsi: ${phase.title}`,
        `Kritiklik: ${text(row?.criticality || "Normal", { max: 40 })}`
      ]
    };
  });
};

const activatePlan = async ({ req, user, body }) => {
  assertPolicyConsent(body);
  const planId = text(body.id || body.planId, { field: "Satınalma planı", required: true, max: 160 });
  const planRows = await query(
    `SELECT plan.*, estimate.payload AS estimate_payload, estimate.workflow_status AS estimate_status,
            run.approval_status AS ai_approval_status,
            COALESCE(json_agg(phase ORDER BY phase.sequence) FILTER (WHERE phase.id IS NOT NULL), '[]'::json) AS phases
       FROM procurement_plans plan
       JOIN customer_estimates estimate ON estimate.id = plan.estimate_id
       LEFT JOIN ai_runs run ON run.id = plan.ai_run_id
       LEFT JOIN procurement_plan_phases phase ON phase.plan_id = plan.id
      WHERE plan.id = $1 AND plan.customer_id = $2
      GROUP BY plan.id, estimate.payload, estimate.workflow_status, run.approval_status
      LIMIT 1`,
    [planId, user.id]
  );
  const plan = planRows[0];
  if (!plan) throw new ApiError(404, "procurement_plan_not_found", "Satınalma planı tapılmadı.");
  if (plan.status === "activated") {
    const data = await readPlans({ user, planId });
    return { plan: data[0], duplicate: true };
  }
  if (plan.status !== "approved" || plan.ai_approval_status !== "approved") {
    throw new ApiError(409, "procurement_plan_not_approved", "Satınalma planı insan tərəfindən təsdiqlənməyib.");
  }
  if (plan.estimate_status !== "approved") {
    throw new ApiError(409, "estimate_not_approved", "Planın smetası təsdiqlənmiş vəziyyətdə deyil.");
  }
  const selectedPhases = (Array.isArray(plan.phases) ? plan.phases : []).filter((phase) => phase.included !== false);
  if (!selectedPhases.length) throw new ApiError(409, "procurement_plan_empty", "RFQ üçün aktiv satınalma dalğası yoxdur.");
  const estimate = plan.estimate_payload || {};
  const incoming = selectedPhases.map((phase) => {
    const items = preparePhaseItems(phase, estimate);
    return {
      phase_id: phase.id,
      rfq_id: `rfq-${randomUUID()}`,
      title: `${estimate.projectLabel || plan.title}: ${phase.title}`.slice(0, 300),
      need_date: phase.need_by_date,
      budget: phase.budget === null ? "Sorğu əsasında" : `${Number(phase.budget).toFixed(2)} ${phase.currency || plan.currency}`,
      note: `${phase.reason || "Mərhələli satınalma planı"} | Təchizat müddəti: ${phase.lead_time_days} gün`.slice(0, 3_000),
      items
    };
  });
  const company = text(user.companyName || user.name || "Fərdi müştəri", { max: 200 });
  const contactName = text(user.name || company, { max: 160 });
  const contactEmail = text(user.email, { max: 254 }) || null;
  const contact = [contactName, contactEmail].filter(Boolean).join(" · ");
  const submissionHash = hashOpaque(getClientIp(req));
  const rows = await query(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS wave(
         phase_id text, rfq_id text, title text, need_date date, budget text, note text, items jsonb
       )
     ), eligible AS (
       SELECT wave.*, phase.plan_id
         FROM incoming wave
         JOIN procurement_plan_phases phase ON phase.id = wave.phase_id
         JOIN procurement_plans plan ON plan.id = phase.plan_id
        WHERE plan.id = $2 AND plan.customer_id = $3 AND plan.status = 'approved' AND phase.included = true
     ), new_rfqs AS (
       INSERT INTO rfqs (
         id, customer_id, rfq_type, title, company_name, contact, contact_name, email,
         city, priority, need_date, budget, delivery_mode, usage_text, note,
         submission_hash, ai_run_id, estimate_id, procurement_plan_phase_id
       )
       SELECT eligible.rfq_id, $3, 'custom', eligible.title, $4, $5, $6, $7,
              $8, 'Qiymət müqayisəsi', eligible.need_date, eligible.budget,
              'Mərhələli layihə təchizatı', 'AI satınalma planı', eligible.note,
              $9, $10, $11, eligible.phase_id
         FROM eligible
       ON CONFLICT (procurement_plan_phase_id) WHERE procurement_plan_phase_id IS NOT NULL DO NOTHING
       RETURNING id, procurement_plan_phase_id
     ), new_items AS (
       INSERT INTO rfq_items (id, rfq_id, item_kind, item_id, title, quantity_text, unit, specs)
       SELECT item.id, new_rfqs.id, item.kind, item.item_id, item.title, item.quantity_text,
              item.unit, coalesce(item.specs, '[]'::jsonb)
         FROM new_rfqs
         JOIN eligible ON eligible.phase_id = new_rfqs.procurement_plan_phase_id
         CROSS JOIN LATERAL jsonb_to_recordset(eligible.items) AS item(
           id text, kind text, item_id text, title text, quantity_text text, unit text, specs jsonb
         )
       RETURNING id
     ), linked_rfqs AS (
       SELECT id, procurement_plan_phase_id FROM new_rfqs
       UNION ALL
       SELECT rfq.id, rfq.procurement_plan_phase_id
         FROM rfqs rfq
         JOIN eligible ON eligible.phase_id = rfq.procurement_plan_phase_id
        WHERE NOT EXISTS (SELECT 1 FROM new_rfqs created WHERE created.procurement_plan_phase_id = rfq.procurement_plan_phase_id)
     ), updated_phases AS (
       UPDATE procurement_plan_phases phase
          SET rfq_id = linked.id, status = 'rfq_created', updated_at = now()
         FROM linked_rfqs linked
        WHERE phase.id = linked.procurement_plan_phase_id
       RETURNING phase.id
     ), activated_plan AS (
       UPDATE procurement_plans target
          SET status = CASE
                WHEN (SELECT count(*) FROM linked_rfqs) = (SELECT count(*) FROM eligible) THEN 'activated'
                ELSE target.status
              END,
              activated_at = CASE
                WHEN (SELECT count(*) FROM linked_rfqs) = (SELECT count(*) FROM eligible) THEN now()
                ELSE target.activated_at
              END,
              version = target.version + 1,
              updated_at = now()
        WHERE target.id = $2 AND target.customer_id = $3
       RETURNING target.id, target.status
     ), converted_estimate AS (
       UPDATE customer_estimates estimate
          SET workflow_status = 'converted', procurement_plan_id = $2,
              converted_at = now(), version = estimate.version + 1, updated_at = now()
         FROM activated_plan
        WHERE estimate.id = $11 AND estimate.customer_id = $3 AND activated_plan.status = 'activated'
       RETURNING estimate.id
     )
     SELECT linked.id, linked.procurement_plan_phase_id AS phase_id,
            (SELECT count(*)::int FROM new_items) AS inserted_item_count,
            (SELECT status FROM activated_plan) AS plan_status
       FROM linked_rfqs linked
      ORDER BY linked.procurement_plan_phase_id`,
    [
      JSON.stringify(incoming), planId, user.id, company, contact, contactName, contactEmail,
      text(estimate.city, { max: 160 }) || null, submissionHash, plan.ai_run_id, plan.estimate_id
    ]
  );
  if (!rows.length || rows.some((row) => row.plan_status !== "activated")) {
    throw new ApiError(409, "procurement_plan_activation_incomplete", "Bütün satınalma dalğaları RFQ-yə çevrilmədi.");
  }
  await Promise.all(rows.map((row) => recordPolicyConsent({
    entityType: "rfq",
    entityId: row.id,
    userId: user.id,
    submissionHash,
    sourcePath: text(body.sourcePath, { max: 500 })
  })));
  await Promise.all(rows.map((row) => syncRfqLead(row.id)));
  await recordAudit({
    actorId: user.id,
    action: "activate",
    entityType: "procurement_plan",
    entityId: planId,
    details: { estimateId: plan.estimate_id, rfqIds: rows.map((row) => row.id), waveCount: rows.length }
  });
  const admins = await query("SELECT id FROM users WHERE role IN ('super_admin', 'admin', 'sales') AND status = 'active'");
  await Promise.allSettled(admins.map((admin) => queueNotification({
    userId: admin.id,
    channel: "in_app",
    subject: "Mərhələli satınalma planı aktivləşdi",
    body: `${company}: ${plan.title} üzrə ${rows.length} RFQ yaradıldı.`,
    templateKey: "procurement_plan_activated",
    payload: { planId, estimateId: plan.estimate_id, rfqIds: rows.map((row) => row.id) }
  })));
  const data = await readPlans({ user, planId });
  return { plan: data[0], duplicate: false };
};

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET", "POST", "PATCH"]);
  const user = await requireRole(req, allowedRoles);

  if (req.method === "GET") {
    const planId = text(req.query.id, { max: 160 });
    const estimateId = text(req.query.estimateId, { max: 160 });
    const data = await readPlans({ user, planId, estimateId, limit: req.query.limit });
    return sendJson(res, 200, { ok: true, data });
  }

  assertSameOrigin(req);
  const body = await readJson(req, 180_000);
  const action = text(body.action, { field: "Əməliyyat", required: true, max: 40 });

  if (req.method === "POST" && action === "activate") {
    const data = await activatePlan({ req, user, body });
    return sendJson(res, data.duplicate ? 200 : 201, { ok: true, data });
  }

  if (req.method === "POST" && action === "generate") {
    const estimateId = text(body.estimateId, { field: "Smeta", required: true, max: 160 });
    const existing = await readPlans({ user, estimateId, limit: 1 });
    if (existing[0]) return sendJson(res, 200, { ok: true, data: { plan: existing[0], duplicate: true } });
    const estimateRows = await query(
      `SELECT * FROM customer_estimates WHERE id = $1 AND customer_id = $2 LIMIT 1`,
      [estimateId, user.id]
    );
    const estimate = estimateRows[0];
    if (!estimate) throw new ApiError(404, "estimate_not_found", "Satınalma planı üçün smeta tapılmadı.");
    if (estimate.workflow_status !== "approved") {
      throw new ApiError(409, "estimate_not_approved", "Satınalma planı yalnız təsdiqlənmiş smetadan yaradıla bilər.");
    }
    const projectStartDate = isoDate(body.projectStartDate, "Layihə başlanğıcı");
    const durationDays = integer(body.durationDays, 150, 30, 730, "Layihə müddəti");
    const generated = await generateAiProcurementPlan({
      user,
      estimate: estimate.payload || {},
      input: { projectStartDate, durationDays }
    });
    const planId = `ppl-${randomUUID()}`;
    const plan = generated.plan;
    const waves = plan.waves.map((wave) => ({
      id: `pph-${randomUUID()}`,
      ...wave
    }));
    const inserted = await query(
      `WITH new_plan AS (
         INSERT INTO procurement_plans (
           id, estimate_id, customer_id, ai_run_id, title, status,
           project_start_date, target_end_date, duration_days, currency,
           total_budget, priced_rows, unpriced_rows, summary, warnings, confidence
         ) VALUES (
           $1, $2, $3, $4, $5, 'review_pending',
           $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15
         )
         ON CONFLICT (estimate_id) DO NOTHING
         RETURNING id
       ), new_phases AS (
         INSERT INTO procurement_plan_phases (
           id, plan_id, wave_key, phase_key, title, sequence,
           start_date, end_date, need_by_date, lead_time_days, budget, currency,
           risk_level, row_keys, row_count, unpriced_count, included, status, reason, checks
         )
         SELECT wave.id, new_plan.id, wave.wave_key, wave.phase_key, wave.title, wave.sequence,
                wave.start_date, wave.end_date, wave.need_by_date, wave.lead_time_days,
                wave.budget, wave.currency, wave.risk_level, wave.row_keys,
                wave.row_count, wave.unpriced_count, wave.included, 'planned', wave.reason, wave.checks
           FROM new_plan
           CROSS JOIN LATERAL jsonb_to_recordset($16::jsonb) AS wave(
             id text, wave_key text, phase_key text, title text, sequence integer,
             start_date date, end_date date, need_by_date date, lead_time_days integer,
             budget numeric, currency text, risk_level text, row_keys jsonb,
             row_count integer, unpriced_count integer, included boolean, reason text, checks jsonb
           )
         RETURNING id
       ), linked_estimate AS (
         UPDATE customer_estimates target
            SET procurement_plan_id = new_plan.id, version = target.version + 1, updated_at = now()
           FROM new_plan
          WHERE target.id = $2 AND target.customer_id = $3
         RETURNING target.id
       )
       SELECT id, (SELECT count(*)::int FROM new_phases) AS wave_count FROM new_plan`,
      [
        planId, estimateId, user.id, generated.runId,
        `${estimate.title} · satınalma planı`, plan.projectStartDate, plan.targetEndDate,
        plan.durationDays, plan.currency, plan.totalBudget, plan.pricedRows, plan.unpricedRows,
        plan.summary, JSON.stringify(plan.warnings || []), generated.confidence,
        JSON.stringify(waves.map((wave) => ({
          id: wave.id,
          wave_key: wave.key,
          phase_key: wave.phaseKey,
          title: wave.title,
          sequence: wave.sequence,
          start_date: wave.startDate,
          end_date: wave.endDate,
          need_by_date: wave.needByDate,
          lead_time_days: wave.leadTimeDays,
          budget: wave.budget,
          currency: wave.currency,
          risk_level: wave.riskLevel,
          row_keys: wave.rowKeys,
          row_count: wave.rowCount,
          unpriced_count: wave.unpricedCount,
          included: wave.included !== false,
          reason: wave.reason,
          checks: wave.checks || []
        })))
      ]
    );
    if (!inserted[0]) {
      const duplicate = await readPlans({ user, estimateId, limit: 1 });
      return sendJson(res, 200, { ok: true, data: { plan: duplicate[0], duplicate: true } });
    }
    await recordAudit({
      actorId: user.id,
      action: "generate",
      entityType: "procurement_plan",
      entityId: planId,
      details: { estimateId, aiRunId: generated.runId, waveCount: Number(inserted[0].wave_count || waves.length) }
    });
    const data = await readPlans({ user, planId });
    return sendJson(res, 201, { ok: true, data: { plan: data[0], duplicate: false } });
  }

  if (req.method === "PATCH" && action === "update") {
    const planId = text(body.id || body.planId, { field: "Satınalma planı", required: true, max: 160 });
    const requested = Array.isArray(body.waves) ? body.waves.slice(0, 20) : [];
    if (!requested.length) throw new ApiError(400, "procurement_waves_required", "Yenilənəcək satınalma dalğaları göndərilməyib.");
    const edits = requested.map((wave, index) => {
      const startDate = isoDate(wave.startDate, `Dalğa ${index + 1} başlanğıcı`);
      const endDate = isoDate(wave.endDate, `Dalğa ${index + 1} sonu`);
      const needByDate = isoDate(wave.needByDate, `Dalğa ${index + 1} tələb tarixi`);
      if (endDate < startDate) throw new ApiError(400, "invalid_phase_dates", "Dalğanın bitmə tarixi başlanğıcdan əvvəl ola bilməz.");
      if (needByDate > startDate) throw new ApiError(400, "invalid_phase_dates", "Material tələb tarixi iş başlanğıcından sonra ola bilməz.");
      return {
        id: entityId(wave.id, "phase"),
        start_date: startDate,
        end_date: endDate,
        need_by_date: needByDate,
        lead_time_days: integer(wave.leadTimeDays, 14, 1, 90, "Təchizat müddəti"),
        risk_level: oneOf(wave.riskLevel, riskLevels, "medium", "Risk səviyyəsi"),
        included: wave.included !== false,
        reason: text(wave.reason, { max: 600 }),
        checks: stringList(wave.checks, 8)
      };
    });
    if (new Set(edits.map((edit) => edit.id)).size !== edits.length) {
      throw new ApiError(400, "duplicate_procurement_wave", "Eyni satınalma dalğası bir neçə dəfə göndərilib.");
    }
    const updated = await query(
      `WITH target_plan AS (
         SELECT id, ai_run_id FROM procurement_plans
          WHERE id = $1 AND customer_id = $2 AND status IN ('draft', 'review_pending', 'rejected')
       ), edits AS (
         SELECT * FROM jsonb_to_recordset($3::jsonb) AS edit(
           id text, start_date date, end_date date, need_by_date date,
           lead_time_days integer, risk_level text, included boolean, reason text, checks jsonb
         )
       ), valid_plan AS (
         SELECT target.id, target.ai_run_id
           FROM target_plan target
          WHERE (SELECT count(*) FROM edits) = (
            SELECT count(*) FROM edits edit
            JOIN procurement_plan_phases phase ON phase.id = edit.id AND phase.plan_id = target.id
          )
       ), updated_phases AS (
         UPDATE procurement_plan_phases phase
            SET start_date = edit.start_date, end_date = edit.end_date,
                need_by_date = edit.need_by_date, lead_time_days = edit.lead_time_days,
                risk_level = edit.risk_level, included = edit.included,
                status = CASE WHEN edit.included THEN 'planned' ELSE 'skipped' END,
                reason = edit.reason, checks = edit.checks, updated_at = now()
           FROM edits, valid_plan
          WHERE phase.id = edit.id AND phase.plan_id = valid_plan.id
         RETURNING phase.id
       ), reset_review AS (
         UPDATE ai_runs run
            SET approval_status = 'pending', reviewed_by = NULL, reviewed_at = NULL,
                review_note = NULL, updated_at = now()
           FROM valid_plan
          WHERE run.id = valid_plan.ai_run_id
         RETURNING run.id
       )
       UPDATE procurement_plans plan
          SET status = 'review_pending', approved_at = NULL,
              human_edited_at = now(), version = version + 1, updated_at = now()
        WHERE plan.id IN (SELECT id FROM valid_plan)
       RETURNING plan.id, (SELECT count(*)::int FROM updated_phases) AS updated_count`,
      [planId, user.id, JSON.stringify(edits)]
    );
    if (!updated[0]) throw new ApiError(409, "procurement_plan_not_editable", "Satınalma planı tapılmadı, dalğa uyğun gəlmir və ya plan artıq redaktəyə bağlıdır.");
    if (Number(updated[0].updated_count || 0) !== edits.length) {
      throw new ApiError(409, "procurement_wave_mismatch", "Satınalma dalğalarından biri bu plana aid deyil.");
    }
    await recordAudit({
      actorId: user.id,
      action: "update",
      entityType: "procurement_plan",
      entityId: planId,
      details: { waveCount: edits.length }
    });
    const data = await readPlans({ user, planId });
    return sendJson(res, 200, { ok: true, data: { plan: data[0] } });
  }

  throw new ApiError(400, "invalid_action", "Satınalma planı əməliyyatı dəstəklənmir.");
});
