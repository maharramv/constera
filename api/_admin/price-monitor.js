import { assertCriticalTwoFactor, requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { remindDuePriceReviews, remindPriceReview, runPriceFreshnessScan } from "../_lib/price-monitor.js";
import { oneOf, text } from "../_lib/validation.js";

const loadMonitor = async () => {
  const [summaryRows, itemRows] = await Promise.all([
    query(
      `SELECT
        count(*) FILTER (WHERE status = 'pending')::int AS pending,
        count(*) FILTER (WHERE status = 'pending' AND due_at <= now())::int AS overdue,
        count(*) FILTER (
          WHERE status = 'pending' AND due_at > now() AND due_at <= now() + interval '7 days'
        )::int AS due_soon,
        count(*) FILTER (
          WHERE status = 'completed' AND completed_at >= now() - interval '30 days'
        )::int AS completed_30_days
       FROM price_review_requests`
    ),
    query(
      `SELECT request.id, request.product_id, request.supplier_id, request.status,
              request.reason, request.due_at, request.requested_at,
              request.last_reminded_at, request.reminder_count,
              product.sku, product.name, product.brand, product.price_text,
              product.price_status, product.price_verified_at,
              supplier.name AS supplier_name, supplier.contact AS supplier_contact
         FROM price_review_requests request
         JOIN products product ON product.id = request.product_id
         LEFT JOIN suppliers supplier ON supplier.id = request.supplier_id
        WHERE request.status = 'pending'
        ORDER BY request.due_at ASC, request.requested_at ASC
        LIMIT 200`
    )
  ]);
  const summary = summaryRows[0] || {};
  return {
    summary: {
      pending: Number(summary.pending || 0),
      overdue: Number(summary.overdue || 0),
      dueSoon: Number(summary.due_soon || 0),
      completed30Days: Number(summary.completed_30_days || 0)
    },
    items: itemRows.map((item) => ({
      id: item.id,
      productId: item.product_id,
      supplierId: item.supplier_id,
      sku: item.sku,
      name: item.name,
      brand: item.brand,
      price: item.price_text,
      priceStatus: item.price_status,
      priceVerifiedAt: item.price_verified_at,
      supplier: item.supplier_name || "Təchizatçı təyin edilməyib",
      supplierContact: item.supplier_contact || "",
      reason: item.reason,
      dueAt: item.due_at,
      requestedAt: item.requested_at,
      lastRemindedAt: item.last_reminded_at,
      reminderCount: Number(item.reminder_count || 0)
    })),
    generatedAt: new Date().toISOString()
  };
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, ["super_admin", "admin", "sales"]);
  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, data: await loadMonitor() });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 20_000);
  if (req.method === "POST") {
    if (!["super_admin", "admin"].includes(user.role)) {
      throw new ApiError(403, "permission_denied", "Qiymət statuslarını yalnız administrator yeniləyə bilər.");
    }
    assertCriticalTwoFactor(user);
    const action = oneOf(body.action, ["scan", "remind-due"], "scan", "Qiymət monitoru əməliyyatı");
    if (action === "remind-due") {
      const reminder = await remindDuePriceReviews();
      await recordAudit({ actorId: user.id, action: "remind_due", entityType: "price_monitor", details: reminder });
      return sendJson(res, 200, { ok: true, data: { reminder, monitor: await loadMonitor() } });
    }
    const result = await runPriceFreshnessScan({ actorId: user.id, notify: true });
    await recordAudit({ actorId: user.id, action: "scan", entityType: "price_monitor", details: result });
    return sendJson(res, 200, { ok: true, data: { scan: result, monitor: await loadMonitor() } });
  }

  const id = text(body.id, { field: "Qiymət yoxlama ID-si", required: true, max: 160 });
  const action = oneOf(body.action, ["remind", "cancel"], "remind", "Qiymət nəzarəti əməliyyatı");
  if (action === "cancel") {
    if (!["super_admin", "admin"].includes(user.role)) {
      throw new ApiError(403, "permission_denied", "Qiymət yoxlamasını yalnız administrator ləğv edə bilər.");
    }
    assertCriticalTwoFactor(user);
    const rows = await query(
      `UPDATE price_review_requests
          SET status = 'cancelled', note = $2, updated_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING id`,
      [id, text(body.note, { max: 1_000 }) || "Administrator tərəfindən ləğv edildi"]
    );
    if (!rows[0]) throw new ApiError(404, "price_review_not_found", "Aktiv qiymət yoxlaması tapılmadı.");
    await recordAudit({ actorId: user.id, action: "cancel", entityType: "price_review", entityId: id });
  } else {
    const result = await remindPriceReview(id);
    if (!result) throw new ApiError(404, "price_review_not_found", "Aktiv qiymət yoxlaması tapılmadı.");
    await recordAudit({
      actorId: user.id,
      action: "remind",
      entityType: "price_review",
      entityId: id,
      details: { notifiedUsers: result.notifiedUsers }
    });
  }
  return sendJson(res, 200, { ok: true, data: await loadMonitor() });
});
