import { requireRole } from "./_lib/auth.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { entityId, parsePriceAmount, safeMediaUrl, safeUrl, slugify, stringList, text } from "./_lib/validation.js";

const limitArray = (value, limit, label) => {
  if (!Array.isArray(value)) return [];
  if (value.length > limit) throw new ApiError(413, "sync_limit_exceeded", `${label} üçün maksimum ${limit} qeyd göndərilə bilər.`);
  return value;
};

const normalizeImportedWebsite = (value) => {
  const website = text(value, { max: 2_000 });
  if (!website) return "";
  if (/^www\./i.test(website)) return safeUrl(`https://${website}`, "Təchizatçı saytı");
  if (/^https:\/\//i.test(website)) return safeUrl(website, "Təchizatçı saytı");
  return "";
};

const normalizeCategoryRows = (categories, kind) => {
  const parents = [];
  const children = [];
  categories.forEach((category, index) => {
    const id = entityId(category.id, `${kind}-category`);
    const title = text(category.title, { field: "Kateqoriya adı", required: true, max: 200 });
    const groupName = text(category.group, { max: 160 }) || "Ümumi";
    parents.push({
      id,
      parentId: null,
      kind,
      title,
      slug: slugify(category.slug || id || title),
      subtitle: text(category.subtitle, { max: 500 }),
      groupName,
      sortOrder: index
    });
    stringList(category.subcategories, 1_000).forEach((subcategory, subIndex) => {
      children.push({
        id: `${id}--${slugify(subcategory)}`.slice(0, 220),
        parentId: id,
        kind,
        title: subcategory,
        slug: `${slugify(id)}-${slugify(subcategory)}`.slice(0, 220),
        subtitle: "",
        groupName,
        sortOrder: subIndex
      });
    });
  });
  return { parents, children };
};

const upsertCategories = async (rows) => {
  if (!rows.length) return 0;
  await query(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
         id text, "parentId" text, kind text, title text, slug text,
         subtitle text, "groupName" text, "sortOrder" integer
       )
     )
     INSERT INTO categories (id, parent_id, kind, title, slug, subtitle, group_name, sort_order, active, updated_at)
     SELECT id, "parentId", kind, title, slug, NULLIF(subtitle, ''), "groupName", "sortOrder", true, now() FROM incoming
     ON CONFLICT (id) DO UPDATE SET
       parent_id = EXCLUDED.parent_id, kind = EXCLUDED.kind, title = EXCLUDED.title,
       slug = EXCLUDED.slug, subtitle = EXCLUDED.subtitle, group_name = EXCLUDED.group_name,
       sort_order = EXCLUDED.sort_order, active = true, updated_at = now()`,
    [JSON.stringify(rows)]
  );
  return rows.length;
};

const upsertSuppliers = async (suppliers) => {
  if (!suppliers.length) return 0;
  const rows = suppliers.map((supplier) => ({
    id: entityId(supplier.id, "supplier"),
    name: text(supplier.name, { field: "Təchizatçı adı", required: true, max: 200 }),
    supplierType: text(supplier.type, { max: 120 }) || "Təchizatçı",
    focus: text(supplier.focus, { max: 600 }),
    website: normalizeImportedWebsite(supplier.website),
    status: text(supplier.status, { max: 80 }) || "Aktiv",
    region: text(supplier.region, { max: 160 }) || "Azərbaycan",
    contact: text(supplier.contact, { max: 300 }),
    rating: text(supplier.rating, { max: 80 }) || "Yeni",
    responseTime: text(supplier.responseTime, { max: 160 }) || "Sorğu əsasında"
  }));
  await query(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
         id text, name text, "supplierType" text, focus text, website text,
         status text, region text, contact text, rating text, "responseTime" text
       )
     )
     INSERT INTO suppliers (id, name, supplier_type, focus, website, status, region, contact, rating, response_time, updated_at)
     SELECT id, name, "supplierType", NULLIF(focus, ''), NULLIF(website, ''), status, region,
            NULLIF(contact, ''), rating, "responseTime", now() FROM incoming
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, supplier_type = EXCLUDED.supplier_type, focus = EXCLUDED.focus,
       website = EXCLUDED.website, status = EXCLUDED.status, region = EXCLUDED.region,
       contact = EXCLUDED.contact, rating = EXCLUDED.rating, response_time = EXCLUDED.response_time,
       updated_at = now()`,
    [JSON.stringify(rows)]
  );
  return rows.length;
};

const upsertProducts = async (products) => {
  if (!products.length) return 0;
  const rows = products.map((product) => {
    const sourceUrl = safeUrl(product.sourceUrl, "Mənbə URL-i");
    let priceStatus = ["confirmed", "request", "expired"].includes(product.priceStatus) ? product.priceStatus : "request";
    let priceAmount = parsePriceAmount(product.priceAmount ?? product.price);
    let priceText = text(product.price, { max: 120 }) || "Sorğu əsasında";
    if (priceStatus === "confirmed" && (!sourceUrl || priceAmount === null)) {
      priceStatus = "request";
      priceAmount = null;
      priceText = "Sorğu əsasında";
    }
    const name = text(product.name, { field: "Məhsul adı", required: true, max: 240 });
    return {
      id: entityId(product.id, "product"),
      sku: text(product.sku, { field: "SKU", required: true, max: 120 }),
      name,
      slug: slugify(product.slug || name),
      brand: text(product.brand, { max: 160 }) || "Brendsiz",
      categoryId: text(product.category, { field: "Kateqoriya", required: true, max: 160 }),
      subcategory: text(product.subcategory, { max: 200 }) || "Ümumi",
      packageText: text(product.package, { max: 160 }),
      origin: text(product.origin, { max: 160 }),
      supplierName: text(product.supplier, { max: 200 }),
      priceAmount,
      priceCurrency: ["AZN", "USD", "EUR"].includes(product.priceCurrency) ? product.priceCurrency : "AZN",
      priceText,
      priceNote: text(product.priceNote, { max: 500 }),
      priceStatus,
      availability: text(product.availability, { max: 160 }) || "Stok sorğu ilə",
      imageUrl: safeMediaUrl(product.imageUrl),
      sourceUrl,
      sourceLabel: text(product.sourceLabel, { max: 160 }),
      specs: stringList(product.specs),
      extraData: { syncedFrom: "static-catalog" }
    };
  });
  await query(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
         id text, sku text, name text, slug text, brand text, "categoryId" text,
         subcategory text, "packageText" text, origin text, "supplierName" text,
         "priceAmount" numeric, "priceCurrency" text, "priceText" text, "priceNote" text,
         "priceStatus" text, availability text, "imageUrl" text, "sourceUrl" text,
         "sourceLabel" text, specs jsonb, "extraData" jsonb
       )
     )
     INSERT INTO products (
       id, sku, name, slug, brand, category_id, subcategory, package_text, origin, supplier_name,
       supplier_id, price_amount, price_currency, price_text, price_note, price_status,
       availability, image_url, source_url, source_label, specs, extra_data, status, updated_at
     )
     SELECT i.id, i.sku, i.name, i.slug, i.brand, i."categoryId", i.subcategory,
            NULLIF(i."packageText", ''), NULLIF(i.origin, ''), NULLIF(i."supplierName", ''),
            s.id, i."priceAmount", i."priceCurrency", i."priceText", NULLIF(i."priceNote", ''),
            i."priceStatus", i.availability, NULLIF(i."imageUrl", ''), NULLIF(i."sourceUrl", ''),
            NULLIF(i."sourceLabel", ''), i.specs, i."extraData", 'active', now()
       FROM incoming i
       LEFT JOIN suppliers s ON lower(s.name) = lower(i."supplierName")
     ON CONFLICT (sku) DO UPDATE SET
       name = EXCLUDED.name, slug = EXCLUDED.slug, brand = EXCLUDED.brand,
       category_id = EXCLUDED.category_id, subcategory = EXCLUDED.subcategory,
       package_text = EXCLUDED.package_text, origin = EXCLUDED.origin,
       supplier_name = EXCLUDED.supplier_name, supplier_id = EXCLUDED.supplier_id,
       price_amount = EXCLUDED.price_amount, price_currency = EXCLUDED.price_currency,
       price_text = EXCLUDED.price_text, price_note = EXCLUDED.price_note,
       price_status = EXCLUDED.price_status, availability = EXCLUDED.availability,
       image_url = EXCLUDED.image_url, source_url = EXCLUDED.source_url,
       source_label = EXCLUDED.source_label, specs = EXCLUDED.specs,
       extra_data = products.extra_data || EXCLUDED.extra_data, status = 'active', updated_at = now()`,
    [JSON.stringify(rows)]
  );
  return rows.length;
};

const upsertEntities = async (kind, items) => {
  if (!items.length) return 0;
  const rows = items.map((item) => {
    const titleValue = item.title || item.name;
    const title = text(titleValue, { field: "Kart adı", required: true, max: 260 });
    return {
      id: entityId(item.id, kind),
      entityKind: kind,
      categoryId: text(item.category, { max: 160 }) || null,
      subcategory: text(item.subcategory, { max: 200 }) || "Ümumi",
      title,
      slug: slugify(title),
      unit: text(item.unit, { max: 160 }),
      priceText: text(item.price, { max: 160 }) || "Sorğu əsasında",
      extraData: item
    };
  });
  await query(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
         id text, "entityKind" text, "categoryId" text, subcategory text,
         title text, slug text, unit text, "priceText" text, "extraData" jsonb
       )
     )
     INSERT INTO marketplace_entities (
       id, entity_kind, category_id, subcategory, title, slug, unit, price_text, extra_data, status, updated_at
     )
     SELECT id, "entityKind", "categoryId", subcategory, title, slug, NULLIF(unit, ''),
            "priceText", "extraData", 'active', now() FROM incoming
     ON CONFLICT (id) DO UPDATE SET
       entity_kind = EXCLUDED.entity_kind, category_id = EXCLUDED.category_id,
       subcategory = EXCLUDED.subcategory, title = EXCLUDED.title, slug = EXCLUDED.slug,
       unit = EXCLUDED.unit, price_text = EXCLUDED.price_text, extra_data = EXCLUDED.extra_data,
       status = 'active', updated_at = now()`,
    [JSON.stringify(rows)]
  );
  return rows.length;
};

export const syncMarketplaceData = async (body) => {
  const categories = limitArray(body.categories, 200, "Kateqoriya");
  const serviceCategories = limitArray(body.serviceCategories, 100, "Xidmət kateqoriyası");
  const packageCategories = limitArray(body.packageCategories, 100, "Paket kateqoriyası");
  const rentalCategories = limitArray(body.rentalCategories, 100, "İcarə kateqoriyası");
  const suppliers = limitArray(body.suppliers, 500, "Təchizatçı");
  const products = limitArray(body.products, 1_500, "Məhsul");
  const services = limitArray(body.services, 1_000, "Xidmət");
  const packages = limitArray(body.packages, 1_000, "Paket");
  const rentals = limitArray(body.rentals, 1_000, "İcarə");

  const categorySets = [
    normalizeCategoryRows(categories, "material"),
    normalizeCategoryRows(serviceCategories, "service"),
    normalizeCategoryRows(packageCategories, "package"),
    normalizeCategoryRows(rentalCategories, "rental")
  ];
  const parents = categorySets.flatMap((set) => set.parents);
  const children = categorySets.flatMap((set) => set.children);
  const result = {
    categories: await upsertCategories(parents),
    subcategories: await upsertCategories(children),
    suppliers: await upsertSuppliers(suppliers),
    products: await upsertProducts(products),
    services: await upsertEntities("service", services),
    packages: await upsertEntities("package", packages),
    rentals: await upsertEntities("rental", rentals)
  };
  return result;
};

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["POST"]);
  assertSameOrigin(req);
  const user = await requireRole(req, ["super_admin", "admin"]);
  const body = await readJson(req, 5_000_000);
  const result = await syncMarketplaceData(body);
  await recordAudit({ actorId: user.id, action: "bulk_sync", entityType: "marketplace", details: result });
  return sendJson(res, 200, { ok: true, data: result, syncedAt: new Date().toISOString() });
});
