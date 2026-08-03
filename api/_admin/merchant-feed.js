import { query } from "../_lib/db.js";
import { assertMethod, withApiErrors } from "../_lib/http.js";
import { buildMerchantFeedXml } from "../_lib/merchant-feed.js";

const appOrigin = () => {
  try {
    const url = new URL(process.env.APP_ORIGIN || "https://constera.az");
    return url.protocol === "https:" ? url.origin : "https://constera.az";
  } catch {
    return "https://constera.az";
  }
};

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const rows = await query(
    `SELECT product.id, product.sku, product.name, product.brand,
            product.subcategory, product.package_text, product.origin,
            product.price_amount, product.price_currency, product.stock_quantity,
            product.specs, product.extra_data->>'barcode' AS barcode,
            category.title AS category_title,
            licensed_media.url AS media_url
       FROM products product
       LEFT JOIN categories category ON category.id = product.category_id
       JOIN suppliers supplier
         ON supplier.id = product.supplier_id
        AND supplier.status <> 'Arxiv'
       JOIN supplier_contracts contract
         ON contract.supplier_id = supplier.id
        AND contract.status = 'active'
        AND contract.legal_confirmed = true
        AND contract.starts_on <= current_date
        AND (contract.ends_on IS NULL OR contract.ends_on >= current_date)
       JOIN LATERAL (
         SELECT media.url
           FROM media_assets media
          WHERE media.entity_type = 'product'
            AND media.entity_id = product.id
            AND media.status = 'active'
            AND media.content_type LIKE 'image/%'
            AND media.license_type IN ('own', 'supplier', 'official', 'licensed')
            AND media.rights_status = 'verified'
            AND (media.rights_expires_on IS NULL OR media.rights_expires_on >= current_date)
            AND media.url ~ '^https://'
          ORDER BY media.is_primary DESC, media.updated_at DESC, media.created_at DESC
          LIMIT 1
       ) licensed_media ON true
      WHERE product.status = 'active'
        AND NULLIF(trim(supplier.contact), '') IS NOT NULL
        AND supplier.website ~ '^https://'
        AND EXISTS (
          SELECT 1 FROM companies company
           WHERE company.id = supplier.company_id
             AND company.status = 'active'
             AND NULLIF(trim(company.tax_id), '') IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM users supplier_user
           WHERE supplier_user.company_id = supplier.company_id
             AND supplier_user.role = 'supplier'
             AND supplier_user.status = 'active'
        )
        AND product.price_status = 'confirmed'
        AND product.price_amount > 0
        AND product.price_verified_at >= now() - interval '30 days'
        AND product.stock_quantity IS NOT NULL
        AND product.source_url ~ '^https://'
        AND lower(trim(coalesce(product.brand, ''))) <> 'constera sorğu'
        AND lower(product.name) NOT LIKE '%məhsul qrupu%'
        AND upper(product.sku) NOT LIKE '%RFQ%'
      ORDER BY product.updated_at DESC
      LIMIT 5000`
  );
  const xml = buildMerchantFeedXml(rows, appOrigin());
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200);
  return res.end(xml);
});
