import { query } from "./db.js";

const fold = (value) => String(value || "")
  .toLocaleLowerCase("az")
  .replace(/ə/g, "e")
  .replace(/ö/g, "o")
  .replace(/ü/g, "u")
  .replace(/ı/g, "i")
  .replace(/ğ/g, "g")
  .replace(/ş/g, "s")
  .replace(/ç/g, "c");

const parsePackageSize = (packageText, unit) => {
  const value = fold(packageText).replace(",", ".");
  const aliases = {
    "litr": ["l", "litr"],
    "metr": ["m", "metr"],
    "m²": ["m2", "m²"],
    "m³": ["m3", "m³"],
    "ton": ["ton", "t"],
    "kq": ["kg", "kq"]
  };
  const units = aliases[unit] || [];
  for (const candidate of units) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = value.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${escaped}(?:\\b|$)`, "i"));
    if (match) return Number(match[1]);
  }
  return null;
};

const calculateLine = ({ quantity, unit, packageText, unitPrice }) => {
  const safeQuantity = Math.max(0, Number(quantity || 0));
  if (!Number.isFinite(unitPrice) || safeQuantity <= 0) return null;
  if (["ədəd", "kisə"].includes(unit)) {
    const packages = Math.ceil(safeQuantity);
    return { packageCount: packages, packageSize: 1, lineTotal: packages * unitPrice, confidence: "high" };
  }
  const packageSize = parsePackageSize(packageText, unit);
  if (packageSize && packageSize > 0) {
    const packages = Math.ceil(safeQuantity / packageSize);
    return { packageCount: packages, packageSize, lineTotal: packages * unitPrice, confidence: "high" };
  }
  if (["m³", "ton"].includes(unit)) {
    return { packageCount: safeQuantity, packageSize: 1, lineTotal: safeQuantity * unitPrice, confidence: "medium" };
  }
  return null;
};

const mapCandidate = (row) => ({
  id: row.id,
  name: row.name,
  sku: row.sku,
  brand: row.brand,
  category: row.category_id,
  subcategory: row.subcategory,
  package: row.package_text || "",
  supplierId: row.offer_supplier_id || row.supplier_id,
  supplier: row.offer_supplier_name || row.supplier_name || "",
  offerId: row.offer_id || null,
  unitPrice: row.offer_unit_price === null
    ? (row.price_status === "confirmed" && row.price_currency === "AZN" && row.price_amount !== null ? Number(row.price_amount) : null)
    : Number(row.offer_unit_price),
  currency: row.offer_currency || row.price_currency || "AZN",
  price: (row.offer_unit_price !== null || (row.price_status === "confirmed" && row.price_currency === "AZN" && row.price_amount !== null))
    ? `${Number(row.offer_unit_price ?? row.price_amount).toFixed(2)} ${row.offer_currency || row.price_currency || "AZN"}`
    : "Sorğu əsasında",
  priceStatus: row.offer_price_status || row.price_status,
  priceVerifiedAt: row.offer_verified_at || row.price_verified_at,
  packageText: row.package_text || ""
});

export const priceEstimateWithCatalog = async (rows) => {
  const sourceRows = Array.isArray(rows) ? rows.slice(0, 30) : [];
  const requestedIds = [...new Set(sourceRows.flatMap((row) => (
    Array.isArray(row.productIds) ? row.productIds.slice(0, 10) : []
  )).map(String).filter(Boolean))];
  const candidates = requestedIds.length ? await query(
    `SELECT product.id, product.name, product.sku, product.brand, product.category_id,
            product.subcategory, product.package_text, product.supplier_id,
            product.supplier_name, product.price_amount, product.price_currency,
            product.price_status, product.price_verified_at,
            best_offer.id AS offer_id,
            best_offer.supplier_id AS offer_supplier_id,
            best_offer.supplier_name AS offer_supplier_name,
            best_offer.unit_price AS offer_unit_price,
            best_offer.currency AS offer_currency,
            best_offer.price_status AS offer_price_status,
            best_offer.price_verified_at AS offer_verified_at
       FROM products product
       LEFT JOIN LATERAL (
         SELECT offer.*, supplier.name AS supplier_name
         FROM product_offers offer
         JOIN suppliers supplier ON supplier.id = offer.supplier_id
         WHERE offer.product_id = product.id
           AND offer.status = 'active'
           AND offer.currency = 'AZN'
           AND supplier.status <> 'Arxiv'
         ORDER BY
           CASE offer.price_status WHEN 'confirmed' THEN 0 WHEN 'request' THEN 1 ELSE 2 END,
           offer.unit_price ASC NULLS LAST,
           offer.updated_at DESC
         LIMIT 1
       ) best_offer ON true
      WHERE product.id = ANY($1::text[])
        AND product.status = 'active'`,
    [requestedIds]
  ) : [];
  const byId = new Map(candidates.map((row) => [row.id, mapCandidate(row)]));
  const pricedRows = sourceRows.map((row) => {
    const keywords = (Array.isArray(row.keywords) ? row.keywords : []).map(fold);
    const options = (Array.isArray(row.productIds) ? row.productIds : [])
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((candidate) => {
        const text = fold(`${candidate.name} ${candidate.brand} ${candidate.subcategory}`);
        const score = keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
        return { ...candidate, score };
      })
      .sort((left, right) => (
        Number(right.priceStatus === "confirmed") - Number(left.priceStatus === "confirmed")
        || right.score - left.score
        || Number(left.unitPrice ?? Number.MAX_SAFE_INTEGER) - Number(right.unitPrice ?? Number.MAX_SAFE_INTEGER)
      ));
    const selected = options.find((candidate) => candidate.priceStatus === "confirmed" && candidate.unitPrice !== null) || options[0] || null;
    const calculation = selected ? calculateLine({
      quantity: row.quantity,
      unit: String(row.unit || ""),
      packageText: selected.packageText,
      unitPrice: selected.unitPrice
    }) : null;
    return {
      key: String(row.key || ""),
      selected,
      packageCount: calculation?.packageCount ?? null,
      packageSize: calculation?.packageSize ?? null,
      lineTotal: calculation ? Math.round(calculation.lineTotal * 100) / 100 : null,
      pricingConfidence: calculation?.confidence || "request"
    };
  });
  const totals = pricedRows.map((row) => row.lineTotal).filter(Number.isFinite);
  const materialSubtotal = Math.round(totals.reduce((sum, value) => sum + value, 0) * 100) / 100;
  return {
    rows: pricedRows,
    materialSubtotal,
    pricedRows: totals.length,
    totalRows: pricedRows.length,
    coveragePercent: pricedRows.length ? Math.round((totals.length / pricedRows.length) * 100) : 0,
    currency: "AZN",
    note: "Məbləğ yalnız kataloqda təsdiqli qiymət və uyğun qablaşdırma ölçüsü olan mövqelər üzrə hesablanıb."
  };
};
