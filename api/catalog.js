import { query } from "./_lib/db.js";
import { assertMethod, sendJson, withApiErrors } from "./_lib/http.js";
import { categoryPublicId, categoryStorageId, parseLimit, text } from "./_lib/validation.js";

const mapProduct = (row) => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  brand: row.brand,
  category: categoryPublicId(row.category_id),
  subcategory: row.subcategory,
  package: row.package_text || "Sorğu ilə",
  origin: row.origin || "Azərbaycan/İdxal",
  supplier: row.supplier_name || "Təchizatçı",
  price: row.price_text,
  priceAmount: row.price_amount === null ? null : Number(row.price_amount),
  priceCurrency: row.price_currency,
  priceNote: row.price_note || "",
  priceStatus: row.price_status,
  availability: row.availability,
  stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity),
  minimumOrder: row.minimum_order === null ? null : Number(row.minimum_order),
  priceVerifiedAt: row.price_verified_at,
  imageUrl: row.image_url || "",
  sourceUrl: row.source_url || "",
  sourceLabel: row.source_label || "",
  specs: row.specs || [],
  updatedAt: row.updated_at
});

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const limit = parseLimit(req.query.limit, 200, 1_000);
  const queryText = text(req.query.q, { max: 120 });
  const category = text(req.query.category, { max: 160 });
  const values = [];
  const where = ["p.status = 'active'"];
  if (queryText) {
    values.push(`%${queryText}%`);
    where.push(`(p.name ILIKE $${values.length} OR p.sku ILIKE $${values.length} OR p.brand ILIKE $${values.length} OR p.subcategory ILIKE $${values.length})`);
  }
  if (category) {
    values.push(categoryStorageId("material", category));
    where.push(`p.category_id = $${values.length}`);
  }
  values.push(limit);

  const [productRows, categoryRows, supplierRows, entityRows] = await Promise.all([
    query(
      `SELECT p.* FROM products p WHERE ${where.join(" AND ")} ORDER BY p.updated_at DESC, p.name ASC LIMIT $${values.length}`,
      values
    ),
    query("SELECT id, parent_id, kind, title, slug, subtitle, group_name, sort_order FROM categories WHERE active = true ORDER BY sort_order, title"),
    query("SELECT id, name, supplier_type, focus, website, status, region, contact, rating, response_time FROM suppliers WHERE status <> 'Arxiv' ORDER BY name"),
    query("SELECT id, entity_kind, category_id, subcategory, title, unit, price_text, extra_data, updated_at FROM marketplace_entities WHERE status = 'active' ORDER BY title")
  ]);

  const parentCategories = categoryRows.filter((item) => !item.parent_id).map((parent) => ({
    id: categoryPublicId(parent.id),
    kind: parent.kind,
    title: parent.title,
    subtitle: parent.subtitle || "",
    group: parent.group_name,
    subcategories: categoryRows.filter((item) => item.parent_id === parent.id).map((item) => item.title)
  }));

  return sendJson(res, 200, {
    ok: true,
    data: {
      products: productRows.map(mapProduct),
      categories: parentCategories,
      suppliers: supplierRows.map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        type: supplier.supplier_type,
        focus: supplier.focus || "",
        website: supplier.website || "",
        status: supplier.status,
        region: supplier.region,
        contact: supplier.contact || "",
        rating: supplier.rating || "Yeni",
        responseTime: supplier.response_time || "Sorğu əsasında"
      })),
      services: entityRows.filter((item) => item.entity_kind === "service").map((item) => item.extra_data),
      packages: entityRows.filter((item) => item.entity_kind === "package").map((item) => item.extra_data),
      rentals: entityRows.filter((item) => item.entity_kind === "rental").map((item) => item.extra_data)
    },
    meta: { limit, productCount: productRows.length, generatedAt: new Date().toISOString() }
  }, { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" });
});
