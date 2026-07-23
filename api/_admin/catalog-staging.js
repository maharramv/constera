import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import {
  ApiError,
  assertMethod,
  assertSameOrigin,
  readJson,
  sendJson,
  withApiErrors
} from "../_lib/http.js";
import {
  categoryStorageId,
  oneOf,
  parseLimit,
  text
} from "../_lib/validation.js";
import { upsertEntities, upsertProducts } from "../sync.js";

const reviewStatuses = ["pending", "approved", "rejected", "merged"];
const itemKinds = ["product", "service", "package", "rental"];
const categoryKind = (kind) => kind === "product" ? "material" : kind;

const mapItem = (row) => ({
  id: row.id,
  runId: row.run_id,
  kind: row.item_kind,
  sourceId: row.source_id,
  sourceUrl: row.source_url,
  reviewStatus: row.review_status,
  existingEntityId: row.existing_entity_id || "",
  validationErrors: row.validation_errors || [],
  verifiedAt: row.verified_at,
  createdAt: row.created_at,
  payload: row.payload || {}
});

const existingProductForSku = async (sku) => {
  if (!sku) return null;
  const rows = await query(
    "SELECT id, name, source_url FROM products WHERE sku = $1 AND status <> 'archived' LIMIT 1",
    [sku]
  );
  return rows[0] || null;
};

const specifications = (payload) => {
  const entries = payload.specifications && typeof payload.specifications === "object"
    ? Object.entries(payload.specifications)
    : [];
  const rows = entries.slice(0, 30).map(([key, value]) => `${key}: ${value}`);
  if (payload.description) rows.push(String(payload.description).slice(0, 1_000));
  return rows;
};

const productForPublication = (payload, categoryId, subcategory) => {
  const sku = text(payload.sku, { field: "SKU", required: true, max: 120 });
  return {
    id: text(payload.id, { max: 160 }),
    sku,
    name: text(payload.name, { field: "Məhsul adı", required: true, max: 240 }),
    slug: text(payload.slug, { max: 220 }),
    brand: text(payload.brand, { max: 160 }) || "Brendsiz",
    category: categoryId,
    subcategory,
    package: text(payload.unit, { max: 160 }),
    origin: text(payload.specifications?.["İstehsalçı ölkə"], { max: 160 }),
    supplier: text(payload.provider || payload.source_label, { max: 200 }),
    price: text(payload.price_text, { max: 120 }) || "Sorğu əsasında",
    priceAmount: payload.price,
    priceCurrency: "AZN",
    priceStatus: payload.price_status === "confirmed" ? "confirmed" : "request",
    priceVerifiedAt: payload.verified_at,
    availability: text(payload.stock_status, { max: 160 }) || "Stok sorğu ilə",
    stockQuantity: payload.stock_quantity,
    imageUrl: Array.isArray(payload.image_urls) ? payload.image_urls[0] : "",
    sourceUrl: text(payload.source_url, { max: 2_000 }),
    sourceLabel: text(payload.source_label, { max: 160 }),
    specs: specifications(payload)
  };
};

const entityForPublication = (payload, categoryId, subcategory) => ({
  id: text(payload.id, { max: 160 }),
  title: text(payload.name, { field: "Qeyd adı", required: true, max: 260 }),
  name: text(payload.name, { field: "Qeyd adı", required: true, max: 260 }),
  category: categoryId,
  subcategory,
  unit: text(payload.unit, { max: 160 }),
  price: text(payload.price_text, { max: 160 }) || "Qiymət sorğu əsasında",
  team: text(payload.provider, { max: 160 }),
  idealFor: text(payload.description, { max: 300 }),
  specs: specifications(payload),
  imageUrl: Array.isArray(payload.image_urls) ? payload.image_urls[0] : "",
  sourceUrl: text(payload.source_url, { max: 2_000 }),
  sourceLabel: text(payload.source_label, { max: 160 }),
  city: text(payload.city, { max: 120 }),
  priceAmount: payload.price,
  priceStatus: payload.price_status,
  verifiedAt: payload.verified_at
});

const updateRunReviewState = async (runId) => {
  await query(
    `UPDATE catalog_import_runs r
        SET status = 'reviewed', updated_at = now()
      WHERE r.id = $1
        AND NOT EXISTS (
          SELECT 1 FROM catalog_import_items i
           WHERE i.run_id = r.id AND i.review_status = 'pending'
        )`,
    [runId]
  );
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, ["super_admin", "admin"]);
  if (req.method === "GET") {
    const status = oneOf(req.query.status, reviewStatuses, "pending", "Yoxlama statusu");
    const kindValue = text(req.query.kind, { max: 20 });
    const kind = kindValue ? oneOf(kindValue, itemKinds, "product", "Qeyd növü") : "";
    const limit = parseLimit(req.query.limit, 100, 500);
    const values = [status];
    const where = ["review_status = $1"];
    if (kind) {
      values.push(kind);
      where.push(`item_kind = $${values.length}`);
    }
    values.push(limit);
    const rows = await query(
      `SELECT id, run_id, item_kind, source_id, source_url, payload,
              review_status,
              COALESCE(
                existing_entity_id,
                CASE
                  WHEN item_kind = 'product' THEN (
                    SELECT p.id FROM products p
                     WHERE p.sku = payload->>'sku' AND p.status <> 'archived'
                     LIMIT 1
                  )
                  ELSE NULL
                END
              ) AS existing_entity_id,
              validation_errors,
              verified_at, created_at
         FROM catalog_import_items
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC, id
        LIMIT $${values.length}`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows.map(mapItem) });
  }

  assertMethod(req, ["PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 30_000);
  const id = text(body.id, { field: "Staging qeyd ID-si", required: true, max: 180 });
  const action = oneOf(body.action, ["approve", "reject"], "approve", "Yoxlama əməliyyatı");
  const rows = await query(
    `SELECT id, run_id, item_kind, source_id, source_url, payload,
            review_status, existing_entity_id, validation_errors,
            verified_at, created_at
       FROM catalog_import_items
      WHERE id = $1 LIMIT 1`,
    [id]
  );
  const record = rows[0];
  if (!record) throw new ApiError(404, "staging_item_not_found", "Yoxlama sahəsində qeyd tapılmadı.");
  if (record.review_status !== "pending") {
    throw new ApiError(409, "staging_item_already_reviewed", "Bu qeyd artıq yoxlanılıb.");
  }

  if (action === "reject") {
    const updated = await query(
      `UPDATE catalog_import_items
          SET review_status = 'rejected', updated_at = now()
        WHERE id = $1 AND review_status = 'pending'
        RETURNING id`,
      [id]
    );
    if (!updated.length) throw new ApiError(409, "staging_item_already_reviewed", "Bu qeyd artıq yoxlanılıb.");
    await updateRunReviewState(record.run_id);
    await recordAudit({
      actorId: user.id,
      action: "catalog_review",
      entityType: "catalog_staging",
      entityId: id,
      details: { decision: "rejected", sourceId: record.source_id }
    });
    return sendJson(res, 200, { ok: true, data: { id, reviewStatus: "rejected" } });
  }

  const kind = categoryKind(record.item_kind);
  const categoryId = text(body.categoryId, { field: "Kateqoriya", required: true, max: 200 });
  const storageCategoryId = categoryStorageId(kind, categoryId);
  const categoryRows = await query(
    `SELECT id FROM categories
      WHERE id = $1 AND kind = $2 AND parent_id IS NULL AND active = true
      LIMIT 1`,
    [storageCategoryId, kind]
  );
  if (!categoryRows.length) {
    throw new ApiError(400, "invalid_publication_category", "Seçilmiş aktiv əsas kateqoriya tapılmadı.");
  }
  const payload = record.payload || {};
  const subcategory = text(body.subcategory || payload.subcategory, {
    field: "Subkateqoriya",
    required: true,
    max: 200
  });

  let publishedId;
  let reviewStatus = "approved";
  if (record.item_kind === "product") {
    const product = productForPublication(payload, categoryId, subcategory);
    const existing = await existingProductForSku(product.sku);
    if (existing && body.allowExistingUpdate !== true) {
      throw new ApiError(
        409,
        "existing_product_requires_confirmation",
        `"${existing.name}" məhsulu bu SKU ilə artıq mövcuddur. Yeniləməni ayrıca təsdiqlə.`,
        { existingId: existing.id }
      );
    }
    await upsertProducts([product]);
    const published = await query("SELECT id FROM products WHERE sku = $1 LIMIT 1", [product.sku]);
    publishedId = published[0]?.id || product.id;
    if (existing) reviewStatus = "merged";
  } else {
    const entity = entityForPublication(payload, categoryId, subcategory);
    await upsertEntities(record.item_kind, [entity]);
    publishedId = entity.id;
  }

  const updated = await query(
    `UPDATE catalog_import_items
        SET review_status = $3, existing_entity_id = $2, updated_at = now()
      WHERE id = $1 AND review_status = 'pending'
      RETURNING id`,
    [id, publishedId, reviewStatus]
  );
  if (!updated.length) throw new ApiError(409, "staging_item_already_reviewed", "Bu qeyd artıq yoxlanılıb.");
  await updateRunReviewState(record.run_id);
  await recordAudit({
    actorId: user.id,
    action: "catalog_review",
    entityType: record.item_kind,
    entityId: publishedId,
    details: {
      decision: "approved",
      stagingId: id,
      sourceId: record.source_id,
      categoryId,
      subcategory
    }
  });
  return sendJson(res, 200, {
    ok: true,
    data: { id, reviewStatus, publishedId }
  });
});
