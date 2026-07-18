import { requireRole } from "./_lib/auth.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { entityId, safeUrl, text } from "./_lib/validation.js";

const mapSupplier = (row) => ({
  id: row.id,
  name: row.name,
  type: row.supplier_type,
  focus: row.focus || "",
  website: row.website || "",
  status: row.status,
  region: row.region,
  contact: row.contact || "",
  rating: row.rating || "Yeni",
  responseTime: row.response_time || "Sorğu əsasında"
});

const normalizeSupplier = (body) => ({
  id: entityId(body.id, "supplier"),
  name: text(body.name, { field: "Təchizatçı adı", required: true, max: 200 }),
  type: text(body.type, { field: "Təchizatçı tipi", max: 120 }) || "Təchizatçı",
  focus: text(body.focus, { field: "İxtisaslaşma", max: 600 }),
  website: safeUrl(body.website, "Sayt URL-i"),
  status: text(body.status, { field: "Status", max: 80 }) || "Aktiv",
  region: text(body.region, { field: "Region", max: 160 }) || "Azərbaycan",
  contact: text(body.contact, { field: "Əlaqə", max: 300 }),
  rating: text(body.rating, { field: "Reytinq", max: 80 }) || "Yeni",
  responseTime: text(body.responseTime, { field: "Cavab müddəti", max: 160 }) || "Sorğu əsasında"
});

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const rows = await query(
      "SELECT id, name, supplier_type, focus, website, status, region, contact, rating, response_time FROM suppliers WHERE status <> 'Arxiv' ORDER BY name"
    );
    return sendJson(res, 200, { ok: true, data: rows.map(mapSupplier) });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const user = await requireRole(req, ["super_admin", "admin"]);
  const body = await readJson(req, 40_000);
  if (req.method === "DELETE") {
    const id = text(body.id || req.query.id, { field: "Təchizatçı ID-si", required: true, max: 160 });
    const rows = await query("UPDATE suppliers SET status = 'Arxiv', updated_at = now() WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) throw new ApiError(404, "supplier_not_found", "Təchizatçı tapılmadı.");
    await recordAudit({ actorId: user.id, action: "archive", entityType: "supplier", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, status: "Arxiv" } });
  }

  const item = normalizeSupplier(body);
  const rows = await query(
    `INSERT INTO suppliers (id, name, supplier_type, focus, website, status, region, contact, rating, response_time, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, supplier_type = EXCLUDED.supplier_type, focus = EXCLUDED.focus,
       website = EXCLUDED.website, status = EXCLUDED.status, region = EXCLUDED.region,
       contact = EXCLUDED.contact, rating = EXCLUDED.rating, response_time = EXCLUDED.response_time, updated_at = now()
     RETURNING id, name, supplier_type, focus, website, status, region, contact, rating, response_time`,
    [item.id, item.name, item.type, item.focus || null, item.website || null, item.status, item.region, item.contact || null, item.rating, item.responseTime]
  );
  await recordAudit({ actorId: user.id, action: req.method === "POST" ? "create" : "update", entityType: "supplier", entityId: item.id });
  return sendJson(res, req.method === "POST" ? 201 : 200, { ok: true, data: mapSupplier(rows[0]) });
});
