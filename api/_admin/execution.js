import { randomUUID } from "node:crypto";
import { assertCriticalTwoFactor, requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { calculatePaymentCertificate, canTransitionExecution, lineAmount, progressPercent } from "../_lib/project-execution.js";
import { entityId, oneOf, safeUrl, stringList, text } from "../_lib/validation.js";

const privilegedRoles = new Set(["super_admin", "admin", "sales"]);
const contractStatuses = ["draft", "active", "suspended", "completed", "cancelled"];
const measurementStatuses = ["draft", "submitted", "accepted", "rejected", "cancelled"];
const certificateStatuses = ["draft", "submitted", "certified", "rejected", "paid", "cancelled"];

const isPrivileged = (user) => privilegedRoles.has(user.role);
const camelize = (row) => Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [
  key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value
]));
const camelizeRows = (rows) => rows.map(camelize);

const decimal = (value, field, { min = 0, max = 1_000_000_000, digits = 2, positive = false } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (positive && number <= 0)) {
    throw new ApiError(400, "validation_error", `${field} düzgün rəqəm olmalıdır.`);
  }
  return Number(number.toFixed(digits));
};

const isoDate = (value, field, { required = true } = {}) => {
  const result = text(value, { field, required, max: 10 });
  if (!result && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00Z`))) {
    throw new ApiError(400, "validation_error", `${field} düzgün tarix olmalıdır.`);
  }
  return result;
};

const currency = (value) => oneOf(String(value || "AZN").toUpperCase(), ["AZN", "USD", "EUR"], "AZN", "Valyuta");
const evidenceUrls = (value) => stringList(value, 20).map((item) => safeUrl(item, "Sübut URL-i"));

const requireProjectOwner = async (projectId, user) => {
  const id = text(projectId, { field: "Layihə", required: true, max: 160 });
  const rows = await query(
    `SELECT id, customer_id, title, status, currency
       FROM customer_projects
      WHERE id = $1 AND (customer_id = $2 OR $3::boolean = true)
      LIMIT 1`,
    [id, user.id, isPrivileged(user)]
  );
  if (!rows[0]) throw new ApiError(404, "project_not_found", "Layihə tapılmadı və ya idarəetmə icazəsi yoxdur.");
  return rows[0];
};

const requireContract = async (contractId, user, { manage = false } = {}) => {
  const id = text(contractId, { field: "Müqavilə", required: true, max: 160 });
  const rows = await query(
    `SELECT contract.*, project.customer_id, project.title AS project_title,
            supplier.name AS contractor_name, supplier.company_id AS contractor_company_id
       FROM project_work_contracts contract
       JOIN customer_projects project ON project.id = contract.project_id
       JOIN suppliers supplier ON supplier.id = contract.contractor_supplier_id
      WHERE contract.id = $1
        AND ($2::boolean = true OR project.customer_id = $3 OR ($4::boolean = false AND supplier.company_id = $5))
      LIMIT 1`,
    [id, isPrivileged(user), user.id, manage, user.companyId]
  );
  if (!rows[0]) throw new ApiError(404, "contract_not_found", "İş müqaviləsi tapılmadı və ya giriş icazəsi yoxdur.");
  return rows[0];
};

const requireBoqItem = async (boqItemId, contractId) => {
  const id = text(boqItemId, { field: "BOQ mövqeyi", required: true, max: 160 });
  const rows = await query(
    "SELECT * FROM project_boq_items WHERE id = $1 AND contract_id = $2 LIMIT 1",
    [id, contractId]
  );
  if (!rows[0]) throw new ApiError(404, "boq_item_not_found", "BOQ mövqeyi seçilmiş müqaviləyə aid deyil.");
  return rows[0];
};

const requireMeasurement = async (measurementId, user) => {
  const id = text(measurementId, { field: "Ölçmə", required: true, max: 160 });
  const rows = await query(
    `SELECT measurement.*, item.contract_quantity, item.unit_rate, item.title AS item_title,
            contract.project_id, project.customer_id, supplier.company_id AS contractor_company_id
       FROM project_work_measurements measurement
       JOIN project_boq_items item ON item.id = measurement.boq_item_id
       JOIN project_work_contracts contract ON contract.id = measurement.contract_id
       JOIN customer_projects project ON project.id = contract.project_id
       JOIN suppliers supplier ON supplier.id = contract.contractor_supplier_id
      WHERE measurement.id = $1
        AND ($2::boolean = true OR project.customer_id = $3 OR supplier.company_id = $4)
      LIMIT 1`,
    [id, isPrivileged(user), user.id, user.companyId]
  );
  if (!rows[0]) throw new ApiError(404, "measurement_not_found", "Sahə ölçməsi tapılmadı və ya giriş icazəsi yoxdur.");
  return rows[0];
};

const requireCertificate = async (certificateId, user) => {
  const id = text(certificateId, { field: "Ödəniş aktı", required: true, max: 160 });
  const rows = await query(
    `SELECT certificate.*, contract.project_id, contract.title AS contract_title,
            contract.contract_number, contract.external_contract_number,
            project.title AS project_title, project.customer_id,
            supplier.name AS contractor_name, supplier.company_id AS contractor_company_id
       FROM project_payment_certificates certificate
       JOIN project_work_contracts contract ON contract.id = certificate.contract_id
       JOIN customer_projects project ON project.id = contract.project_id
       JOIN suppliers supplier ON supplier.id = contract.contractor_supplier_id
      WHERE certificate.id = $1
        AND ($2::boolean = true OR project.customer_id = $3 OR supplier.company_id = $4)
      LIMIT 1`,
    [id, isPrivileged(user), user.id, user.companyId]
  );
  if (!rows[0]) throw new ApiError(404, "certificate_not_found", "Ödəniş aktı tapılmadı və ya giriş icazəsi yoxdur.");
  return rows[0];
};

const readCertificateDocument = async (certificateId, user) => {
  const certificate = await requireCertificate(certificateId, user);
  const items = await query(
    `SELECT certificate_item.*, item.item_code, item.title, item.unit,
            measurement.measurement_number, measurement.work_date, measurement.location_text
       FROM project_payment_certificate_items certificate_item
       JOIN project_boq_items item ON item.id = certificate_item.boq_item_id
       JOIN project_work_measurements measurement ON measurement.id = certificate_item.measurement_id
      WHERE certificate_item.certificate_id = $1
      ORDER BY item.sort_order, item.item_code, measurement.work_date`,
    [certificate.id]
  );
  return { certificate: camelize(certificate), items: camelizeRows(items) };
};

const readDashboard = async (user) => {
  const common = [user.id, user.companyId, isPrivileged(user)];
  const [projects, suppliers, changes, contracts, boqItems, measurements, certificates] = await Promise.all([
    query(
      `SELECT DISTINCT project.id, project.title, project.status, project.city, project.currency
         FROM customer_projects project
         LEFT JOIN project_work_contracts contract ON contract.project_id = project.id
         LEFT JOIN suppliers supplier ON supplier.id = contract.contractor_supplier_id
        WHERE $3::boolean = true OR project.customer_id = $1 OR supplier.company_id = $2
        ORDER BY project.title`, common
    ),
    query(
      `SELECT id, name, region, company_id,
              ($3::boolean = true OR company_id = $2) AS own_company
         FROM suppliers
        WHERE status <> 'Arxiv'
          AND ($3::boolean = true OR company_id = $2 OR EXISTS (
            SELECT 1 FROM customer_projects own_project WHERE own_project.customer_id = $1
          ))
        ORDER BY name LIMIT 500`, common
    ),
    query(
      `SELECT change.id, change.change_number, change.project_id, change.title, change.cost_delta,
              change.currency, change.status
         FROM project_change_orders change
         JOIN customer_projects project ON project.id = change.project_id
         LEFT JOIN project_work_contracts contract ON contract.project_id = project.id
         LEFT JOIN suppliers supplier ON supplier.id = contract.contractor_supplier_id
        WHERE change.status IN ('approved', 'implemented')
          AND ($3::boolean = true OR project.customer_id = $1 OR supplier.company_id = $2)
        ORDER BY change.created_at DESC`, common
    ),
    query(
      `SELECT contract.*, project.title AS project_title, project.customer_id,
              supplier.name AS contractor_name, supplier.company_id AS contractor_company_id,
              COALESCE((SELECT sum(item.contract_quantity * item.unit_rate) FROM project_boq_items item
                         WHERE item.contract_id = contract.id AND item.status <> 'cancelled'), 0) AS boq_amount,
              COALESCE((SELECT sum(measurement.measured_quantity * item.unit_rate)
                         FROM project_work_measurements measurement
                         JOIN project_boq_items item ON item.id = measurement.boq_item_id
                        WHERE measurement.contract_id = contract.id AND measurement.status = 'accepted'), 0) AS accepted_amount,
              COALESCE((SELECT sum(certificate.net_payable) FROM project_payment_certificates certificate
                         WHERE certificate.contract_id = contract.id AND certificate.status IN ('certified', 'paid')), 0) AS certified_net,
              COALESCE((SELECT sum(certificate.net_payable) FROM project_payment_certificates certificate
                         WHERE certificate.contract_id = contract.id AND certificate.status = 'paid'), 0) AS paid_net
         FROM project_work_contracts contract
         JOIN customer_projects project ON project.id = contract.project_id
         JOIN suppliers supplier ON supplier.id = contract.contractor_supplier_id
        WHERE $3::boolean = true OR project.customer_id = $1 OR supplier.company_id = $2
        ORDER BY contract.created_at DESC`, common
    ),
    query(
      `SELECT item.*, contract.project_id, contract.title AS contract_title,
              change.change_number,
              COALESCE((SELECT sum(measurement.measured_quantity) FROM project_work_measurements measurement
                         WHERE measurement.boq_item_id = item.id AND measurement.status = 'accepted'), 0) AS accepted_quantity,
              COALESCE((SELECT sum(certificate_item.quantity) FROM project_payment_certificate_items certificate_item
                         JOIN project_payment_certificates certificate ON certificate.id = certificate_item.certificate_id
                        WHERE certificate_item.boq_item_id = item.id AND certificate.status IN ('certified', 'paid')), 0) AS certified_quantity
         FROM project_boq_items item
         JOIN project_work_contracts contract ON contract.id = item.contract_id
         JOIN customer_projects project ON project.id = contract.project_id
         JOIN suppliers supplier ON supplier.id = contract.contractor_supplier_id
         LEFT JOIN project_change_orders change ON change.id = item.linked_change_order_id
        WHERE $3::boolean = true OR project.customer_id = $1 OR supplier.company_id = $2
        ORDER BY contract.created_at DESC, item.sort_order, item.item_code`, common
    ),
    query(
      `SELECT measurement.*, item.item_code, item.title AS item_title, item.unit, item.unit_rate,
              contract.title AS contract_title, contract.currency,
              project.title AS project_title, project.customer_id,
              supplier.company_id AS contractor_company_id
         FROM project_work_measurements measurement
         JOIN project_boq_items item ON item.id = measurement.boq_item_id
         JOIN project_work_contracts contract ON contract.id = measurement.contract_id
         JOIN customer_projects project ON project.id = contract.project_id
         JOIN suppliers supplier ON supplier.id = contract.contractor_supplier_id
        WHERE $3::boolean = true OR project.customer_id = $1 OR supplier.company_id = $2
        ORDER BY measurement.created_at DESC LIMIT 500`, common
    ),
    query(
      `SELECT certificate.*, contract.title AS contract_title, contract.contract_number,
              project.title AS project_title, project.customer_id,
              supplier.name AS contractor_name, supplier.company_id AS contractor_company_id,
              (SELECT count(*)::int FROM project_payment_certificate_items item
                WHERE item.certificate_id = certificate.id) AS line_count
         FROM project_payment_certificates certificate
         JOIN project_work_contracts contract ON contract.id = certificate.contract_id
         JOIN customer_projects project ON project.id = contract.project_id
         JOIN suppliers supplier ON supplier.id = contract.contractor_supplier_id
        WHERE $3::boolean = true OR project.customer_id = $1 OR supplier.company_id = $2
        ORDER BY certificate.created_at DESC LIMIT 300`, common
    )
  ]);

  const contractRows = camelizeRows(contracts).map((contract) => ({
    ...contract,
    progressPercent: progressPercent(contract.acceptedAmount, Math.max(Number(contract.contractAmount), Number(contract.boqAmount)))
  }));
  return {
    actor: { id: user.id, name: user.name, role: user.role, companyId: user.companyId || null },
    stats: {
      contracts: contractRows.length,
      boqItems: boqItems.length,
      submittedMeasurements: measurements.filter((row) => row.status === "submitted").length,
      certifiedCertificates: certificates.filter((row) => ["certified", "paid"].includes(row.status)).length,
      payableTotal: certificates.filter((row) => row.status === "certified").reduce((sum, row) => sum + Number(row.net_payable || 0), 0)
    },
    projects: camelizeRows(projects), suppliers: camelizeRows(suppliers), changes: camelizeRows(changes),
    contracts: contractRows, boqItems: camelizeRows(boqItems), measurements: camelizeRows(measurements),
    certificates: camelizeRows(certificates)
  };
};

const createContract = async (body, user) => {
  const project = await requireProjectOwner(body.projectId, user);
  const supplierId = text(body.contractorSupplierId, { field: "Podratçı", required: true, max: 160 });
  const supplierRows = await query("SELECT id FROM suppliers WHERE id = $1 AND status <> 'Arxiv' LIMIT 1", [supplierId]);
  if (!supplierRows[0]) throw new ApiError(404, "contractor_not_found", "Podratçı tapılmadı.");
  const startDate = isoDate(body.startDate, "Başlama tarixi");
  const endDate = isoDate(body.endDate, "Bitmə tarixi", { required: false });
  if (endDate && endDate < startDate) throw new ApiError(400, "invalid_contract_dates", "Bitmə tarixi başlama tarixindən əvvəl ola bilməz.");
  const id = entityId(body.id, "work-contract");
  await query(
    `INSERT INTO project_work_contracts (
       id, project_id, contractor_supplier_id, external_contract_number, title, currency,
       contract_amount, advance_percent, advance_recovery_percent, retention_percent,
       tax_percent, start_date, end_date, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id, project.id, supplierId, text(body.externalContractNumber, { max: 120 }) || null,
      text(body.title, { field: "Müqavilə adı", required: true, max: 240 }), currency(body.currency),
      decimal(body.contractAmount, "Müqavilə məbləği", { positive: true }),
      decimal(body.advancePercent || 0, "Avans faizi", { max: 100 }),
      decimal(body.advanceRecoveryPercent || 0, "Avans tutulması", { max: 100 }),
      decimal(body.retentionPercent || 0, "Zəmanət saxlaması", { max: 100 }),
      decimal(body.taxPercent || 0, "ƏDV faizi", { max: 100 }), startDate, endDate, user.id
    ]
  );
  await recordAudit({ actorId: user.id, action: "create", entityType: "project_work_contract", entityId: id, details: { projectId: project.id, supplierId } });
};

const createBoqItem = async (body, user) => {
  const contract = await requireContract(body.contractId, user, { manage: true });
  if (["completed", "cancelled"].includes(contract.status)) throw new ApiError(409, "contract_closed", "Bağlanmış müqaviləyə BOQ mövqeyi əlavə edilə bilməz.");
  const changeOrderId = text(body.linkedChangeOrderId, { max: 160 }) || null;
  if (changeOrderId) {
    const changes = await query(
      "SELECT id FROM project_change_orders WHERE id = $1 AND project_id = $2 AND status IN ('approved', 'implemented') LIMIT 1",
      [changeOrderId, contract.project_id]
    );
    if (!changes[0]) throw new ApiError(409, "change_order_mismatch", "Dəyişiklik sifarişi bu layihəyə aid və təsdiqlənmiş olmalıdır.");
  }
  const id = entityId(body.id, "boq");
  await query(
    `INSERT INTO project_boq_items (
       id, contract_id, item_code, title, work_category, unit, contract_quantity,
       unit_rate, linked_change_order_id, sort_order, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id, contract.id, text(body.itemCode, { field: "İş kodu", required: true, max: 80 }),
      text(body.title, { field: "İşin adı", required: true, max: 300 }),
      text(body.workCategory, { max: 160 }) || null,
      text(body.unit, { field: "Ölçü vahidi", required: true, max: 40 }),
      decimal(body.contractQuantity, "Müqavilə miqdarı", { positive: true, digits: 3 }),
      decimal(body.unitRate, "Vahid qiyməti"), changeOrderId,
      Math.max(0, Math.min(100000, Number.parseInt(body.sortOrder || 0, 10) || 0)), user.id
    ]
  );
  await recordAudit({ actorId: user.id, action: "create", entityType: "project_boq_item", entityId: id, details: { contractId: contract.id, changeOrderId } });
};

const createMeasurement = async (body, user) => {
  const contract = await requireContract(body.contractId, user);
  if (contract.status !== "active") throw new ApiError(409, "contract_not_active", "Ölçmə yalnız aktiv iş müqaviləsində yaradıla bilər.");
  const item = await requireBoqItem(body.boqItemId, contract.id);
  if (item.status !== "active") throw new ApiError(409, "boq_item_closed", "Bağlanmış BOQ mövqeyi üzrə ölçmə yaradıla bilməz.");
  const measuredQuantity = decimal(body.measuredQuantity, "Ölçülən miqdar", { positive: true, digits: 3 });
  const id = entityId(body.id, "measurement");
  await query(
    `INSERT INTO project_work_measurements (
       id, contract_id, boq_item_id, work_date, measured_quantity,
       location_text, evidence_urls, note, submitted_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
    [
      id, contract.id, item.id, isoDate(body.workDate, "İş tarixi"), measuredQuantity,
      text(body.locationText, { max: 300 }) || null, JSON.stringify(evidenceUrls(body.evidenceUrls)),
      text(body.note, { max: 2_000 }) || null, user.id
    ]
  );
  await recordAudit({ actorId: user.id, action: "create", entityType: "project_work_measurement", entityId: id, details: { contractId: contract.id, boqItemId: item.id, measuredQuantity } });
};

const createCertificate = async (body, user) => {
  const contract = await requireContract(body.contractId, user);
  if (!["active", "suspended"].includes(contract.status)) throw new ApiError(409, "contract_not_payable", "Ödəniş aktı yalnız aktiv və ya dayandırılmış müqavilə üzrə yaradıla bilər.");
  const certificateType = oneOf(body.certificateType, ["interim", "final"], "interim", "Akt tipi");
  const periodStart = isoDate(body.periodStart, "Dövrün başlanğıcı");
  const periodEnd = isoDate(body.periodEnd, "Dövrün sonu");
  if (periodEnd < periodStart) throw new ApiError(400, "invalid_certificate_period", "Dövrün sonu başlanğıcdan əvvəl ola bilməz.");
  const measurements = await query(
    `SELECT measurement.id AS measurement_id, measurement.boq_item_id,
            measurement.measured_quantity AS quantity, item.unit_rate
       FROM project_work_measurements measurement
       JOIN project_boq_items item ON item.id = measurement.boq_item_id
       LEFT JOIN project_payment_certificate_items allocated ON allocated.measurement_id = measurement.id
      WHERE measurement.contract_id = $1 AND measurement.status = 'accepted'
        AND measurement.work_date BETWEEN $2 AND $3 AND allocated.id IS NULL
      ORDER BY measurement.work_date, measurement.measurement_number`,
    [contract.id, periodStart, periodEnd]
  );
  const lines = measurements.map((row) => ({
    id: `certificate-item-${randomUUID()}`,
    measurementId: row.measurement_id,
    boqItemId: row.boq_item_id,
    quantity: Number(row.quantity),
    unitRate: Number(row.unit_rate),
    lineAmount: lineAmount(row.quantity, row.unit_rate)
  }));
  const priorRows = await query(
    `SELECT COALESCE(sum(advance_recovery_amount), 0) AS advance_recovery,
            COALESCE(sum(retention_amount), 0) AS retention,
            COALESCE(sum(retention_release_amount), 0) AS retention_release
       FROM project_payment_certificates
      WHERE contract_id = $1 AND status IN ('certified', 'paid')`,
    [contract.id]
  );
  const releaseRetention = certificateType === "final" && Boolean(body.releaseRetention);
  if (releaseRetention) {
    const pendingRelease = await query(
      `SELECT id FROM project_payment_certificates
        WHERE contract_id = $1 AND retention_release_amount > 0
          AND status IN ('draft', 'submitted', 'certified')
        LIMIT 1`,
      [contract.id]
    );
    if (pendingRelease[0]) {
      throw new ApiError(409, "retention_release_pending", "Bu müqavilə üzrə zəmanət saxlamasını azad edən açıq akt artıq mövcuddur.");
    }
  }
  const financials = calculatePaymentCertificate({
    workAmount: lines.reduce((sum, item) => sum + item.lineAmount, 0),
    contractAmount: contract.contract_amount,
    advancePercent: contract.advance_percent,
    advanceRecoveryPercent: contract.advance_recovery_percent,
    retentionPercent: contract.retention_percent,
    taxPercent: contract.tax_percent,
    priorAdvanceRecovery: priorRows[0]?.advance_recovery,
    priorRetention: priorRows[0]?.retention,
    priorRetentionRelease: priorRows[0]?.retention_release,
    otherDeductions: decimal(body.otherDeductions || 0, "Digər tutulmalar"),
    releaseRetention
  });
  if (!lines.length && financials.retentionReleaseAmount <= 0) {
    throw new ApiError(409, "no_payable_measurements", "Seçilmiş dövrdə akta daxil ediləcək qəbul olunmuş ölçmə yoxdur.");
  }
  const id = entityId(body.id, "certificate");
  try {
    await query(
      `WITH certificate AS (
       INSERT INTO project_payment_certificates (
         id, contract_id, certificate_type, period_start, period_end, work_amount,
         advance_recovery_amount, retention_amount, retention_release_amount,
         other_deductions, tax_percent, tax_amount, net_payable, currency, note, submitted_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id
     )
     INSERT INTO project_payment_certificate_items (
       id, certificate_id, measurement_id, boq_item_id, quantity, unit_rate, line_amount
     )
     SELECT line.id, certificate.id,
            line.measurement_id, line.boq_item_id, line.quantity, line.unit_rate, line.line_amount
       FROM certificate
       CROSS JOIN jsonb_to_recordset($17::jsonb) AS line(
         id text, measurement_id text, boq_item_id text, quantity numeric, unit_rate numeric, line_amount numeric
       )`,
      [
        id, contract.id, certificateType, periodStart, periodEnd, financials.workAmount,
        financials.advanceRecoveryAmount, financials.retentionAmount, financials.retentionReleaseAmount,
        financials.otherDeductions, Number(contract.tax_percent), financials.taxAmount,
        financials.netPayable, contract.currency,
        text(body.note, { max: 2_000 }) || null, user.id,
        JSON.stringify(lines.map((item) => ({
          id: item.id, measurement_id: item.measurementId, boq_item_id: item.boqItemId,
          quantity: item.quantity, unit_rate: item.unitRate, line_amount: item.lineAmount
        })))
      ]
    );
  } catch (error) {
    if (error?.code === "23505" && error?.constraint === "project_payment_certificates_open_retention_release_idx") {
      throw new ApiError(409, "retention_release_pending", "Bu müqavilə üzrə zəmanət saxlamasını azad edən açıq akt artıq mövcuddur.");
    }
    if (error?.code === "23505") {
      throw new ApiError(409, "measurement_already_allocated", "Ölçmələrdən biri artıq başqa ödəniş aktına daxil edilib. Məlumatları yeniləyib təkrar yoxlayın.");
    }
    throw error;
  }
  await recordAudit({ actorId: user.id, action: "create", entityType: "project_payment_certificate", entityId: id, details: { contractId: contract.id, certificateType, lineCount: lines.length, netPayable: financials.netPayable } });
};

const updateContractStatus = async (body, user) => {
  const contract = await requireContract(body.id, user, { manage: true });
  const status = oneOf(body.status, contractStatuses, contract.status, "Müqavilə statusu");
  if (!canTransitionExecution("contract", contract.status, status)) throw new ApiError(409, "invalid_status_transition", "Müqavilə statusu bu istiqamətdə dəyişdirilə bilməz.");
  if (["active", "completed", "cancelled"].includes(status)) assertCriticalTwoFactor(user);
  await query(
    `UPDATE project_work_contracts SET status = $2,
       approved_by = CASE WHEN $2 = 'active' THEN $3 ELSE approved_by END,
       approved_at = CASE WHEN $2 = 'active' THEN now() ELSE approved_at END,
       updated_at = now() WHERE id = $1`,
    [contract.id, status, user.id]
  );
  await recordAudit({ actorId: user.id, action: "status_update", entityType: "project_work_contract", entityId: contract.id, details: { from: contract.status, to: status } });
};

const updateMeasurementStatus = async (body, user) => {
  const measurement = await requireMeasurement(body.id, user);
  const status = oneOf(body.status, measurementStatuses, measurement.status, "Ölçmə statusu");
  if (!canTransitionExecution("measurement", measurement.status, status)) throw new ApiError(409, "invalid_status_transition", "Ölçmə statusu bu istiqamətdə dəyişdirilə bilməz.");
  const managing = isPrivileged(user) || measurement.customer_id === user.id;
  if (["accepted", "rejected"].includes(status)) {
    if (!managing) throw new ApiError(403, "permission_denied", "Ölçməni yalnız layihə sahibi təsdiqləyə bilər.");
    if (measurement.submitted_by === user.id) throw new ApiError(409, "self_approval_blocked", "Öz təqdim etdiyiniz ölçməni təsdiqləyə bilməzsiniz.");
    assertCriticalTwoFactor(user);
  } else if (!managing && measurement.submitted_by !== user.id) {
    throw new ApiError(403, "permission_denied", "Bu ölçmənin statusunu dəyişmək üçün icazəniz yoxdur.");
  }
  if (status === "accepted") {
    const totals = await query(
      `SELECT COALESCE(sum(measured_quantity), 0) AS accepted_quantity
         FROM project_work_measurements
        WHERE boq_item_id = $1 AND status = 'accepted' AND id <> $2`,
      [measurement.boq_item_id, measurement.id]
    );
    if (Number(totals[0]?.accepted_quantity || 0) + Number(measurement.measured_quantity) > Number(measurement.contract_quantity)) {
      throw new ApiError(409, "boq_quantity_exceeded", "Qəbul edilən ümumi miqdar BOQ müqavilə miqdarını aşır.");
    }
  }
  await query(
    `UPDATE project_work_measurements SET status = $2,
       reviewed_by = CASE WHEN $2 IN ('accepted', 'rejected') THEN $3 ELSE reviewed_by END,
       reviewed_at = CASE WHEN $2 IN ('accepted', 'rejected') THEN now() ELSE reviewed_at END,
       review_note = CASE WHEN $2 IN ('accepted', 'rejected') THEN $4 ELSE review_note END,
       updated_at = now() WHERE id = $1`,
    [measurement.id, status, user.id, text(body.reviewNote, { max: 1_000 }) || null]
  );
  await recordAudit({ actorId: user.id, action: "status_update", entityType: "project_work_measurement", entityId: measurement.id, details: { from: measurement.status, to: status } });
};

const updateCertificateStatus = async (body, user) => {
  const certificate = await requireCertificate(body.id, user);
  const status = oneOf(body.status, certificateStatuses, certificate.status, "Akt statusu");
  if (!canTransitionExecution("certificate", certificate.status, status)) throw new ApiError(409, "invalid_status_transition", "Akt statusu bu istiqamətdə dəyişdirilə bilməz.");
  const managing = isPrivileged(user) || certificate.customer_id === user.id;
  if (["certified", "rejected", "paid"].includes(status)) {
    if (!managing) throw new ApiError(403, "permission_denied", "Aktı yalnız layihə sahibi təsdiqləyə və ödəyə bilər.");
    if (status === "certified" && certificate.submitted_by === user.id) throw new ApiError(409, "self_approval_blocked", "Öz təqdim etdiyiniz aktı təsdiqləyə bilməzsiniz.");
    assertCriticalTwoFactor(user);
  } else if (!managing && certificate.submitted_by !== user.id) {
    throw new ApiError(403, "permission_denied", "Bu aktın statusunu dəyişmək üçün icazəniz yoxdur.");
  }
  const paymentReference = text(body.paymentReference, { max: 160 }) || null;
  if (status === "paid" && !paymentReference) throw new ApiError(400, "payment_reference_required", "Ödəniş istinadını daxil edin.");
  await query(
    `UPDATE project_payment_certificates SET status = $2,
       certified_by = CASE WHEN $2 = 'certified' THEN $3 ELSE certified_by END,
       certified_at = CASE WHEN $2 = 'certified' THEN now() ELSE certified_at END,
       paid_by = CASE WHEN $2 = 'paid' THEN $3 ELSE paid_by END,
       paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE paid_at END,
       payment_reference = CASE WHEN $2 = 'paid' THEN $4 ELSE payment_reference END,
       note = COALESCE($5, note), updated_at = now() WHERE id = $1`,
    [certificate.id, status, user.id, paymentReference, text(body.note, { max: 2_000 }) || null]
  );
  await recordAudit({ actorId: user.id, action: "status_update", entityType: "project_payment_certificate", entityId: certificate.id, details: { from: certificate.status, to: status, paymentReference } });
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req);
  if (req.method === "GET") {
    const certificateId = text(req.query.certificateId, { max: 160 });
    return sendJson(res, 200, { ok: true, data: certificateId ? await readCertificateDocument(certificateId, user) : await readDashboard(user) });
  }

  assertMethod(req, ["POST"]);
  assertSameOrigin(req);
  const body = await readJson(req, 500_000);
  const action = text(body.action, { field: "Əməliyyat", required: true, max: 80 });
  if (action === "create-contract") await createContract(body, user);
  else if (action === "create-boq-item") await createBoqItem(body, user);
  else if (action === "create-measurement") await createMeasurement(body, user);
  else if (action === "create-certificate") await createCertificate(body, user);
  else if (action === "update-contract-status") await updateContractStatus(body, user);
  else if (action === "update-measurement-status") await updateMeasurementStatus(body, user);
  else if (action === "update-certificate-status") await updateCertificateStatus(body, user);
  else throw new ApiError(400, "invalid_action", "İcra və ödəniş əməliyyatı dəstəklənmir.");
  return sendJson(res, 200, { ok: true, data: await readDashboard(user) });
});
