import { requireRole } from "../_lib/auth.js";
import { query } from "../_lib/db.js";
import { assertMethod, sendJson, withApiErrors } from "../_lib/http.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  await requireRole(req, ["super_admin", "admin", "sales"]);
  const [countsRows, priceRows, rfqRows, tenderRows, entityRows, categoryRows, auditRows] = await Promise.all([
    query(`SELECT
      (SELECT count(*) FROM users WHERE status = 'active')::int AS users,
      (SELECT count(*) FROM products WHERE status = 'active')::int AS products,
      (SELECT count(*) FROM suppliers WHERE status <> 'Arxiv')::int AS suppliers,
      (SELECT count(*) FROM categories WHERE active = true AND parent_id IS NULL)::int AS categories,
      (SELECT count(*) FROM categories WHERE active = true AND parent_id IS NOT NULL)::int AS subcategories,
      (SELECT count(*) FROM rfqs)::int AS rfqs,
      (SELECT count(*) FROM offers)::int AS offers,
      (SELECT count(*) FROM tenders)::int AS tenders,
      (SELECT count(*) FROM tender_bids)::int AS tender_bids,
      (SELECT count(*) FROM media_assets WHERE status = 'active')::int AS media,
      (SELECT count(*) FROM import_jobs)::int AS imports,
      (SELECT count(*) FROM notifications WHERE status IN ('pending', 'failed'))::int AS pending_notifications`),
    query(`SELECT price_status AS status, count(*)::int AS count
             FROM products WHERE status = 'active' GROUP BY price_status ORDER BY price_status`),
    query(`SELECT status, count(*)::int AS count FROM rfqs GROUP BY status ORDER BY count(*) DESC`),
    query(`SELECT status, count(*)::int AS count FROM tenders GROUP BY status ORDER BY count(*) DESC`),
    query(`SELECT entity_kind AS kind, count(*)::int AS count
             FROM marketplace_entities WHERE status = 'active' GROUP BY entity_kind ORDER BY entity_kind`),
    query(`SELECT c.id, c.title, count(p.id)::int AS product_count
             FROM categories c
             LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
            WHERE c.active = true AND c.parent_id IS NULL AND c.kind = 'material'
            GROUP BY c.id, c.title ORDER BY count(p.id) DESC, c.title LIMIT 10`),
    query(`SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
                  u.name AS actor_name
             FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
            ORDER BY a.created_at DESC LIMIT 12`)
  ]);
  const counts = countsRows[0] || {};
  return sendJson(res, 200, {
    ok: true,
    data: {
      counts,
      prices: priceRows,
      rfqs: rfqRows,
      tenders: tenderRows,
      entities: entityRows,
      topCategories: categoryRows.map((item) => ({
        id: String(item.id).replace(/^material:/, ""),
        title: item.title,
        productCount: item.product_count
      })),
      recentActivity: auditRows,
      integrations: {
        database: true,
        blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
        emailWebhook: Boolean(process.env.EMAIL_WEBHOOK_URL),
        whatsappWebhook: Boolean(process.env.WHATSAPP_WEBHOOK_URL)
      },
      generatedAt: new Date().toISOString()
    }
  });
});
