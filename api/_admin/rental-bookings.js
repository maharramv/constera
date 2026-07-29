import { randomUUID } from "node:crypto";
import { getSessionUser, hashOpaque, requireRole } from "../_lib/auth.js";
import { syncRentalLead } from "../_lib/crm.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, getClientIp, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { email, oneOf, parseLimit, parsePriceAmount, text } from "../_lib/validation.js";

const privilegedRoles = ["super_admin", "admin", "sales"];
const statuses = ["requested", "quoted", "confirmed", "active", "completed", "cancelled"];
const transitions = Object.freeze({
  requested: ["quoted", "cancelled"],
  quoted: ["confirmed", "cancelled"],
  confirmed: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: []
});

const dateValue = (value, field) => {
  const normalized = text(value, { field, required: true, max: 10 });
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized)
    || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new ApiError(400, "validation_error", `${field} düzgün deyil.`);
  }
  return normalized;
};

const mapBooking = (row) => ({
  id: row.id,
  rentalId: row.rental_id,
  supplierId: row.supplier_id || null,
  customerId: row.customer_id || null,
  rentalTitle: row.rental_title,
  rentalSnapshot: row.rental_snapshot || {},
  companyName: row.company_name,
  contactName: row.contact_name,
  email: row.email,
  phone: row.phone,
  city: row.city,
  address: row.address,
  startDate: row.start_date,
  endDate: row.end_date,
  quantity: Number(row.quantity),
  operatorPreference: row.operator_preference,
  deliveryRequired: Boolean(row.delivery_required),
  status: row.status,
  quotedAmount: row.quoted_amount === null ? null : Number(row.quoted_amount),
  depositAmount: row.deposit_amount === null ? null : Number(row.deposit_amount),
  currency: row.currency,
  note: row.note || "",
  adminNote: row.admin_note || "",
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const loadBookings = async (user, limit = 200) => {
  const values = [];
  const where = [];
  if (user.role === "customer") {
    values.push(user.id);
    where.push(`booking.customer_id = $${values.length}`);
  } else if (user.role === "supplier") {
    values.push(user.companyId || "none");
    where.push(`supplier.company_id = $${values.length}`);
  }
  values.push(limit);
  return query(
    `SELECT booking.*
       FROM rental_bookings booking
       LEFT JOIN suppliers supplier ON supplier.id = booking.supplier_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY booking.created_at DESC
      LIMIT $${values.length}`,
    values
  );
};

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const rentalId = text(req.query.rentalId, { max: 160 });
    const startDate = text(req.query.startDate, { max: 10 });
    const endDate = text(req.query.endDate, { max: 10 });
    if (rentalId && startDate && endDate) {
      const overlap = await query(
        `SELECT COALESCE(sum(quantity), 0)::int AS reserved
           FROM rental_bookings
          WHERE rental_id = $1
            AND status IN ('confirmed', 'active')
            AND daterange(start_date, end_date, '[]') && daterange($2::date, $3::date, '[]')`,
        [rentalId, dateValue(startDate, "Başlanğıc tarixi"), dateValue(endDate, "Bitmə tarixi")]
      );
      return sendJson(res, 200, { ok: true, data: { rentalId, reservedQuantity: Number(overlap[0]?.reserved || 0) } });
    }
    const user = await requireRole(req);
    const rows = await loadBookings(user, parseLimit(req.query.limit, 200, 500));
    return sendJson(res, 200, { ok: true, data: rows.map(mapBooking) });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 50_000);
  if (req.method === "POST") {
    if (text(body.website, { max: 200 })) return sendJson(res, 201, { ok: true, data: { accepted: true } });
    const session = await getSessionUser(req);
    const submissionHash = hashOpaque(getClientIp(req));
    const recent = await query(
      "SELECT count(*)::int AS count FROM rental_bookings WHERE submission_hash = $1 AND created_at > now() - interval '1 hour'",
      [submissionHash]
    );
    if ((recent[0]?.count || 0) >= 10) {
      throw new ApiError(429, "rental_booking_rate_limited", "Bir saat ərzində icarə müraciəti limiti dolub.");
    }
    const rentalId = text(body.rentalId, { field: "İcarə ID-si", required: true, max: 160 });
    const rentalRows = await query(
      `SELECT entity.*, category.title AS category_title
         FROM marketplace_entities entity
         LEFT JOIN categories category ON category.id = entity.category_id
        WHERE entity.id = $1
          AND entity.entity_kind = 'rental'
          AND entity.status = 'active'
        LIMIT 1`,
      [rentalId]
    );
    const rental = rentalRows[0];
    if (!rental) throw new ApiError(404, "rental_not_found", "İcarə avadanlığı canlı kataloqda tapılmadı.");
    const startDate = dateValue(body.startDate, "Başlanğıc tarixi");
    const endDate = dateValue(body.endDate, "Bitmə tarixi");
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (start < today || end < start) throw new ApiError(400, "invalid_rental_period", "İcarə tarix aralığı düzgün deyil.");
    if ((end - start) / 86_400_000 > 180) throw new ApiError(400, "rental_period_too_long", "İcarə müddəti maksimum 180 gün ola bilər.");
    const quantity = Math.max(1, Math.min(100, Math.round(Number(body.quantity) || 1)));
    const supplierCandidate = text(rental.extra_data?.supplierId, { max: 160 });
    const supplierRows = supplierCandidate
      ? await query("SELECT id FROM suppliers WHERE id = $1 AND status <> 'Arxiv' LIMIT 1", [supplierCandidate])
      : [];
    const id = `rbk-${randomUUID()}`;
    const rows = await query(
      `INSERT INTO rental_bookings (
         id, rental_id, supplier_id, customer_id, rental_title, rental_snapshot,
         company_name, contact_name, email, phone, city, address,
         start_date, end_date, quantity, operator_preference, delivery_required,
         note, submission_hash
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb,
         $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19
       )
       RETURNING *`,
      [
        id,
        rentalId,
        supplierRows[0]?.id || null,
        session?.id || null,
        rental.title,
        JSON.stringify({
          category: rental.category_title || "",
          subcategory: rental.subcategory,
          unit: rental.unit || "",
          price: rental.price_text,
          extra: rental.extra_data || {}
        }),
        text(body.companyName, { field: "Şirkət", required: true, max: 200 }),
        text(body.contactName || session?.name, { field: "Əlaqələndirici şəxs", required: true, max: 160 }),
        email(body.email || session?.email),
        text(body.phone, { field: "Telefon", required: true, max: 80 }),
        text(body.city, { field: "Şəhər", required: true, max: 160 }),
        text(body.address, { field: "Ünvan", required: true, max: 500 }),
        startDate,
        endDate,
        quantity,
        text(body.operatorPreference, { max: 160 }) || "Razılaşma ilə",
        body.deliveryRequired !== false,
        text(body.note, { max: 2_000 }) || null,
        submissionHash
      ]
    );
    await syncRentalLead(id);
    await recordAudit({ actorId: session?.id || null, action: "create", entityType: "rental_booking", entityId: id, details: { rentalId, startDate, endDate, quantity } });
    const admins = await query("SELECT id FROM users WHERE role IN ('super_admin', 'admin', 'sales') AND status = 'active'");
    await Promise.allSettled(admins.map((admin) => queueNotification({
      userId: admin.id,
      subject: "Yeni icarə rezervasiyası",
      body: `${rental.title}: ${startDate} – ${endDate}, ${quantity} ədəd.`,
      templateKey: "rental_booking_created",
      payload: { bookingId: id, rentalId, startDate, endDate, quantity }
    })));
    return sendJson(res, 201, { ok: true, data: mapBooking(rows[0]) });
  }

  const user = await requireRole(req, privilegedRoles);
  const id = text(body.id || req.query.id, { field: "Rezervasiya ID-si", required: true, max: 160 });
  const currentRows = await query("SELECT * FROM rental_bookings WHERE id = $1 LIMIT 1", [id]);
  const current = currentRows[0];
  if (!current) throw new ApiError(404, "rental_booking_not_found", "İcarə rezervasiyası tapılmadı.");
  const status = oneOf(body.status, statuses, current.status, "Rezervasiya statusu");
  if (status !== current.status && !transitions[current.status]?.includes(status)) {
    throw new ApiError(409, "invalid_rental_booking_transition", "İcarə mərhələləri ardıcıllıqla dəyişdirilməlidir.", {
      current: current.status,
      allowed: transitions[current.status] || []
    });
  }
  const quotedAmount = Object.prototype.hasOwnProperty.call(body, "quotedAmount")
    ? parsePriceAmount(body.quotedAmount)
    : current.quoted_amount === null ? null : Number(current.quoted_amount);
  const depositAmount = Object.prototype.hasOwnProperty.call(body, "depositAmount")
    ? parsePriceAmount(body.depositAmount)
    : current.deposit_amount === null ? null : Number(current.deposit_amount);
  if (["quoted", "confirmed"].includes(status) && quotedAmount === null) {
    throw new ApiError(400, "rental_quote_required", "Qiymət təklifi və təsdiq üçün məbləğ yazılmalıdır.");
  }
  if (status === "confirmed") {
    const availableUnits = Math.max(1, Number(current.rental_snapshot?.extra?.availableUnits || 1));
    const overlaps = await query(
      `SELECT COALESCE(sum(quantity), 0)::int AS reserved
         FROM rental_bookings
        WHERE rental_id = $1
          AND id <> $2
          AND status IN ('confirmed', 'active')
          AND daterange(start_date, end_date, '[]') && daterange($3::date, $4::date, '[]')`,
      [current.rental_id, id, current.start_date, current.end_date]
    );
    if (Number(overlaps[0]?.reserved || 0) + Number(current.quantity) > availableUnits) {
      throw new ApiError(409, "rental_not_available", "Bu tarixlər üçün kifayət qədər boş avadanlıq yoxdur.");
    }
  }
  await query(
    `UPDATE rental_bookings
        SET status = $2,
            quoted_amount = $3,
            deposit_amount = $4,
            currency = $5,
            admin_note = $6,
            updated_at = now()
      WHERE id = $1`,
    [
      id,
      status,
      quotedAmount,
      depositAmount,
      oneOf(body.currency, ["AZN", "USD", "EUR"], current.currency, "Valyuta"),
      Object.prototype.hasOwnProperty.call(body, "adminNote") ? text(body.adminNote, { max: 2_000 }) || null : current.admin_note
    ]
  );
  await syncRentalLead(id);
  await recordAudit({ actorId: user.id, action: "status_update", entityType: "rental_booking", entityId: id, details: { status, quotedAmount } });
  if (current.customer_id) {
    await queueNotification({
      userId: current.customer_id,
      subject: `İcarə rezervasiyası: ${current.rental_title}`,
      body: `Rezervasiya statusu yeniləndi: ${status}.`,
      templateKey: "rental_booking_status_updated",
      payload: { bookingId: id, status }
    });
  }
  const updatedRows = await query("SELECT * FROM rental_bookings WHERE id = $1", [id]);
  return sendJson(res, 200, { ok: true, data: mapBooking(updatedRows[0]) });
});
