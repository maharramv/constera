import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { calculateDeliveryQuote, listLogisticsZones, mapLogisticsZone } from "../_lib/logistics.js";
import { requireRole } from "../_lib/auth.js";
import { entityId, oneOf, parsePriceAmount, text } from "../_lib/validation.js";

const adminRoles = ["super_admin", "admin"];

const parseInteger = (value, fallback, min, max, field) => {
  const number = value === "" || value === null || value === undefined
    ? fallback
    : Number.parseInt(String(value), 10);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ApiError(400, "validation_error", `${field} düzgün deyil.`);
  }
  return number;
};

const parseAmount = (value, field, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const amount = parsePriceAmount(value);
  if (amount === null) throw new ApiError(400, "validation_error", `${field} düzgün deyil.`);
  return amount;
};

const normalizeZone = (body) => {
  const cities = (Array.isArray(body.cities) ? body.cities : String(body.cities || "").split(/[,;]/))
    .map((city) => text(city, { max: 120 }))
    .filter((city, index, values) => city && values.indexOf(city) === index)
    .slice(0, 100);
  const etaMinDays = parseInteger(body.etaMinDays, 1, 0, 365, "Minimum çatdırılma müddəti");
  const etaMaxDays = parseInteger(body.etaMaxDays, 3, etaMinDays, 365, "Maksimum çatdırılma müddəti");
  return {
    id: entityId(body.id, "log-zone"),
    name: text(body.name, { field: "Zona adı", required: true, max: 160 }),
    cities,
    baseFee: parseAmount(body.baseFee, "Baza tarifi"),
    perSupplierFee: parseAmount(body.perSupplierFee, "Təchizatçı əlavəsi"),
    perUnitFee: parseAmount(body.perUnitFee, "Vahid əlavəsi"),
    minimumFee: parseAmount(body.minimumFee, "Minimum tarif"),
    freeAbove: body.freeAbove === "" || body.freeAbove === null || body.freeAbove === undefined
      ? null
      : parseAmount(body.freeAbove, "Pulsuz çatdırılma həddi"),
    etaMinDays,
    etaMaxDays,
    priority: parseInteger(body.priority, 100, 0, 100_000, "Prioritet"),
    active: body.active !== false && String(body.active) !== "false"
  };
};

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const manage = req.query.scope === "manage";
    if (manage) await requireRole(req, adminRoles);
    return sendJson(res, 200, {
      ok: true,
      data: await listLogisticsZones({ includeInactive: manage })
    });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const body = await readJson(req, 40_000);
  const action = text(body.action, { max: 80 });

  if (req.method === "POST" && action === "quote") {
    const city = text(body.city, { field: "Şəhər", required: true, max: 160 });
    const mode = oneOf(body.mode, ["delivery", "pickup", "supplier_delivery"], "delivery", "Çatdırılma üsulu");
    const subtotal = body.subtotal === null || body.subtotal === undefined ? null : parseAmount(body.subtotal, "Ara cəm");
    const itemQuantity = parseAmount(body.itemQuantity, "Məhsul miqdarı");
    const supplierCount = parseInteger(body.supplierCount, 1, 0, 100, "Təchizatçı sayı");
    const quote = await calculateDeliveryQuote({ city, mode, subtotal, itemQuantity, supplierCount });
    return sendJson(res, 200, {
      ok: true,
      data: {
        city,
        mode,
        amount: quote.amount,
        currency: quote.currency,
        etaMinDays: quote.etaMinDays,
        etaMaxDays: quote.etaMaxDays,
        zone: quote.zone ? { id: quote.zone.id, name: quote.zone.name } : null,
        breakdown: quote.breakdown,
        note: "Məbləğ ConstEra-nın idarə olunan platforma tarifi üzrə hesablanmış təxmini logistika qiymətidir."
      }
    });
  }

  const user = await requireRole(req, adminRoles);
  if (req.method === "DELETE") {
    const id = text(body.id || req.query.id, { field: "Zona ID-si", required: true, max: 160 });
    const rows = await query(
      "UPDATE logistics_zones SET active = false, updated_at = now() WHERE id = $1 RETURNING id",
      [id]
    );
    if (!rows[0]) throw new ApiError(404, "logistics_zone_not_found", "Logistika zonası tapılmadı.");
    await recordAudit({ actorId: user.id, action: "archive", entityType: "logistics_zone", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, active: false } });
  }

  let source = body;
  if (req.method === "PATCH") {
    const id = text(body.id || req.query.id, { field: "Zona ID-si", required: true, max: 160 });
    const existingRows = await query("SELECT * FROM logistics_zones WHERE id = $1 LIMIT 1", [id]);
    if (!existingRows[0]) throw new ApiError(404, "logistics_zone_not_found", "Logistika zonası tapılmadı.");
    const existing = mapLogisticsZone(existingRows[0]);
    source = { ...existing, ...body, id };
  }
  const zone = normalizeZone(source);
  const rows = await query(
    `INSERT INTO logistics_zones (
       id, name, cities, base_fee, per_supplier_fee, per_unit_fee,
       minimum_fee, free_above, eta_min_days, eta_max_days, priority, active, updated_at
     ) VALUES (
       $1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, now()
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       cities = EXCLUDED.cities,
       base_fee = EXCLUDED.base_fee,
       per_supplier_fee = EXCLUDED.per_supplier_fee,
       per_unit_fee = EXCLUDED.per_unit_fee,
       minimum_fee = EXCLUDED.minimum_fee,
       free_above = EXCLUDED.free_above,
       eta_min_days = EXCLUDED.eta_min_days,
       eta_max_days = EXCLUDED.eta_max_days,
       priority = EXCLUDED.priority,
       active = EXCLUDED.active,
       updated_at = now()
     RETURNING *`,
    [
      zone.id, zone.name, JSON.stringify(zone.cities), zone.baseFee,
      zone.perSupplierFee, zone.perUnitFee, zone.minimumFee, zone.freeAbove,
      zone.etaMinDays, zone.etaMaxDays, zone.priority, zone.active
    ]
  );
  await recordAudit({
    actorId: user.id,
    action: req.method === "POST" ? "create" : "update",
    entityType: "logistics_zone",
    entityId: zone.id
  });
  return sendJson(res, req.method === "POST" ? 201 : 200, {
    ok: true,
    data: mapLogisticsZone(rows[0])
  });
});
