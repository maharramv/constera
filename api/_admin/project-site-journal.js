import { randomBytes } from "node:crypto";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { buildProjectJournalSummary, weeklyDateRange } from "../_lib/project-site-journal.js";
import { entityId, oneOf, text } from "../_lib/validation.js";

const privilegedRoles = new Set(["super_admin", "admin", "sales"]);
const issueStatuses = ["open", "in_progress", "resolved", "verified"];
const documentStatuses = ["draft", "pending", "accepted", "rejected", "superseded"];

const numeric = (value, field, maximum = 100_000) => {
  const result = Number(value || 0);
  if (!Number.isFinite(result) || result < 0 || result > maximum) {
    throw new ApiError(400, "validation_error", `${field} düzgün rəqəm olmalıdır.`);
  }
  return Number(result.toFixed(2));
};

const dateValue = (value, field, fallback = "") => {
  const result = text(value || fallback, { field, required: true, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00Z`))) {
    throw new ApiError(400, "validation_error", `${field} düzgün tarix olmalıdır.`);
  }
  return result;
};

const requireProject = async (projectId, user) => {
  const rows = await query(
    `SELECT project.*
       FROM customer_projects project
      WHERE project.id = $1 AND (project.customer_id = $2 OR $3::boolean = true)
      LIMIT 1`,
    [projectId, user.id, privilegedRoles.has(user.role)]
  );
  if (!rows[0]) throw new ApiError(404, "project_not_found", "Layihə tapılmadı və ya giriş icazəsi yoxdur.");
  return rows[0];
};

const requireProjectMedia = async (assetId, projectId, user) => {
  if (!assetId) return null;
  const rows = await query(
    `SELECT id FROM media_assets
      WHERE id = $1 AND entity_type = 'project' AND entity_id = $2
        AND status = 'active' AND (owner_id = $3 OR $4::boolean = true)
      LIMIT 1`,
    [assetId, projectId, user.id, privilegedRoles.has(user.role)]
  );
  if (!rows[0]) throw new ApiError(409, "project_media_mismatch", "Fayl bu layihəyə aid deyil.");
  return assetId;
};

const mapLog = (row) => ({
  id: row.id, number: Number(row.log_number), projectId: row.project_id,
  workDate: String(row.work_date), shift: row.shift, weather: row.weather,
  weatherNote: row.weather_note || "", crewName: row.crew_name,
  supervisorName: row.supervisor_name || "", workerCount: Number(row.worker_count),
  workerHours: Number(row.worker_hours), workSummary: row.work_summary,
  equipmentNote: row.equipment_note || "", equipmentHours: Number(row.equipment_hours),
  delayMinutes: Number(row.delay_minutes), delayReason: row.delay_reason || "",
  safetyNote: row.safety_note || "", photoUrl: row.photo_url || "",
  recordedBy: row.recorded_by_name || "İstifadəçi", createdAt: row.created_at
});

const mapIssue = (row) => ({
  id: row.id, number: Number(row.issue_number), code: row.issue_code,
  projectId: row.project_id, title: row.title, severity: row.severity, status: row.status,
  workArea: row.work_area || "", description: row.description || "", dueDate: row.due_date ? String(row.due_date) : "",
  assigneeName: row.assignee_name || "", photoUrl: row.photo_url || "",
  reportedBy: row.reported_by_name || "İstifadəçi", resolvedAt: row.resolved_at || null,
  createdAt: row.created_at, updatedAt: row.updated_at
});

const mapDocument = (row) => ({
  id: row.id, number: Number(row.document_number), code: row.document_code,
  projectId: row.project_id, type: row.record_type, title: row.title,
  workArea: row.work_area || "", inspectionDate: String(row.inspection_date), status: row.status,
  revisionCode: row.revision_code || "", specification: row.specification || "",
  inspectorName: row.inspector_name || "", contractorName: row.contractor_name || "",
  fileUrl: row.file_url || "", createdBy: row.created_by_name || "İstifadəçi",
  approvedAt: row.approved_at || null, createdAt: row.created_at
});

const journalPeriod = (queryParams = {}) => {
  const fallback = weeklyDateRange();
  const start = dateValue(queryParams.start, "Başlanğıc tarixi", fallback.start);
  const end = dateValue(queryParams.end, "Son tarix", fallback.end);
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  if (days < 0 || days > 31) throw new ApiError(400, "invalid_report_period", "Hesabat intervalı 1-32 gün arasında olmalıdır.");
  return { start, end };
};

const readJournal = async (projectId, user, queryParams = {}) => {
  const project = await requireProject(projectId, user);
  const period = journalPeriod(queryParams);
  const [logRows, issueRows, documentRows] = await Promise.all([
    query(
      `SELECT log.*, media.url AS photo_url, COALESCE(person.name, person.email) AS recorded_by_name
         FROM project_site_daily_logs log
         LEFT JOIN media_assets media ON media.id = log.photo_asset_id AND media.status = 'active'
         LEFT JOIN users person ON person.id = log.recorded_by
        WHERE log.project_id = $1 AND log.work_date BETWEEN $2::date AND $3::date
        ORDER BY log.work_date DESC, log.created_at DESC LIMIT 500`,
      [projectId, period.start, period.end]
    ),
    query(
      `SELECT issue.*, media.url AS photo_url, COALESCE(person.name, person.email) AS reported_by_name
         FROM project_quality_issues issue
         LEFT JOIN media_assets media ON media.id = issue.photo_asset_id AND media.status = 'active'
         LEFT JOIN users person ON person.id = issue.reported_by
        WHERE issue.project_id = $1 ORDER BY issue.created_at DESC LIMIT 300`,
      [projectId]
    ),
    query(
      `SELECT document.*, media.url AS file_url, COALESCE(person.name, person.email) AS created_by_name
         FROM project_control_documents document
         LEFT JOIN media_assets media ON media.id = document.media_asset_id AND media.status = 'active'
         LEFT JOIN users person ON person.id = document.created_by
        WHERE document.project_id = $1 ORDER BY document.inspection_date DESC, document.created_at DESC LIMIT 300`,
      [projectId]
    )
  ]);
  const logs = logRows.map(mapLog);
  const issues = issueRows.map(mapIssue);
  const documents = documentRows.map(mapDocument);
  return {
    project: { id: project.id, title: project.title, city: project.city || "", status: project.status },
    logs, issues, documents,
    summary: buildProjectJournalSummary({ logs, issues, documents, ...period })
  };
};

const createDailyLog = async (body, user) => {
  const projectId = text(body.projectId, { field: "Layihə", required: true, max: 160 });
  await requireProject(projectId, user);
  const photoAssetId = await requireProjectMedia(text(body.photoAssetId, { max: 160 }) || null, projectId, user);
  const id = entityId(body.id, "site-log");
  await query(
    `INSERT INTO project_site_daily_logs (
       id, project_id, work_date, shift, weather, weather_note, crew_name, supervisor_name,
       worker_count, worker_hours, work_summary, equipment_note, equipment_hours,
       delay_minutes, delay_reason, safety_note, photo_asset_id, recorded_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      id, projectId, dateValue(body.workDate, "İş tarixi", new Date().toISOString().slice(0, 10)),
      oneOf(body.shift, ["day", "night"], "day", "Növbə"),
      oneOf(body.weather, ["clear", "cloudy", "rain", "wind", "hot", "cold"], "clear", "Hava"),
      text(body.weatherNote, { max: 500 }) || null,
      text(body.crewName, { field: "Briqada", required: true, max: 240 }),
      text(body.supervisorName, { max: 240 }) || null,
      Math.round(numeric(body.workerCount, "İşçi sayı", 5_000)), numeric(body.workerHours, "İş saatı"),
      text(body.workSummary, { field: "Görülən iş", required: true, max: 4_000 }),
      text(body.equipmentNote, { max: 1_000 }) || null, numeric(body.equipmentHours, "Texnika saatı"),
      Math.round(numeric(body.delayMinutes, "Gecikmə", 1_000_000)), text(body.delayReason, { max: 1_000 }) || null,
      text(body.safetyNote, { max: 1_000 }) || null, photoAssetId, user.id
    ]
  );
  await recordAudit({ actorId: user.id, action: "site_daily_log", entityType: "project_site_daily_log", entityId: id, details: { projectId } });
  return projectId;
};

const createIssue = async (body, user) => {
  const projectId = text(body.projectId, { field: "Layihə", required: true, max: 160 });
  const project = await requireProject(projectId, user);
  const photoAssetId = await requireProjectMedia(text(body.photoAssetId, { max: 160 }) || null, projectId, user);
  const id = entityId(body.id, "quality-issue");
  const code = `CE-QS-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const severity = oneOf(body.severity, ["low", "medium", "high", "critical"], "medium", "Risk");
  const title = text(body.title, { field: "Qüsur", required: true, max: 300 });
  await query(
    `INSERT INTO project_quality_issues (
       id, issue_code, project_id, title, severity, work_area, description,
       due_date, assignee_name, photo_asset_id, reported_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, code, projectId, title, severity, text(body.workArea, { max: 240 }) || null,
      text(body.description, { max: 3_000 }) || null,
      body.dueDate ? dateValue(body.dueDate, "Son tarix") : null,
      text(body.assigneeName, { max: 240 }) || null, photoAssetId, user.id]
  );
  await recordAudit({ actorId: user.id, action: "quality_issue", entityType: "project_quality_issue", entityId: id, details: { projectId, severity } });
  if (severity === "critical") {
    await queueNotification({
      userId: project.customer_id, channel: "in_app", subject: `Kritik obyekt qüsuru: ${title}`,
      body: `${code} kodlu kritik qüsur qeydə alındı.`, templateKey: "project_critical_quality_issue",
      payload: { projectId, issueId: id, url: `/project-planner.html?project=${encodeURIComponent(projectId)}#project-site-journal` }
    });
  }
  return projectId;
};

const createDocument = async (body, user) => {
  const projectId = text(body.projectId, { field: "Layihə", required: true, max: 160 });
  await requireProject(projectId, user);
  const mediaAssetId = await requireProjectMedia(text(body.mediaAssetId, { max: 160 }) || null, projectId, user);
  const id = entityId(body.id, "control-document");
  const type = oneOf(body.type, ["hidden_work", "inspection", "handover", "drawing_revision"], "hidden_work", "Sənəd tipi");
  const status = oneOf(body.status, documentStatuses, "draft", "Status");
  const prefix = type === "drawing_revision" ? "CR" : "AKT";
  const code = `CE-${prefix}-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  await query(
    `INSERT INTO project_control_documents (
       id, document_code, project_id, record_type, title, work_area, inspection_date,
       status, revision_code, specification, inspector_name, contractor_name, media_asset_id, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, code, projectId, type, text(body.title, { field: "Sənəd adı", required: true, max: 300 }),
      text(body.workArea, { max: 240 }) || null, dateValue(body.inspectionDate, "Yoxlama tarixi", new Date().toISOString().slice(0, 10)),
      status, text(body.revisionCode, { max: 80 }) || null,
      text(body.specification, { max: 3_000 }) || null, text(body.inspectorName, { max: 240 }) || null,
      text(body.contractorName, { max: 240 }) || null, mediaAssetId, user.id]
  );
  if (type === "drawing_revision" && status === "accepted") {
    await query(
      `UPDATE project_control_documents SET status = 'superseded', updated_at = now()
        WHERE project_id = $1 AND record_type = 'drawing_revision' AND status = 'accepted' AND id <> $2`,
      [projectId, id]
    );
  }
  await recordAudit({ actorId: user.id, action: "project_control_document", entityType: "project_control_document", entityId: id, details: { projectId, type } });
  return projectId;
};

const updateStatus = async (body, user) => {
  const projectId = text(body.projectId, { field: "Layihə", required: true, max: 160 });
  await requireProject(projectId, user);
  const id = text(body.id, { field: "Qeyd", required: true, max: 160 });
  const issue = body.action === "update-issue-status";
  const status = oneOf(body.status, issue ? issueStatuses : documentStatuses, issue ? "open" : "draft", "Status");
  const rows = issue ? await query(
    `UPDATE project_quality_issues SET status = $1,
       resolved_by = CASE WHEN $1 IN ('resolved','verified') THEN $2 ELSE resolved_by END,
       resolved_at = CASE WHEN $1 IN ('resolved','verified') THEN now() ELSE resolved_at END,
       updated_at = now() WHERE id = $3 AND project_id = $4 RETURNING id`,
    [status, user.id, id, projectId]
  ) : await query(
    `UPDATE project_control_documents SET status = $1,
       approved_by = CASE WHEN $1 = 'accepted' THEN $2 ELSE approved_by END,
       approved_at = CASE WHEN $1 = 'accepted' THEN now() ELSE approved_at END,
       updated_at = now() WHERE id = $3 AND project_id = $4 RETURNING id`,
    [status, user.id, id, projectId]
  );
  if (!rows[0]) throw new ApiError(404, "project_control_entry_not_found", "Obyekt jurnalı qeydi tapılmadı.");
  if (!issue && status === "accepted") {
    await query(
      `UPDATE project_control_documents current_document
          SET status = 'superseded', updated_at = now()
        WHERE current_document.project_id = $1
          AND current_document.record_type = 'drawing_revision'
          AND current_document.status = 'accepted'
          AND current_document.id <> $2
          AND EXISTS (
            SELECT 1 FROM project_control_documents selected
             WHERE selected.id = $2 AND selected.record_type = 'drawing_revision'
          )`,
      [projectId, id]
    );
  }
  await recordAudit({ actorId: user.id, action: "status", entityType: issue ? "project_quality_issue" : "project_control_document", entityId: id, details: { projectId, status } });
  return projectId;
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const sendWeeklyReport = (res, data) => {
  const { project, logs, issues, documents, summary } = data;
  const rows = logs.map((item) => `<tr><td>${escapeHtml(item.workDate)}</td><td>${escapeHtml(item.crewName)}</td><td>${item.workerCount}</td><td>${escapeHtml(item.workSummary)}</td><td>${item.delayMinutes}</td></tr>`).join("");
  const issueRows = issues.filter((item) => !["resolved", "verified"].includes(item.status)).map((item) => `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.workArea)}</td><td>${escapeHtml(item.severity)}</td><td>${escapeHtml(item.status)}</td></tr>`).join("");
  const actRows = documents.map((item) => `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.revisionCode)}</td></tr>`).join("");
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`<!doctype html><html lang="az"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.title)} · Həftəlik obyekt hesabatı</title><link rel="stylesheet" href="/assets/css/styles.css"><link rel="stylesheet" href="/assets/css/enterprise.css"></head><body><main class="section"><section class="admin-panel"><p class="eyebrow">ConstEra obyekt hesabatı</p><h1>${escapeHtml(project.title)}</h1><p>${escapeHtml(summary.period.start)} — ${escapeHtml(summary.period.end)} · ${escapeHtml(project.city)}</p><div class="admin-stat-grid"><article class="stat-card"><span class="stat-value">${summary.workdays}</span><p>iş günü</p></article><article class="stat-card"><span class="stat-value">${summary.workerShifts}</span><p>işçi-növbə</p></article><article class="stat-card"><span class="stat-value">${summary.workerHours}</span><p>iş saatı</p></article><article class="stat-card"><span class="stat-value">${summary.openIssues}</span><p>açıq qüsur</p></article></div><h2>Gündəlik icra</h2><div class="table-wrap"><table class="admin-table"><thead><tr><th>Tarix</th><th>Briqada</th><th>İşçi</th><th>Görülən iş</th><th>Gecikmə, dəq.</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Qeyd yoxdur.</td></tr>'}</tbody></table></div><h2>Açıq qüsurlar</h2><div class="table-wrap"><table class="admin-table"><thead><tr><th>Kod</th><th>Qüsur</th><th>Sahə</th><th>Risk</th><th>Status</th></tr></thead><tbody>${issueRows || '<tr><td colspan="5">Açıq qüsur yoxdur.</td></tr>'}</tbody></table></div><h2>Aktlar və çertyoj versiyaları</h2><div class="table-wrap"><table class="admin-table"><thead><tr><th>Kod</th><th>Ad</th><th>Tip</th><th>Status</th><th>Reviziya</th></tr></thead><tbody>${actRows || '<tr><td colspan="5">Sənəd yoxdur.</td></tr>'}</tbody></table></div><p>Hesabat ConstEra-da saxlanmış obyekt qeydlərindən yaradılıb.</p></section></main></body></html>`);
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req);
  if (req.method === "GET") {
    const projectId = text(req.query.projectId, { field: "Layihə", required: true, max: 160 });
    const data = await readJournal(projectId, user, req.query);
    if (req.query.report === "weekly") return sendWeeklyReport(res, data);
    return sendJson(res, 200, { ok: true, data });
  }

  assertMethod(req, ["POST", "DELETE"]);
  assertSameOrigin(req);
  const body = await readJson(req, 300_000);
  const action = text(body.action, { field: "Əməliyyat", required: true, max: 80 });
  if (req.method === "DELETE") {
    const tables = { "delete-log": "project_site_daily_logs", "delete-issue": "project_quality_issues", "delete-document": "project_control_documents" };
    const table = tables[action];
    if (!table) throw new ApiError(400, "invalid_action", "Silinmə əməliyyatı dəstəklənmir.");
    const projectId = text(body.projectId, { field: "Layihə", required: true, max: 160 });
    await requireProject(projectId, user);
    const id = text(body.id, { field: "Qeyd", required: true, max: 160 });
    const rows = await query(`DELETE FROM ${table} WHERE id = $1 AND project_id = $2 RETURNING id`, [id, projectId]);
    if (!rows[0]) throw new ApiError(404, "project_control_entry_not_found", "Obyekt jurnalı qeydi tapılmadı.");
    await recordAudit({ actorId: user.id, action: "delete", entityType: table, entityId: id, details: { projectId } });
    return sendJson(res, 200, { ok: true, data: await readJournal(projectId, user) });
  }

  let projectId;
  if (action === "create-daily-log") projectId = await createDailyLog(body, user);
  else if (action === "create-issue") projectId = await createIssue(body, user);
  else if (action === "create-document") projectId = await createDocument(body, user);
  else if (["update-issue-status", "update-document-status"].includes(action)) projectId = await updateStatus(body, user);
  else throw new ApiError(400, "invalid_action", "Obyekt jurnalı əməliyyatı dəstəklənmir.");
  return sendJson(res, 200, { ok: true, data: await readJournal(projectId, user) });
});
