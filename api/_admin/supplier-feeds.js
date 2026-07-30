import { assertCriticalTwoFactor, requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { validatePublicUrl } from "../_lib/catalog-quality.js";
import {
  mapSupplierFeed,
  previewSupplierFeed,
  rollbackSupplierFeedRun,
  runSupplierFeed
} from "../_lib/supplier-feeds.js";
import {
  ApiError,
  assertMethod,
  assertSameOrigin,
  readJson,
  sendJson,
  withApiErrors
} from "../_lib/http.js";
import { entityId, oneOf, parseLimit, text } from "../_lib/validation.js";

const roles = ["super_admin", "admin", "supplier"];
const mappingKeys = new Set([
  "sku",
  "supplierSku",
  "price",
  "currency",
  "priceStatus",
  "stockQuantity",
  "minimumOrder",
  "leadTimeDays",
  "sourceUrl",
  "priceVerifiedAt"
]);

const supplierForUser = async (user, requestedSupplierId = "") => {
  if (user.role === "supplier") {
    if (!user.companyId) {
      throw new ApiError(409, "supplier_profile_required", "Hesaba bağlı təchizatçı profili tapılmadı.");
    }
    const rows = await query(
      "SELECT id, name FROM suppliers WHERE company_id = $1 AND status <> 'Arxiv' LIMIT 1",
      [user.companyId]
    );
    if (!rows[0]) {
      throw new ApiError(409, "supplier_profile_required", "Hesaba bağlı təchizatçı profili tapılmadı.");
    }
    return rows[0];
  }
  if (!requestedSupplierId) return null;
  const rows = await query(
    "SELECT id, name FROM suppliers WHERE id = $1 AND status <> 'Arxiv' LIMIT 1",
    [requestedSupplierId]
  );
  if (!rows[0]) throw new ApiError(404, "supplier_not_found", "Təchizatçı tapılmadı.");
  return rows[0];
};

const parseSchedule = (value, fallback = 1440) => {
  const result = value === "" || value === null || value === undefined
    ? fallback
    : Number.parseInt(String(value), 10);
  if (!Number.isFinite(result) || result < 60 || result > 43_200) {
    throw new ApiError(400, "validation_error", "Sinxronizasiya intervalı 60-43200 dəqiqə aralığında olmalıdır.");
  }
  return result;
};

const normalizeMapping = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => mappingKeys.has(key))
    .map(([key, column]) => [key, text(column, { max: 80 })])
    .filter(([, column]) => column));
};

const normalizeFeed = async (body, fallback = {}) => {
  const endpointUrl = text(body.endpointUrl ?? fallback.endpointUrl, {
    field: "Feed URL-i",
    required: true,
    max: 2_000
  });
  const checkedUrl = await validatePublicUrl(endpointUrl);
  if (!checkedUrl.ok) {
    throw new ApiError(400, "feed_url_invalid", checkedUrl.reason);
  }
  const sensitiveQuery = [...checkedUrl.url.searchParams.keys()].some((key) =>
    /token|secret|password|passwd|api.?key|auth/i.test(key)
  );
  if (sensitiveQuery) {
    throw new ApiError(
      400,
      "feed_url_secret_rejected",
      "Giriş sirrini URL-də saxlama; environment dəyişəni sahəsindən istifadə et."
    );
  }
  const authEnvKey = text(body.authEnvKey ?? fallback.authEnvKey, { max: 90 });
  if (authEnvKey && !/^[A-Z][A-Z0-9_]{2,89}$/.test(authEnvKey)) {
    throw new ApiError(
      400,
      "validation_error",
      "Giriş açarı yalnız böyük hərf, rəqəm və alt xətdən ibarət environment dəyişəni olmalıdır."
    );
  }
  return {
    id: entityId(body.id || fallback.id, "sfd"),
    supplierId: text(body.supplierId ?? fallback.supplierId, {
      field: "Təchizatçı",
      required: true,
      max: 160
    }),
    name: text(body.name ?? fallback.name, { field: "Feed adı", required: true, max: 160 }),
    endpointUrl: checkedUrl.url.toString(),
    format: oneOf(body.format ?? fallback.format, ["csv", "json"], "csv", "Feed formatı"),
    authEnvKey,
    mapping: normalizeMapping(body.mapping ?? fallback.mapping),
    scheduleMinutes: parseSchedule(body.scheduleMinutes, fallback.scheduleMinutes || 1440),
    active: body.active === undefined
      ? fallback.active !== false
      : body.active !== false && String(body.active) !== "false"
  };
};

const loadFeed = async (id, supplierId = "") => {
  const rows = await query(
    `SELECT feed.*, supplier.name AS supplier_name
       FROM supplier_feeds feed
       JOIN suppliers supplier ON supplier.id = feed.supplier_id
      WHERE feed.id = $1 ${supplierId ? "AND feed.supplier_id = $2" : ""}
      LIMIT 1`,
    supplierId ? [id, supplierId] : [id]
  );
  return rows[0] || null;
};

const mapRun = (row) => ({
  id: row.id,
  feedId: row.feed_id,
  feedName: row.feed_name || "",
  status: row.status,
  totalRows: Number(row.total_rows),
  matchedRows: Number(row.matched_rows),
  updatedRows: Number(row.updated_rows),
  skippedRows: Number(row.skipped_rows),
  summary: row.summary || {},
  error: row.error_text || "",
  rollbackStatus: row.rollback_status || "unavailable",
  rolledBackAt: row.rolled_back_at,
  startedAt: row.started_at,
  completedAt: row.completed_at
});

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, roles);
  const requestedSupplierId = text(req.query?.supplierId, { max: 160 });
  const scopedSupplier = await supplierForUser(user, requestedSupplierId);

  if (req.method === "GET") {
    const values = [];
    const where = ["feed.active = true"];
    if (scopedSupplier) {
      values.push(scopedSupplier.id);
      where.push(`feed.supplier_id = $${values.length}`);
    }
    values.push(parseLimit(req.query.limit, 100, 500));
    const feeds = await query(
      `SELECT feed.*, supplier.name AS supplier_name
         FROM supplier_feeds feed
         JOIN suppliers supplier ON supplier.id = feed.supplier_id
        WHERE ${where.join(" AND ")}
        ORDER BY feed.updated_at DESC
        LIMIT $${values.length}`,
      values
    );
    const feedIds = feeds.map((feed) => feed.id);
    const runs = feedIds.length ? await query(
      `SELECT run.*, feed.name AS feed_name
         FROM supplier_feed_runs run
         JOIN supplier_feeds feed ON feed.id = run.feed_id
        WHERE run.feed_id = ANY($1::text[])
        ORDER BY run.started_at DESC
        LIMIT 100`,
      [feedIds]
    ) : [];
    return sendJson(res, 200, {
      ok: true,
      data: {
        feeds: feeds.map(mapSupplierFeed),
        runs: runs.map(mapRun),
        supplier: scopedSupplier || null
      }
    });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const body = await readJson(req, 50_000);
  if (!(req.method === "POST" && body.action === "preview")) {
    assertCriticalTwoFactor(user);
  }

  if (req.method === "POST" && ["run", "preview"].includes(body.action)) {
    const id = text(body.id, { field: "Feed ID-si", required: true, max: 160 });
    const feed = await loadFeed(id, scopedSupplier?.id || "");
    if (!feed) throw new ApiError(404, "supplier_feed_not_found", "Feed tapılmadı.");
    const result = body.action === "preview"
      ? await previewSupplierFeed(feed)
      : await runSupplierFeed(feed);
    await recordAudit({
      actorId: user.id,
      action: body.action,
      entityType: "supplier_feed",
      entityId: id,
      details: result
    });
    return sendJson(res, 200, { ok: true, data: result });
  }

  if (req.method === "POST" && body.action === "rollback") {
    const runId = text(body.runId, { field: "Feed işi", required: true, max: 160 });
    const rows = await query(
      `SELECT run.id
         FROM supplier_feed_runs run
         JOIN supplier_feeds feed ON feed.id = run.feed_id
        WHERE run.id = $1 ${scopedSupplier ? "AND feed.supplier_id = $2" : ""}
        LIMIT 1`,
      scopedSupplier ? [runId, scopedSupplier.id] : [runId]
    );
    if (!rows[0]) throw new ApiError(404, "supplier_feed_run_not_found", "Feed işi tapılmadı.");
    const result = await rollbackSupplierFeedRun(runId, user.id);
    await recordAudit({
      actorId: user.id,
      action: "rollback",
      entityType: "supplier_feed_run",
      entityId: runId,
      details: result
    });
    return sendJson(res, 200, { ok: true, data: result });
  }

  if (req.method === "DELETE") {
    const id = text(body.id || req.query.id, { field: "Feed ID-si", required: true, max: 160 });
    const rows = await query(
      `UPDATE supplier_feeds
          SET active = false, updated_at = now()
        WHERE id = $1 ${scopedSupplier ? "AND supplier_id = $2" : ""}
        RETURNING id`,
      scopedSupplier ? [id, scopedSupplier.id] : [id]
    );
    if (!rows[0]) throw new ApiError(404, "supplier_feed_not_found", "Feed tapılmadı.");
    await recordAudit({ actorId: user.id, action: "archive", entityType: "supplier_feed", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, active: false } });
  }

  let source = body;
  if (req.method === "PATCH") {
    const id = text(body.id || req.query.id, { field: "Feed ID-si", required: true, max: 160 });
    const existing = await loadFeed(id, scopedSupplier?.id || "");
    if (!existing) throw new ApiError(404, "supplier_feed_not_found", "Feed tapılmadı.");
    source = {
      id,
      supplierId: existing.supplier_id,
      name: existing.name,
      endpointUrl: existing.endpoint_url,
      format: existing.feed_format,
      authEnvKey: existing.auth_env_key,
      mapping: existing.mapping,
      scheduleMinutes: existing.schedule_minutes,
      active: existing.active,
      ...body
    };
  }
  if (scopedSupplier) source = { ...source, supplierId: scopedSupplier.id };
  const feed = await normalizeFeed(source);
  await supplierForUser({ ...user, role: "admin" }, feed.supplierId);
  const duplicates = await query(
    `SELECT id FROM supplier_feeds
      WHERE supplier_id = $1 AND endpoint_url = $2 AND id <> $3
      LIMIT 1`,
    [feed.supplierId, feed.endpointUrl, feed.id]
  );
  if (duplicates[0]) {
    throw new ApiError(409, "supplier_feed_duplicate", "Bu təchizatçı üçün eyni feed URL-i artıq mövcuddur.");
  }
  const rows = await query(
    `INSERT INTO supplier_feeds (
       id, supplier_id, name, endpoint_url, feed_format, auth_env_key,
       mapping, schedule_minutes, active, next_run_at, created_by, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, now(), $10, now()
     )
     ON CONFLICT (id) DO UPDATE SET
       supplier_id = EXCLUDED.supplier_id,
       name = EXCLUDED.name,
       endpoint_url = EXCLUDED.endpoint_url,
       feed_format = EXCLUDED.feed_format,
       auth_env_key = EXCLUDED.auth_env_key,
       mapping = EXCLUDED.mapping,
       schedule_minutes = EXCLUDED.schedule_minutes,
       active = EXCLUDED.active,
       next_run_at = LEAST(supplier_feeds.next_run_at, now()),
       updated_at = now()
     RETURNING *`,
    [
      feed.id,
      feed.supplierId,
      feed.name,
      feed.endpointUrl,
      feed.format,
      feed.authEnvKey || null,
      JSON.stringify(feed.mapping),
      feed.scheduleMinutes,
      feed.active,
      user.id
    ]
  );
  await recordAudit({
    actorId: user.id,
    action: req.method === "POST" ? "create" : "update",
    entityType: "supplier_feed",
    entityId: feed.id,
    details: { supplierId: feed.supplierId, format: feed.format, scheduleMinutes: feed.scheduleMinutes }
  });
  return sendJson(res, req.method === "POST" ? 201 : 200, {
    ok: true,
    data: mapSupplierFeed({ ...rows[0], supplier_name: scopedSupplier?.name || "" })
  });
});
