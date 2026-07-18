import { requireRole } from "./_lib/auth.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { categoryPublicId, categoryStorageId, entityId, oneOf, parseLimit, stableItemSlug, stringList, text } from "./_lib/validation.js";

const kinds = ["service", "package", "rental"];

const mapEntity = (row) => ({
  ...(row.extra_data || {}),
  id: row.id,
  entityType: row.entity_kind,
  title: row.title,
  name: row.title,
  category: row.category_id ? categoryPublicId(row.category_id) : "",
  subcategory: row.subcategory,
  unit: row.unit || "",
  price: row.price_text,
  status: row.status,
  updatedAt: row.updated_at
});

const normalizeEntity = (body, existing = null) => {
  const kind = oneOf(body.entityType ?? existing?.entity_kind, kinds, existing?.entity_kind || "service", "Bölmə");
  const title = text(body.title || body.name || existing?.title, { field: "Ad", required: true, max: 260 });
  const id = existing?.id || entityId(body.id, kind);
  const category = text(body.category ?? (existing?.category_id ? categoryPublicId(existing.category_id) : ""), { max: 160 });
  const base = existing?.extra_data || {};
  const extraData = {
    ...base,
    id,
    title,
    name: title,
    type: text(body.itemType ?? body.type ?? base.type, { max: 160 }),
    category,
    subcategory: text(body.subcategory ?? existing?.subcategory, { max: 200 }) || "Ümumi",
    unit: text(body.unit ?? existing?.unit, { max: 160 }),
    price: text(body.price ?? existing?.price_text, { max: 160 }) || "Sorğu əsasında",
    leadTime: text(body.leadTime ?? body.time ?? base.leadTime, { max: 160 }),
    timeline: text(body.timeline ?? body.time ?? base.timeline, { max: 160 }),
    delivery: text(body.delivery ?? body.time ?? base.delivery, { max: 160 }),
    team: text(body.team ?? base.team, { max: 160 }),
    operator: text(body.operator ?? body.team ?? base.operator, { max: 160 }),
    capacity: text(body.capacity ?? body.extra ?? base.capacity, { max: 200 }),
    idealFor: text(body.idealFor ?? body.extra ?? base.idealFor, { max: 300 }),
    specs: stringList(body.specs ?? base.specs),
    includes: stringList(body.includes ?? body.specs ?? base.includes),
    deliverables: stringList(body.deliverables ?? base.deliverables)
  };
  return {
    id,
    kind,
    categoryId: category ? categoryStorageId(kind, category) : null,
    subcategory: extraData.subcategory,
    title,
    slug: stableItemSlug(title, id),
    unit: extraData.unit,
    priceText: extraData.price,
    extraData,
    status: oneOf(body.status ?? existing?.status, ["active", "draft", "archived"], existing?.status || "active", "Status")
  };
};

const selectFields = "id, entity_kind, category_id, subcategory, title, slug, unit, price_text, extra_data, status, created_at, updated_at";

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const kind = text(req.query.kind, { max: 40 });
    const limit = parseLimit(req.query.limit, 200, 1_000);
    const values = [];
    const where = ["status = 'active'"];
    if (kind) {
      values.push(oneOf(kind, kinds, "service", "Bölmə"));
      where.push(`entity_kind = $${values.length}`);
    }
    values.push(limit);
    const rows = await query(
      `SELECT ${selectFields} FROM marketplace_entities WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT $${values.length}`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows.map(mapEntity) });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const user = await requireRole(req, ["super_admin", "admin"]);
  const body = await readJson(req, 80_000);

  if (req.method === "DELETE") {
    const id = text(body.id || req.query.id, { field: "Qeyd ID-si", required: true, max: 160 });
    const rows = await query("UPDATE marketplace_entities SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) throw new ApiError(404, "entity_not_found", "Qeyd tapılmadı.");
    await recordAudit({ actorId: user.id, action: "archive", entityType: "marketplace_entity", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, status: "archived" } });
  }

  let existing = null;
  if (req.method === "PATCH") {
    const id = text(body.id || req.query.id, { field: "Qeyd ID-si", required: true, max: 160 });
    const rows = await query(`SELECT ${selectFields} FROM marketplace_entities WHERE id = $1 LIMIT 1`, [id]);
    existing = rows[0];
    if (!existing) throw new ApiError(404, "entity_not_found", "Qeyd tapılmadı.");
  }
  const item = normalizeEntity(body, existing);
  try {
    const rows = await query(
      `INSERT INTO marketplace_entities (
         id, entity_kind, category_id, subcategory, title, slug, unit, price_text, extra_data, status, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now())
       ON CONFLICT (id) DO UPDATE SET
         entity_kind = EXCLUDED.entity_kind, category_id = EXCLUDED.category_id,
         subcategory = EXCLUDED.subcategory, title = EXCLUDED.title, slug = EXCLUDED.slug,
         unit = EXCLUDED.unit, price_text = EXCLUDED.price_text, extra_data = EXCLUDED.extra_data,
         status = EXCLUDED.status, updated_at = now()
       RETURNING ${selectFields}`,
      [
        item.id, item.kind, item.categoryId, item.subcategory, item.title, item.slug,
        item.unit || null, item.priceText, JSON.stringify(item.extraData), item.status
      ]
    );
    await recordAudit({
      actorId: user.id,
      action: req.method === "POST" ? "create" : "update",
      entityType: item.kind,
      entityId: item.id
    });
    return sendJson(res, req.method === "POST" ? 201 : 200, { ok: true, data: mapEntity(rows[0]) });
  } catch (error) {
    if (error?.code === "23503") throw new ApiError(400, "category_not_found", "Seçilmiş kateqoriya bazada tapılmadı.");
    if (error?.code === "23505") throw new ApiError(409, "duplicate_entity", "Bu ID və ya URL adı ilə qeyd artıq mövcuddur.");
    throw error;
  }
});
