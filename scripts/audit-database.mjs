import "./load-local-env.mjs";
import { query } from "../api/_lib/db.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const [counts] = await query(`
  SELECT
    (SELECT count(*)::int FROM categories WHERE kind = 'material' AND parent_id IS NULL AND active = true) AS material_categories,
    (SELECT count(*)::int FROM categories WHERE kind = 'material' AND parent_id IS NOT NULL AND active = true) AS material_subcategories,
    (SELECT count(*)::int FROM products WHERE status = 'active') AS products,
    (SELECT count(*)::int FROM suppliers WHERE status <> 'Arxiv') AS suppliers,
    (SELECT count(*)::int FROM marketplace_entities WHERE entity_kind = 'service' AND status = 'active') AS services,
    (SELECT count(*)::int FROM marketplace_entities WHERE entity_kind = 'package' AND status = 'active') AS packages,
    (SELECT count(*)::int FROM marketplace_entities WHERE entity_kind = 'rental' AND status = 'active') AS rentals,
    (SELECT count(*)::int FROM orders) AS orders,
    (SELECT count(*)::int FROM users WHERE status = 'active') AS active_users,
    (SELECT count(*)::int FROM catalog_import_runs) AS scraper_runs,
    (SELECT count(*)::int FROM catalog_import_items WHERE review_status = 'pending') AS scraper_pending
`);

const [integrity] = await query(`
  SELECT
    (SELECT count(*)::int FROM products
      WHERE status = 'active' AND price_status = 'confirmed'
        AND (price_amount IS NULL OR source_url IS NULL OR source_url = '')) AS invalid_confirmed_prices,
    (SELECT count(*)::int FROM (
      SELECT sku FROM products WHERE status = 'active' GROUP BY sku HAVING count(*) > 1
    ) duplicate_skus) AS duplicate_skus,
    (SELECT count(*)::int FROM products
      WHERE price_verified_at > now() + interval '5 minutes') AS future_price_dates,
    (SELECT count(*)::int FROM order_items WHERE quantity <= 0) AS invalid_order_quantities,
    (SELECT count(*)::int FROM users u
      WHERE u.role = 'supplier' AND u.status = 'active' AND (
        u.company_id IS NULL OR NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.company_id = u.company_id)
      )) AS supplier_users_without_profile,
    (SELECT count(*)::int FROM products p
      JOIN suppliers s ON s.id = p.supplier_id
      WHERE lower(coalesce(p.supplier_name, '')) <> lower(s.name)) AS supplier_product_scope_mismatch,
    (SELECT count(*)::int FROM tenders t
      WHERE t.visibility = 'invited' AND NOT EXISTS (
        SELECT 1 FROM tender_invitations ti WHERE ti.tender_id = t.id
      )) AS invited_tenders_without_supplier,
    (SELECT count(*)::int FROM catalog_import_items
      WHERE (payload->>'price_status') = 'confirmed'
        AND (
          NULLIF(payload->>'source_url', '') IS NULL
          OR NULLIF(payload->>'verified_at', '') IS NULL
          OR NULLIF(payload->>'price', '') IS NULL
        )) AS invalid_scraper_confirmed_prices,
    (SELECT count(*)::int FROM catalog_import_runs
      WHERE source_file ~ '(^/|^[A-Za-z]:[\\/])') AS scraper_absolute_source_paths,
    (SELECT count(DISTINCT i.id)::int
       FROM catalog_import_items i
       CROSS JOIN LATERAL jsonb_array_elements_text(
         CASE
           WHEN jsonb_typeof(i.payload->'image_urls') = 'array' THEN i.payload->'image_urls'
           ELSE '[]'::jsonb
         END
       ) AS media(url)
      WHERE CASE i.source_id
        WHEN 'elem' THEN media.url !~* '^https://(www\\.)?elem\\.az/'
        WHEN 'tvim' THEN media.url !~* '^https://(www\\.)?tvim\\.az/'
        WHEN 'omid' THEN media.url !~* '^https://(www\\.)?omid\\.az/'
        WHEN 'insaat' THEN media.url !~* '^https://(www\\.)?insaat\\.az/'
        ELSE true
      END) AS invalid_scraper_media_hosts
`);

const [schema] = await query(`
  SELECT
    to_regclass('public.orders') IS NOT NULL AS orders_ready,
    to_regclass('public.order_items') IS NOT NULL AS order_items_ready,
    to_regclass('public.password_reset_tokens') IS NOT NULL AS password_reset_ready,
    to_regclass('public.customer_projects') IS NOT NULL AS customer_projects_ready,
    to_regclass('public.saved_products') IS NOT NULL AS saved_products_ready,
    to_regclass('public.customer_estimates') IS NOT NULL AS customer_estimates_ready,
    to_regclass('public.catalog_import_runs') IS NOT NULL AS scraper_runs_ready,
    to_regclass('public.catalog_import_items') IS NOT NULL AS scraper_items_ready,
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS search_ready,
    to_regclass('public.suppliers_company_unique') IS NOT NULL AS supplier_scope_ready
`);

const minimums = {
  material_categories: 70,
  material_subcategories: 695,
  products: 826,
  services: 118,
  packages: 75,
  rentals: 108
};
const problems = [];

Object.entries(minimums).forEach(([key, minimum]) => {
  if (Number(counts[key] || 0) < minimum) problems.push(`${key}: ${counts[key] || 0}, minimum ${minimum}`);
});
Object.entries(integrity).forEach(([key, value]) => {
  if (Number(value || 0) !== 0) problems.push(`${key}: ${value}`);
});
Object.entries(schema).forEach(([key, value]) => {
  if (!value) problems.push(`${key}: hazır deyil`);
});

console.log("ConstEra Neon auditi:");
Object.entries(counts).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
console.log(`- schema: ${Object.values(schema).every(Boolean) ? "hazır" : "natamam"}`);
console.log(`- data_integrity: ${Object.values(integrity).every((value) => Number(value || 0) === 0) ? "təmiz" : "problemli"}`);

if (problems.length) {
  console.error("Neon auditi uğursuz oldu:");
  problems.forEach((problem) => console.error(`- ${problem}`));
  process.exit(1);
}

console.log("Neon auditi uğurla tamamlandı.");
