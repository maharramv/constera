import { requireRole } from "./_lib/auth.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { categoryPublicId, categoryStorageId, oneOf, slugify, text } from "./_lib/validation.js";

const kinds = ["material", "service", "package", "rental"];

const mapCategory = (row) => ({
  id: categoryPublicId(row.id),
  parentId: row.parent_id ? categoryPublicId(row.parent_id) : null,
  kind: row.kind,
  title: row.title,
  slug: row.slug,
  subtitle: row.subtitle || "",
  group: row.group_name,
  sortOrder: Number(row.sort_order || 0),
  active: Boolean(row.active),
  childCount: Number(row.child_count || 0),
  itemCount: Number(row.item_count || 0),
  updatedAt: row.updated_at
});

const categorySelect = `
  SELECT c.id, c.parent_id, c.kind, c.title, c.slug, c.subtitle, c.group_name,
         c.sort_order, c.active, c.updated_at,
         count(DISTINCT child.id)::int AS child_count,
         (count(DISTINCT p.id) + count(DISTINCT e.id))::int AS item_count
    FROM categories c
    LEFT JOIN categories child ON child.parent_id = c.id AND child.active = true
    LEFT JOIN products p ON p.category_id = c.id AND p.status <> 'archived'
    LEFT JOIN marketplace_entities e ON e.category_id = c.id AND e.status <> 'archived'
`;

const loadCategory = async (id) => {
  const rows = await query(
    `${categorySelect} WHERE c.id = $1 GROUP BY c.id LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

const normalizeCategory = async (body, existing = null) => {
  const kind = oneOf(body.kind ?? existing?.kind, kinds, existing?.kind || "material", "Kateqoriya tipi");
  const title = text(body.title ?? existing?.title, { field: "Kateqoriya adı", required: true, max: 200 });
  const parentPublicId = text(body.parentId ?? (existing?.parent_id ? categoryPublicId(existing.parent_id) : ""), { max: 200 });
  const parentId = parentPublicId ? categoryStorageId(kind, parentPublicId) : null;
  if (parentId) {
    const parent = await loadCategory(parentId);
    if (!parent || !parent.active || parent.kind !== kind || parent.parent_id) {
      throw new ApiError(400, "invalid_parent_category", "Ana kateqoriya tapılmadı və ya uyğun deyil.");
    }
  }
  const suppliedId = text(body.id, { max: 220 });
  const id = existing?.id || (suppliedId
    ? categoryStorageId(kind, suppliedId)
    : parentId
      ? `${parentId}--${slugify(title)}`.slice(0, 220)
      : categoryStorageId(kind, slugify(title)));
  const baseSlug = slugify(body.slug || title);
  return {
    id,
    parentId,
    kind,
    title,
    slug: parentId ? `${slugify(categoryPublicId(parentId))}-${baseSlug}`.slice(0, 220) : baseSlug,
    subtitle: text(body.subtitle ?? existing?.subtitle, { max: 500 }),
    groupName: text(body.group ?? existing?.group_name, { max: 160 }) || "Ümumi",
    sortOrder: Math.max(0, Math.min(Number.parseInt(body.sortOrder ?? existing?.sort_order ?? 0, 10) || 0, 100_000)),
    active: body.active === undefined ? existing?.active !== false : Boolean(body.active)
  };
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, ["super_admin", "admin"]);
  if (req.method === "GET") {
    const kind = text(req.query.kind, { max: 40 });
    const includeArchived = String(req.query.includeArchived || "") === "true";
    const values = [];
    const where = [];
    if (kind) {
      values.push(oneOf(kind, kinds, "material", "Kateqoriya tipi"));
      where.push(`c.kind = $${values.length}`);
    }
    if (!includeArchived) where.push("c.active = true");
    const rows = await query(
      `${categorySelect} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       GROUP BY c.id ORDER BY c.kind, c.parent_id NULLS FIRST, c.sort_order, c.title`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows.map(mapCategory) });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const body = await readJson(req, 40_000);

  if (req.method === "DELETE") {
    const kind = oneOf(body.kind, kinds, "material", "Kateqoriya tipi");
    const id = categoryStorageId(kind, text(body.id || req.query.id, { field: "Kateqoriya ID-si", required: true, max: 220 }));
    const rows = await query(
      `UPDATE categories SET active = false, updated_at = now()
        WHERE id = $1 OR parent_id = $1 RETURNING id`,
      [id]
    );
    if (!rows.length) throw new ApiError(404, "category_not_found", "Kateqoriya tapılmadı.");
    await recordAudit({ actorId: user.id, action: "archive", entityType: "category", entityId: id, details: { affected: rows.length } });
    return sendJson(res, 200, { ok: true, data: { id: categoryPublicId(id), affected: rows.length } });
  }

  let existing = null;
  if (req.method === "PATCH") {
    const kind = oneOf(body.kind, kinds, "material", "Kateqoriya tipi");
    const id = categoryStorageId(kind, text(body.id || req.query.id, { field: "Kateqoriya ID-si", required: true, max: 220 }));
    existing = await loadCategory(id);
    if (!existing) throw new ApiError(404, "category_not_found", "Kateqoriya tapılmadı.");
  }
  const item = await normalizeCategory(body, existing);
  try {
    const rows = await query(
      `INSERT INTO categories (id, parent_id, kind, title, slug, subtitle, group_name, sort_order, active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (id) DO UPDATE SET
         parent_id = EXCLUDED.parent_id, title = EXCLUDED.title, slug = EXCLUDED.slug,
         subtitle = EXCLUDED.subtitle, group_name = EXCLUDED.group_name,
         sort_order = EXCLUDED.sort_order, active = EXCLUDED.active, updated_at = now()
       RETURNING id`,
      [item.id, item.parentId, item.kind, item.title, item.slug, item.subtitle || null, item.groupName, item.sortOrder, item.active]
    );
    await recordAudit({
      actorId: user.id,
      action: req.method === "POST" ? "create" : "update",
      entityType: "category",
      entityId: item.id,
      details: { kind: item.kind, parentId: item.parentId }
    });
    return sendJson(res, req.method === "POST" ? 201 : 200, { ok: true, data: mapCategory(await loadCategory(rows[0].id)) });
  } catch (error) {
    if (error?.code === "23505") throw new ApiError(409, "duplicate_category", "Bu ID və ya URL adı ilə kateqoriya artıq mövcuddur.");
    throw error;
  }
});
