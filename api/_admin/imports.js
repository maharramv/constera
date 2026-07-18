import { randomUUID } from "node:crypto";
import readXlsxFile from "read-excel-file/node";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { matrixToObjects, parseCsv, readAliased, splitList } from "../_lib/imports.js";
import { categoryPublicId, oneOf, parseLimit, parsePriceAmount, slugify, text } from "../_lib/validation.js";
import { upsertEntities, upsertProducts } from "../sync.js";

const importTypes = ["product", "service", "package", "rental"];

const decodeRows = async (body) => {
  if (Array.isArray(body.rows)) return body.rows.slice(0, 1_000);
  const encoded = text(body.fileBase64, { max: 4_000_000 });
  if (!encoded) throw new ApiError(400, "file_required", "CSV və ya XLSX faylı seçilməlidir.");
  const buffer = Buffer.from(encoded.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!buffer.length || buffer.length > 3_000_000) throw new ApiError(413, "file_too_large", "İdxal faylı maksimum 3 MB ola bilər.");
  const filename = text(body.filename, { max: 240 }).toLowerCase();
  const matrix = filename.endsWith(".xlsx") || body.fileType === "xlsx"
    ? await readXlsxFile(buffer)
    : parseCsv(buffer.toString("utf8"));
  return matrixToObjects(matrix).slice(0, 1_000);
};

const loadCategoryMap = async (kind) => {
  const rows = await query(
    "SELECT id, title, slug FROM categories WHERE kind = $1 AND parent_id IS NULL AND active = true",
    [kind]
  );
  const map = new Map();
  rows.forEach((row) => {
    const publicId = categoryPublicId(row.id);
    [publicId, row.title, row.slug].forEach((key) => map.set(slugify(key), publicId));
  });
  return map;
};

const productFromRow = (row, index, categories) => {
  const sku = text(readAliased(row, "sku"), { max: 120 });
  const name = text(readAliased(row, "name"), { max: 240 });
  const categoryInput = text(readAliased(row, "category"), { max: 200 });
  const category = categories.get(slugify(categoryInput));
  const subcategory = text(readAliased(row, "subcategory"), { max: 200 });
  const errors = [];
  if (!sku) errors.push("SKU yoxdur");
  if (!name) errors.push("məhsul adı yoxdur");
  if (!category) errors.push(`kateqoriya tapılmadı: ${categoryInput || "boş"}`);
  if (!subcategory) errors.push("subkateqoriya yoxdur");
  if (errors.length) return { index, errors };
  const sourceUrl = text(readAliased(row, "sourceUrl"), { max: 2_000 });
  const price = text(readAliased(row, "price"), { max: 160 }) || "Sorğu əsasında";
  const amount = parsePriceAmount(price);
  return {
    index,
    item: {
      id: `product-${slugify(sku)}`,
      sku,
      name,
      brand: text(readAliased(row, "brand"), { max: 160 }) || "Brendsiz",
      category,
      subcategory,
      package: text(readAliased(row, "package"), { max: 160 }),
      origin: text(readAliased(row, "origin"), { max: 160 }),
      supplier: text(readAliased(row, "supplier"), { max: 200 }),
      price,
      priceAmount: amount,
      priceCurrency: oneOf(String(readAliased(row, "currency") || "AZN").toUpperCase(), ["AZN", "USD", "EUR"], "AZN", "Valyuta"),
      priceStatus: amount !== null && sourceUrl ? "confirmed" : "request",
      availability: text(readAliased(row, "availability"), { max: 160 }) || "Stok sorğu ilə",
      stockQuantity: parsePriceAmount(readAliased(row, "stockQuantity")),
      minimumOrder: parsePriceAmount(readAliased(row, "minimumOrder")),
      imageUrl: text(readAliased(row, "imageUrl"), { max: 2_000 }),
      sourceUrl,
      sourceLabel: text(readAliased(row, "sourceLabel"), { max: 160 }),
      specs: splitList(readAliased(row, "specs"))
    }
  };
};

const entityFromRow = (row, index, kind, categories) => {
  const title = text(readAliased(row, "title"), { max: 260 });
  const categoryInput = text(readAliased(row, "category"), { max: 200 });
  const category = categories.get(slugify(categoryInput));
  const subcategory = text(readAliased(row, "subcategory"), { max: 200 });
  const errors = [];
  if (!title) errors.push("ad yoxdur");
  if (!category) errors.push(`kateqoriya tapılmadı: ${categoryInput || "boş"}`);
  if (!subcategory) errors.push("subkateqoriya yoxdur");
  if (errors.length) return { index, errors };
  const suppliedId = text(readAliased(row, "id"), { max: 120 });
  const stableKey = suppliedId || `${title}-${category}-${subcategory}`;
  const id = `${kind}-${slugify(stableKey)}`.slice(0, 160);
  return {
    index,
    item: {
      id,
      title,
      name: title,
      category,
      subcategory,
      type: text(readAliased(row, "itemType"), { max: 160 }),
      unit: text(readAliased(row, "unit"), { max: 160 }),
      price: text(readAliased(row, "price"), { max: 160 }) || "Sorğu əsasında",
      leadTime: text(readAliased(row, "time"), { max: 160 }),
      timeline: text(readAliased(row, "time"), { max: 160 }),
      delivery: text(readAliased(row, "time"), { max: 160 }),
      team: text(readAliased(row, "team"), { max: 160 }),
      operator: text(readAliased(row, "team"), { max: 160 }),
      capacity: text(readAliased(row, "extra"), { max: 200 }),
      idealFor: text(readAliased(row, "extra"), { max: 300 }),
      specs: splitList(readAliased(row, "specs")),
      includes: splitList(readAliased(row, "specs")),
      deliverables: splitList(readAliased(row, "deliverables"))
    }
  };
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, ["super_admin", "admin"]);
  if (req.method === "GET") {
    const limit = parseLimit(req.query.limit, 50, 200);
    const rows = await query(
      `SELECT id, import_type, filename, status, total_rows, valid_rows, imported_rows,
              error_rows, summary, error_report, created_at, completed_at
         FROM import_jobs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return sendJson(res, 200, { ok: true, data: rows });
  }

  assertMethod(req, ["POST"]);
  assertSameOrigin(req);
  const body = await readJson(req, 4_200_000);
  const importType = oneOf(body.importType, importTypes, "product", "İdxal tipi");
  const action = oneOf(body.action, ["validate", "commit"], "validate", "Əməliyyat");
  const filename = text(body.filename, { max: 240 }) || `${importType}.csv`;
  const jobId = `imp-${randomUUID()}`;
  await query(
    "INSERT INTO import_jobs (id, created_by, import_type, filename, status) VALUES ($1, $2, $3, $4, 'validating')",
    [jobId, user.id, importType, filename]
  );
  try {
    const rows = await decodeRows(body);
    if (!rows.length) throw new ApiError(400, "empty_import", "Faylda məlumat sətri tapılmadı.");
    const kind = importType === "product" ? "material" : importType;
    const categories = await loadCategoryMap(kind);
    const checked = rows.map((row, index) => importType === "product"
      ? productFromRow(row, index + 2, categories)
      : entityFromRow(row, index + 2, importType, categories));
    const valid = checked.filter((entry) => entry.item).map((entry) => entry.item);
    const errors = checked.filter((entry) => entry.errors).map((entry) => ({ row: entry.index, errors: entry.errors }));
    const summary = { importType, filename, total: rows.length, valid: valid.length, errors: errors.length };
    if (action === "validate") {
      await query(
        `UPDATE import_jobs SET status = 'validated', total_rows = $2, valid_rows = $3,
         error_rows = $4, summary = $5::jsonb, error_report = $6::jsonb, completed_at = now() WHERE id = $1`,
        [jobId, rows.length, valid.length, errors.length, JSON.stringify(summary), JSON.stringify(errors.slice(0, 200))]
      );
      return sendJson(res, 200, { ok: true, data: { jobId, ...summary, errors: errors.slice(0, 200), preview: valid.slice(0, 10) } });
    }
    if (errors.length && !body.allowPartial) {
      await query(
        `UPDATE import_jobs SET status = 'failed', total_rows = $2, valid_rows = $3,
         error_rows = $4, summary = $5::jsonb, error_report = $6::jsonb, completed_at = now() WHERE id = $1`,
        [jobId, rows.length, valid.length, errors.length, JSON.stringify(summary), JSON.stringify(errors.slice(0, 200))]
      );
      throw new ApiError(400, "import_validation_failed", "İdxalda səhv sətirlər var. Əvvəl onları düzəlt və ya qismən idxalı seç.", { errors: errors.slice(0, 50) });
    }
    await query("UPDATE import_jobs SET status = 'processing' WHERE id = $1", [jobId]);
    const imported = importType === "product"
      ? await upsertProducts(valid)
      : await upsertEntities(importType, valid);
    await query(
      `UPDATE import_jobs SET status = 'completed', total_rows = $2, valid_rows = $3,
       imported_rows = $4, error_rows = $5, summary = $6::jsonb,
       error_report = $7::jsonb, completed_at = now() WHERE id = $1`,
      [jobId, rows.length, valid.length, imported, errors.length, JSON.stringify({ ...summary, imported }), JSON.stringify(errors.slice(0, 200))]
    );
    await recordAudit({ actorId: user.id, action: "import", entityType: importType, entityId: jobId, details: { imported, errors: errors.length } });
    return sendJson(res, 201, { ok: true, data: { jobId, imported, errors: errors.slice(0, 200), ...summary } });
  } catch (error) {
    if (!(error instanceof ApiError && error.code === "import_validation_failed")) {
      await query(
        `UPDATE import_jobs SET status = 'failed', summary = $2::jsonb,
         error_report = $3::jsonb, completed_at = now() WHERE id = $1 AND status NOT IN ('completed', 'validated')`,
        [jobId, JSON.stringify({ message: error.message || "İdxal xətası" }), JSON.stringify([{ errors: [error.message || "İdxal xətası"] }])]
      ).catch(() => null);
    }
    throw error;
  }
});
