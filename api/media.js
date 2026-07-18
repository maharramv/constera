import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { requireRole } from "./_lib/auth.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { oneOf, parseLimit, text } from "./_lib/validation.js";

const entityTypes = ["product", "supplier", "service", "package", "rental", "general"];
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"]);

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
  status: row.status,
  createdAt: row.created_at
});

const safeFilename = (value) => text(value, { field: "Fayl adı", required: true, max: 180 })
  .normalize("NFKD")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "") || "media";

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

  assertMethod(req, ["POST", "DELETE"]);
  assertSameOrigin(req);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiError(503, "blob_not_configured", "Vercel Blob hələ layihəyə qoşulmayıb.");
  }
  const body = await readJson(req, 4_200_000);

  if (req.method === "DELETE") {
    const id = text(body.id || req.query.id, { field: "Media ID-si", required: true, max: 160 });
    const rows = await query("SELECT * FROM media_assets WHERE id = $1 AND status = 'active' LIMIT 1", [id]);
    const item = rows[0];
    if (!item) throw new ApiError(404, "media_not_found", "Media faylı tapılmadı.");
    if (!privileged && item.owner_id !== user.id) throw new ApiError(403, "permission_denied", "Bu faylı silmək icazəsi yoxdur.");
    await del(item.url);
    await query("UPDATE media_assets SET status = 'archived' WHERE id = $1", [id]);
    await recordAudit({ actorId: user.id, action: "archive", entityType: "media", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, status: "archived" } });
  }

  const filename = safeFilename(body.filename);
  const contentType = oneOf(body.contentType, [...allowedTypes], "image/webp", "Fayl tipi");
  const encoded = text(body.fileBase64, { field: "Fayl", required: true, max: 4_000_000 });
  const buffer = Buffer.from(encoded.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!buffer.length || buffer.length > 3_000_000) throw new ApiError(413, "file_too_large", "Media faylı maksimum 3 MB ola bilər.");
  if (!hasExpectedSignature(buffer, contentType)) {
    throw new ApiError(400, "invalid_file_signature", "Faylın məzmunu seçilmiş formata uyğun deyil.");
  }
  const entityType = oneOf(body.entityType, entityTypes, "general", "Media tipi");
  const entityIdValue = text(body.entityId, { max: 160 }) || null;
  const folder = entityIdValue ? `${entityType}/${safePathSegment(entityIdValue) || "general"}` : entityType;
  const blob = await put(`constera/${folder}/${filename}`, buffer, {
    access: "public",
    addRandomSuffix: true,
    contentType
  });
  const id = `med-${randomUUID()}`;
  const rows = await query(
    `INSERT INTO media_assets (
       id, owner_id, entity_type, entity_id, filename, pathname, url, content_type, size_bytes, alt_text
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id, user.id, entityType, entityIdValue, filename, blob.pathname, blob.url,
      contentType, buffer.length, text(body.altText, { max: 240 }) || null
    ]
  );
  await recordAudit({ actorId: user.id, action: "upload", entityType: "media", entityId: id, details: { entityType, entityId: entityIdValue } });
  return sendJson(res, 201, { ok: true, data: mapMedia(rows[0]) });
});
