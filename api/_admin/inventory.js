import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { matrixToObjects, parseCsv, readAliased } from "../_lib/imports.js";
import { categoryPublicId, oneOf, parseLimit, parsePriceAmount, safeUrl, text } from "../_lib/validation.js";

const formatPrice = (amount, currency) => `${Number(amount).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const optionalAmount = (value, field) => {
  if (value === "" || value === null || value === undefined) return null;
  const amount = parsePriceAmount(value);
  if (amount === null) throw new ApiError(400, "validation_error", `${field} mənfi və ya yanlış ola bilməz.`);
  return amount;
};

const normalizeBulkStatus = (value) => {
  const status = String(value || "").trim().toLocaleLowerCase("az-AZ");
  if (!status) return "";
  if (["confirmed", "təsdiqli", "tesdiqli", "aktiv"].includes(status)) return "confirmed";
  if (["request", "sorğu", "sorgu", "sorğu ilə", "sorgu ile"].includes(status)) return "request";
  if (["expired", "vaxtı keçib", "vaxti kecib", "köhnə", "kohne"].includes(status)) return "expired";
  return null;
};

const bulkAmount = (value, field, errors) => {
  const source = String(value ?? "").trim();
  if (!source) return { provided: false, value: null };
  const normalized = source.replace(/\s/g, "").replace(",", ".").replace(/(?:azn|manat)$/i, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    errors.push(`${field} düzgün müsbət rəqəm deyil.`);
    return { provided: true, value: null };
  }
  return { provided: true, value: Number(normalized) };
};

const supplierScope = async (user, requestedSupplierId = "") => {
  if (user.role === "supplier") {
    if (!user.companyId) throw new ApiError(409, "supplier_profile_required", "Hesaba bağlı şirkət tapılmadı.");
    const rows = await query("SELECT id, name FROM suppliers WHERE company_id = $1 AND status <> 'Arxiv' LIMIT 1", [user.companyId]);
    if (!rows[0]) throw new ApiError(409, "supplier_profile_required", "Hesaba bağlı təchizatçı profili tapılmadı.");
    return rows[0];
  }
  const id = text(requestedSupplierId, { max: 160 });
  if (!id) return null;
  const rows = await query("SELECT id, name FROM suppliers WHERE id = $1 AND status <> 'Arxiv' LIMIT 1", [id]);
  if (!rows[0]) throw new ApiError(404, "supplier_not_found", "Təchizatçı tapılmadı.");
  return rows[0];
};

const mapInventoryProduct = (row, history = []) => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  brand: row.brand,
  category: categoryPublicId(row.category_id),
  subcategory: row.subcategory,
  package: row.package_text || "",
  supplier: row.supplier_name || "",
  supplierId: row.supplier_id || null,
  priceAmount: row.price_amount === null ? null : Number(row.price_amount),
  priceCurrency: row.price_currency,
  price: row.price_text,
  priceNote: row.price_note || "",
  priceStatus: row.price_status,
  priceVerifiedAt: row.price_verified_at,
  stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity),
  minimumOrder: row.minimum_order === null ? null : Number(row.minimum_order),
  availability: row.availability,
  sourceUrl: row.source_url || "",
  status: row.status,
  updatedAt: row.updated_at,
  priceHistory: history.map((item) => ({
    amount: item.price_amount === null ? null : Number(item.price_amount),
    currency: item.price_currency,
    price: item.price_text,
    capturedAt: item.captured_at
  }))
});

const loadInventory = async (user, requestedSupplierId = "", limitValue = 500) => {
  const supplier = await supplierScope(user, requestedSupplierId);
  const limit = parseLimit(limitValue, 500, 1_000);
  const values = [];
  const where = ["p.supplier_id IS NOT NULL"];
  if (supplier) {
    values.push(supplier.id);
    where.push(`p.supplier_id = $${values.length}`);
  }
  values.push(limit);
  const products = await query(
    `SELECT p.* FROM products p
      WHERE ${where.join(" AND ")}
      ORDER BY p.updated_at DESC, p.name
      LIMIT $${values.length}`,
    values
  );
  const histories = products.length ? await query(
    `SELECT product_id, price_amount, price_currency, price_text, captured_at
       FROM (
         SELECT h.*, row_number() OVER (PARTITION BY h.product_id ORDER BY h.captured_at DESC) AS rank
           FROM price_history h WHERE h.product_id = ANY($1::text[])
       ) recent
      WHERE rank <= 12
      ORDER BY product_id, captured_at DESC`,
    [products.map((product) => product.id)]
  ) : [];
  const historyByProduct = new Map();
  histories.forEach((item) => {
    const list = historyByProduct.get(item.product_id) || [];
    list.push(item);
    historyByProduct.set(item.product_id, list);
  });
  const mapped = products.map((product) => mapInventoryProduct(product, historyByProduct.get(product.id) || []));
  const now = Date.now();
  const stale = mapped.filter((product) => !product.priceVerifiedAt || now - new Date(product.priceVerifiedAt).getTime() > 30 * 86_400_000).length;
  const lowStock = mapped.filter((product) => product.stockQuantity !== null && product.stockQuantity <= Math.max(product.minimumOrder || 0, 5)).length;
  const inventoryValue = mapped.reduce((sum, product) => sum + (product.priceAmount || 0) * (product.stockQuantity || 0), 0);
  return {
    supplier,
    products: mapped,
    metrics: {
      total: mapped.length,
      confirmed: mapped.filter((product) => product.priceStatus === "confirmed").length,
      stale,
      lowStock,
      missingStock: mapped.filter((product) => product.stockQuantity === null).length,
      inventoryValue: Math.round(inventoryValue * 100) / 100
    }
  };
};

const parseBulkInventory = async (body, supplier) => {
  const csv = text(body.csv, { field: "CSV məlumatı", required: true, max: 180_000 });
  const matrix = parseCsv(csv);
  const sourceRows = matrixToObjects(matrix);
  if (!sourceRows.length) throw new ApiError(400, "empty_inventory_import", "CSV-də məlumat sətri tapılmadı.");
  if (sourceRows.length > 1_000) throw new ApiError(413, "inventory_import_too_large", "Bir dəfəyə maksimum 1 000 SKU yenilənə bilər.");

  const values = [];
  const where = ["status = 'active'"];
  if (supplier) {
    values.push(supplier.id);
    where.push(`supplier_id = $${values.length}`);
  }
  const products = await query(`SELECT * FROM products WHERE ${where.join(" AND ")}`, values);
  const productsBySku = new Map(products.map((product) => [product.sku.trim().toLocaleLowerCase("az-AZ"), product]));
  const seen = new Set();
  const preview = sourceRows.map((row, index) => {
    const rowNumber = index + 2;
    const sku = text(readAliased(row, "sku"), { max: 120 });
    const skuKey = sku.toLocaleLowerCase("az-AZ");
    const product = productsBySku.get(skuKey);
    const errors = [];
    if (!sku) errors.push("SKU boşdur.");
    if (sku && !product) errors.push("SKU bu təchizatçıya aid deyil.");
    if (sku && seen.has(skuKey)) errors.push("SKU faylda təkrar olunub.");
    if (sku) seen.add(skuKey);

    const price = bulkAmount(readAliased(row, "price"), "Qiymət", errors);
    const stock = bulkAmount(readAliased(row, "stockQuantity"), "Stok", errors);
    const minimumOrder = bulkAmount(readAliased(row, "minimumOrder"), "Minimum sifariş", errors);
    const statusInput = normalizeBulkStatus(readAliased(row, "priceStatus"));
    if (statusInput === null) errors.push("Qiymət statusu tanınmadı.");
    const priceStatus = statusInput || product?.price_status || "request";
    const priceAmount = price.provided ? price.value : product?.price_amount == null ? null : Number(product.price_amount);
    const sourceInput = text(readAliased(row, "sourceUrl"), { max: 2_000 });
    let sourceUrl = sourceInput || product?.source_url || "";
    if (sourceInput) {
      try {
        sourceUrl = safeUrl(sourceInput, "Mənbə URL-i");
      } catch {
        errors.push("Mənbə düzgün HTTPS ünvanı olmalıdır.");
      }
    }
    if (priceStatus === "confirmed" && (priceAmount === null || !sourceUrl.startsWith("https://"))) {
      errors.push("Təsdiqli qiymət üçün məbləğ və HTTPS mənbə tələb olunur.");
    }

    const changes = [];
    if (price.provided) changes.push(`qiymət: ${price.value ?? "-"}`);
    if (statusInput) changes.push(`status: ${statusInput}`);
    if (stock.provided) changes.push(`stok: ${stock.value ?? "-"}`);
    if (minimumOrder.provided) changes.push(`min.: ${minimumOrder.value ?? "-"}`);
    if (sourceInput) changes.push("mənbə");
    if (!changes.length) errors.push("Yenilənəcək sahə yoxdur.");

    const update = product ? {
      id: product.id,
      priceStatus,
      priceCurrency: product.price_currency || "AZN",
      sourceUrl,
      priceNote: "Təchizatçı toplu inventar yeniləməsi",
      ...(priceStatus === "confirmed" || price.provided ? { priceAmount } : {}),
      ...(stock.provided ? { stockQuantity: stock.value } : {}),
      ...(minimumOrder.provided ? { minimumOrder: minimumOrder.value } : {})
    } : null;
    return {
      rowNumber,
      sku: sku || "-",
      name: product?.name || "",
      changes,
      errors,
      valid: errors.length === 0,
      update
    };
  });
  return {
    total: preview.length,
    valid: preview.filter((item) => item.valid).length,
    errors: preview.filter((item) => !item.valid).length,
    preview: preview.map(({ update, ...item }) => item),
    updates: preview.filter((item) => item.valid).map((item) => item.update)
  };
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, ["super_admin", "admin", "supplier"]);

  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, data: await loadInventory(user, req.query.supplierId, req.query.limit) });
  }

  assertMethod(req, ["PATCH", "POST"]);
  assertSameOrigin(req);
  const body = await readJson(req, 180_000);
  let bulk = null;
  let scopedSupplier = null;
  if (req.method === "POST") {
    scopedSupplier = await supplierScope(user, body.supplierId);
    bulk = await parseBulkInventory(body, scopedSupplier);
    const action = oneOf(body.action, ["validate", "commit"], "validate", "Əməliyyat");
    if (action === "validate") return sendJson(res, 200, { ok: true, data: bulk });
    if (bulk.errors) {
      throw new ApiError(400, "inventory_validation_failed", "Toplu inventarda səhv sətirlər var.", {
        total: bulk.total,
        valid: bulk.valid,
        errors: bulk.errors,
        preview: bulk.preview
      });
    }
  }
  const itemLimit = req.method === "POST" ? 1_000 : 200;
  const sourceItems = req.method === "POST" ? bulk.updates : Array.isArray(body.items) ? body.items : [];
  if (sourceItems.length > itemLimit) {
    throw new ApiError(413, "inventory_update_too_large", `Bir dəfəyə maksimum ${itemLimit} məhsul yenilənə bilər.`);
  }
  const items = sourceItems.slice(0, itemLimit);
  if (!items.length) throw new ApiError(400, "empty_inventory_update", "Yenilənəcək məhsul seçilməyib.");
  const ids = [...new Set(items.map((item) => text(item.id, { field: "Məhsul ID-si", required: true, max: 160 })))];
  if (ids.length !== items.length) throw new ApiError(400, "duplicate_inventory_item", "Eyni məhsul bir neçə dəfə göndərilib.");

  const supplier = req.method === "POST" ? scopedSupplier : await supplierScope(user, body.supplierId);
  const values = [ids];
  const where = ["id = ANY($1::text[])"];
  if (supplier) {
    values.push(supplier.id);
    where.push(`supplier_id = $${values.length}`);
  }
  const currentRows = await query(`SELECT * FROM products WHERE ${where.join(" AND ")}`, values);
  if (currentRows.length !== ids.length) throw new ApiError(403, "inventory_scope_violation", "Məhsullardan biri bu təchizatçıya aid deyil.");
  const currentById = new Map(currentRows.map((row) => [row.id, row]));
  const now = new Date().toISOString();
  const normalized = items.map((source) => {
    const current = currentById.get(source.id);
    const currency = oneOf(source.priceCurrency ?? current.price_currency, ["AZN", "USD", "EUR"], "AZN", "Valyuta");
    const priceStatus = oneOf(source.priceStatus ?? current.price_status, ["confirmed", "request", "expired"], "request", "Qiymət statusu");
    let priceAmount = Object.prototype.hasOwnProperty.call(source, "priceAmount")
      ? optionalAmount(source.priceAmount, "Qiymət")
      : current.price_amount === null ? null : Number(current.price_amount);
    const sourceUrl = Object.prototype.hasOwnProperty.call(source, "sourceUrl")
      ? safeUrl(source.sourceUrl, "Mənbə URL-i")
      : current.source_url || "";
    if (priceStatus === "confirmed" && (priceAmount === null || !sourceUrl)) {
      throw new ApiError(400, "confirmed_price_requires_source", `${current.sku}: təsdiqli qiymət üçün məbləğ və HTTPS mənbə URL-i tələb olunur.`);
    }
    if (priceStatus !== "confirmed") priceAmount = null;
    const stockQuantity = Object.prototype.hasOwnProperty.call(source, "stockQuantity")
      ? optionalAmount(source.stockQuantity, "Stok")
      : current.stock_quantity === null ? null : Number(current.stock_quantity);
    const minimumOrder = Object.prototype.hasOwnProperty.call(source, "minimumOrder")
      ? optionalAmount(source.minimumOrder, "Minimum sifariş")
      : current.minimum_order === null ? null : Number(current.minimum_order);
    const availability = text(source.availability, { max: 160 }) || (stockQuantity === null
      ? current.availability || "Stok sorğu ilə"
      : stockQuantity > 0 ? "Anbarda var" : "Stokda yoxdur");
    return {
      id: current.id,
      priceAmount,
      priceCurrency: currency,
      priceText: priceStatus === "confirmed" ? formatPrice(priceAmount, currency) : "Sorğu əsasında",
      priceNote: text(source.priceNote, { max: 500 }) || current.price_note || "Təchizatçı kabinetindən yenilənib",
      priceStatus,
      priceVerifiedAt: priceStatus === "confirmed" ? now : null,
      stockQuantity,
      minimumOrder,
      availability,
      sourceUrl,
      priceChanged: priceStatus === "confirmed" && (current.price_status !== "confirmed" || Number(current.price_amount) !== priceAmount)
    };
  });

  const rows = await query(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
         id text, "priceAmount" numeric, "priceCurrency" text, "priceText" text,
         "priceNote" text, "priceStatus" text, "priceVerifiedAt" timestamptz,
         "stockQuantity" numeric, "minimumOrder" numeric, availability text, "sourceUrl" text
       )
     )
     UPDATE products p SET
       price_amount = i."priceAmount", price_currency = i."priceCurrency", price_text = i."priceText",
       price_note = NULLIF(i."priceNote", ''), price_status = i."priceStatus",
       price_verified_at = i."priceVerifiedAt", stock_quantity = i."stockQuantity",
       minimum_order = i."minimumOrder", availability = i.availability,
       source_url = NULLIF(i."sourceUrl", ''), updated_at = now()
     FROM incoming i WHERE p.id = i.id
     RETURNING p.*`,
    [JSON.stringify(normalized)]
  );
  const changedPrices = normalized.filter((item) => item.priceChanged);
  if (changedPrices.length) {
    await query(
      `WITH incoming AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
           id text, "priceAmount" numeric, "priceCurrency" text, "priceText" text, "sourceUrl" text
         )
       )
       INSERT INTO price_history (product_id, price_amount, price_currency, price_text, source_url)
       SELECT id, "priceAmount", "priceCurrency", "priceText", NULLIF("sourceUrl", '') FROM incoming`,
      [JSON.stringify(changedPrices)]
    );
  }
  const confirmedIds = normalized.filter((item) => item.priceStatus === "confirmed").map((item) => item.id);
  if (confirmedIds.length) {
    await query(
      `UPDATE price_review_requests
          SET status = 'completed', completed_at = now(), updated_at = now(),
              note = 'Təchizatçı inventar yeniləməsi ilə təsdiqləndi'
        WHERE product_id = ANY($1::text[]) AND status = 'pending'`,
      [confirmedIds]
    );
  }
  await recordAudit({
    actorId: user.id,
    action: req.method === "POST" ? "bulk_import" : "bulk_update",
    entityType: "inventory",
    entityId: supplier?.id || null,
    details: { count: rows.length, changedPrices: changedPrices.length }
  });
  const inventory = await loadInventory(user, body.supplierId, 1_000);
  return sendJson(res, 200, {
    ok: true,
    data: bulk ? { ...inventory, bulk: { total: bulk.total, valid: bulk.valid, errors: 0 } } : inventory
  });
});
