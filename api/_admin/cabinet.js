import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { categoryPublicId, entityId, oneOf, parsePriceAmount, text } from "../_lib/validation.js";

const projectStatuses = ["planning", "estimating", "procurement", "active", "completed", "archived"];
const projectTypes = ["apartment", "villa", "office", "commercial", "industrial", "landscape", "other"];
const estimateWorkflowStatuses = ["draft", "review_pending", "approved", "rejected"];

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
  rfqId: row.rfq_id || null,
  offerId: row.offer_id || null,
  tenderId: row.tender_id || null,
  tenderBidId: row.tender_bid_id || null,
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
  contactName: row.contact_name || "",
  email: row.email || "",
  phone: row.phone || "",
  city: row.city || "",
  address: row.address || "",
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
                'id', i.id, 'productId', i.product_id, 'supplierId', i.supplier_id,
                'sku', i.sku, 'title', i.title,
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
                  'status', o.status,
                  'orderId', converted_order.id,
                  'orderNumber', converted_order.order_number,
                  'orderStatus', converted_order.status,
                  'createdAt', o.created_at
                ) ORDER BY o.created_at DESC)
                FROM offers o
                LEFT JOIN suppliers s ON s.id = o.supplier_id
                LEFT JOIN orders converted_order ON converted_order.offer_id = o.id
                WHERE o.rfq_id = r.id
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
      workflowStatus: row.workflow_status || "draft",
      sourceType: row.source_type || "",
      sourceFileName: row.source_file_name || "",
      aiRunId: row.ai_run_id || null,
      rfqId: row.rfq_id || null,
      version: Number(row.version || 1),
      approvedAt: row.approved_at || null,
      convertedAt: row.converted_at || null,
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
    const id = entityId(body.id || payload.id, "estimate");
    const title = text(body.title || payload.projectLabel, { field: "Smeta adı", required: true, max: 240 });
    const aiRunId = text(body.aiRunId || payload.aiRunId, { max: 160 }) || null;
    const sourceType = text(body.sourceType || payload.sourceType || "calculator", { max: 80 }) || "calculator";
    const sourceFileName = text(body.sourceFileName || payload.sourceFileName, { max: 240 }) || null;
    const inferredStatus = aiRunId
      ? payload.aiApprovalStatus === "approved"
        ? "approved"
        : payload.aiApprovalStatus === "rejected"
          ? "rejected"
          : "review_pending"
      : "draft";
    const workflowStatus = oneOf(
      body.workflowStatus || payload.workflowStatus,
      estimateWorkflowStatuses,
      inferredStatus,
      "Smeta iş axını"
    );
    if (aiRunId) {
      const aiRows = await query(
        `SELECT id, feature, status, approval_status
           FROM ai_runs
          WHERE id = $1 AND user_id = $2 AND expires_at > now()
          LIMIT 1`,
        [aiRunId, user.id]
      );
      const aiRun = aiRows[0];
      if (!aiRun) throw new ApiError(404, "estimate_ai_run_not_found", "Smetaya bağlı AI nəticəsi tapılmadı və ya istifadə müddəti bitib.");
      if (!["estimate_review", "estimate_document"].includes(aiRun.feature)) {
        throw new ApiError(409, "estimate_ai_feature_mismatch", "Bu AI nəticəsi smeta analizinə aid deyil.");
      }
      if (aiRun.status !== "completed") {
        throw new ApiError(409, "estimate_ai_run_incomplete", "Smetaya bağlı AI analizi hələ tamamlanmayıb.");
      }
      if (workflowStatus === "approved" && aiRun.approval_status !== "approved") {
        throw new ApiError(409, "estimate_ai_not_approved", "AI smetası insan tərəfindən təsdiqlənməyib.");
      }
      if (workflowStatus === "rejected" && aiRun.approval_status !== "rejected") {
        throw new ApiError(409, "estimate_ai_not_rejected", "AI smetası üçün rədd qərarı qeydə alınmayıb.");
      }
    } else if (["review_pending", "rejected"].includes(workflowStatus)) {
      throw new ApiError(400, "estimate_ai_run_required", "Bu smeta vəziyyəti üçün AI nəticəsinin audit nömrəsi tələb olunur.");
    }
    const storedPayload = {
      ...payload,
      id,
      workflowStatus,
      sourceType,
      sourceFileName: sourceFileName || "",
      aiRunId: aiRunId || ""
    };
    const encoded = JSON.stringify(storedPayload);
    if (Buffer.byteLength(encoded, "utf8") > 100_000) throw new ApiError(413, "estimate_too_large", "Smeta məlumatı maksimum 100 KB ola bilər.");
    const rows = await query(
      `INSERT INTO customer_estimates (
         id, customer_id, title, payload, workflow_status, source_type,
         source_file_name, ai_run_id, approved_at, updated_at
       ) VALUES (
         $1, $2, $3, $4::jsonb, $5, $6, $7, $8,
         CASE WHEN $5 = 'approved' THEN now() ELSE NULL END, now()
       )
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         payload = EXCLUDED.payload,
         workflow_status = CASE
           WHEN customer_estimates.workflow_status = 'converted' THEN 'converted'
           ELSE EXCLUDED.workflow_status
         END,
         source_type = EXCLUDED.source_type,
         source_file_name = EXCLUDED.source_file_name,
         ai_run_id = EXCLUDED.ai_run_id,
         approved_at = CASE
           WHEN customer_estimates.workflow_status = 'converted' THEN customer_estimates.approved_at
           WHEN EXCLUDED.workflow_status = 'approved' THEN coalesce(customer_estimates.approved_at, now())
           ELSE NULL
         END,
         version = customer_estimates.version + 1,
         updated_at = now()
       WHERE customer_estimates.customer_id = EXCLUDED.customer_id
       RETURNING id, workflow_status, version, rfq_id`,
      [id, user.id, title, encoded, workflowStatus, sourceType, sourceFileName, aiRunId]
    );
    if (!rows[0]) throw new ApiError(403, "estimate_forbidden", "Bu smetanı dəyişmək icazəsi yoxdur.");
    await recordAudit({
      actorId: user.id,
      action: "upsert",
      entityType: "customer_estimate",
      entityId: id,
      details: { workflowStatus: rows[0].workflow_status, version: Number(rows[0].version), aiRunId, sourceType }
    });
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
