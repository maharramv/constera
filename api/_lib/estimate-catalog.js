import { query } from "./db.js";
import { searchAiCatalogCandidates } from "./ai-catalog.js";
import { expandCatalogSearchGroups, foldCatalogSearchText } from "./catalog-search.js";

const MAX_ROWS = 30;
const MAX_PRODUCTS_PER_ROW = 10;
const SEARCH_CHUNK_SIZE = 3;

const fold = foldCatalogSearchText;
const boundedText = (value, maximum = 300) => String(value ?? "").trim().slice(0, maximum);
const unique = (items, limit = 100) => [...new Set(items.filter(Boolean))].slice(0, limit);

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

export const calculateEstimateLine = ({ quantity, unit, packageText, unitPrice }) => {
  const safeQuantity = Math.max(0, Number(quantity || 0));
  if (!Number.isFinite(unitPrice) || safeQuantity <= 0) return null;
  if (["ədəd", "kisə", "paket"].includes(unit)) {
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

const mapCandidate = (row) => {
  const offerPrice = row.offer_unit_price === null || row.offer_unit_price === undefined
    ? null
    : Number(row.offer_unit_price);
  const productPrice = row.price_amount === null || row.price_amount === undefined
    ? null
    : Number(row.price_amount);
  const hasOfferPrice = row.offer_price_status === "confirmed"
    && row.offer_currency === "AZN"
    && Number.isFinite(offerPrice)
    && offerPrice > 0;
  const hasProductPrice = row.price_status === "confirmed"
    && row.price_currency === "AZN"
    && Number.isFinite(productPrice)
    && productPrice > 0;
  const unitPrice = hasOfferPrice ? offerPrice : hasProductPrice ? productPrice : null;
  const currency = hasOfferPrice ? row.offer_currency : row.price_currency || "AZN";
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    brand: row.brand,
    category: row.category_id,
    subcategory: row.subcategory,
    package: row.package_text || "",
    supplierId: hasOfferPrice ? row.offer_supplier_id : row.supplier_id,
    supplier: hasOfferPrice ? row.offer_supplier_name || "" : row.supplier_name || "",
    offerId: hasOfferPrice ? row.offer_id : null,
    unitPrice,
    currency,
    price: unitPrice === null ? "Sorğu əsasında" : `${unitPrice.toFixed(2)} ${currency}`,
    priceStatus: hasOfferPrice || hasProductPrice ? "confirmed" : row.offer_price_status || row.price_status,
    priceVerifiedAt: hasOfferPrice ? row.offer_verified_at : row.price_verified_at,
    packageText: row.package_text || "",
    availability: row.availability || "Sorğu əsasında",
    stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity),
    origin: row.origin || "",
    imageUrl: row.image_url || "",
    sourceUrl: row.source_url || "",
    sourceLabel: row.source_label || row.supplier_name || row.brand || "ConstEra kataloqu",
    specs: Array.isArray(row.specs) ? row.specs.slice(0, 12) : []
  };
};

const normalizeRows = (rows) => (Array.isArray(rows) ? rows : []).slice(0, MAX_ROWS).map((row, index) => ({
  requestKey: `estimate-row-${index + 1}`,
  key: boundedText(row?.key || `material-${index + 1}`, 120),
  title: boundedText(row?.title || `Material ${index + 1}`, 240),
  category: boundedText(row?.category || "Material", 160),
  quantity: Math.max(0.001, Math.min(1_000_000_000, Number(row?.quantity) || 1)),
  unit: boundedText(row?.unit || "ədəd", 40),
  keywords: unique((Array.isArray(row?.keywords) ? row.keywords : [])
    .map((value) => boundedText(value, 120)), 12),
  productIds: unique((Array.isArray(row?.productIds) ? row.productIds : [])
    .map((value) => boundedText(value, 160)), MAX_PRODUCTS_PER_ROW)
}));

const candidateSearchText = (candidate) => fold([
  candidate.name,
  candidate.sku,
  candidate.brand,
  candidate.category,
  candidate.subcategory,
  candidate.package,
  candidate.origin,
  ...(Array.isArray(candidate.specs) ? candidate.specs : [])
].join(" "));

const candidateRawText = (candidate) => [
  candidate.name,
  candidate.sku,
  candidate.brand,
  candidate.category,
  candidate.subcategory,
  candidate.package,
  candidate.packageText,
  ...(Array.isArray(candidate.specs) ? candidate.specs : [])
].join(" ");

const containsPhrase = (haystack, phrase) => ` ${haystack} `.includes(` ${phrase} `);
const containsVariant = (haystack, phrase) => {
  if (containsPhrase(haystack, phrase)) return true;
  if (phrase.includes(" ") || phrase.length < 4) return false;
  return haystack.split(" ").some((token) => token.length >= 4
    && (token.startsWith(phrase) || phrase.startsWith(token)));
};

const extractNumbers = (value) => [...String(value || "").replace(/,/g, ".").matchAll(/\d+(?:\.\d+)?/g)]
  .map((match) => Number(match[0]))
  .filter(Number.isFinite);

const technicalIdentifiers = (value) => unique(String(value || "")
  .split(/[^\p{L}\p{N}.,xX-]+/u)
  .filter((token) => {
    const letters = token.match(/\p{L}/gu) || [];
    const hasDigits = /\d/.test(token);
    const isUpperCode = letters.length >= 2 && token === token.toLocaleUpperCase("az-AZ");
    const isAlphaNumericCode = hasDigits && letters.length > 0;
    const isMeasurement = /^\d+(?:[.,]\d+)?(?:mm|sm|m|m2|m3|kq|kg|l|lt)$/i.test(token);
    return !isMeasurement && (isUpperCode || isAlphaNumericCode);
  })
  .map(fold)
  .filter((token) => token.length >= 2), 12);

const requiredNumbers = (row) => {
  const demandQuantity = Number(row.quantity);
  return unique(extractNumbers(row.title)
    .filter((value) => !Number.isFinite(demandQuantity) || Math.abs(value - demandQuantity) > 0.0001)
    .map(String), 12).map(Number);
};

export const rankEstimateCandidates = (row, candidates) => {
  const exactIds = new Set(row.productIds || []);
  const titleGroups = expandCatalogSearchGroups(row.title, { maxGroups: 12, maxVariants: 8 });
  const groups = expandCatalogSearchGroups([
    row.title,
    row.category,
    ...(row.keywords || [])
  ].join(" "), { maxGroups: 12, maxVariants: 8 });
  const identifiers = technicalIdentifiers(row.title);
  const numbers = requiredNumbers(row);
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      const haystack = candidateSearchText(candidate);
      const name = fold(candidate.name);
      const candidateNumbers = extractNumbers(candidateRawText(candidate));
      const identifierMatch = identifiers.every((identifier) => containsPhrase(haystack, identifier));
      const numberMatch = numbers.every((number) => candidateNumbers.some((candidateNumber) => Math.abs(candidateNumber - number) <= 0.0001));
      const matchedTitleGroups = titleGroups.filter((group) => group.some((variant) => containsVariant(haystack, variant))).length;
      const requiredTitleGroups = titleGroups.length <= 2 ? 1 : Math.ceil(titleGroups.length * 0.4);
      let score = exactIds.has(candidate.id) ? 2_000 : 0;
      for (const group of groups) {
        const matches = group.filter((variant) => containsVariant(haystack, variant));
        if (!matches.length) continue;
        score += 80 + Math.min(60, matches.length * 12);
        if (matches.some((variant) => containsVariant(name, variant))) score += 70;
      }
      if (identifierMatch && identifiers.length) score += identifiers.length * 180;
      if (numberMatch && numbers.length) score += numbers.length * 90;
      if (candidate.priceStatus === "confirmed" && Number(candidate.unitPrice ?? candidate.priceAmount) > 0) score += 45;
      if (candidate.sourceUrl) score += 20;
      const specificMatch = exactIds.has(candidate.id)
        || (identifierMatch && numberMatch && matchedTitleGroups >= requiredTitleGroups);
      return { ...candidate, score, specificMatch };
    })
    .filter((candidate) => candidate.specificMatch && (exactIds.has(candidate.id) || candidate.score >= 140))
    .sort((left, right) => right.score - left.score
      || Number(right.priceStatus === "confirmed") - Number(left.priceStatus === "confirmed")
      || Number(left.unitPrice ?? Number.MAX_SAFE_INTEGER) - Number(right.unitPrice ?? Number.MAX_SAFE_INTEGER));
};

const withoutScore = (candidate) => {
  if (!candidate) return null;
  const { score: _score, specificMatch: _specificMatch, ...safe } = candidate;
  return safe;
};

const chunk = (items, size) => Array.from(
  { length: Math.ceil(items.length / size) },
  (_, index) => items.slice(index * size, index * size + size)
);

const discoverCatalogIds = async (rows) => {
  const discovered = new Map(rows.map((row) => [row.requestKey, row.productIds]));
  await Promise.all(chunk(rows, SEARCH_CHUNK_SIZE).map(async (group) => {
    const candidates = await searchAiCatalogCandidates({
      prompt: group.map((row) => row.title).join("; "),
      hints: unique(group.flatMap((row) => [row.category, ...row.keywords]), 10),
      productIds: unique(group.flatMap((row) => row.productIds), 30),
      limit: 24
    });
    for (const row of group) {
      const ranked = rankEstimateCandidates(row, candidates);
      discovered.set(row.requestKey, unique([
        ...row.productIds,
        ...ranked.map((candidate) => candidate.id)
      ], MAX_PRODUCTS_PER_ROW));
    }
  }));
  return discovered;
};

export const priceEstimateWithCatalog = async (rows) => {
  const sourceRows = normalizeRows(rows);
  const candidateIdsByRow = await discoverCatalogIds(sourceRows);
  const requestedIds = unique(sourceRows.flatMap((row) => candidateIdsByRow.get(row.requestKey) || []), 300);
  const candidates = requestedIds.length ? await query(
    `SELECT product.id, product.name, product.sku, product.brand, product.category_id,
            product.subcategory, product.package_text, product.supplier_id,
            product.supplier_name, product.price_amount, product.price_currency,
            product.price_status, product.price_verified_at, product.availability,
            product.stock_quantity, product.origin, product.image_url, product.source_url,
            product.source_label, product.specs,
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
    const rowIds = candidateIdsByRow.get(row.requestKey) || [];
    const ranked = rankEstimateCandidates(row, rowIds.map((id) => byId.get(String(id))).filter(Boolean));
    const selectedCandidate = ranked.find((candidate) => candidate.priceStatus === "confirmed" && candidate.unitPrice !== null)
      || ranked[0]
      || null;
    const calculation = selectedCandidate ? calculateEstimateLine({
      quantity: row.quantity,
      unit: row.unit,
      packageText: selectedCandidate.packageText,
      unitPrice: selectedCandidate.unitPrice
    }) : null;
    const selected = withoutScore(selectedCandidate);
    return {
      key: row.key,
      title: row.title,
      selected,
      alternatives: ranked.slice(0, 3).map(withoutScore),
      matchedBy: selected ? (row.productIds.includes(selected.id) ? "provided" : "catalog_search") : "unresolved",
      packageCount: calculation?.packageCount ?? null,
      packageSize: calculation?.packageSize ?? null,
      lineTotal: calculation ? Math.round(calculation.lineTotal * 100) / 100 : null,
      pricingConfidence: calculation?.confidence || "request"
    };
  });
  const totals = pricedRows.map((row) => row.lineTotal).filter(Number.isFinite);
  const unresolvedRows = pricedRows.filter((row) => !row.selected).map((row) => ({ key: row.key, title: row.title }));
  const searchMatchedRows = pricedRows.filter((row) => row.matchedBy === "catalog_search").length;
  const materialSubtotal = Math.round(totals.reduce((sum, value) => sum + value, 0) * 100) / 100;
  return {
    rows: pricedRows,
    materialSubtotal,
    pricedRows: totals.length,
    matchedRows: pricedRows.length - unresolvedRows.length,
    searchMatchedRows,
    unresolvedRows,
    totalRows: pricedRows.length,
    coveragePercent: pricedRows.length ? Math.round((totals.length / pricedRows.length) * 100) : 0,
    matchPercent: pricedRows.length ? Math.round(((pricedRows.length - unresolvedRows.length) / pricedRows.length) * 100) : 0,
    currency: "AZN",
    note: "Məbləğ yalnız real kataloq uyğunluğu, təsdiqli AZN qiyməti və uyğun qablaşdırma ölçüsü olan mövqelər üzrə hesablanıb."
  };
};
