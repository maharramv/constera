import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { assertMethod, sendJson, withApiErrors } from "../_lib/http.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const user = await requireRole(req, ["super_admin", "admin"]);
  const [categories, suppliers, products, entities, tenders, lots, orders, orderItems] = await Promise.all([
    query("SELECT * FROM categories ORDER BY kind, parent_id NULLS FIRST, sort_order, title"),
    query("SELECT * FROM suppliers ORDER BY name"),
    query(`SELECT id, sku, name, slug, brand, category_id, subcategory, package_text, origin,
                  supplier_id, supplier_name, price_amount, price_currency, price_text, price_note,
                  price_status, availability, stock_quantity, minimum_order, price_verified_at,
                  image_url, source_url, source_label, specs, extra_data, status, created_at, updated_at
             FROM products ORDER BY updated_at DESC`),
    query("SELECT * FROM marketplace_entities ORDER BY entity_kind, title"),
    query("SELECT * FROM tenders ORDER BY created_at DESC"),
    query("SELECT * FROM tender_lots ORDER BY tender_id, sort_order"),
    query("SELECT * FROM orders ORDER BY created_at DESC"),
    query("SELECT * FROM order_items ORDER BY order_id, created_at")
  ]);
  const data = {
    version: "constera-cloud-backup-v2",
    exportedAt: new Date().toISOString(),
    source: "ConstEra PostgreSQL",
    data: { categories, suppliers, products, entities, tenders, tenderLots: lots, orders, orderItems }
  };
  await recordAudit({
    actorId: user.id,
    action: "export",
    entityType: "backup",
    details: { categories: categories.length, products: products.length, entities: entities.length, orders: orders.length }
  });
  return sendJson(res, 200, { ok: true, data });
});
