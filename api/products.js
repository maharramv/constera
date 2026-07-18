import { query, recordAudit } from "./_lib/db.js";
import { requireRole } from "./_lib/auth.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { entityId, oneOf, parseLimit, parsePriceAmount, safeMediaUrl, safeUrl, slugify, stringList, text } from "./_lib/validation.js";

const productFields = `id, sku, name, slug, brand, category_id, subcategory, package_text, origin,
  supplier_name, price_amount, price_currency, price_text, price_note, price_status, availability,
  image_url, source_url, source_label, specs, status, created_at, updated_at`;

const mapProduct = (row) => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  slug: row.slug,
  brand: row.brand,
  category: row.category_id,
  subcategory: row.subcategory,
  package: row.package_text || "",
  origin: row.origin || "",
  supplier: row.supplier_name || "",
  priceAmount: row.price_amount === null ? null : Number(row.price_amount),
  priceCurrency: row.price_currency,
  price: row.price_text,
  priceNote: row.price_note || "",
  priceStatus: row.price_status,
  availability: row.availability,
  imageUrl: row.image_url || "",
  sourceUrl: row.source_url || "",
  sourceLabel: row.source_label || "",
  specs: row.specs || [],
  status: row.status,
  updatedAt: row.updated_at
});

const normalizeProduct = (body) => {
  const sourceUrl = safeUrl(body.sourceUrl, "Mənbə URL-i");
  let priceStatus = oneOf(body.priceStatus, ["confirmed", "request", "expired"], "request", "Qiymət statusu");
  let priceAmount = parsePriceAmount(body.priceAmount ?? body.price);
  let priceText = text(body.price, { field: "Qiymət", max: 120 }) || "Sorğu əsasında";
  if (priceStatus === "confirmed" && (!sourceUrl || priceAmount === null)) {
    priceStatus = "request";
    priceAmount = null;
    priceText = "Sorğu əsasında";
  }

  const name = text(body.name, { field: "Məhsul adı", required: true, max: 240 });
  return {
    id: entityId(body.id, "product"),
    sku: text(body.sku, { field: "SKU", required: true, max: 120 }),
    name,
    slug: slugify(body.slug || name),
    brand: text(body.brand, { field: "Brend", max: 160 }) || "Brendsiz",
    category: text(body.category, { field: "Kateqoriya", required: true, max: 160 }),
    subcategory: text(body.subcategory, { field: "Subkateqoriya", required: true, max: 200 }),
    packageText: text(body.package, { field: "Qablaşdırma", max: 160 }),
    origin: text(body.origin, { field: "Mənşə", max: 160 }),
    supplierName: text(body.supplier, { field: "Təchizatçı", max: 200 }),
    priceAmount,
    priceCurrency: oneOf(body.priceCurrency, ["AZN", "USD", "EUR"], "AZN", "Valyuta"),
    priceText,
    priceNote: text(body.priceNote, { field: "Qiymət qeydi", max: 500 }),
    priceStatus,
    availability: text(body.availability, { field: "Mövcudluq", max: 160 }) || "Stok sorğu ilə",
    imageUrl: safeMediaUrl(body.imageUrl),
    sourceUrl,
    sourceLabel: text(body.sourceLabel, { field: "Mənbə adı", max: 160 }),
    specs: stringList(body.specs),
    status: oneOf(body.status, ["active", "draft", "archived"], "active", "Məhsul statusu")
  };
};

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const limit = parseLimit(req.query.limit, 100, 1_000);
    const id = text(req.query.id, { max: 160 });
    const values = [];
    const where = [];
    if (id) {
      values.push(id);
      where.push(`id = $${values.length}`);
    } else {
      where.push("status = 'active'");
    }
    values.push(limit);
    const rows = await query(`SELECT ${productFields} FROM products WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT $${values.length}`, values);
    if (id && !rows[0]) throw new ApiError(404, "product_not_found", "Məhsul tapılmadı.");
    return sendJson(res, 200, { ok: true, data: id ? mapProduct(rows[0]) : rows.map(mapProduct) });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const user = await requireRole(req, ["super_admin", "admin"]);
  const body = await readJson(req, 80_000);

  if (req.method === "DELETE") {
    const id = text(body.id || req.query.id, { field: "Məhsul ID-si", required: true, max: 160 });
    const rows = await query("UPDATE products SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) throw new ApiError(404, "product_not_found", "Məhsul tapılmadı.");
    await recordAudit({ actorId: user.id, action: "archive", entityType: "product", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, status: "archived" } });
  }

  let source = body;
  if (req.method === "PATCH") {
    const id = text(body.id || req.query.id, { field: "Məhsul ID-si", required: true, max: 160 });
    const existing = await query(`SELECT ${productFields} FROM products WHERE id = $1 LIMIT 1`, [id]);
    if (!existing[0]) throw new ApiError(404, "product_not_found", "Məhsul tapılmadı.");
    source = { ...mapProduct(existing[0]), ...body, id };
  }
  const item = normalizeProduct(source);

  try {
    const rows = await query(
      `INSERT INTO products (
         id, sku, name, slug, brand, category_id, subcategory, package_text, origin, supplier_name,
         price_amount, price_currency, price_text, price_note, price_status, availability,
         image_url, source_url, source_label, specs, status, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, now()
       )
       ON CONFLICT (id) DO UPDATE SET
         sku = EXCLUDED.sku, name = EXCLUDED.name, slug = EXCLUDED.slug, brand = EXCLUDED.brand,
         category_id = EXCLUDED.category_id, subcategory = EXCLUDED.subcategory,
         package_text = EXCLUDED.package_text, origin = EXCLUDED.origin, supplier_name = EXCLUDED.supplier_name,
         price_amount = EXCLUDED.price_amount, price_currency = EXCLUDED.price_currency,
         price_text = EXCLUDED.price_text, price_note = EXCLUDED.price_note, price_status = EXCLUDED.price_status,
         availability = EXCLUDED.availability, image_url = EXCLUDED.image_url, source_url = EXCLUDED.source_url,
         source_label = EXCLUDED.source_label, specs = EXCLUDED.specs, status = EXCLUDED.status, updated_at = now()
       RETURNING ${productFields}`,
      [
        item.id, item.sku, item.name, item.slug, item.brand, item.category, item.subcategory,
        item.packageText || null, item.origin || null, item.supplierName || null, item.priceAmount,
        item.priceCurrency, item.priceText, item.priceNote || null, item.priceStatus, item.availability,
        item.imageUrl || null, item.sourceUrl || null, item.sourceLabel || null, JSON.stringify(item.specs), item.status
      ]
    );
    if (item.priceStatus === "confirmed") {
      await query(
        `INSERT INTO price_history (product_id, price_amount, price_currency, price_text, source_url)
         VALUES ($1, $2, $3, $4, $5)`,
        [item.id, item.priceAmount, item.priceCurrency, item.priceText, item.sourceUrl]
      );
    }
    await recordAudit({ actorId: user.id, action: req.method === "POST" ? "create" : "update", entityType: "product", entityId: item.id, details: { sku: item.sku } });
    return sendJson(res, req.method === "POST" ? 201 : 200, { ok: true, data: mapProduct(rows[0]) });
  } catch (error) {
    if (error?.code === "23505") throw new ApiError(409, "duplicate_product", "Bu ID və ya SKU ilə məhsul artıq mövcuddur.");
    if (error?.code === "23503") throw new ApiError(400, "category_not_found", "Seçilmiş kateqoriya bazada tapılmadı.");
    throw error;
  }
});
