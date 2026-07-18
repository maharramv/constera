import { query } from "./_lib/db.js";
import { assertMethod, sendJson, withApiErrors } from "./_lib/http.js";
import { categoryPublicId, categoryStorageId, parseLimit, parsePriceAmount, text } from "./_lib/validation.js";

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
  const pageSize = parseLimit(req.query.pageSize || req.query.limit, 200, 1_000);
  const parsedPage = Number.parseInt(String(req.query.page || "1"), 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const offset = (page - 1) * pageSize;
  const queryText = text(req.query.q, { max: 120 });
  const category = text(req.query.category, { max: 160 });
  const group = text(req.query.group, { max: 160 });
  const brand = text(req.query.brand, { max: 160 });
  const subcategory = text(req.query.subcategory, { max: 200 });
  const availability = text(req.query.availability, { max: 160 });
  const priceStatus = text(req.query.priceStatus, { max: 40 });
  const origin = text(req.query.origin, { max: 40 });
  const productsOnly = req.query.scope === "products";
  const minPrice = parsePriceAmount(req.query.minPrice);
  const maxPrice = parsePriceAmount(req.query.maxPrice);
  const sort = ["relevance", "newest", "name", "price_asc", "price_desc"].includes(String(req.query.sort || ""))
    ? String(req.query.sort)
    : queryText ? "relevance" : "newest";
  const values = [];
  const where = ["p.status = 'active'"];
  const searchExpression = `lower(coalesce(p.name, '') || ' ' || coalesce(p.sku, '') || ' ' || coalesce(p.brand, '') || ' ' || coalesce(p.subcategory, ''))`;
  let relevanceIndex = 0;
  if (queryText) {
    values.push(queryText.toLocaleLowerCase("az-AZ"));
    relevanceIndex = values.length;
    values.push(`%${queryText.toLocaleLowerCase("az-AZ")}%`);
    where.push(`(${searchExpression} ILIKE $${values.length} OR similarity(${searchExpression}, $${relevanceIndex}) > 0.2)`);
  }
  if (category) {
    values.push(categoryStorageId("material", category));
    where.push(`p.category_id = $${values.length}`);
  }
  if (group) {
    values.push(group);
    where.push(`EXISTS (
      SELECT 1 FROM categories filtered_category
      WHERE filtered_category.id = p.category_id AND filtered_category.group_name = $${values.length}
    )`);
  }
  if (brand) {
    values.push(brand);
    where.push(`p.brand = $${values.length}`);
  }
  if (subcategory) {
    values.push(subcategory);
    where.push(`p.subcategory = $${values.length}`);
  }
  if (availability) {
    values.push(availability);
    where.push(`p.availability = $${values.length}`);
  }
  if (["confirmed", "request", "expired"].includes(priceStatus)) {
    values.push(priceStatus);
    where.push(`p.price_status = $${values.length}`);
  }
  if (origin === "local") where.push("lower(coalesce(p.origin, '')) LIKE '%azərbaycan%' AND lower(coalesce(p.origin, '')) NOT LIKE '%idxal%'");
  if (origin === "import") where.push("(lower(coalesce(p.origin, '')) LIKE '%idxal%' OR lower(coalesce(p.origin, '')) LIKE '%import%')");
  if (origin === "mixed") where.push("coalesce(p.origin, '') LIKE '%/%' AND lower(coalesce(p.origin, '')) LIKE '%azərbaycan%'");
  if (minPrice !== null) {
    values.push(minPrice);
    where.push(`p.price_amount >= $${values.length}`);
  }
  if (maxPrice !== null) {
    values.push(maxPrice);
    where.push(`p.price_amount <= $${values.length}`);
  }

  const orderBy = sort === "price_asc"
    ? "p.price_amount ASC NULLS LAST, p.name ASC"
    : sort === "price_desc"
      ? "p.price_amount DESC NULLS LAST, p.name ASC"
      : sort === "name"
        ? "p.name ASC"
        : sort === "relevance" && relevanceIndex
          ? `similarity(${searchExpression}, $${relevanceIndex}) DESC, p.name ASC`
          : "p.updated_at DESC, p.name ASC";
  const filteredValues = [...values];
  const productValues = [...values, pageSize, offset];
  const limitIndex = productValues.length - 1;
  const offsetIndex = productValues.length;

  const [productRows, countRows, brandRows, subcategoryRows, availabilityRows, priceRows, categoryFacetRows, categoryRows, supplierRows, entityRows] = await Promise.all([
    query(
      `SELECT p.* FROM products p WHERE ${where.join(" AND ")} ORDER BY ${orderBy} LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      productValues
    ),
    query(`SELECT count(*)::int AS count FROM products p WHERE ${where.join(" AND ")}`, filteredValues),
    productsOnly
      ? Promise.resolve([])
      : query(`SELECT p.brand AS value, count(*)::int AS count FROM products p WHERE ${where.join(" AND ")} GROUP BY p.brand ORDER BY count(*) DESC, p.brand LIMIT 200`, filteredValues),
    productsOnly
      ? Promise.resolve([])
      : query(`SELECT p.subcategory AS value, count(*)::int AS count FROM products p WHERE ${where.join(" AND ")} GROUP BY p.subcategory ORDER BY count(*) DESC, p.subcategory LIMIT 500`, filteredValues),
    productsOnly
      ? Promise.resolve([])
      : query(`SELECT p.availability AS value, count(*)::int AS count FROM products p WHERE ${where.join(" AND ")} GROUP BY p.availability ORDER BY count(*) DESC, p.availability LIMIT 100`, filteredValues),
    productsOnly
      ? Promise.resolve([])
      : query(`SELECT p.price_status AS value, count(*)::int AS count FROM products p WHERE ${where.join(" AND ")} GROUP BY p.price_status ORDER BY p.price_status`, filteredValues),
    productsOnly
      ? Promise.resolve([])
      : query(`SELECT p.category_id AS value, count(*)::int AS count FROM products p WHERE ${where.join(" AND ")} GROUP BY p.category_id ORDER BY count(*) DESC`, filteredValues),
    productsOnly
      ? Promise.resolve([])
      : query("SELECT id, parent_id, kind, title, slug, subtitle, group_name, sort_order FROM categories WHERE active = true ORDER BY sort_order, title"),
    productsOnly
      ? Promise.resolve([])
      : query("SELECT id, name, supplier_type, focus, website, status, region, contact, rating, response_time FROM suppliers WHERE status <> 'Arxiv' ORDER BY name"),
    productsOnly
      ? Promise.resolve([])
      : query("SELECT id, entity_kind, category_id, subcategory, title, unit, price_text, extra_data, updated_at FROM marketplace_entities WHERE status = 'active' ORDER BY title")
  ]);
  const total = Number(countRows[0]?.count || 0);

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
    meta: {
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      total,
      productCount: productRows.length,
      scope: productsOnly ? "products" : "full",
      sort,
      facets: {
        brands: brandRows,
        subcategories: subcategoryRows,
        availability: availabilityRows,
        priceStatuses: priceRows,
        categories: categoryFacetRows.map((item) => ({ ...item, value: categoryPublicId(item.value) }))
      },
      generatedAt: new Date().toISOString()
    }
  }, { "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300" });
});
