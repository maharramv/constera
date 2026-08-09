import fs from "node:fs/promises";
import path from "node:path";

import "./load-local-env.mjs";
import { query } from "../api/_lib/db.js";
import { buildSupplierOnboarding } from "../api/_lib/launch-readiness.js";

const argv = process.argv.slice(2);
const readOption = (name, fallback) => {
  const withEquals = argv.find((item) => item.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")
    ? argv[index + 1]
    : fallback;
};

const outputDir = path.resolve(readOption("--output-dir", "outputs"));
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const rows = await query(`
  SELECT supplier.id, supplier.name, supplier.website, supplier.contact,
         supplier.company_id, company.tax_id,
         (SELECT count(*) FROM users supplier_user
           WHERE supplier_user.company_id = supplier.company_id
             AND supplier_user.role = 'supplier'
             AND supplier_user.status = 'active')::int AS supplier_user_count,
         (SELECT count(*) FROM supplier_contracts contract
           WHERE contract.supplier_id = supplier.id
             AND contract.status = 'active'
             AND contract.legal_confirmed = true
             AND contract.starts_on <= current_date
             AND (contract.ends_on IS NULL OR contract.ends_on >= current_date))::int AS active_contract_count,
         (SELECT count(*) FROM product_offers offer
           WHERE offer.supplier_id = supplier.id
             AND offer.status = 'active'
             AND offer.price_status = 'confirmed'
             AND offer.unit_price > 0
             AND offer.price_verified_at >= now() - interval '30 days'
             AND offer.stock_quantity > 0
             AND offer.source_url ~ '^https://')::int AS eligible_offer_count,
         (SELECT count(DISTINCT product.id)
            FROM products product
            JOIN media_assets media
              ON media.entity_type = 'product'
             AND media.entity_id = product.id
             AND media.status = 'active'
             AND media.content_type LIKE 'image/%'
             AND media.license_type IN ('own', 'supplier', 'official', 'licensed')
             AND media.rights_status = 'verified'
             AND (media.rights_expires_on IS NULL OR media.rights_expires_on >= current_date)
           WHERE product.supplier_id = supplier.id
             AND product.status = 'active')::int AS licensed_media_count,
         (SELECT count(*) FROM supplier_feeds feed
           WHERE feed.supplier_id = supplier.id
             AND feed.active = true
             AND feed.last_status = 'completed'
             AND feed.last_run_at >= now() - interval '48 hours')::int AS healthy_feed_count,
         (SELECT count(*) FROM products product
           WHERE product.supplier_id = supplier.id
             AND product.status = 'active')::int AS product_count
    FROM suppliers supplier
    LEFT JOIN companies company ON company.id = supplier.company_id
   WHERE supplier.status <> 'Arxiv'
`);

const suppliers = rows
  .map((row) => {
    const onboarding = buildSupplierOnboarding(row);
    const requiredMissing = onboarding.checks
      .filter((item) => item.required && !item.ready)
      .map((item) => item.label);
    const optionalMissing = onboarding.checks
      .filter((item) => !item.required && !item.ready)
      .map((item) => item.label);
    return {
      supplierId: row.id,
      supplierName: row.name,
      score: onboarding.score,
      reviewStatus: onboarding.readyForPilot ? "pilot_ready" : "review_required",
      requiredMissing,
      optionalMissing,
      productCount: Number(row.product_count),
      eligibleOfferCount: Number(row.eligible_offer_count),
      licensedMediaCount: Number(row.licensed_media_count),
      hasTaxId: Boolean(String(row.tax_id || "").trim()),
      hasContact: Boolean(String(row.contact || "").trim()),
      hasWebsite: /^https:\/\//.test(row.website || ""),
      supplierAccountCount: Number(row.supplier_user_count),
      activeContractCount: Number(row.active_contract_count),
      healthyFeedCount: Number(row.healthy_feed_count)
    };
  })
  .sort((left, right) => (
    right.score - left.score
    || right.eligibleOfferCount - left.eligibleOfferCount
    || right.productCount - left.productCount
    || left.supplierName.localeCompare(right.supplierName, "az")
  ))
  .map((supplier, index) => ({ priority: index + 1, ...supplier }));

const csvEscape = (value) => {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const headers = [
  "priority", "review_status", "supplier_id", "supplier_name", "score", "required_missing",
  "optional_missing", "product_count", "eligible_offer_count", "licensed_media_count",
  "has_tax_id", "has_contact", "has_website", "supplier_account_count",
  "active_contract_count", "healthy_feed_count"
];
const csvRows = [headers.join(",")];
for (const supplier of suppliers) {
  csvRows.push([
    supplier.priority, supplier.reviewStatus, supplier.supplierId, supplier.supplierName,
    supplier.score, supplier.requiredMissing, supplier.optionalMissing, supplier.productCount,
    supplier.eligibleOfferCount, supplier.licensedMediaCount, supplier.hasTaxId ? "YES" : "NO",
    supplier.hasContact ? "YES" : "NO", supplier.hasWebsite ? "YES" : "NO",
    supplier.supplierAccountCount, supplier.activeContractCount, supplier.healthyFeedCount
  ].map(csvEscape).join(","));
}

const payload = {
  generatedAt: new Date().toISOString(),
  notice: "Bu növbə mövcud sübutlara əsaslanır. Çatışmayan hüquqi və kommersiya məlumatları avtomatik təsdiqlənmir.",
  supplierCount: suppliers.length,
  readyCount: suppliers.filter((item) => item.reviewStatus === "pilot_ready").length,
  suppliers
};

await fs.mkdir(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, "supplier-onboarding-priority.json");
const csvPath = path.join(outputDir, "supplier-onboarding-priority.csv");
await Promise.all([
  fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8"),
  fs.writeFile(csvPath, `${csvRows.join("\n")}\n`, "utf8")
]);

console.log("ConstEra təchizatçı qoşulma növbəsi hazırlandı:");
for (const supplier of suppliers) {
  console.log(`- ${supplier.priority}. ${supplier.supplierName}: ${supplier.score}% · ${supplier.requiredMissing.join(", ") || "pilot üçün hazır"}`);
}
console.log(`- Pilot üçün tam hazır: ${payload.readyCount}/${payload.supplierCount}`);
console.log(`- JSON: ${jsonPath}`);
console.log(`- CSV: ${csvPath}`);
