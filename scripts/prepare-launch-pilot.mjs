import fs from "node:fs/promises";
import path from "node:path";

import "./load-local-env.mjs";
import { query } from "../api/_lib/db.js";

const argv = process.argv.slice(2);
const readOption = (name, fallback) => {
  const withEquals = argv.find((item) => item.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")
    ? argv[index + 1]
    : fallback;
};

const parsedLimit = Number(readOption("--limit", "20"));
const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 20;
const outputDir = path.resolve(readOption("--output-dir", "outputs"));

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const rows = await query(
  `SELECT
     product.id AS product_id,
     product.sku,
     product.name,
     product.brand,
     category.title AS category,
     product.subcategory,
     product.package_text,
     product.availability,
     product.image_url AS reference_image_url,
     coalesce(offer.source_url, product.source_url) AS source_url,
     offer.id AS offer_id,
     offer.unit_price,
     offer.currency,
     offer.price_status,
     offer.price_verified_at,
     offer.stock_quantity,
     offer.minimum_order,
     offer.lead_time_days,
     supplier.id AS supplier_id,
     supplier.name AS supplier_name,
     supplier.website AS supplier_website,
     supplier.contact AS supplier_contact,
     company.tax_id AS supplier_tax_id,
     verified_media.url AS licensed_image_url,
     verified_media.license_type AS media_license_type,
     EXISTS (
       SELECT 1 FROM users supplier_user
        WHERE supplier_user.company_id = supplier.company_id
          AND supplier_user.role = 'supplier'
          AND supplier_user.status = 'active'
     ) AS has_supplier_account,
     EXISTS (
       SELECT 1 FROM supplier_contracts contract
        WHERE contract.supplier_id = supplier.id
          AND contract.status = 'active'
          AND contract.legal_confirmed = true
          AND contract.starts_on <= current_date
          AND (contract.ends_on IS NULL OR contract.ends_on >= current_date)
     ) AS has_active_contract,
     coalesce(issues.open_issues, 0)::int AS open_issues,
     coalesce(issues.high_issues, 0)::int AS high_issues
   FROM products product
   LEFT JOIN categories category ON category.id = product.category_id
   LEFT JOIN LATERAL (
     SELECT candidate.*
       FROM product_offers candidate
      WHERE candidate.product_id = product.id
        AND candidate.status = 'active'
      ORDER BY
        CASE candidate.price_status WHEN 'confirmed' THEN 0 WHEN 'request' THEN 1 ELSE 2 END,
        candidate.price_verified_at DESC NULLS LAST,
        candidate.stock_quantity DESC NULLS LAST,
        candidate.unit_price ASC NULLS LAST
      LIMIT 1
   ) offer ON true
   LEFT JOIN suppliers supplier ON supplier.id = offer.supplier_id AND supplier.status <> 'Arxiv'
   LEFT JOIN companies company ON company.id = supplier.company_id AND company.status = 'active'
   LEFT JOIN LATERAL (
     SELECT media.url, media.license_type
       FROM media_assets media
      WHERE media.entity_type = 'product'
        AND media.entity_id = product.id
        AND media.status = 'active'
        AND media.content_type LIKE 'image/%'
        AND media.license_type IN ('own', 'supplier', 'official', 'licensed')
        AND media.rights_status = 'verified'
        AND (media.rights_expires_on IS NULL OR media.rights_expires_on >= current_date)
        AND media.url ~ '^https://'
      ORDER BY media.is_primary DESC, media.created_at DESC
      LIMIT 1
   ) verified_media ON true
   LEFT JOIN LATERAL (
     SELECT
       count(*) FILTER (WHERE issue.status = 'open')::int AS open_issues,
       count(*) FILTER (
         WHERE issue.status = 'open' AND issue.severity IN ('high', 'critical')
       )::int AS high_issues
       FROM catalog_quality_issues issue
      WHERE (issue.entity_type = 'product' AND issue.entity_id = product.id)
         OR (offer.id IS NOT NULL AND issue.entity_type = 'product_offer' AND issue.entity_id = offer.id)
   ) issues ON true
  WHERE product.status = 'active'
    AND lower(trim(coalesce(product.brand, ''))) <> 'constera sorğu'
    AND lower(product.name) NOT LIKE '%məhsul qrupu%'
    AND upper(product.sku) NOT LIKE '%RFQ%'
  ORDER BY
    CASE WHEN offer.price_status = 'confirmed' AND offer.unit_price > 0 THEN 0 ELSE 1 END,
    CASE WHEN offer.stock_quantity > 0 THEN 0 ELSE 1 END,
    CASE WHEN coalesce(offer.source_url, product.source_url) ~ '^https://' THEN 0 ELSE 1 END,
    CASE WHEN verified_media.url IS NOT NULL THEN 0 ELSE 1 END,
    coalesce(issues.high_issues, 0),
    coalesce(issues.open_issues, 0),
    offer.price_verified_at DESC NULLS LAST,
    product.name
  LIMIT $1`,
  [limit]
);

const freshAfter = Date.now() - 30 * 24 * 60 * 60 * 1000;
const candidates = rows.map((row, index) => {
  const checks = {
    confirmedPrice: row.price_status === "confirmed" && Number(row.unit_price) > 0,
    freshPrice: Boolean(row.price_verified_at && new Date(row.price_verified_at).getTime() >= freshAfter),
    knownStock: Number(row.stock_quantity) > 0,
    publicSource: /^https:\/\//.test(row.source_url || ""),
    licensedMedia: Boolean(row.licensed_image_url),
    supplierProfile: Boolean(
      row.supplier_id
      && row.supplier_tax_id
      && row.supplier_contact
      && /^https:\/\//.test(row.supplier_website || "")
      && row.has_supplier_account
    ),
    activeContract: Boolean(row.has_active_contract),
    noHighQualityIssues: Number(row.high_issues) === 0
  };
  const missing = Object.entries(checks)
    .filter(([, ready]) => !ready)
    .map(([key]) => ({
      confirmedPrice: "təsdiqli qiymət",
      freshPrice: "30 günlük qiymət təsdiqi",
      knownStock: "təsdiqli stok",
      publicSource: "açıq mənbə",
      licensedMedia: "media istifadə hüququ",
      supplierProfile: "təchizatçı profili və VÖEN",
      activeContract: "aktiv müqavilə",
      noHighQualityIssues: "yüksək riskli keyfiyyət problemi"
    })[key]);

  return {
    priority: index + 1,
    reviewStatus: missing.length ? "review_required" : "pilot_ready",
    missing,
    checks,
    productId: row.product_id,
    offerId: row.offer_id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    package: row.package_text,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    price: row.unit_price === null ? null : Number(row.unit_price),
    currency: row.currency,
    priceVerifiedAt: row.price_verified_at,
    stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity),
    minimumOrder: row.minimum_order === null ? null : Number(row.minimum_order),
    leadTimeDays: row.lead_time_days === null ? null : Number(row.lead_time_days),
    availability: row.availability,
    sourceUrl: row.source_url,
    imageUrl: row.licensed_image_url || row.reference_image_url,
    imageRightsVerified: Boolean(row.licensed_image_url),
    mediaLicenseType: row.media_license_type,
    openQualityIssues: Number(row.open_issues),
    highQualityIssues: Number(row.high_issues)
  };
});

const csvEscape = (value) => {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const headers = [
  "priority", "review_status", "missing", "product_id", "offer_id", "sku", "name", "brand",
  "category", "subcategory", "package", "supplier_id", "supplier_name", "price", "currency",
  "price_verified_at", "stock_quantity", "minimum_order", "lead_time_days", "availability",
  "source_url", "image_url", "image_rights_verified", "media_license_type", "open_quality_issues",
  "high_quality_issues"
];
const csvRows = [headers.join(",")];
for (const candidate of candidates) {
  csvRows.push([
    candidate.priority, candidate.reviewStatus, candidate.missing, candidate.productId,
    candidate.offerId, candidate.sku, candidate.name, candidate.brand, candidate.category,
    candidate.subcategory, candidate.package, candidate.supplierId, candidate.supplierName,
    candidate.price, candidate.currency, candidate.priceVerifiedAt, candidate.stockQuantity,
    candidate.minimumOrder, candidate.leadTimeDays, candidate.availability, candidate.sourceUrl,
    candidate.imageUrl, candidate.imageRightsVerified ? "YES" : "NO", candidate.mediaLicenseType,
    candidate.openQualityIssues, candidate.highQualityIssues
  ].map(csvEscape).join(","));
}

const payload = {
  generatedAt: new Date().toISOString(),
  notice: "Bu sənəd yalnız pilot namizədləri sıralayır. review_required qeydi olan məhsul satışa hazır sayılmır.",
  requestedLimit: limit,
  candidateCount: candidates.length,
  readyCount: candidates.filter((item) => item.reviewStatus === "pilot_ready").length,
  candidates
};

await fs.mkdir(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, "pilot-product-candidates.json");
const csvPath = path.join(outputDir, "pilot-product-candidates.csv");
await Promise.all([
  fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8"),
  fs.writeFile(csvPath, `${csvRows.join("\n")}\n`, "utf8")
]);

console.log("ConstEra pilot assortiment namizədləri hazırlandı:");
console.log(`- Namizəd: ${candidates.length}`);
console.log(`- Pilot üçün tam hazır: ${payload.readyCount}`);
console.log(`- Əl ilə təsdiq tələb edir: ${candidates.length - payload.readyCount}`);
console.log(`- JSON: ${jsonPath}`);
console.log(`- CSV: ${csvPath}`);
