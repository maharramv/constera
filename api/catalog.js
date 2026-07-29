import { query } from "./_lib/db.js";
import { expandCatalogSearchGroups, foldCatalogSearchText } from "./_lib/catalog-search.js";
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
  const pageSize = parseLimit(req.query.pageSize || req.query.limit, 96, 1_000);
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
  const sourceStatus = text(req.query.source, { max: 40 });
  const origin = text(req.query.origin, { max: 40 });
  const requestedScope = String(req.query.scope || "products");
  const scope = ["products", "facets", "full"].includes(requestedScope) ? requestedScope : "products";
  const includeFacets = scope === "facets" || scope === "full";
  const includeStructure = scope === "full";
  const minPrice = parsePriceAmount(req.query.minPrice);
  const maxPrice = parsePriceAmount(req.query.maxPrice);
  const sort = ["quality", "relevance", "newest", "name", "price_asc", "price_desc"].includes(String(req.query.sort || ""))
    ? String(req.query.sort)
    : queryText ? "relevance" : "quality";
  const values = [];
  const where = ["p.status = 'active'"];
  const searchExpression = `translate(
    lower(
      coalesce(p.name, '') || ' ' ||
      coalesce(p.sku, '') || ' ' ||
      coalesce(p.brand, '') || ' ' ||
      coalesce(p.subcategory, '') || ' ' ||
      coalesce(p.package_text, '') || ' ' ||
      coalesce(p.supplier_name, '') || ' ' ||
      coalesce(p.origin, '') || ' ' ||
      coalesce(p.specs::text, '')
    ),
    'əğıöşüç',
    'egiosuc'
  )`;
  const nameSearchExpression = `translate(lower(coalesce(p.name, '')), 'əğıöşüç', 'egiosuc')`;
  const brandSearchExpression = `translate(lower(coalesce(p.brand, '')), 'əğıöşüç', 'egiosuc')`;
  const skuSearchExpression = "lower(coalesce(p.sku, ''))";
  let relevanceIndex = 0;
  if (queryText) {
    const normalizedQuery = foldCatalogSearchText(queryText);
    const searchGroups = expandCatalogSearchGroups(queryText);
    if (normalizedQuery && searchGroups.length) {
      values.push(normalizedQuery);
      relevanceIndex = values.length;
      const groupConditions = searchGroups.map((group) => {
        const variantConditions = group.map((variant) => {
          values.push(`%${variant}%`);
          return `${searchExpression} ILIKE $${values.length}`;
        });
        return `(${variantConditions.join(" OR ")})`;
      });
      where.push(`(
        (${groupConditions.join(" AND ")})
        OR similarity(${nameSearchExpression}, $${relevanceIndex}) > 0.28
        OR word_similarity($${relevanceIndex}, ${searchExpression}) > 0.38
      )`);
    }
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
  if (sourceStatus === "sourced") where.push("NULLIF(trim(coalesce(p.source_url, '')), '') IS NOT NULL");
  if (sourceStatus === "sourced-image") {
    where.push("NULLIF(trim(coalesce(p.source_url, '')), '') IS NOT NULL AND NULLIF(trim(coalesce(p.image_url, '')), '') IS NOT NULL");
  }
  if (sourceStatus === "unsourced") where.push("NULLIF(trim(coalesce(p.source_url, '')), '') IS NULL");
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

  const qualityExpression = `(
    CASE WHEN NULLIF(trim(coalesce(p.source_url, '')), '') IS NOT NULL THEN 500 ELSE 0 END +
    CASE WHEN NULLIF(trim(coalesce(p.image_url, '')), '') IS NOT NULL THEN 180 ELSE 0 END +
    CASE WHEN p.price_amount > 0 THEN 120 ELSE 0 END +
    CASE WHEN p.price_status = 'confirmed' AND NULLIF(trim(coalesce(p.source_url, '')), '') IS NOT NULL THEN 180 ELSE 0 END +
    CASE WHEN p.price_verified_at IS NOT NULL THEN 25 ELSE 0 END
  )`;
  const requestGroupExpression = `(CASE WHEN
    lower(trim(coalesce(p.brand, ''))) = 'constera sorğu'
    OR lower(p.name) LIKE '%məhsul qrupu%'
    OR upper(p.sku) LIKE '%RFQ%'
    THEN 1 ELSE 0 END)`;
  const relevanceExpression = relevanceIndex
    ? `(
      CASE
        WHEN ${nameSearchExpression} = $${relevanceIndex} THEN 900
        WHEN ${nameSearchExpression} LIKE $${relevanceIndex} || '%' THEN 620
        WHEN ${nameSearchExpression} LIKE '%' || $${relevanceIndex} || '%' THEN 460
        ELSE 0
      END +
      CASE
        WHEN ${skuSearchExpression} = $${relevanceIndex} THEN 500
        WHEN ${skuSearchExpression} LIKE '%' || $${relevanceIndex} || '%' THEN 260
        ELSE 0
      END +
      CASE
        WHEN ${brandSearchExpression} = $${relevanceIndex} THEN 300
        WHEN ${brandSearchExpression} LIKE '%' || $${relevanceIndex} || '%' THEN 180
        ELSE 0
      END +
      similarity(${nameSearchExpression}, $${relevanceIndex}) * 260 +
      word_similarity($${relevanceIndex}, ${searchExpression}) * 140
    )`
    : "0";
  const orderBy = sort === "price_asc"
    ? `${requestGroupExpression} ASC, p.price_amount ASC NULLS LAST, p.name ASC`
    : sort === "price_desc"
      ? `${requestGroupExpression} ASC, p.price_amount DESC NULLS LAST, p.name ASC`
      : sort === "name"
        ? `${requestGroupExpression} ASC, p.name ASC`
        : sort === "relevance" && relevanceIndex
          ? `${requestGroupExpression} ASC, ${qualityExpression} DESC, ${relevanceExpression} DESC, p.name ASC`
          : sort === "newest"
            ? `${requestGroupExpression} ASC, p.updated_at DESC, p.name ASC`
            : `${requestGroupExpression} ASC, ${qualityExpression} DESC, p.name ASC`;
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
    !includeFacets
      ? Promise.resolve([])
      : query(`SELECT p.brand AS value, count(*)::int AS count FROM products p WHERE ${where.join(" AND ")} GROUP BY p.brand ORDER BY count(*) DESC, p.brand LIMIT 200`, filteredValues),
    !includeFacets
      ? Promise.resolve([])
      : query(`SELECT p.subcategory AS value, count(*)::int AS count FROM products p WHERE ${where.join(" AND ")} GROUP BY p.subcategory ORDER BY count(*) DESC, p.subcategory LIMIT 500`, filteredValues),
    !includeFacets
      ? Promise.resolve([])
      : query(`SELECT p.availability AS value, count(*)::int AS count FROM products p WHERE ${where.join(" AND ")} GROUP BY p.availability ORDER BY count(*) DESC, p.availability LIMIT 100`, filteredValues),
    !includeFacets
      ? Promise.resolve([])
      : query(`SELECT p.price_status AS value, count(*)::int AS count FROM products p WHERE ${where.join(" AND ")} GROUP BY p.price_status ORDER BY p.price_status`, filteredValues),
    !includeFacets
      ? Promise.resolve([])
      : query(`SELECT p.category_id AS value, count(*)::int AS count FROM products p WHERE ${where.join(" AND ")} GROUP BY p.category_id ORDER BY count(*) DESC`, filteredValues),
    !includeStructure
      ? Promise.resolve([])
      : query("SELECT id, parent_id, kind, title, slug, subtitle, group_name, sort_order FROM categories WHERE active = true ORDER BY sort_order, title"),
    !includeStructure
      ? Promise.resolve([])
      : query("SELECT id, name, supplier_type, focus, website, status, region, contact, rating, response_time FROM suppliers WHERE status <> 'Arxiv' ORDER BY name"),
    !includeStructure
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
      scope,
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
