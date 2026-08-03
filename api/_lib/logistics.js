import { randomUUID } from "node:crypto";
import { query } from "./db.js";

const fold = (value) => String(value || "")
  .trim()
  .toLocaleLowerCase("az")
  .replace(/ə/g, "e")
  .replace(/ö/g, "o")
  .replace(/ü/g, "u")
  .replace(/ı/g, "i")
  .replace(/ğ/g, "g")
  .replace(/ş/g, "s")
  .replace(/ç/g, "c");

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

const dateKey = (value) => {
  if (!value) return "";
  const source = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(source)) return source.slice(0, 10);
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "";
};

export const mapLogisticsZone = (row) => ({
  id: row.id,
  name: row.name,
  cities: Array.isArray(row.cities) ? row.cities : [],
  baseFee: Number(row.base_fee || 0),
  perSupplierFee: Number(row.per_supplier_fee || 0),
  perUnitFee: Number(row.per_unit_fee || 0),
  minimumFee: Number(row.minimum_fee || 0),
  freeAbove: row.free_above === null ? null : Number(row.free_above),
  etaMinDays: Number(row.eta_min_days || 0),
  etaMaxDays: Number(row.eta_max_days || 0),
  priority: Number(row.priority || 0),
  active: Boolean(row.active),
  rateStatus: row.rate_status === "verified"
    && dateKey(row.rate_valid_until)
    && dateKey(row.rate_valid_until) < new Date().toISOString().slice(0, 10)
    ? "expired"
    : row.rate_status || "estimate",
  rateSourceUrl: row.rate_source_url || "",
  rateVerifiedAt: row.rate_verified_at || null,
  rateVerifiedBy: row.rate_verified_by || null,
  rateValidUntil: dateKey(row.rate_valid_until) || null,
  rateNote: row.rate_note || "",
  updatedAt: row.updated_at
});

export const listLogisticsZones = async ({ includeInactive = false } = {}) => {
  const rows = await query(
    `SELECT * FROM logistics_zones
      ${includeInactive ? "" : "WHERE active = true"}
      ORDER BY priority, name`
  );
  return rows.map(mapLogisticsZone);
};

export const findLogisticsZone = (zones, city) => {
  const cityKey = fold(city);
  return zones.find((zone) => zone.cities.some((candidate) => {
    const key = fold(candidate);
    return key && (cityKey.includes(key) || key.includes(cityKey));
  })) || zones.find((zone) => zone.cities.length === 0) || null;
};

export const calculateDeliveryQuoteFromZones = ({
  zones,
  city,
  mode = "delivery",
  subtotal = null,
  itemQuantity = 0,
  supplierCount = 1
}) => {
  const zone = findLogisticsZone(zones, city);
  const safeSubtotal = subtotal === null ? null : Math.max(0, Number(subtotal || 0));
  const safeQuantity = Math.max(0, Number(itemQuantity || 0));
  const safeSupplierCount = Math.max(0, Math.trunc(Number(supplierCount || 0)));
  if (mode === "pickup") {
    return {
      zone,
      amount: 0,
      currency: "AZN",
      etaMinDays: 0,
      etaMaxDays: 1,
      breakdown: {
        tariffType: "platform_estimate",
        baseFee: 0,
        supplierFee: 0,
        quantityFee: 0,
        discount: 0
      }
    };
  }
  if (!zone) {
    return {
      zone: null,
      amount: 0,
      currency: "AZN",
      etaMinDays: 3,
      etaMaxDays: 10,
      breakdown: {
        tariffType: "request",
        note: "Bu ünvan üçün logistika tarifi admin tərəfindən əlavə edilməlidir."
      }
    };
  }
  const supplierFee = Math.max(0, safeSupplierCount - 1) * zone.perSupplierFee;
  const quantityFee = safeQuantity * zone.perUnitFee;
  const raw = Math.max(zone.minimumFee, zone.baseFee + supplierFee + quantityFee);
  const freeDelivery = zone.freeAbove !== null && safeSubtotal !== null && safeSubtotal >= zone.freeAbove;
  const amount = freeDelivery ? 0 : money(raw);
  const tariffType = zone.rateStatus === "verified" ? "verified_partner_tariff" : "platform_estimate";
  return {
    zone,
    amount,
    currency: "AZN",
    etaMinDays: zone.etaMinDays,
    etaMaxDays: zone.etaMaxDays,
    breakdown: {
      tariffType,
      rateValidUntil: zone.rateValidUntil,
      rateSourceUrl: zone.rateSourceUrl,
      baseFee: zone.baseFee,
      supplierFee: money(supplierFee),
      quantityFee: money(quantityFee),
      discount: freeDelivery ? money(raw) : 0,
      freeAbove: zone.freeAbove,
      supplierCount: safeSupplierCount,
      itemQuantity: safeQuantity
    }
  };
};

export const calculateDeliveryQuote = async (input) =>
  calculateDeliveryQuoteFromZones({ ...input, zones: await listLogisticsZones() });

export const saveDeliveryQuote = async ({
  orderId = null,
  customerId = null,
  city,
  mode,
  supplierCount,
  itemQuantity,
  subtotal,
  quote,
  status = "quoted"
}) => {
  const id = `dlq-${randomUUID()}`;
  const rows = await query(
    `INSERT INTO delivery_quotes (
       id, order_id, customer_id, zone_id, city, mode, supplier_count,
       item_quantity, subtotal, amount, currency, eta_min_days, eta_max_days,
       breakdown, status
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15
     )
     RETURNING *`,
    [
      id, orderId, customerId, quote.zone?.id || null, city, mode, supplierCount,
      itemQuantity, subtotal, quote.amount, quote.currency, quote.etaMinDays,
      quote.etaMaxDays, JSON.stringify(quote.breakdown), status
    ]
  );
  return rows[0];
};
