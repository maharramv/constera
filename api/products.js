import { randomUUID } from "node:crypto";
import { query, recordAudit } from "./_lib/db.js";
import { requireRole } from "./_lib/auth.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { syncProductInventoryLevels } from "./_lib/order-operations.js";
import { listProductOffers, loadOffersForProducts, syncCanonicalProductOffer } from "./_lib/product-offers.js";
import { categoryPublicId, categoryStorageId, entityId, oneOf, parseLimit, parsePriceAmount, safeMediaUrl, safeUrl, slugify, stringList, text } from "./_lib/validation.js";

const productFields = `id, sku, name, slug, brand, category_id, subcategory, package_text, origin,
  supplier_id, supplier_name, price_amount, price_currency, price_text, price_note, price_status, availability,
  stock_quantity, minimum_order, price_verified_at, image_url, source_url, source_label,
  specs, extra_data, status, created_at, updated_at`;

const mapProduct = (row) => ({
  id: row.id,
  sku: row.sku,
  barcode: row.extra_data?.barcode || "",
  name: row.name,
  slug: row.slug,
  brand: row.brand,
  category: categoryPublicId(row.category_id),
  subcategory: row.subcategory,
  package: row.package_text || "",
  origin: row.origin || "",
  supplier: row.supplier_name || "",
  supplierId: row.supplier_id || null,
  priceAmount: row.price_amount === null ? null : Number(row.price_amount),
  priceCurrency: row.price_currency,
  price: row.price_text,
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
  status: row.status,
  updatedAt: row.updated_at
});

const loadProductDetails = async (row) => {
  const [historyRows, mediaRows, relatedRows, offers] = await Promise.all([
    query(
      `SELECT price_amount, price_currency, price_text, source_url, captured_at
         FROM price_history
        WHERE product_id = $1
        ORDER BY captured_at DESC
        LIMIT 12`,
      [row.id]
    ),
    query(
      `SELECT url, alt_text, content_type, created_at
         FROM media_assets
        WHERE entity_type = 'product' AND entity_id = $1
          AND status = 'active' AND content_type LIKE 'image/%'
        ORDER BY created_at DESC
        LIMIT 10`,
      [row.id]
    ),
    query(
      `SELECT ${productFields}
         FROM products
        WHERE status = 'active' AND id <> $1
          AND category_id IS NOT DISTINCT FROM $2
        ORDER BY
          (
            (NULLIF(trim(coalesce(image_url, '')), '') IS NOT NULL)::int * 2
            + (NULLIF(trim(coalesce(source_url, '')), '') IS NOT NULL)::int * 2
            + (price_status = 'confirmed')::int
          ) DESC,
          updated_at DESC
        LIMIT 6`,
      [row.id, row.category_id]
    ),
    listProductOffers(row.id)
  ]);
  const gallery = [
    ...(row.image_url ? [{ url: row.image_url, alt: row.name, primary: true }] : []),
    ...mediaRows.map((media) => ({
      url: media.url,
      alt: media.alt_text || row.name,
      primary: false
    }))
  ].filter((item, index, items) => items.findIndex((entry) => entry.url === item.url) === index);

  return {
    priceHistory: historyRows.map((item) => ({
      amount: item.price_amount === null ? null : Number(item.price_amount),
      currency: item.price_currency,
      price: item.price_text,
      sourceUrl: item.source_url || "",
      capturedAt: item.captured_at
    })),
    gallery,
    offers,
    preferredOffer: offers[0] || null,
    relatedProducts: relatedRows.map(mapProduct)
  };
};

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
    category: categoryStorageId("material", text(body.category, { field: "Kateqoriya", required: true, max: 160 })),
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
    stockQuantity: parsePriceAmount(body.stockQuantity),
    minimumOrder: parsePriceAmount(body.minimumOrder),
    priceVerifiedAt: priceStatus === "confirmed"
      ? (Number.isFinite(Date.parse(body.priceVerifiedAt)) ? new Date(body.priceVerifiedAt).toISOString() : new Date().toISOString())
      : null,
    imageUrl: safeMediaUrl(body.imageUrl),
    sourceUrl,
    sourceLabel: text(body.sourceLabel, { field: "Mənbə adı", max: 160 }),
    specs: stringList(body.specs),
    extraData: {
      barcode: text(body.barcode, { field: "Barkod", max: 80 }).replace(/\s+/g, "")
    },
    status: oneOf(body.status, ["active", "draft", "archived"], "active", "Məhsul statusu")
  };
};

const supplierForUser = async (user) => {
  if (user.role !== "supplier" || !user.companyId) return null;
  const rows = await query("SELECT id, name FROM suppliers WHERE company_id = $1 AND status <> 'Arxiv' LIMIT 1", [user.companyId]);
  return rows[0] || null;
};

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const limit = parseLimit(req.query.limit, 100, 1_000);
    const id = text(req.query.id, { max: 160 });
    const idsInput = text(req.query.ids, { max: 12_000 });
    const requestedIds = idsInput
      ? [...new Set(idsInput.split(",").map((value) => value.trim()).filter(Boolean))]
      : [];
    if (requestedIds.length > 100 || requestedIds.some((value) => !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value))) {
      throw new ApiError(400, "invalid_product_ids", "Toplu məhsul sorğusunda maksimum 100 düzgün ID göndərilə bilər.");
    }
    if (requestedIds.length) {
      const rows = await query(
        `SELECT ${productFields}
           FROM products
          WHERE id = ANY($1::text[]) AND status = 'active'`,
        [requestedIds]
      );
      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const offersByProduct = await loadOffersForProducts(rows.map((row) => row.id));
      return sendJson(res, 200, {
        ok: true,
        data: requestedIds
          .map((productId) => rowsById.get(productId))
          .filter(Boolean)
          .map((row) => {
            const offers = offersByProduct.get(row.id) || [];
            return { ...mapProduct(row), offers, preferredOffer: offers[0] || null };
          })
      });
    }
    const ownScope = req.query.scope === "mine";
    const values = [];
    const where = [];
    if (ownScope) {
      const user = await requireRole(req, ["super_admin", "admin", "supplier"]);
      if (user.role === "supplier") {
        const supplier = await supplierForUser(user);
        if (!supplier) return sendJson(res, 200, { ok: true, data: [] });
        values.push(supplier.id);
        where.push(`supplier_id = $${values.length}`);
      }
    }
    if (id) {
      values.push(id);
      where.push(`id = $${values.length}`);
      if (!ownScope) where.push("status = 'active'");
    } else if (!ownScope) {
      where.push("status = 'active'");
    }
    values.push(limit);
    const rows = await query(
      `SELECT ${productFields} FROM products ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT $${values.length}`,
      values
    );
    if (id && !rows[0]) throw new ApiError(404, "product_not_found", "Məhsul tapılmadı.");
    if (id) {
      const details = await loadProductDetails(rows[0]);
      return sendJson(res, 200, { ok: true, data: { ...mapProduct(rows[0]), ...details } });
    }
    return sendJson(res, 200, { ok: true, data: rows.map(mapProduct) });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const user = await requireRole(req, ["super_admin", "admin", "supplier"]);
  const ownSupplier = await supplierForUser(user);
  if (user.role === "supplier" && !ownSupplier) {
    throw new ApiError(409, "supplier_profile_required", "Hesaba bağlı təchizatçı profili tapılmadı.");
  }
  const body = await readJson(req, 80_000);

  if (req.method === "DELETE") {
    const id = text(body.id || req.query.id, { field: "Məhsul ID-si", required: true, max: 160 });
    const rows = await query(
      `UPDATE products SET status = 'archived', updated_at = now()
        WHERE id = $1 ${ownSupplier ? "AND supplier_id = $2" : ""} RETURNING id`,
      ownSupplier ? [id, ownSupplier.id] : [id]
    );
    if (!rows[0]) throw new ApiError(404, "product_not_found", "Məhsul tapılmadı.");
    await query("UPDATE product_offers SET status = 'archived', updated_at = now() WHERE product_id = $1", [id]);
    await recordAudit({ actorId: user.id, action: "archive", entityType: "product", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, status: "archived" } });
  }

  let source = body;
  let previousProduct = null;
  if (req.method === "PATCH") {
    const id = text(body.id || req.query.id, { field: "Məhsul ID-si", required: true, max: 160 });
    const existing = await query(
      `SELECT ${productFields} FROM products WHERE id = $1 ${ownSupplier ? "AND supplier_id = $2" : ""} LIMIT 1`,
      ownSupplier ? [id, ownSupplier.id] : [id]
    );
    if (!existing[0]) throw new ApiError(404, "product_not_found", "Məhsul tapılmadı.");
    previousProduct = existing[0];
    source = { ...mapProduct(existing[0]), ...body, id };
  }
  const item = normalizeProduct(source);
  if (item.stockQuantity !== null) {
    const reservationRows = await query(
      `SELECT COALESCE(sum(quantity), 0) AS reserved_quantity
         FROM inventory_reservations
        WHERE product_id = $1
          AND status = 'active'`,
      [item.id]
    );
    const reservedQuantity = Number(reservationRows[0]?.reserved_quantity || 0);
    if (item.stockQuantity < reservedQuantity) {
      throw new ApiError(
        409,
        "stock_below_reserved",
        `Stok aktiv rezervdən (${reservedQuantity}) aşağı ola bilməz.`
      );
    }
  }
  if (ownSupplier && req.method === "POST") {
    const conflicts = await query(
      "SELECT id, sku, supplier_id FROM products WHERE id = $1 OR sku = $2 LIMIT 1",
      [item.id, item.sku]
    );
    if (conflicts[0] && conflicts[0].supplier_id !== ownSupplier.id) {
      throw new ApiError(403, "supplier_product_conflict", "Bu ID və ya SKU başqa təchizatçıya aiddir.");
    }
  }
  const supplierRows = ownSupplier
    ? [ownSupplier]
    : item.supplierName
      ? await query("SELECT id, name FROM suppliers WHERE lower(name) = lower($1) AND status <> 'Arxiv' LIMIT 1", [item.supplierName])
      : [];
  const supplier = supplierRows[0] || null;
  if (ownSupplier) item.supplierName = ownSupplier.name;

  try {
    const rows = await query(
      `INSERT INTO products (
         id, sku, name, slug, brand, category_id, subcategory, package_text, origin, supplier_name, supplier_id,
         price_amount, price_currency, price_text, price_note, price_status, availability,
         stock_quantity, minimum_order, price_verified_at,
         image_url, source_url, source_label, specs, extra_data, status, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22, $23, $24::jsonb, $25::jsonb, $26, now()
       )
       ON CONFLICT (id) DO UPDATE SET
         sku = EXCLUDED.sku, name = EXCLUDED.name, slug = EXCLUDED.slug, brand = EXCLUDED.brand,
         category_id = EXCLUDED.category_id, subcategory = EXCLUDED.subcategory,
         package_text = EXCLUDED.package_text, origin = EXCLUDED.origin, supplier_name = EXCLUDED.supplier_name,
         supplier_id = EXCLUDED.supplier_id,
         price_amount = EXCLUDED.price_amount, price_currency = EXCLUDED.price_currency,
         price_text = EXCLUDED.price_text, price_note = EXCLUDED.price_note, price_status = EXCLUDED.price_status,
         availability = EXCLUDED.availability, stock_quantity = EXCLUDED.stock_quantity,
         minimum_order = EXCLUDED.minimum_order, price_verified_at = EXCLUDED.price_verified_at,
         image_url = EXCLUDED.image_url, source_url = EXCLUDED.source_url,
         source_label = EXCLUDED.source_label, specs = EXCLUDED.specs,
         extra_data = products.extra_data || EXCLUDED.extra_data,
         status = EXCLUDED.status, updated_at = now()
       RETURNING ${productFields}`,
      [
        item.id, item.sku, item.name, item.slug, item.brand, item.category, item.subcategory,
        item.packageText || null, item.origin || null, item.supplierName || null, supplier?.id || null, item.priceAmount,
        item.priceCurrency, item.priceText, item.priceNote || null, item.priceStatus, item.availability,
        item.stockQuantity, item.minimumOrder, item.priceVerifiedAt,
        item.imageUrl || null, item.sourceUrl || null, item.sourceLabel || null,
        JSON.stringify(item.specs), JSON.stringify(item.extraData), item.status
      ]
    );
    const confirmedPriceChanged = item.priceStatus === "confirmed" && (
      !previousProduct
      || previousProduct.price_status !== "confirmed"
      || Number(previousProduct.price_amount) !== item.priceAmount
      || previousProduct.price_currency !== item.priceCurrency
    );
    if (confirmedPriceChanged) {
      await query(
        `INSERT INTO price_history (product_id, price_amount, price_currency, price_text, source_url)
         VALUES ($1, $2, $3, $4, $5)`,
        [item.id, item.priceAmount, item.priceCurrency, item.priceText, item.sourceUrl]
      );
    }
    if (item.priceStatus === "confirmed") {
      await query(
        `UPDATE price_review_requests
            SET status = 'completed', completed_at = now(), updated_at = now(),
                note = 'Məhsul qiyməti yenidən təsdiqləndi'
          WHERE product_id = $1 AND status = 'pending'`,
        [item.id]
      );
    }
    if (supplier) {
      await query(
        `INSERT INTO product_offers (
           id, product_id, supplier_id, supplier_sku, unit_price, currency,
           price_text, price_status, stock_quantity, minimum_order,
           source_url, source_label, price_verified_at, is_featured, status, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, true, $14, now()
         )
         ON CONFLICT (product_id, supplier_id) DO UPDATE SET
           supplier_sku = EXCLUDED.supplier_sku,
           unit_price = EXCLUDED.unit_price,
           currency = EXCLUDED.currency,
           price_text = EXCLUDED.price_text,
           price_status = EXCLUDED.price_status,
           stock_quantity = EXCLUDED.stock_quantity,
           minimum_order = EXCLUDED.minimum_order,
           source_url = EXCLUDED.source_url,
           source_label = EXCLUDED.source_label,
           price_verified_at = EXCLUDED.price_verified_at,
           status = EXCLUDED.status,
           updated_at = now()`,
        [
          `pof-${randomUUID()}`, item.id, supplier.id, item.sku, item.priceAmount,
          item.priceCurrency, item.priceText, item.priceStatus, item.stockQuantity,
          item.minimumOrder, item.sourceUrl || null, item.sourceLabel || null,
          item.priceVerifiedAt, item.status
        ]
      );
      await syncCanonicalProductOffer(item.id);
    }
    await syncProductInventoryLevels([item.id]);
    await recordAudit({ actorId: user.id, action: req.method === "POST" ? "create" : "update", entityType: "product", entityId: item.id, details: { sku: item.sku } });
    return sendJson(res, req.method === "POST" ? 201 : 200, { ok: true, data: mapProduct(rows[0]) });
  } catch (error) {
    if (error?.code === "23505") throw new ApiError(409, "duplicate_product", "Bu ID və ya SKU ilə məhsul artıq mövcuddur.");
    if (error?.code === "23503") throw new ApiError(400, "category_not_found", "Seçilmiş kateqoriya bazada tapılmadı.");
    throw error;
  }
});
