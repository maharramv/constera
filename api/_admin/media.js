import { createHash, randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { oneOf, parseLimit, text } from "../_lib/validation.js";

const entityTypes = ["product", "supplier", "service", "package", "rental", "general"];
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"]);
const licenseTypes = ["own", "supplier", "official", "licensed", "unspecified"];

export const hasExpectedSignature = (buffer, contentType) => {
  if (contentType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (contentType === "image/avif") {
    const brands = buffer.subarray(8, 40).toString("ascii");
    return buffer.subarray(4, 8).toString("ascii") === "ftyp" && /avif|avis/.test(brands);
  }
  if (contentType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  return false;
};

const safePathSegment = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[^a-zA-Z0-9._:-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 160);

const mapMedia = (row) => ({
  id: row.id,
  ownerId: row.owner_id,
  entityType: row.entity_type,
  entityId: row.entity_id || null,
  filename: row.filename,
  pathname: row.pathname,
  url: row.url,
  contentType: row.content_type,
  sizeBytes: row.size_bytes,
  altText: row.alt_text || "",
  sourceUrl: row.source_url || "",
  licenseType: row.license_type || "unspecified",
  licenseNote: row.license_note || "",
  checksum: row.checksum_sha256 || "",
  isPrimary: Boolean(row.is_primary),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at || row.created_at
});

const safeFilename = (value) => text(value, { field: "Fayl adı", required: true, max: 180 })
  .normalize("NFKD")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "") || "media";

const optionalHttpsUrl = (value) => {
  const source = text(value, { max: 2_000 });
  if (!source) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw new ApiError(400, "invalid_media_source", "Media mənbəyi təhlükəsiz HTTPS ünvanı olmalıdır.");
  }
};

const assertSupplierMediaScope = async (user, entityType, entityId) => {
  if (user.role !== "supplier") return;
  if (entityType === "general" && !entityId) return;
  if (!user.companyId || !entityId || !["product", "supplier"].includes(entityType)) {
    throw new ApiError(403, "media_scope_denied", "Media yalnız öz təchizatçı profilinə və məhsullarına bağlana bilər.");
  }
  const rows = entityType === "supplier"
    ? await query(
      "SELECT id FROM suppliers WHERE id = $1 AND company_id = $2 AND status <> 'Arxiv' LIMIT 1",
      [entityId, user.companyId]
    )
    : await query(
      `SELECT product.id
         FROM products product
         JOIN suppliers supplier ON supplier.id = product.supplier_id
        WHERE product.id = $1 AND supplier.company_id = $2
          AND product.status <> 'archived'
        LIMIT 1`,
      [entityId, user.companyId]
    );
  if (!rows[0]) {
    throw new ApiError(403, "media_scope_denied", "Bu qeyd təchizatçı hesabına aid deyil.");
  }
};

const updateEntityImage = async ({ entityType, entityId, url }) => {
  if (!entityId || !url) return;
  if (entityType === "product") {
    await query("UPDATE products SET image_url = $2, updated_at = now() WHERE id = $1", [entityId, url]);
  } else if (["service", "package", "rental"].includes(entityType)) {
    await query(
      `UPDATE marketplace_entities
          SET extra_data = jsonb_set(COALESCE(extra_data, '{}'::jsonb), '{image}', to_jsonb($2::text), true),
              updated_at = now()
        WHERE id = $1 AND entity_kind = $3`,
      [entityId, url, entityType]
    );
  }
};

const markPrimary = async ({ id, entityType, entityId, url }) => {
  if (!entityId) throw new ApiError(400, "media_entity_required", "Əsas şəkil üçün əlaqəli qeyd ID-si tələb olunur.");
  await query(
    `UPDATE media_assets
        SET is_primary = false, updated_at = now()
      WHERE entity_type = $1 AND entity_id = $2 AND id <> $3 AND is_primary = true`,
    [entityType, entityId, id]
  );
  await query("UPDATE media_assets SET is_primary = true, updated_at = now() WHERE id = $1", [id]);
  await updateEntityImage({ entityType, entityId, url });
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, ["super_admin", "admin", "supplier"]);
  const privileged = ["super_admin", "admin"].includes(user.role);
  if (req.method === "GET") {
    const limit = parseLimit(req.query.limit, 100, 500);
    const entityType = text(req.query.entityType, { max: 40 });
    const entityId = text(req.query.entityId, { max: 160 });
    const values = [];
    const where = ["status = 'active'"];
    if (!privileged) {
      values.push(user.id);
      where.push(`owner_id = $${values.length}`);
    }
    if (entityType) {
      values.push(oneOf(entityType, entityTypes, "general", "Media tipi"));
      where.push(`entity_type = $${values.length}`);
    }
    if (entityId) {
      values.push(entityId);
      where.push(`entity_id = $${values.length}`);
    }
    values.push(limit);
    const rows = await query(
      `SELECT * FROM media_assets WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT $${values.length}`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows.map(mapMedia) });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const body = await readJson(req, 4_200_000);

  if (req.method === "DELETE") {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new ApiError(503, "blob_not_configured", "Vercel Blob hələ layihəyə qoşulmayıb.");
    }
    const id = text(body.id || req.query.id, { field: "Media ID-si", required: true, max: 160 });
    const rows = await query("SELECT * FROM media_assets WHERE id = $1 AND status = 'active' LIMIT 1", [id]);
    const item = rows[0];
    if (!item) throw new ApiError(404, "media_not_found", "Media faylı tapılmadı.");
    if (!privileged && item.owner_id !== user.id) throw new ApiError(403, "permission_denied", "Bu faylı silmək icazəsi yoxdur.");
    await assertSupplierMediaScope(user, item.entity_type, item.entity_id);
    await del(item.url);
    await query("UPDATE media_assets SET status = 'archived', is_primary = false, updated_at = now() WHERE id = $1", [id]);
    if (item.is_primary && item.entity_id) {
      const replacement = (await query(
        `SELECT * FROM media_assets
          WHERE entity_type = $1 AND entity_id = $2 AND status = 'active'
            AND content_type LIKE 'image/%'
          ORDER BY created_at DESC LIMIT 1`,
        [item.entity_type, item.entity_id]
      ))[0];
      if (replacement) {
        await markPrimary({
          id: replacement.id,
          entityType: replacement.entity_type,
          entityId: replacement.entity_id,
          url: replacement.url
        });
      } else if (item.entity_type === "product") {
        await query(
          "UPDATE products SET image_url = NULL, updated_at = now() WHERE id = $1 AND image_url = $2",
          [item.entity_id, item.url]
        );
      } else if (["service", "package", "rental"].includes(item.entity_type)) {
        await query(
          `UPDATE marketplace_entities
              SET extra_data = COALESCE(extra_data, '{}'::jsonb) - 'image', updated_at = now()
            WHERE id = $1 AND entity_kind = $2 AND extra_data->>'image' = $3`,
          [item.entity_id, item.entity_type, item.url]
        );
      }
    }
    await recordAudit({ actorId: user.id, action: "archive", entityType: "media", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, status: "archived" } });
  }

  if (req.method === "PATCH") {
    const id = text(body.id || req.query.id, { field: "Media ID-si", required: true, max: 160 });
    const current = (await query("SELECT * FROM media_assets WHERE id = $1 AND status = 'active' LIMIT 1", [id]))[0];
    if (!current) throw new ApiError(404, "media_not_found", "Media faylı tapılmadı.");
    if (!privileged && current.owner_id !== user.id) {
      throw new ApiError(403, "permission_denied", "Bu faylı yeniləmək icazəsi yoxdur.");
    }
    const entityType = oneOf(body.entityType ?? current.entity_type, entityTypes, "general", "Media tipi");
    const entityIdValue = text(body.entityId ?? current.entity_id, { max: 160 }) || null;
    const shouldRemainPrimary = body.isPrimary === undefined
      ? Boolean(current.is_primary)
      : body.isPrimary === true || String(body.isPrimary) === "true";
    await assertSupplierMediaScope(user, entityType, entityIdValue);
    if (shouldRemainPrimary && !current.content_type.startsWith("image/")) {
      throw new ApiError(400, "primary_media_must_be_image", "Yalnız şəkil əsas media seçilə bilər.");
    }
    const rows = await query(
      `UPDATE media_assets
          SET entity_type = $2, entity_id = $3, alt_text = $4,
              source_url = $5, license_type = $6, license_note = $7,
              is_primary = false, updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [
        id,
        entityType,
        entityIdValue,
        text(body.altText ?? current.alt_text, { max: 240 }) || null,
        optionalHttpsUrl(body.sourceUrl ?? current.source_url),
        oneOf(body.licenseType ?? current.license_type, licenseTypes, "unspecified", "İstifadə hüququ"),
        text(body.licenseNote ?? current.license_note, { max: 1_000 }) || null
      ]
    );
    if (shouldRemainPrimary) {
      await markPrimary({ id, entityType, entityId: entityIdValue, url: current.url });
      rows[0].is_primary = true;
    }
    await recordAudit({
      actorId: user.id,
      action: "update",
      entityType: "media",
      entityId: id,
      details: { entityType, entityId: entityIdValue, isPrimary: Boolean(rows[0].is_primary) }
    });
    return sendJson(res, 200, { ok: true, data: mapMedia(rows[0]) });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiError(503, "blob_not_configured", "Vercel Blob hələ layihəyə qoşulmayıb.");
  }
  const filename = safeFilename(body.filename);
  const contentType = oneOf(body.contentType, [...allowedTypes], "image/webp", "Fayl tipi");
  const encoded = text(body.fileBase64, { field: "Fayl", required: true, max: 4_000_000 });
  const buffer = Buffer.from(encoded.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!buffer.length || buffer.length > 3_000_000) throw new ApiError(413, "file_too_large", "Media faylı maksimum 3 MB ola bilər.");
  if (!hasExpectedSignature(buffer, contentType)) {
    throw new ApiError(400, "invalid_file_signature", "Faylın məzmunu seçilmiş formata uyğun deyil.");
  }
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const entityType = oneOf(body.entityType, entityTypes, "general", "Media tipi");
  const entityIdValue = text(body.entityId, { max: 160 }) || null;
  await assertSupplierMediaScope(user, entityType, entityIdValue);
  const duplicate = (await query(
    `SELECT * FROM media_assets
      WHERE checksum_sha256 = $1 AND entity_type = $2
        AND entity_id IS NOT DISTINCT FROM $3 AND status = 'active'
      LIMIT 1`,
    [checksum, entityType, entityIdValue]
  ))[0];
  if (duplicate) return sendJson(res, 200, { ok: true, data: mapMedia(duplicate), duplicate: true });
  const folder = entityIdValue ? `${entityType}/${safePathSegment(entityIdValue) || "general"}` : entityType;
  const blob = await put(`constera/${folder}/${filename}`, buffer, {
    access: "public",
    addRandomSuffix: true,
    contentType
  });
  const id = `med-${randomUUID()}`;
  const rows = await query(
    `INSERT INTO media_assets (
       id, owner_id, entity_type, entity_id, filename, pathname, url,
       content_type, size_bytes, alt_text, source_url, license_type,
       license_note, checksum_sha256, is_primary, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, false, now()
     )
     RETURNING *`,
    [
      id, user.id, entityType, entityIdValue, filename, blob.pathname, blob.url,
      contentType, buffer.length, text(body.altText, { max: 240 }) || null,
      optionalHttpsUrl(body.sourceUrl),
      oneOf(body.licenseType, licenseTypes, "unspecified", "İstifadə hüququ"),
      text(body.licenseNote, { max: 1_000 }) || null,
      checksum
    ]
  );
  if ((body.isPrimary === true || String(body.isPrimary) === "true") && contentType.startsWith("image/")) {
    await markPrimary({ id, entityType, entityId: entityIdValue, url: blob.url });
    rows[0].is_primary = true;
  }
  await recordAudit({ actorId: user.id, action: "upload", entityType: "media", entityId: id, details: { entityType, entityId: entityIdValue } });
  return sendJson(res, 201, { ok: true, data: mapMedia(rows[0]) });
});
