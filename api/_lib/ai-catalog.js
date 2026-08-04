import { query } from "./db.js";
import { expandCatalogSearchGroups, foldCatalogSearchText } from "./catalog-search.js";
import { categoryPublicId } from "./validation.js";

const MAX_CANDIDATES = 24;
const MAX_QUERY_ROWS = 120;

const safeHttpsUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString().slice(0, 1_500) : "";
  } catch {
    return "";
  }
};

const boundedText = (value, maximum = 300) => String(value ?? "").trim().slice(0, maximum);
const unique = (items, limit = 50) => [...new Set(items.filter(Boolean))].slice(0, limit);

const mapCandidate = (row) => ({
  id: boundedText(row.id, 160),
  sku: boundedText(row.sku, 160),
  name: boundedText(row.name, 240),
  brand: boundedText(row.brand, 160),
  category: categoryPublicId(row.category_id),
  subcategory: boundedText(row.subcategory, 200),
  package: boundedText(row.package_text || "Sorğu ilə", 160),
  origin: boundedText(row.origin || "Azərbaycan/İdxal", 160),
  price: boundedText(row.price_text || "Sorğu əsasında", 160),
  priceAmount: row.price_amount === null ? null : Number(row.price_amount),
  priceCurrency: boundedText(row.price_currency || "AZN", 12),
  priceStatus: boundedText(row.price_status || "request", 40),
  priceVerifiedAt: row.price_verified_at || null,
  availability: boundedText(row.availability || "Sorğu əsasında", 160),
  stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity),
  sourceLabel: boundedText(row.source_label || row.supplier_name || row.brand || "ConstEra kataloqu", 160),
  sourceUrl: safeHttpsUrl(row.source_url),
  specs: unique((Array.isArray(row.specs) ? row.specs : []).map((item) => boundedText(item, 240)), 12)
});

const searchableCandidateText = (candidate) => foldCatalogSearchText([
  candidate.name,
  candidate.sku,
  candidate.brand,
  candidate.category,
  candidate.subcategory,
  candidate.package,
  candidate.origin,
  ...candidate.specs
].join(" "));

const rankCandidate = (candidate, searchGroups, exactIds) => {
  const haystack = searchableCandidateText(candidate);
  const name = foldCatalogSearchText(candidate.name);
  let score = exactIds.has(candidate.id) ? 2_000 : 0;
  for (const group of searchGroups) {
    const matched = group.filter((variant) => haystack.includes(variant));
    if (!matched.length) continue;
    score += 90 + Math.min(60, matched.length * 12);
    if (matched.some((variant) => name.includes(variant))) score += 80;
  }
  if (candidate.sourceUrl) score += 70;
  if (candidate.priceStatus === "confirmed" && Number(candidate.priceAmount) > 0) score += 60;
  if (Number(candidate.stockQuantity) > 0) score += 25;
  return score;
};

const productColumns = `
  p.id, p.sku, p.name, p.brand, p.category_id, p.subcategory, p.package_text,
  p.origin, p.price_text, p.price_amount, p.price_currency, p.price_status,
  p.price_verified_at, p.availability, p.stock_quantity, p.source_label,
  p.source_url, p.supplier_name, p.specs
`;

export const searchAiCatalogCandidates = async ({ prompt = "", hints = [], productIds = [], limit = MAX_CANDIDATES } = {}) => {
  const safeLimit = Math.min(MAX_CANDIDATES, Math.max(1, Number(limit || MAX_CANDIDATES)));
  const exactIds = new Set(unique(productIds.map((id) => boundedText(id, 160)), 30));
  const phrases = unique([
    boundedText(prompt, 2_000),
    ...hints.map((hint) => boundedText(hint, 160))
  ], 12);
  const searchGroups = unique(
    phrases.flatMap((phrase) => expandCatalogSearchGroups(phrase, { maxGroups: 8, maxVariants: 8 }))
      .map((group) => group.join("\u001f")),
    40
  ).map((group) => group.split("\u001f"));

  const candidates = new Map();
  if (exactIds.size) {
    const exactRows = await query(
      `SELECT ${productColumns}
         FROM products p
        WHERE p.status = 'active' AND p.id = ANY($1::text[])`,
      [[...exactIds]]
    );
    exactRows.map(mapCandidate).forEach((candidate) => candidates.set(candidate.id, candidate));
  }

  const variants = unique(searchGroups.flat(), 64);
  if (variants.length) {
    const searchExpression = `translate(
      lower(
        coalesce(p.name, '') || ' ' || coalesce(p.sku, '') || ' ' ||
        coalesce(p.brand, '') || ' ' || coalesce(p.subcategory, '') || ' ' ||
        coalesce(p.package_text, '') || ' ' || coalesce(p.origin, '') || ' ' ||
        coalesce(p.specs::text, '')
      ),
      'əğıöşüç',
      'egiosuc'
    )`;
    const values = variants.map((variant) => `%${variant}%`);
    values.push(MAX_QUERY_ROWS);
    const searchRows = await query(
      `SELECT ${productColumns}
         FROM products p
        WHERE p.status = 'active'
          AND (${variants.map((_, index) => `${searchExpression} ILIKE $${index + 1}`).join(" OR ")})
        ORDER BY
          (NULLIF(trim(coalesce(p.source_url, '')), '') IS NOT NULL) DESC,
          (p.price_status = 'confirmed' AND p.price_amount > 0) DESC,
          (p.stock_quantity > 0) DESC,
          p.updated_at DESC
        LIMIT $${values.length}`,
      values
    );
    searchRows.map(mapCandidate).forEach((candidate) => candidates.set(candidate.id, candidate));
  }

  return [...candidates.values()]
    .map((candidate) => ({ candidate, score: rankCandidate(candidate, searchGroups, exactIds) }))
    .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name, "az"))
    .slice(0, safeLimit)
    .map(({ candidate }) => candidate);
};
