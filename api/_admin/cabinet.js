import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { categoryPublicId, entityId, oneOf, parsePriceAmount, text } from "../_lib/validation.js";

const projectStatuses = ["planning", "estimating", "procurement", "active", "completed", "archived"];
const projectTypes = ["apartment", "villa", "office", "commercial", "industrial", "landscape", "other"];

const mapProduct = (row) => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  brand: row.brand,
  category: categoryPublicId(row.category_id),
  subcategory: row.subcategory,
  package: row.package_text || "Sorğu ilə",
  supplier: row.supplier_name || "Təchizatçı",
  price: row.price_text,
  priceAmount: row.price_amount === null ? null : Number(row.price_amount),
  priceCurrency: row.price_currency,
  priceStatus: row.price_status,
  availability: row.availability,
  imageUrl: row.image_url || ""
});

const mapOrder = (row) => ({
  id: row.id,
  orderNumber: Number(row.order_number),
  status: row.status,
  paymentStatus: row.payment_status,
  totalAmount: row.total_amount === null ? null : Number(row.total_amount),
  currency: row.currency,
  hasPendingPrice: Boolean(row.has_pending_price),
  items: row.items || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapRfq = (row) => ({
  id: row.id,
  type: row.rfq_type,
  title: row.title,
  companyName: row.company_name,
  city: row.city || "",
  status: row.status,
  priority: row.priority,
  needDate: row.need_date,
  budget: row.budget || "",
  note: row.note || "",
  items: row.items || [],
  offers: (row.offers || []).map((offer) => ({
    ...offer,
    priceAmount: offer.priceAmount === null ? null : Number(offer.priceAmount)
  })),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapProject = (row) => ({
  id: row.id,
  title: row.title,
  projectType: row.project_type,
  city: row.city || "",
  area: row.area === null ? null : Number(row.area),
  budget: row.budget === null ? null : Number(row.budget),
  currency: row.currency,
  status: row.status,
  note: row.note || "",
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const normalizeProductIds = (value, listType) => {
  if (!Array.isArray(value)) throw new ApiError(400, "validation_error", "Məhsul siyahısı massiv olmalıdır.");
  const limit = listType === "compare" ? 5 : 100;
  const ids = [...new Set(value.map((id) => text(id, { max: 160 })).filter(Boolean))];
  if (ids.length > limit) throw new ApiError(400, "list_limit_exceeded", `${listType === "compare" ? "Müqayisə" : "Seçilmişlər"} siyahısında maksimum ${limit} məhsul ola bilər.`);
  if (ids.some((id) => !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id))) {
    throw new ApiError(400, "validation_error", "Məhsul identifikatorlarından biri düzgün deyil.");
  }
  return ids;
};

const readCabinet = async (user) => {
  const [orders, rfqs, savedRows, projects, estimates, notifications] = await Promise.all([
    query(
      `SELECT o.*,
              COALESCE(json_agg(json_build_object(
                'id', i.id, 'productId', i.product_id, 'sku', i.sku, 'title', i.title,
                'quantity', i.quantity, 'unit', i.unit, 'priceText', i.price_text,
                'lineTotal', i.line_total, 'snapshot', i.snapshot
              ) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
         FROM orders o
         LEFT JOIN order_items i ON i.order_id = o.id
        WHERE o.customer_id = $1
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT 100`,
      [user.id]
    ),
    query(
      `SELECT r.*,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', i.id, 'kind', i.item_kind, 'itemId', i.item_id,
                  'title', i.title, 'quantity', i.quantity_text, 'unit', i.unit, 'specs', i.specs
                ) ORDER BY i.created_at)
                FROM rfq_items i WHERE i.rfq_id = r.id
              ), '[]'::json) AS items,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', o.id, 'supplierId', o.supplier_id, 'supplierName', s.name,
                  'priceAmount', o.price_amount, 'priceText', o.price_text, 'currency', o.currency,
                  'leadTime', o.lead_time, 'delivery', o.delivery, 'warranty', o.warranty,
                  'status', o.status, 'createdAt', o.created_at
                ) ORDER BY o.created_at DESC)
                FROM offers o LEFT JOIN suppliers s ON s.id = o.supplier_id WHERE o.rfq_id = r.id
              ), '[]'::json) AS offers
         FROM rfqs r
        WHERE r.customer_id = $1
        ORDER BY r.created_at DESC
        LIMIT 100`,
      [user.id]
    ),
    query(
      `SELECT sp.list_type, p.*
         FROM saved_products sp
         JOIN products p ON p.id = sp.product_id AND p.status = 'active'
        WHERE sp.user_id = $1
        ORDER BY sp.created_at DESC`,
      [user.id]
    ),
    query("SELECT * FROM customer_projects WHERE customer_id = $1 ORDER BY updated_at DESC LIMIT 100", [user.id]),
    query("SELECT * FROM customer_estimates WHERE customer_id = $1 ORDER BY updated_at DESC LIMIT 50", [user.id]),
    query(
      `SELECT id, subject, body, status, created_at
         FROM notifications
        WHERE user_id = $1 AND status <> 'dead'
        ORDER BY created_at DESC LIMIT 20`,
      [user.id]
    )
  ]);

  return {
    user,
    orders: orders.map(mapOrder),
    rfqs: rfqs.map(mapRfq),
    projects: projects.map(mapProject),
    estimates: estimates.map((row) => ({
      id: row.id,
      title: row.title,
      payload: row.payload || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    saved: {
      favorites: savedRows.filter((row) => row.list_type === "favorite").map(mapProduct),
      compare: savedRows.filter((row) => row.list_type === "compare").map(mapProduct)
    },
    notifications: notifications.map((row) => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      status: row.status,
      createdAt: row.created_at
    }))
  };
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req);

  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, data: await readCabinet(user) });
  }

  assertMethod(req, ["POST", "DELETE"]);
  assertSameOrigin(req);
  const body = await readJson(req, 160_000);
  const action = text(body.action, { field: "Əməliyyat", required: true, max: 40 });

  if (req.method === "DELETE") {
    const id = text(body.id, { field: "Qeyd ID-si", required: true, max: 160 });
    if (action === "delete-project") {
      const rows = await query("DELETE FROM customer_projects WHERE id = $1 AND customer_id = $2 RETURNING id", [id, user.id]);
      if (!rows[0]) throw new ApiError(404, "project_not_found", "Layihə tapılmadı.");
      await recordAudit({ actorId: user.id, action: "delete", entityType: "customer_project", entityId: id });
    } else if (action === "delete-estimate") {
      const rows = await query("DELETE FROM customer_estimates WHERE id = $1 AND customer_id = $2 RETURNING id", [id, user.id]);
      if (!rows[0]) throw new ApiError(404, "estimate_not_found", "Smeta tapılmadı.");
      await recordAudit({ actorId: user.id, action: "delete", entityType: "customer_estimate", entityId: id });
    } else {
      throw new ApiError(400, "invalid_action", "Silinmə əməliyyatı dəstəklənmir.");
    }
    return sendJson(res, 200, { ok: true, data: await readCabinet(user) });
  }

  if (action === "sync-list") {
    const listType = oneOf(body.listType, ["favorite", "compare"], "favorite", "Siyahı tipi");
    const productIds = normalizeProductIds(body.productIds, listType);
    await query(
      `WITH cleared AS (
         DELETE FROM saved_products WHERE user_id = $1 AND list_type = $2
       ), incoming AS (
         SELECT unnest($3::text[]) AS product_id
       )
       INSERT INTO saved_products (user_id, product_id, list_type)
       SELECT $1, p.id, $2 FROM incoming i JOIN products p ON p.id = i.product_id AND p.status = 'active'
       ON CONFLICT DO NOTHING`,
      [user.id, listType, productIds]
    );
    await recordAudit({ actorId: user.id, action: "sync", entityType: "saved_products", details: { listType, count: productIds.length } });
  } else if (action === "save-project") {
    const id = entityId(body.id, "project");
    const title = text(body.title, { field: "Layihə adı", required: true, max: 240 });
    const projectType = oneOf(body.projectType, projectTypes, "other", "Layihə tipi");
    const status = oneOf(body.status, projectStatuses, "planning", "Layihə statusu");
    const rows = await query(
      `INSERT INTO customer_projects (
         id, customer_id, title, project_type, city, area, budget, currency, status, note, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, project_type = EXCLUDED.project_type, city = EXCLUDED.city,
         area = EXCLUDED.area, budget = EXCLUDED.budget, currency = EXCLUDED.currency,
         status = EXCLUDED.status, note = EXCLUDED.note, updated_at = now()
       WHERE customer_projects.customer_id = EXCLUDED.customer_id
       RETURNING id`,
      [
        id, user.id, title, projectType, text(body.city, { max: 160 }) || null,
        parsePriceAmount(body.area), parsePriceAmount(body.budget),
        oneOf(body.currency, ["AZN", "USD", "EUR"], "AZN", "Valyuta"), status,
        text(body.note, { max: 3_000 }) || null
      ]
    );
    if (!rows[0]) throw new ApiError(403, "project_forbidden", "Bu layihəni dəyişmək icazəsi yoxdur.");
    await recordAudit({ actorId: user.id, action: "upsert", entityType: "customer_project", entityId: id, details: { status } });
  } else if (action === "save-estimate") {
    const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {};
    const encoded = JSON.stringify(payload);
    if (Buffer.byteLength(encoded, "utf8") > 100_000) throw new ApiError(413, "estimate_too_large", "Smeta məlumatı maksimum 100 KB ola bilər.");
    const id = entityId(body.id || payload.id, "estimate");
    const title = text(body.title || payload.projectLabel, { field: "Smeta adı", required: true, max: 240 });
    const rows = await query(
      `INSERT INTO customer_estimates (id, customer_id, title, payload, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, payload = EXCLUDED.payload, updated_at = now()
       WHERE customer_estimates.customer_id = EXCLUDED.customer_id
       RETURNING id`,
      [id, user.id, title, encoded]
    );
    if (!rows[0]) throw new ApiError(403, "estimate_forbidden", "Bu smetanı dəyişmək icazəsi yoxdur.");
    await recordAudit({ actorId: user.id, action: "upsert", entityType: "customer_estimate", entityId: id });
  } else if (action === "sync-estimates") {
    const sourceEstimates = Array.isArray(body.estimates) ? body.estimates.slice(0, 20) : [];
    const estimates = sourceEstimates.map((source) => {
      const payload = source?.payload && typeof source.payload === "object" && !Array.isArray(source.payload) ? source.payload : {};
      const encoded = JSON.stringify(payload);
      if (Buffer.byteLength(encoded, "utf8") > 100_000) throw new ApiError(413, "estimate_too_large", "Smeta məlumatı maksimum 100 KB ola bilər.");
      return {
        id: entityId(source.id || payload.id, "estimate"),
        customerId: user.id,
        title: text(source.title || payload.projectLabel, { field: "Smeta adı", required: true, max: 240 }),
        payload
      };
    });
    if (estimates.length) {
      await query(
        `WITH incoming AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id text, "customerId" text, title text, payload jsonb)
         )
         INSERT INTO customer_estimates (id, customer_id, title, payload, updated_at)
         SELECT id, "customerId", title, payload, now() FROM incoming
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, payload = EXCLUDED.payload, updated_at = now()
         WHERE customer_estimates.customer_id = EXCLUDED.customer_id`,
        [JSON.stringify(estimates)]
      );
      await recordAudit({ actorId: user.id, action: "sync", entityType: "customer_estimate", details: { count: estimates.length } });
    }
  } else {
    throw new ApiError(400, "invalid_action", "Kabinet əməliyyatı dəstəklənmir.");
  }

  return sendJson(res, 200, { ok: true, data: await readCabinet(user) });
});
