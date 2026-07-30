import { assertCriticalTwoFactor, requireRole } from "../_lib/auth.js";
import {
  normalizeCatalogAttributes,
  previewCatalogRemediation,
  previewCatalogAttributeNormalization,
  remediateCatalogIssues,
  runCatalogQualityScan
} from "../_lib/catalog-quality.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { oneOf, parseLimit, text } from "../_lib/validation.js";

const loadQualityCenter = async (limit = 200) => {
  const [summaryRows, issueRows, runRows] = await Promise.all([
    query(
      `SELECT
        count(*) FILTER (WHERE status = 'open')::int AS open,
        count(*) FILTER (WHERE status = 'open' AND severity = 'critical')::int AS critical,
        count(*) FILTER (WHERE status = 'open' AND severity = 'high')::int AS high,
        count(*) FILTER (WHERE status = 'ignored')::int AS ignored,
        count(*) FILTER (WHERE status = 'resolved' AND resolved_at > now() - interval '30 days')::int AS resolved_30_days
       FROM catalog_quality_issues`
    ),
    query(
      `SELECT issue.*, product.sku, product.name AS product_name,
              offer.product_id AS offer_product_id, offer.supplier_id,
              supplier.name AS supplier_name
         FROM catalog_quality_issues issue
         LEFT JOIN products product
           ON issue.entity_type = 'product' AND product.id = issue.entity_id
         LEFT JOIN product_offers offer
           ON issue.entity_type = 'product_offer' AND offer.id = issue.entity_id
         LEFT JOIN suppliers supplier ON supplier.id = offer.supplier_id
        WHERE issue.status IN ('open', 'ignored')
        ORDER BY
          CASE issue.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
          issue.last_seen_at DESC
        LIMIT $1`,
      [limit]
    ),
    query("SELECT * FROM catalog_quality_runs ORDER BY started_at DESC LIMIT 12")
  ]);
  const summary = summaryRows[0] || {};
  return {
    summary: {
      open: Number(summary.open || 0),
      critical: Number(summary.critical || 0),
      high: Number(summary.high || 0),
      ignored: Number(summary.ignored || 0),
      resolved30Days: Number(summary.resolved_30_days || 0)
    },
    issues: issueRows.map((item) => ({
      id: item.id,
      entityType: item.entity_type,
      entityId: item.entity_id,
      productId: item.entity_type === "product" ? item.entity_id : item.offer_product_id,
      sku: item.sku || "",
      productName: item.product_name || "",
      supplierId: item.supplier_id || null,
      supplierName: item.supplier_name || "",
      type: item.issue_type,
      severity: item.severity,
      detail: item.detail,
      status: item.status,
      firstSeenAt: item.first_seen_at,
      lastSeenAt: item.last_seen_at,
      lastCheckedAt: item.last_checked_at
    })),
    runs: runRows.map((item) => ({
      id: item.id,
      status: item.status,
      scannedProducts: Number(item.scanned_products),
      scannedOffers: Number(item.scanned_offers),
      openIssues: Number(item.open_issues),
      resolvedIssues: Number(item.resolved_issues),
      probedUrls: Number(item.probed_urls),
      summary: item.summary || {},
      error: item.error_text || "",
      startedAt: item.started_at,
      completedAt: item.completed_at
    }))
  };
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, ["super_admin", "admin", "sales"]);
  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, data: await loadQualityCenter(parseLimit(req.query.limit, 200, 500)) });
  }
  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 20_000);
  if (req.method === "POST") {
    const action = text(body.action, { max: 80 }) || "scan";
    if (action === "preview-remediation") {
      const issueIds = Array.isArray(body.issueIds) ? body.issueIds.map((id) => text(id, { max: 160 })).filter(Boolean) : [];
      return sendJson(res, 200, { ok: true, data: await previewCatalogRemediation(issueIds) });
    }
    if (action === "preview-attributes") {
      return sendJson(res, 200, { ok: true, data: await previewCatalogAttributeNormalization() });
    }
    if (action === "normalize-attributes") {
      if (!["super_admin", "admin"].includes(user.role)) {
        throw new ApiError(403, "permission_denied", "Atributları yalnız administrator standartlaşdıra bilər.");
      }
      assertCriticalTwoFactor(user);
      const result = await normalizeCatalogAttributes({ actorId: user.id });
      await recordAudit({
        actorId: user.id,
        action: "normalize_attributes",
        entityType: "catalog_quality",
        details: result
      });
      return sendJson(res, 200, { ok: true, data: result });
    }
    if (action === "remediate") {
      if (!["super_admin", "admin"].includes(user.role)) {
        throw new ApiError(403, "permission_denied", "Avtomatik düzəlişi yalnız administrator icra edə bilər.");
      }
      assertCriticalTwoFactor(user);
      const issueIds = Array.isArray(body.issueIds) ? body.issueIds.map((id) => text(id, { max: 160 })).filter(Boolean) : [];
      const result = await remediateCatalogIssues({ issueIds, actorId: user.id });
      await recordAudit({
        actorId: user.id,
        action: "remediate",
        entityType: "catalog_quality",
        details: result
      });
      return sendJson(res, 200, { ok: true, data: { remediation: result, center: await loadQualityCenter(200) } });
    }
    if (action !== "scan") throw new ApiError(400, "unknown_action", "Keyfiyyət əməliyyatı tanınmadı.");
    const result = await runCatalogQualityScan({
      probeLinks: body.probeLinks !== false,
      linkLimit: Math.max(0, Math.min(Number(body.linkLimit) || 12, 20))
    });
    await recordAudit({ actorId: user.id, action: "scan", entityType: "catalog_quality", entityId: result.id, details: result });
    return sendJson(res, 200, { ok: true, data: { scan: result, center: await loadQualityCenter(200) } });
  }
  if (!["super_admin", "admin"].includes(user.role)) {
    throw new ApiError(403, "permission_denied", "Keyfiyyət probleminin vəziyyətini yalnız administrator dəyişə bilər.");
  }
  const id = text(body.id, { field: "Problem ID-si", required: true, max: 160 });
  const action = oneOf(body.action, ["ignore", "reopen", "resolve"], "resolve", "Keyfiyyət əməliyyatı");
  const status = action === "ignore" ? "ignored" : action === "reopen" ? "open" : "resolved";
  const rows = await query(
    `UPDATE catalog_quality_issues
        SET status = $2,
            resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE NULL END,
            last_checked_at = now()
      WHERE id = $1 RETURNING id`,
    [id, status]
  );
  if (!rows[0]) throw new ApiError(404, "quality_issue_not_found", "Keyfiyyət problemi tapılmadı.");
  await recordAudit({ actorId: user.id, action, entityType: "catalog_quality_issue", entityId: id });
  return sendJson(res, 200, { ok: true, data: await loadQualityCenter(200) });
});
