import "./load-local-env.mjs";
import { query } from "../api/_lib/db.js";
import { buildSupplierOnboarding } from "../api/_lib/launch-readiness.js";

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
             AND feed.last_run_at >= now() - interval '48 hours')::int AS healthy_feed_count
    FROM suppliers supplier
    LEFT JOIN companies company ON company.id = supplier.company_id
   WHERE supplier.status <> 'Arxiv'
   ORDER BY supplier.name
`);

const suppliers = rows.map((row) => ({
  id: row.id,
  name: row.name,
  onboarding: buildSupplierOnboarding(row)
}));
const ready = suppliers.filter((supplier) => supplier.onboarding.readyForPilot);

console.log("ConstEra təchizatçı buraxılış auditi:");
for (const supplier of suppliers) {
  const missing = supplier.onboarding.checks
    .filter((item) => item.required && !item.ready)
    .map((item) => item.label);
  console.log(`- ${supplier.name}: ${supplier.onboarding.score}% · ${missing.length ? missing.join(", ") : "pilot üçün hazır"}`);
}
console.log(`- Hazır təchizatçı: ${ready.length}/${suppliers.length}`);

if (process.argv.includes("--require-ready") && !ready.length) {
  console.error("Pilot satış üçün tam hazır təchizatçı yoxdur.");
  process.exit(1);
}
