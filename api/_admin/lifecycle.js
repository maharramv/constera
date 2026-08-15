import { randomUUID } from "node:crypto";
import { assertCriticalTwoFactor, requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { canTransitionLifecycle, passportCompleteness, priceLockTerms, summarizeIfc } from "../_lib/lifecycle.js";
import { entityId, oneOf, safeUrl, stringList, text } from "../_lib/validation.js";

const privilegedRoles = new Set(["super_admin", "admin", "sales"]);
const passportStatuses = ["draft", "published", "expired", "archived"];
const modelFormats = ["ifc", "dwg", "bcf", "other"];
const changeStatuses = ["draft", "submitted", "approved", "rejected", "implemented", "cancelled"];
const warrantyStatuses = ["open", "in_progress", "waiting_supplier", "resolved", "closed", "rejected"];
const surplusStatuses = ["draft", "published", "reserved", "sold", "withdrawn", "expired"];
const lockStatuses = ["active", "used", "expired", "cancelled"];

const camelize = (row) => Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [
  key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value
]));
const camelizeRows = (rows) => rows.map(camelize);
const isPrivileged = (user) => privilegedRoles.has(user.role);
const signedNumber = (value, field, min = -1_000_000_000, max = 1_000_000_000, digits = 2) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ApiError(400, "validation_error", `${field} düzgün rəqəm olmalıdır.`);
  }
  return Number(number.toFixed(digits));
};
const positiveNumber = (value, field, max = 1_000_000, digits = 3) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > max) {
    throw new ApiError(400, "validation_error", `${field} sıfırdan böyük olmalıdır.`);
  }
  return Number(number.toFixed(digits));
};
const integer = (value, field, min, max, fallback = 0) => {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ApiError(400, "validation_error", `${field} düzgün tam ədəd olmalıdır.`);
  }
  return number;
};
const optionalDate = (value, field) => {
  const result = text(value, { field, max: 10 });
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00Z`))) {
    throw new ApiError(400, "validation_error", `${field} düzgün tarix olmalıdır.`);
  }
  return result;
};
const optionalDateTime = (value, field) => {
  const result = text(value, { field, max: 40 });
  if (!result) return null;
  const date = new Date(result);
  if (!Number.isFinite(date.getTime())) throw new ApiError(400, "validation_error", `${field} düzgün tarix olmalıdır.`);
  return date.toISOString();
};
const urls = (value, field) => stringList(value, 20).map((item) => safeUrl(item, field));

const requireProject = async (projectId, user) => {
  const id = text(projectId, { field: "Layihə", required: true, max: 160 });
  const rows = await query(
    `SELECT id, customer_id, title, budget, currency, start_date, target_end_date
       FROM customer_projects
      WHERE id = $1 AND ($2::boolean = true OR customer_id = $3)
      LIMIT 1`,
    [id, isPrivileged(user), user.id]
  );
  if (!rows[0]) throw new ApiError(404, "project_not_found", "Layihə tapılmadı və ya giriş icazəsi yoxdur.");
  return rows[0];
};

const requireProduct = async (productId, user, publicRead = false) => {
  const id = text(productId, { field: "Məhsul", required: true, max: 160 });
  const rows = await query(
    `SELECT product.*, supplier.company_id AS supplier_company_id
       FROM products product
       LEFT JOIN suppliers supplier ON supplier.id = product.supplier_id
      WHERE product.id = $1
        AND ($2::boolean = true OR $3::boolean = true OR supplier.company_id = $4)
      LIMIT 1`,
    [id, isPrivileged(user), publicRead, user.companyId]
  );
  if (!rows[0]) throw new ApiError(404, "product_not_found", "Məhsul tapılmadı və ya giriş icazəsi yoxdur.");
  return rows[0];
};

const requireSupplier = async (supplierId, user) => {
  const id = text(supplierId, { field: "Podratçı", required: true, max: 160 });
  const rows = await query(
    `SELECT * FROM suppliers
      WHERE id = $1 AND ($2::boolean = true OR company_id = $3)
      LIMIT 1`,
    [id, isPrivileged(user), user.companyId]
  );
  if (!rows[0]) throw new ApiError(404, "supplier_not_found", "Podratçı tapılmadı və ya giriş icazəsi yoxdur.");
  return rows[0];
};

const requireBooking = async (bookingId, user) => {
  const id = text(bookingId, { field: "İcarə rezervasiyası", required: true, max: 160 });
  const rows = await query(
    `SELECT booking.*, supplier.company_id AS supplier_company_id
       FROM rental_bookings booking
       LEFT JOIN suppliers supplier ON supplier.id = booking.supplier_id
      WHERE booking.id = $1
        AND ($2::boolean = true OR booking.customer_id = $3 OR supplier.company_id = $4)
      LIMIT 1`,
    [id, isPrivileged(user), user.id, user.companyId]
  );
  if (!rows[0]) throw new ApiError(404, "booking_not_found", "İcarə rezervasiyası tapılmadı və ya giriş icazəsi yoxdur.");
  return rows[0];
};

const requireOrder = async (orderId, user) => {
  const id = text(orderId, { field: "Sifariş", required: true, max: 160 });
  const rows = await query(
    `SELECT id, customer_id, order_number
       FROM orders
      WHERE id = $1 AND ($2::boolean = true OR customer_id = $3)
      LIMIT 1`,
    [id, isPrivileged(user), user.id]
  );
  if (!rows[0]) throw new ApiError(404, "order_not_found", "Sifariş tapılmadı və ya giriş icazəsi yoxdur.");
  return rows[0];
};

const requirePublicProduct = async (productId) => {
  const id = text(productId, { field: "Məhsul", required: true, max: 160 });
  const rows = await query("SELECT id, supplier_id, name FROM products WHERE id = $1 AND status = 'active' LIMIT 1", [id]);
  if (!rows[0]) throw new ApiError(404, "product_not_found", "Aktiv məhsul tapılmadı.");
  return rows[0];
};

const requirePublicSupplier = async (supplierId) => {
  const id = text(supplierId, { field: "Təchizatçı", required: true, max: 160 });
  const rows = await query("SELECT id, name FROM suppliers WHERE id = $1 LIMIT 1", [id]);
  if (!rows[0]) throw new ApiError(404, "supplier_not_found", "Təchizatçı tapılmadı.");
  return rows[0];
};

const readPublicPassport = async (productId) => {
  const rows = await query(
    `SELECT passport.*, product.id AS active_product_id, product.name AS product_name, product.sku, product.brand,
            product.package_text, product.origin
       FROM products product
       LEFT JOIN product_digital_passports passport
         ON passport.product_id = product.id
        AND passport.status = 'published'
        AND (passport.valid_until IS NULL OR passport.valid_until >= current_date)
      WHERE product.id = $1 AND product.status = 'active'
      LIMIT 1`,
    [text(productId, { field: "Məhsul", required: true, max: 160 })]
  );
  if (!rows[0]) throw new ApiError(404, "product_not_found", "Aktiv məhsul tapılmadı.");
  if (!rows[0].id) return null;
  const passport = camelize(rows[0]);
  return { ...passport, completeness: passportCompleteness(passport) };
};

const readDashboard = async (user) => {
  const privileged = isPrivileged(user);
  const common = [user.id, user.companyId, privileged];
  const [projects, products, orders, offers, bookings, suppliers, passports, models, changes, warranties, surplus, handovers, contractors, locks] = await Promise.all([
    query(`SELECT id, title, status, city, budget, currency FROM customer_projects
            WHERE $3::boolean = true OR customer_id = $1 ORDER BY updated_at DESC LIMIT 200`, common),
    query(`SELECT product.id, product.name, product.sku, product.brand, product.supplier_id,
                  ($3::boolean = true OR supplier.company_id = $2) AS can_manage
             FROM products product LEFT JOIN suppliers supplier ON supplier.id = product.supplier_id
            WHERE product.status = 'active'
            ORDER BY product.updated_at DESC LIMIT 300`, common),
    query(`SELECT id, order_number, company_name, status, total_amount, currency, created_at
             FROM orders
            WHERE $3::boolean = true OR customer_id = $1
            ORDER BY created_at DESC LIMIT 200`, common),
    query(`SELECT offer.id, offer.product_id, product.name AS product_name, supplier.name AS supplier_name,
                  offer.unit_price, offer.currency, offer.minimum_order, offer.stock_quantity,
                  offer.price_verified_at, offer.lead_time_days
             FROM product_offers offer
             JOIN products product ON product.id = offer.product_id
             JOIN suppliers supplier ON supplier.id = offer.supplier_id
            WHERE offer.status = 'active' AND offer.price_status = 'confirmed' AND offer.unit_price IS NOT NULL
            ORDER BY offer.price_verified_at DESC NULLS LAST LIMIT 300`, common),
    query(`SELECT booking.id, booking.rental_id, booking.rental_title, booking.status, booking.start_date,
                  booking.end_date, booking.customer_id, booking.supplier_id
             FROM rental_bookings booking LEFT JOIN suppliers supplier ON supplier.id = booking.supplier_id
            WHERE $3::boolean = true OR booking.customer_id = $1 OR supplier.company_id = $2
            ORDER BY booking.updated_at DESC LIMIT 200`, common),
    query(`SELECT id, name, supplier_type, region, company_id,
                  ($3::boolean = true OR company_id = $2) AS can_manage FROM suppliers
            WHERE $3::boolean = true OR company_id = $2 OR status = 'Aktiv'
            ORDER BY name LIMIT 300`, common),
    query(`SELECT passport.*, product.name AS product_name, product.sku, supplier.name AS supplier_name
             FROM product_digital_passports passport JOIN products product ON product.id = passport.product_id
             LEFT JOIN suppliers supplier ON supplier.id = product.supplier_id
            WHERE $3::boolean = true OR supplier.company_id = $2 OR passport.status = 'published'
            ORDER BY passport.updated_at DESC LIMIT 300`, common),
    query(`SELECT model.*, project.title AS project_title FROM project_model_imports model
             JOIN customer_projects project ON project.id = model.project_id
            WHERE $3::boolean = true OR project.customer_id = $1 ORDER BY model.created_at DESC LIMIT 200`, common),
    query(`SELECT change.*, project.title AS project_title FROM project_change_orders change
             JOIN customer_projects project ON project.id = change.project_id
            WHERE $3::boolean = true OR project.customer_id = $1 ORDER BY change.created_at DESC LIMIT 200`, common),
    query(`SELECT warranty.*, project.title AS project_title, product.name AS product_name,
                  supplier.name AS supplier_name, supplier.company_id AS supplier_company_id
             FROM warranty_cases warranty
             LEFT JOIN customer_projects project ON project.id = warranty.project_id
             LEFT JOIN products product ON product.id = warranty.product_id
             LEFT JOIN suppliers supplier ON supplier.id = warranty.supplier_id
            WHERE $3::boolean = true OR warranty.customer_id = $1 OR supplier.company_id = $2
            ORDER BY warranty.created_at DESC LIMIT 200`, common),
    query(`SELECT listing.*, project.title AS project_title, product.name AS product_name,
                  owner.name AS owner_name
             FROM surplus_listings listing
             LEFT JOIN customer_projects project ON project.id = listing.project_id
             LEFT JOIN products product ON product.id = listing.product_id
             JOIN users owner ON owner.id = listing.owner_id
            WHERE $3::boolean = true OR listing.owner_id = $1 OR listing.status = 'published'
            ORDER BY listing.created_at DESC LIMIT 300`, common),
    query(`SELECT report.*, booking.rental_title, booking.customer_id, supplier.name AS supplier_name
             FROM rental_handover_reports report JOIN rental_bookings booking ON booking.id = report.booking_id
             LEFT JOIN suppliers supplier ON supplier.id = booking.supplier_id
            WHERE $3::boolean = true OR booking.customer_id = $1 OR supplier.company_id = $2
            ORDER BY report.created_at DESC LIMIT 200`, common),
    query(`SELECT passport.*, supplier.name AS supplier_name, supplier.region
             FROM contractor_passports passport JOIN suppliers supplier ON supplier.id = passport.supplier_id
            WHERE $3::boolean = true OR supplier.company_id = $2 OR passport.status = 'verified'
            ORDER BY passport.updated_at DESC LIMIT 300`, common),
    query(`SELECT lock.*, product.name AS product_name, supplier.name AS supplier_name,
                  project.title AS project_title
             FROM offer_price_locks lock JOIN product_offers offer ON offer.id = lock.product_offer_id
             JOIN products product ON product.id = offer.product_id
             JOIN suppliers supplier ON supplier.id = offer.supplier_id
             LEFT JOIN customer_projects project ON project.id = lock.project_id
            WHERE $3::boolean = true OR lock.customer_id = $1 OR supplier.company_id = $2
            ORDER BY lock.created_at DESC LIMIT 200`, common)
  ]);
  const lists = { projects, products, orders, offers, bookings, suppliers, passports, models, changes, warranties, surplus, handovers, contractors, locks };
  return {
    actor: { id: user.id, name: user.name, role: user.role, companyId: user.companyId || null },
    stats: Object.fromEntries(Object.entries(lists).map(([key, rows]) => [key, rows.length])),
    ...Object.fromEntries(Object.entries(lists).map(([key, rows]) => [key, camelizeRows(rows)]))
  };
};

const savePassport = async (body, user) => {
  const product = await requireProduct(body.productId, user);
  const certificates = stringList(body.certificates, 30).map((label) => ({ label }));
  const environmentalData = {
    epdUrl: safeUrl(body.epdUrl, "EPD URL-i") || "",
    carbonKgCo2e: body.carbonKgCo2e === "" || body.carbonKgCo2e === undefined ? null : signedNumber(body.carbonKgCo2e, "Karbon göstəricisi", 0, 1_000_000),
    recycledPercent: body.recycledPercent === "" || body.recycledPercent === undefined ? null : signedNumber(body.recycledPercent, "Təkrar emal faizi", 0, 100)
  };
  const payload = {
    manufacturer: text(body.manufacturer || product.brand, { field: "İstehsalçı", required: true, max: 240 }),
    originCountry: text(body.originCountry || product.origin, { max: 160 }),
    declarationUrl: safeUrl(body.declarationUrl, "Uyğunluq bəyannaməsi") || "",
    safetyUrl: safeUrl(body.safetyUrl, "Təhlükəsizlik sənədi") || "",
    certificates,
    warrantyMonths: integer(body.warrantyMonths, "Zəmanət müddəti", 0, 600),
    environmentalData
  };
  const status = oneOf(body.status, passportStatuses, "draft", "Pasport statusu");
  const completeness = passportCompleteness(payload);
  if (status === "published" && completeness.score < 70) {
    throw new ApiError(409, "passport_incomplete", "Pasportu dərc etmək üçün məlumat tamlığı ən azı 70% olmalıdır.", completeness);
  }
  const id = entityId(body.id, "dpp");
  const rows = await query(
    `INSERT INTO product_digital_passports (
       id, product_id, passport_code, manufacturer, origin_country, model_code, gtin,
       warranty_months, batch_tracking, declaration_url, safety_url, installation_url,
       certificate_data, environmental_data, status, valid_until, created_by, updated_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16, $17, $17, now())
     ON CONFLICT (product_id) DO UPDATE SET
       manufacturer = EXCLUDED.manufacturer, origin_country = EXCLUDED.origin_country,
       model_code = EXCLUDED.model_code, gtin = EXCLUDED.gtin, warranty_months = EXCLUDED.warranty_months,
       batch_tracking = EXCLUDED.batch_tracking, declaration_url = EXCLUDED.declaration_url,
       safety_url = EXCLUDED.safety_url, installation_url = EXCLUDED.installation_url,
       certificate_data = EXCLUDED.certificate_data, environmental_data = EXCLUDED.environmental_data,
       status = EXCLUDED.status, valid_until = EXCLUDED.valid_until, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING *`,
    [
      id, product.id, `DPP-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
      payload.manufacturer, payload.originCountry || null, text(body.modelCode, { max: 160 }) || null,
      text(body.gtin, { max: 80 }) || null, payload.warrantyMonths, Boolean(body.batchTracking),
      payload.declarationUrl || null, payload.safetyUrl || null,
      safeUrl(body.installationUrl, "Quraşdırma təlimatı") || null,
      JSON.stringify(certificates), JSON.stringify(environmentalData), status,
      optionalDate(body.validUntil, "Etibarlılıq tarixi"), user.id
    ]
  );
  await recordAudit({ actorId: user.id, action: "upsert", entityType: "product_digital_passport", entityId: rows[0].id, details: { productId: product.id, status, completeness: completeness.score } });
};

const analyzeModel = async (body, user) => {
  const project = await requireProject(body.projectId, user);
  const filename = text(body.filename, { field: "Model faylı", required: true, max: 240 });
  const extension = filename.split(".").pop()?.toLowerCase() || "other";
  const format = oneOf(body.modelFormat || extension, modelFormats, "other", "Model formatı");
  const source = text(body.contentText, { max: 1_000_000 });
  const summary = format === "ifc" ? summarizeIfc(source) : {
    elementCount: 0, materialCount: 0, entitySummary: {}, extractedItems: [],
    issueNote: `${format.toUpperCase()} modeli saxlanıldı; açıq IFC ixracı material çıxarışını avtomatlaşdıracaq.`
  };
  const id = entityId(body.id, "model");
  await query(
    `INSERT INTO project_model_imports (
       id, project_id, filename, model_format, source_url, status, element_count,
       material_count, extracted_items, entity_summary, issue_note, created_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, now())`,
    [id, project.id, filename, format, safeUrl(body.sourceUrl, "Model URL-i") || null,
      format === "ifc" && summary.elementCount ? "analyzed" : "uploaded", summary.elementCount,
      summary.materialCount, JSON.stringify(summary.extractedItems), JSON.stringify(summary.entitySummary),
      summary.issueNote || null, user.id]
  );
  await recordAudit({ actorId: user.id, action: "analyze", entityType: "project_model", entityId: id, details: { projectId: project.id, format, elementCount: summary.elementCount } });
};

const createChangeOrder = async (body, user) => {
  const project = await requireProject(body.projectId, user);
  const id = entityId(body.id, "change");
  const rows = await query(
    `INSERT INTO project_change_orders (
       id, project_id, title, reason, scope_description, cost_delta, currency,
       days_delta, status, requested_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()) RETURNING change_number`,
    [id, project.id, text(body.title, { field: "Dəyişiklik adı", required: true, max: 240 }),
      text(body.reason, { field: "Səbəb", required: true, max: 1000 }),
      text(body.scopeDescription, { field: "İş həcmi", required: true, max: 5000 }),
      signedNumber(body.costDelta, "Büdcə fərqi"), oneOf(body.currency, ["AZN", "USD", "EUR"], project.currency || "AZN", "Valyuta"),
      integer(body.daysDelta, "Müddət fərqi", -3650, 3650),
      oneOf(body.status, ["draft", "submitted"], "submitted", "Dəyişiklik statusu"), user.id]
  );
  await recordAudit({ actorId: user.id, action: "create", entityType: "project_change_order", entityId: id, details: { projectId: project.id, changeNumber: rows[0].change_number } });
};

const createWarranty = async (body, user) => {
  let project = null;
  if (body.projectId) project = await requireProject(body.projectId, user);
  const order = body.orderId ? await requireOrder(body.orderId, user) : null;
  const product = body.productId ? await requirePublicProduct(body.productId) : null;
  const supplier = body.supplierId ? await requirePublicSupplier(body.supplierId) : null;
  if (!project && !order && !product && !supplier) {
    throw new ApiError(400, "warranty_reference_required", "Müraciəti layihə, sifariş, məhsul və ya təchizatçı ilə əlaqələndirin.");
  }
  if (order && product) {
    const itemRows = await query("SELECT id FROM order_items WHERE order_id = $1 AND product_id = $2 LIMIT 1", [order.id, product.id]);
    if (!itemRows[0]) throw new ApiError(409, "order_product_mismatch", "Seçilmiş məhsul bu sifarişdə yoxdur.");
  }
  if (project && order && project.customer_id !== order.customer_id) {
    throw new ApiError(409, "warranty_owner_mismatch", "Layihə və sifariş eyni müştəriyə aid deyil.");
  }
  if (supplier && product && product.supplier_id && supplier.id !== product.supplier_id) {
    const offerRows = await query(
      "SELECT id FROM product_offers WHERE product_id = $1 AND supplier_id = $2 LIMIT 1",
      [product.id, supplier.id]
    );
    if (!offerRows[0]) throw new ApiError(409, "supplier_product_mismatch", "Seçilmiş təchizatçı bu məhsul üçün təklif verməyib.");
  }
  const id = entityId(body.id, "warranty");
  const customerId = order?.customer_id || project?.customer_id || user.id;
  const evidence = urls(body.evidenceUrls, "Sübut URL-i");
  await query(
    `INSERT INTO warranty_cases (
       id, customer_id, project_id, order_id, product_id, supplier_id, title,
       description, severity, status, due_at, evidence_urls, created_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10, $11::jsonb, $2, now())`,
    [id, customerId, project?.id || null, order?.id || null,
      product?.id || null, supplier?.id || product?.supplier_id || null,
      text(body.title, { field: "Qüsur adı", required: true, max: 240 }),
      text(body.description, { field: "Qüsur təsviri", required: true, max: 5000 }),
      oneOf(body.severity, ["low", "medium", "high", "critical"], "medium", "Risk səviyyəsi"),
      optionalDateTime(body.dueAt, "Cavab son tarixi"), JSON.stringify(evidence)]
  );
  await recordAudit({ actorId: user.id, action: "create", entityType: "warranty_case", entityId: id, details: { projectId: project?.id || null } });
};

const createSurplus = async (body, user) => {
  let project = null;
  if (body.projectId) project = await requireProject(body.projectId, user);
  const id = entityId(body.id, "surplus");
  await query(
    `INSERT INTO surplus_listings (
       id, project_id, product_id, owner_id, title, description, quantity, unit,
       condition, unit_price, currency, city, photo_url, status, expires_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())`,
    [id, project?.id || null, text(body.productId, { max: 160 }) || null, user.id,
      text(body.title, { field: "Elan adı", required: true, max: 240 }), text(body.description, { max: 3000 }) || null,
      positiveNumber(body.quantity, "Miqdar"), text(body.unit, { field: "Vahid", required: true, max: 80 }),
      oneOf(body.condition, ["unused", "opened", "used_good", "reclaimed"], "unused", "Materialın vəziyyəti"),
      body.unitPrice === "" || body.unitPrice === undefined ? null : signedNumber(body.unitPrice, "Vahid qiyməti", 0),
      oneOf(body.currency, ["AZN", "USD", "EUR"], "AZN", "Valyuta"),
      text(body.city, { field: "Şəhər", required: true, max: 160 }), safeUrl(body.photoUrl, "Foto URL-i") || null,
      oneOf(body.status, ["draft", "published"], "published", "Elan statusu"),
      optionalDateTime(body.expiresAt, "Elanın son tarixi")]
  );
  await recordAudit({ actorId: user.id, action: "create", entityType: "surplus_listing", entityId: id, details: { projectId: project?.id || null } });
};

const createHandover = async (body, user) => {
  const booking = await requireBooking(body.bookingId, user);
  const id = entityId(body.id, "handover");
  const reportType = oneOf(body.reportType, ["checkout", "checkin"], "checkout", "Təhvil tipi");
  await query(
    `INSERT INTO rental_handover_reports (
       id, booking_id, report_type, equipment_condition, engine_hours, fuel_level,
       location_text, latitude, longitude, damage_notes, evidence_urls,
       customer_signature, supplier_signature, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
     ON CONFLICT (booking_id, report_type) DO UPDATE SET
       equipment_condition = EXCLUDED.equipment_condition, engine_hours = EXCLUDED.engine_hours,
       fuel_level = EXCLUDED.fuel_level, location_text = EXCLUDED.location_text,
       latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
       damage_notes = EXCLUDED.damage_notes, evidence_urls = EXCLUDED.evidence_urls,
       customer_signature = EXCLUDED.customer_signature, supplier_signature = EXCLUDED.supplier_signature,
       created_by = EXCLUDED.created_by, created_at = now()`,
    [id, booking.id, reportType,
      oneOf(body.equipmentCondition, ["excellent", "good", "fair", "damaged"], "good", "Avadanlıq vəziyyəti"),
      body.engineHours === "" || body.engineHours === undefined ? null : signedNumber(body.engineHours, "Mühərrik saatı", 0, 10_000_000),
      body.fuelLevel === "" || body.fuelLevel === undefined ? null : integer(body.fuelLevel, "Yanacaq səviyyəsi", 0, 100),
      text(body.locationText, { max: 300 }) || null,
      body.latitude === "" || body.latitude === undefined ? null : signedNumber(body.latitude, "Enlik", -90, 90, 6),
      body.longitude === "" || body.longitude === undefined ? null : signedNumber(body.longitude, "Uzunluq", -180, 180, 6),
      text(body.damageNotes, { max: 3000 }) || null, JSON.stringify(urls(body.evidenceUrls, "Sübut URL-i")),
      text(body.customerSignature, { max: 240 }) || null, text(body.supplierSignature, { max: 240 }) || null, user.id]
  );
  await recordAudit({ actorId: user.id, action: "upsert", entityType: "rental_handover", entityId: id, details: { bookingId: booking.id, reportType } });
};

const saveContractor = async (body, user) => {
  const supplier = await requireSupplier(body.supplierId, user);
  const requestedStatus = oneOf(body.status, ["draft", "pending", "verified"], "pending", "Podratçı statusu");
  const status = requestedStatus === "verified" && !isPrivileged(user) ? "pending" : requestedStatus;
  const id = entityId(body.id, "contractor");
  await query(
    `INSERT INTO contractor_passports (
       id, supplier_id, contractor_type, voen, license_number, license_valid_until,
       insurance_number, insurance_valid_until, team_size, annual_capacity,
       regions, specialties, portfolio_urls, status, verification_note,
       verified_by, verified_at, created_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb,
       $14, $15, $16, $17, $18, now())
     ON CONFLICT (supplier_id) DO UPDATE SET
       contractor_type = EXCLUDED.contractor_type, voen = EXCLUDED.voen,
       license_number = EXCLUDED.license_number, license_valid_until = EXCLUDED.license_valid_until,
       insurance_number = EXCLUDED.insurance_number, insurance_valid_until = EXCLUDED.insurance_valid_until,
       team_size = EXCLUDED.team_size, annual_capacity = EXCLUDED.annual_capacity,
       regions = EXCLUDED.regions, specialties = EXCLUDED.specialties,
       portfolio_urls = EXCLUDED.portfolio_urls, status = EXCLUDED.status,
       verification_note = EXCLUDED.verification_note, verified_by = EXCLUDED.verified_by,
       verified_at = EXCLUDED.verified_at, updated_at = now()`,
    [id, supplier.id,
      oneOf(body.contractorType, ["general", "specialist", "design", "installation", "rental", "logistics"], "general", "Podratçı tipi"),
      text(body.voen, { max: 32 }) || null, text(body.licenseNumber, { max: 160 }) || null,
      optionalDate(body.licenseValidUntil, "Lisenziyanın bitmə tarixi"), text(body.insuranceNumber, { max: 160 }) || null,
      optionalDate(body.insuranceValidUntil, "Sığortanın bitmə tarixi"), integer(body.teamSize, "Komanda ölçüsü", 0, 100000),
      text(body.annualCapacity, { max: 300 }) || null, JSON.stringify(stringList(body.regions, 30)),
      JSON.stringify(stringList(body.specialties, 50)), JSON.stringify(urls(body.portfolioUrls, "Portfolio URL-i")), status,
      text(body.verificationNote, { max: 3000 }) || null,
      status === "verified" ? user.id : null, status === "verified" ? new Date().toISOString() : null, user.id]
  );
  await recordAudit({ actorId: user.id, action: "upsert", entityType: "contractor_passport", entityId: id, details: { supplierId: supplier.id, status } });
};

const lockPrice = async (body, user) => {
  if (user.role === "supplier") {
    throw new ApiError(403, "customer_role_required", "Təchizatçı öz məhsul təklifinin qiymətini kilidləyə bilməz.");
  }
  const offerId = text(body.productOfferId, { field: "Məhsul təklifi", required: true, max: 160 });
  const rows = await query(
    `SELECT offer.*, product.name AS product_name FROM product_offers offer
       JOIN products product ON product.id = offer.product_id
      WHERE offer.id = $1 AND offer.status = 'active' AND offer.price_status = 'confirmed'
        AND offer.unit_price IS NOT NULL LIMIT 1`,
    [offerId]
  );
  const offer = rows[0];
  if (!offer) throw new ApiError(404, "offer_not_lockable", "Qiyməti kilidlənə bilən aktiv təklif tapılmadı.");
  if (!offer.price_verified_at || Date.now() - new Date(offer.price_verified_at).getTime() > 31 * 86_400_000) {
    throw new ApiError(409, "offer_price_stale", "Qiyməti kilidləməzdən əvvəl təchizatçı təklifi yenidən təsdiqlənməlidir.");
  }
  if (body.projectId) await requireProject(body.projectId, user);
  let terms;
  try {
    terms = priceLockTerms({ unitPrice: offer.unit_price, quantity: body.quantity, hours: Number(body.hours || 24) });
  } catch (error) {
    throw new ApiError(400, "validation_error", error.message);
  }
  if (offer.minimum_order !== null && terms.quantity < Number(offer.minimum_order)) {
    throw new ApiError(409, "minimum_order_required", `Minimum sifariş ${Number(offer.minimum_order).toLocaleString("az-AZ")} vahiddir.`);
  }
  if (offer.stock_quantity !== null && terms.quantity > Number(offer.stock_quantity)) {
    throw new ApiError(409, "insufficient_stock", "Kilidlənən miqdar təsdiqlənmiş stokdan çoxdur.");
  }
  const id = entityId(body.id, "lock");
  await query(
    `INSERT INTO offer_price_locks (
       id, product_offer_id, customer_id, project_id, quantity,
       locked_unit_price, currency, status, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)`,
    [id, offer.id, user.id, text(body.projectId, { max: 160 }) || null, terms.quantity,
      terms.lockedUnitPrice, offer.currency, terms.expiresAt]
  );
  await recordAudit({ actorId: user.id, action: "create", entityType: "offer_price_lock", entityId: id, details: { offerId: offer.id, quantity: terms.quantity, expiresAt: terms.expiresAt } });
};

const updateStatus = async (body, user) => {
  const entityType = oneOf(body.entityType, ["change_order", "warranty", "surplus", "price_lock"], "", "Qeyd tipi");
  const id = text(body.id, { field: "Qeyd", required: true, max: 160 });
  const configs = {
    change_order: { table: "project_change_orders", statuses: changeStatuses, owner: "requested_by", reviewed: true },
    warranty: { table: "warranty_cases", statuses: warrantyStatuses, owner: "customer_id" },
    surplus: { table: "surplus_listings", statuses: surplusStatuses, owner: "owner_id" },
    price_lock: { table: "offer_price_locks", statuses: lockStatuses, owner: "customer_id" }
  };
  const config = configs[entityType];
  const next = oneOf(body.status, config.statuses, "", "Yeni status");
  const statusQueries = {
    change_order: `SELECT id, status, requested_by AS owner_id, NULL::text AS supplier_company_id FROM project_change_orders WHERE id = $1 LIMIT 1`,
    warranty: `SELECT warranty.id, warranty.status, warranty.customer_id AS owner_id,
                      supplier.company_id AS supplier_company_id
                 FROM warranty_cases warranty
                 LEFT JOIN suppliers supplier ON supplier.id = warranty.supplier_id
                WHERE warranty.id = $1 LIMIT 1`,
    surplus: `SELECT id, status, owner_id, NULL::text AS supplier_company_id FROM surplus_listings WHERE id = $1 LIMIT 1`,
    price_lock: `SELECT id, status, customer_id AS owner_id, NULL::text AS supplier_company_id FROM offer_price_locks WHERE id = $1 LIMIT 1`
  };
  const rows = await query(statusQueries[entityType], [id]);
  const row = rows[0];
  if (!row) throw new ApiError(404, "lifecycle_record_not_found", "Həyat dövrü qeydi tapılmadı.");
  const supplierAccess = entityType === "warranty" && row.supplier_company_id && row.supplier_company_id === user.companyId;
  if (!isPrivileged(user) && row.owner_id !== user.id && !supplierAccess) {
    throw new ApiError(403, "permission_denied", "Bu qeydin statusunu dəyişmək icazəsi yoxdur.");
  }
  if (supplierAccess && !["in_progress", "waiting_supplier", "resolved", "rejected"].includes(next)) {
    throw new ApiError(403, "supplier_status_restricted", "Təchizatçı bu status keçidini edə bilməz.");
  }
  if (!isPrivileged(user) && entityType === "change_order" && !["submitted", "cancelled"].includes(next)) {
    throw new ApiError(403, "review_permission_required", "Dəyişiklik sifarişini yalnız səlahiyyətli əməkdaş təsdiqləyə bilər.");
  }
  if (!isPrivileged(user) && entityType === "price_lock" && next !== "cancelled") {
    throw new ApiError(403, "price_lock_permission_required", "Müştəri yalnız qiymət kilidini ləğv edə bilər.");
  }
  if (!canTransitionLifecycle(entityType, row.status, next)) {
    throw new ApiError(409, "invalid_status_transition", `${row.status} statusundan ${next} statusuna keçid mümkün deyil.`);
  }
  if (config.reviewed) {
    await query(`UPDATE ${config.table} SET status = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now() WHERE id = $1`, [id, next, user.id]);
  } else if (entityType === "price_lock") {
    await query(`UPDATE ${config.table} SET status = $2, used_at = CASE WHEN $2 = 'used' THEN now() ELSE used_at END WHERE id = $1`, [id, next]);
  } else {
    await query(`UPDATE ${config.table} SET status = $2, updated_at = now() WHERE id = $1`, [id, next]);
  }
  await recordAudit({ actorId: user.id, action: "status_update", entityType, entityId: id, details: { from: row.status, to: next } });
};

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET", "POST"]);
  if (req.method === "GET" && String(req.query?.scope || "") === "public-passport") {
    return sendJson(res, 200, { ok: true, data: await readPublicPassport(req.query?.productId) }, { "Cache-Control": "public, max-age=60, s-maxage=600" });
  }
  const user = await requireRole(req);
  if (req.method === "GET") return sendJson(res, 200, { ok: true, data: await readDashboard(user) });

  assertSameOrigin(req);
  const body = await readJson(req, 1_300_000);
  const action = oneOf(body.action, [
    "save-passport", "analyze-model", "create-change-order", "create-warranty",
    "create-surplus", "create-rental-handover", "save-contractor", "lock-price", "update-status"
  ], "", "Əməliyyat");
  const handlers = {
    "save-passport": savePassport,
    "analyze-model": analyzeModel,
    "create-change-order": createChangeOrder,
    "create-warranty": createWarranty,
    "create-surplus": createSurplus,
    "create-rental-handover": createHandover,
    "save-contractor": saveContractor,
    "lock-price": lockPrice,
    "update-status": updateStatus
  };
  const criticalAdminAction =
    (action === "save-passport" && body.status === "published")
    || (action === "save-contractor" && body.status === "verified")
    || (action === "update-status" && ["approved", "rejected", "implemented", "used"].includes(body.status));
  if (criticalAdminAction) assertCriticalTwoFactor(user);
  await handlers[action](body, user);
  return sendJson(res, 200, { ok: true, data: await readDashboard(user) });
});
