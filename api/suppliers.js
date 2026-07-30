import { randomBytes, randomUUID } from "node:crypto";
import { hashOpaque, hashPassword, requireRole } from "./_lib/auth.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, getClientIp, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { queueNotification } from "./_lib/notifications.js";
import { assertPolicyConsent, recordPolicyConsent } from "./_lib/policy-consent.js";
import { email, entityId, oneOf, safeUrl, text } from "./_lib/validation.js";

const mapSupplier = (row) => ({
  id: row.id,
  name: row.name,
  type: row.supplier_type,
  focus: row.focus || "",
  website: row.website || "",
  status: row.status,
  region: row.region,
  contact: row.contact || "",
  rating: row.rating || "Yeni",
  responseTime: row.response_time || "Sorğu əsasında"
});

const normalizeSupplier = (body) => ({
  id: entityId(body.id, "supplier"),
  name: text(body.name, { field: "Təchizatçı adı", required: true, max: 200 }),
  type: text(body.type, { field: "Təchizatçı tipi", max: 120 }) || "Təchizatçı",
  focus: text(body.focus, { field: "İxtisaslaşma", max: 600 }),
  website: safeUrl(body.website, "Sayt URL-i"),
  status: text(body.status, { field: "Status", max: 80 }) || "Aktiv",
  region: text(body.region, { field: "Region", max: 160 }) || "Azərbaycan",
  contact: text(body.contact, { field: "Əlaqə", max: 300 }),
  rating: text(body.rating, { field: "Reytinq", max: 80 }) || "Yeni",
  responseTime: text(body.responseTime, { field: "Cavab müddəti", max: 160 }) || "Sorğu əsasında"
});

const mapApplication = (row) => ({
  id: row.id,
  companyName: row.company_name,
  contactName: row.contact_name,
  email: row.contact_email,
  phone: row.phone,
  taxId: row.tax_id,
  type: row.supplier_type,
  focus: row.focus || "",
  website: row.website || "",
  documentUrl: row.document_url || "",
  region: row.region,
  note: row.note || "",
  status: row.status,
  decisionNote: row.decision_note || "",
  companyId: row.company_id || null,
  supplierId: row.supplier_id || null,
  userId: row.user_id || null,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const normalizeTaxId = (value) => {
  const taxId = text(value, { field: "VÖEN", required: true, max: 20 }).replace(/\s/g, "");
  if (!/^\d{10}$/.test(taxId)) throw new ApiError(400, "validation_error", "VÖEN 10 rəqəmdən ibarət olmalıdır.");
  return taxId;
};

const createSupplierApplication = async (req, body) => {
  if (text(body.fax, { max: 200 })) return { accepted: true };
  assertPolicyConsent(body, { legacyField: "consent" });
  const submissionHash = hashOpaque(getClientIp(req));
  const recentRows = await query(
    "SELECT count(*)::int AS count FROM supplier_applications WHERE submission_hash = $1 AND created_at > now() - interval '24 hours'",
    [submissionHash]
  );
  if ((recentRows[0]?.count || 0) >= 3) {
    throw new ApiError(429, "supplier_application_rate_limited", "24 saat ərzində müraciət limiti dolub.");
  }
  const application = {
    id: `sap-${randomUUID()}`,
    companyName: text(body.companyName, { field: "Şirkət adı", required: true, min: 2, max: 200 }),
    contactName: text(body.contactName, { field: "Əlaqələndirici şəxs", required: true, min: 2, max: 160 }),
    contactEmail: email(body.email),
    phone: text(body.phone, { field: "Telefon", required: true, min: 7, max: 80 }),
    taxId: normalizeTaxId(body.taxId),
    supplierType: text(body.type, { field: "Təchizatçı tipi", max: 120 }) || "Təchizatçı",
    focus: text(body.focus, { field: "İxtisaslaşma", required: true, min: 3, max: 1_000 }),
    website: safeUrl(body.website, "Şirkət saytı"),
    documentUrl: safeUrl(body.documentUrl, "Təsdiq sənədi URL-i"),
    region: text(body.region, { field: "Region", max: 160 }) || "Azərbaycan",
    note: text(body.note, { field: "Qeyd", max: 2_000 })
  };
  try {
    const rows = await query(
      `INSERT INTO supplier_applications (
         id, company_name, contact_name, contact_email, phone, tax_id,
         supplier_type, focus, website, document_url, region, note, submission_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        application.id, application.companyName, application.contactName, application.contactEmail,
        application.phone, application.taxId, application.supplierType, application.focus,
        application.website || null, application.documentUrl || null, application.region,
        application.note || null, submissionHash
      ]
    );
    await recordPolicyConsent({
      entityType: "supplier_application",
      entityId: application.id,
      submissionHash,
      sourcePath: text(body.sourcePath, { max: 500 })
    });
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "";
    const notification = {
      subject: "Yeni təchizatçı müraciəti",
      body: `${application.companyName} (${application.taxId}) ConstEra təchizatçı kabineti üçün müraciət etdi.`,
      templateKey: "supplier_application_created",
      payload: { applicationId: application.id }
    };
    if (adminEmail) {
      await queueNotification({ ...notification, channel: "email", recipient: adminEmail });
    } else {
      const admins = await query(
        "SELECT id FROM users WHERE role IN ('super_admin', 'admin') AND status = 'active'"
      );
      for (const admin of admins) {
        await queueNotification({ ...notification, userId: admin.id, channel: "in_app" });
      }
    }
    await recordAudit({
      action: "create",
      entityType: "supplier_application",
      entityId: application.id,
      details: { companyName: application.companyName, taxId: application.taxId }
    });
    return mapApplication(rows[0]);
  } catch (error) {
    if (error?.code === "23505") {
      throw new ApiError(409, "supplier_application_exists", "Bu e-poçt və ya VÖEN üzrə gözləyən müraciət artıq mövcuddur.");
    }
    throw error;
  }
};

const reviewSupplierApplication = async (user, body) => {
  const id = text(body.applicationId, { field: "Müraciət ID-si", required: true, max: 160 });
  const action = oneOf(body.action, ["approve", "reject"], "approve", "Müraciət qərarı");
  const applicationRows = await query("SELECT * FROM supplier_applications WHERE id = $1 LIMIT 1", [id]);
  const application = applicationRows[0];
  if (!application) throw new ApiError(404, "supplier_application_not_found", "Təchizatçı müraciəti tapılmadı.");
  if (application.status !== "pending") {
    throw new ApiError(409, "supplier_application_reviewed", "Bu müraciət artıq nəzərdən keçirilib.");
  }
  const decisionNote = text(body.decisionNote, { max: 1_000 });
  if (action === "reject") {
    const rows = await query(
      `UPDATE supplier_applications
          SET status = 'rejected', decision_note = $2, reviewed_by = $3,
              reviewed_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [id, decisionNote || "Müraciət tələblərə uyğun deyil.", user.id]
    );
    await recordAudit({ actorId: user.id, action: "reject", entityType: "supplier_application", entityId: id });
    await queueNotification({
      channel: "email",
      recipient: application.contact_email,
      subject: "ConstEra təchizatçı müraciəti",
      body: `Salam, ${application.contact_name}. ${application.company_name} üçün müraciət təsdiqlənmədi. ${decisionNote || "Əlavə məlumat üçün ConstEra ilə əlaqə saxla."}`,
      templateKey: "supplier_application_rejected",
      payload: { applicationId: id }
    });
    return { application: mapApplication(rows[0]), invitationQueued: false };
  }

  const duplicateRows = await query(
    `SELECT
      EXISTS (SELECT 1 FROM users WHERE lower(email) = lower($1)) AS duplicate_user,
      EXISTS (SELECT 1 FROM companies WHERE tax_id = $2) AS duplicate_tax,
      EXISTS (SELECT 1 FROM suppliers WHERE lower(name) = lower($3)) AS duplicate_supplier`,
    [application.contact_email, application.tax_id, application.company_name]
  );
  const duplicates = duplicateRows[0] || {};
  if (duplicates.duplicate_user || duplicates.duplicate_tax || duplicates.duplicate_supplier) {
    throw new ApiError(409, "supplier_identity_conflict", "Bu e-poçt, VÖEN və ya şirkət adı ilə hesab artıq mövcuddur.");
  }

  const companyId = `com-${randomUUID()}`;
  const supplierId = `sup-${randomUUID()}`;
  const userId = `usr-${randomUUID()}`;
  const contractId = `sct-${randomUUID()}`;
  const contractNumber = `CE-SUP-${new Date().getUTCFullYear()}-${supplierId.slice(-8).toUpperCase()}`;
  const temporaryPassword = `${randomBytes(12).toString("base64url")}Aa7!`;
  const passwordHash = await hashPassword(temporaryPassword);
  const rows = await query(
    `WITH selected AS (
       SELECT * FROM supplier_applications WHERE id = $1 AND status = 'pending'
     ), company AS (
       INSERT INTO companies (id, name, company_type, tax_id, status, contact_email, phone, region)
       SELECT $2, company_name, 'supplier', tax_id, 'active', contact_email, phone, region
       FROM selected RETURNING id
     ), supplier_profile AS (
       INSERT INTO suppliers (id, company_id, name, supplier_type, focus, website, status, region, contact)
       SELECT $3, company.id, selected.company_name, selected.supplier_type, selected.focus,
              selected.website, 'Aktiv', selected.region,
              selected.phone || ' · ' || selected.contact_email
       FROM selected CROSS JOIN company RETURNING id
     ), account AS (
       INSERT INTO users (
         id, company_id, email, name, password_hash, role, status,
         must_change_password, password_changed_at
       )
       SELECT $4, company.id, selected.contact_email, selected.contact_name, $5,
              'supplier', 'active', true, now()
       FROM selected CROSS JOIN company RETURNING id
     ), contract AS (
       INSERT INTO supplier_contracts (
         id, supplier_id, contract_number, status, created_by
       )
       SELECT $8, supplier_profile.id, $9, 'draft', $7
       FROM supplier_profile
       RETURNING id
     )
     UPDATE supplier_applications application
        SET status = 'approved', decision_note = $6, reviewed_by = $7,
            reviewed_at = now(), company_id = company.id,
            supplier_id = supplier_profile.id, user_id = account.id, updated_at = now()
       FROM company, supplier_profile, account, contract
      WHERE application.id = $1 AND application.status = 'pending'
      RETURNING application.*`,
    [
      id,
      companyId,
      supplierId,
      userId,
      passwordHash,
      decisionNote || null,
      user.id,
      contractId,
      contractNumber
    ]
  );
  if (!rows[0]) throw new ApiError(409, "supplier_application_reviewed", "Müraciət eyni vaxtda başqa istifadəçi tərəfindən yeniləndi.");

  const resetToken = randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '48 hours')`,
    [`rst-${randomUUID()}`, userId, hashOpaque(resetToken)]
  );
  const origin = String(process.env.APP_ORIGIN || "https://constera.az").replace(/\/$/, "");
  const setupUrl = `${origin}/login.html?reset=${encodeURIComponent(resetToken)}&next=supplier-portal.html`;
  await queueNotification({
    userId,
    channel: "email",
    recipient: application.contact_email,
    subject: "ConstEra təchizatçı hesabın təsdiqləndi",
    body: `Salam, ${application.contact_name}. ${application.company_name} üçün təchizatçı hesabı yaradıldı. 48 saat ərzində şifrəni qur: ${setupUrl}`,
    templateKey: "supplier_application_approved",
    payload: { applicationId: id, supplierId, setupUrl }
  });
  await recordAudit({
    actorId: user.id,
    action: "approve",
    entityType: "supplier_application",
    entityId: id,
    details: { companyId, supplierId, userId, contractId }
  });
  return { application: mapApplication(rows[0]), invitationQueued: true };
};

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    if (req.query.scope === "applications") {
      await requireRole(req, ["super_admin", "admin"]);
      const status = oneOf(req.query.status, ["pending", "approved", "rejected", "withdrawn", "all"], "pending", "Müraciət statusu");
      const rows = await query(
        `SELECT * FROM supplier_applications
          ${status === "all" ? "" : "WHERE status = $1"}
          ORDER BY created_at DESC
          LIMIT 300`,
        status === "all" ? [] : [status]
      );
      return sendJson(res, 200, { ok: true, data: rows.map(mapApplication) });
    }
    const rows = await query(
      "SELECT id, name, supplier_type, focus, website, status, region, contact, rating, response_time FROM suppliers WHERE status <> 'Arxiv' ORDER BY name"
    );
    return sendJson(res, 200, { ok: true, data: rows.map(mapSupplier) });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const body = await readJson(req, 40_000);
  if (req.method === "POST" && (req.query.action === "apply" || body.action === "apply")) {
    const application = await createSupplierApplication(req, body);
    return sendJson(res, 201, {
      ok: true,
      data: application,
      message: "Müraciət qəbul edildi. Yoxlama nəticəsi e-poçtla bildiriləcək."
    });
  }

  const user = await requireRole(req, ["super_admin", "admin"]);
  if (req.method === "PATCH" && body.applicationId) {
    return sendJson(res, 200, { ok: true, data: await reviewSupplierApplication(user, body) });
  }
  if (req.method === "DELETE") {
    const id = text(body.id || req.query.id, { field: "Təchizatçı ID-si", required: true, max: 160 });
    const rows = await query("UPDATE suppliers SET status = 'Arxiv', updated_at = now() WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) throw new ApiError(404, "supplier_not_found", "Təchizatçı tapılmadı.");
    await recordAudit({ actorId: user.id, action: "archive", entityType: "supplier", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, status: "Arxiv" } });
  }

  const item = normalizeSupplier(body);
  const rows = await query(
    `INSERT INTO suppliers (id, name, supplier_type, focus, website, status, region, contact, rating, response_time, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, supplier_type = EXCLUDED.supplier_type, focus = EXCLUDED.focus,
       website = EXCLUDED.website, status = EXCLUDED.status, region = EXCLUDED.region,
       contact = EXCLUDED.contact, rating = EXCLUDED.rating, response_time = EXCLUDED.response_time, updated_at = now()
     RETURNING id, name, supplier_type, focus, website, status, region, contact, rating, response_time`,
    [item.id, item.name, item.type, item.focus || null, item.website || null, item.status, item.region, item.contact || null, item.rating, item.responseTime]
  );
  await recordAudit({ actorId: user.id, action: req.method === "POST" ? "create" : "update", entityType: "supplier", entityId: item.id });
  return sendJson(res, req.method === "POST" ? 201 : 200, { ok: true, data: mapSupplier(rows[0]) });
});
