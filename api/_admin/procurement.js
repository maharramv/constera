import { randomUUID } from "node:crypto";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { mapProcurementRequest, readProcurementRequest } from "../_lib/procurement.js";
import { oneOf, parseLimit, parsePriceAmount, text } from "../_lib/validation.js";

const allowedRoles = ["super_admin", "admin", "sales", "customer"];
const privilegedRoles = ["super_admin", "admin", "sales"];

const canAccess = (user, row) => privilegedRoles.includes(user.role)
  || (user.role === "customer" && (
    row.requested_by === user.id
    || (user.companyId && row.company_id === user.companyId)
  ));

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const user = await requireRole(req, allowedRoles);
    const orderId = text(req.query.orderId, { max: 160 });
    if (orderId) {
      const request = await readProcurementRequest(orderId);
      if (!request) return sendJson(res, 200, { ok: true, data: null });
      if (!canAccess(user, {
        requested_by: request.requestedBy,
        company_id: request.companyId
      })) throw new ApiError(403, "forbidden", "Bu təsdiq sorğusuna giriş yoxdur.");
      return sendJson(res, 200, { ok: true, data: request });
    }
    const values = [];
    const where = [];
    if (!privilegedRoles.includes(user.role)) {
      if (user.companyId) {
        values.push(user.id, user.companyId);
        where.push(`(request.requested_by = $1 OR request.company_id = $2)`);
      } else {
        values.push(user.id);
        where.push(`request.requested_by = $1`);
      }
    }
    values.push(parseLimit(req.query.limit, 200, 500));
    const rows = await query(
      `SELECT request.*, orders.order_number, requester.name AS requester_name,
              company.name AS company_name,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', decision.id, 'actorId', decision.actor_id,
                  'actorName', actor.name, 'decision', decision.decision,
                  'note', decision.note, 'createdAt', decision.created_at
                ) ORDER BY decision.created_at)
                FROM procurement_decisions decision
                JOIN users actor ON actor.id = decision.actor_id
                WHERE decision.request_id = request.id
              ), '[]'::json) AS decisions
         FROM procurement_requests request
         JOIN orders ON orders.id = request.order_id
         LEFT JOIN users requester ON requester.id = request.requested_by
         LEFT JOIN companies company ON company.id = request.company_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY CASE request.status WHEN 'pending' THEN 0 ELSE 1 END, request.created_at DESC
        LIMIT $${values.length}`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows.map(mapProcurementRequest) });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const user = await requireRole(req, allowedRoles);
  const body = await readJson(req, 40_000);
  const action = text(body.action, { max: 80 }) || (req.method === "POST" ? "request" : "decide");

  if (action === "request") {
    const orderId = text(body.orderId, { field: "Sifariş ID-si", required: true, max: 160 });
    const orderRows = await query(
      `SELECT orders.*, customer.company_id AS customer_company_id
         FROM orders
         LEFT JOIN users customer ON customer.id = orders.customer_id
        WHERE orders.id = $1
        LIMIT 1`,
      [orderId]
    );
    const order = orderRows[0];
    if (!order) throw new ApiError(404, "order_not_found", "Sifariş tapılmadı.");
    if (!privilegedRoles.includes(user.role) && order.customer_id !== user.id) {
      throw new ApiError(403, "forbidden", "Bu sifariş üçün təsdiq sorğusu yarada bilməzsən.");
    }
    if (["completed", "cancelled"].includes(order.status)) {
      throw new ApiError(409, "order_not_approvable", "Tamamlanmış və ya ləğv edilmiş sifariş təsdiqə göndərilə bilməz.");
    }
    const requiredApprovals = Math.max(1, Math.min(Number.parseInt(String(body.requiredApprovals || 1), 10) || 1, 5));
    const budgetAmount = body.budgetAmount === "" || body.budgetAmount === null || body.budgetAmount === undefined
      ? null
      : parsePriceAmount(body.budgetAmount);
    if (body.budgetAmount !== "" && body.budgetAmount !== null && body.budgetAmount !== undefined && budgetAmount === null) {
      throw new ApiError(400, "validation_error", "Büdcə məbləği düzgün deyil.");
    }
    const requestId = `pcr-${randomUUID()}`;
    try {
      await query(
        `WITH created AS (
           INSERT INTO procurement_requests (
             id, order_id, requested_by, company_id, required_approvals,
             budget_amount, cost_center, note
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING order_id
         )
         UPDATE orders
            SET approval_status = 'pending', updated_at = now()
          WHERE id = (SELECT order_id FROM created)`,
        [
          requestId, orderId, user.id, order.customer_company_id || user.companyId || null,
          requiredApprovals, budgetAmount, text(body.costCenter, { max: 160 }) || null,
          text(body.note, { max: 1_000 }) || null
        ]
      );
    } catch (error) {
      if (error?.code === "23505") {
        throw new ApiError(409, "procurement_request_exists", "Bu sifariş üçün təsdiq sorğusu artıq mövcuddur.");
      }
      throw error;
    }
    await recordAudit({ actorId: user.id, action: "request", entityType: "procurement", entityId: requestId, details: { orderId } });
    return sendJson(res, 201, { ok: true, data: await readProcurementRequest(orderId) });
  }

  const requestId = text(body.id || req.query.id, { field: "Təsdiq sorğusu ID-si", required: true, max: 160 });
  const requestRows = await query(
    `SELECT request.*, orders.customer_id, orders.order_number
       FROM procurement_requests request
       JOIN orders ON orders.id = request.order_id
      WHERE request.id = $1
      LIMIT 1`,
    [requestId]
  );
  const request = requestRows[0];
  if (!request) throw new ApiError(404, "procurement_request_not_found", "Təsdiq sorğusu tapılmadı.");
  if (!canAccess(user, request)) throw new ApiError(403, "forbidden", "Bu təsdiq sorğusuna giriş yoxdur.");

  if (action === "cancel") {
    if (!privilegedRoles.includes(user.role) && request.requested_by !== user.id) {
      throw new ApiError(403, "forbidden", "Sorğunu yalnız yaradan istifadəçi ləğv edə bilər.");
    }
    if (request.status !== "pending") throw new ApiError(409, "procurement_closed", "Bu təsdiq sorğusu artıq bağlanıb.");
    await query(
      `WITH cancelled AS (
         UPDATE procurement_requests
            SET status = 'cancelled', decided_at = now(), updated_at = now()
          WHERE id = $1
          RETURNING order_id
       )
       UPDATE orders
          SET approval_status = 'not_required', updated_at = now()
        WHERE id = (SELECT order_id FROM cancelled)`,
      [requestId]
    );
    await recordAudit({ actorId: user.id, action: "cancel", entityType: "procurement", entityId: requestId });
    return sendJson(res, 200, { ok: true, data: await readProcurementRequest(request.order_id) });
  }

  if (request.status !== "pending") throw new ApiError(409, "procurement_closed", "Bu təsdiq sorğusu artıq bağlanıb.");
  if (request.requested_by === user.id && user.role !== "super_admin") {
    throw new ApiError(409, "self_approval_forbidden", "Satınalma sorğusunu yaradan şəxs özü təsdiqləyə bilməz.");
  }
  const decision = oneOf(body.decision, ["approved", "rejected"], "approved", "Qərar");
  try {
    await query(
      `INSERT INTO procurement_decisions (id, request_id, actor_id, decision, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        `pcd-${randomUUID()}`, requestId, user.id, decision,
        text(body.note, { max: 1_000 }) || null
      ]
    );
  } catch (error) {
    if (error?.code === "23505") {
      throw new ApiError(409, "procurement_already_decided", "Bu sorğu üzrə qərarını artıq vermisən.");
    }
    throw error;
  }
  const countRows = await query(
    `SELECT
       count(*) FILTER (WHERE decision = 'approved')::int AS approved_count,
       count(*) FILTER (WHERE decision = 'rejected')::int AS rejected_count
     FROM procurement_decisions WHERE request_id = $1`,
    [requestId]
  );
  const approvedCount = Number(countRows[0]?.approved_count || 0);
  const rejectedCount = Number(countRows[0]?.rejected_count || 0);
  const nextStatus = rejectedCount > 0
    ? "rejected"
    : approvedCount >= Number(request.required_approvals)
      ? "approved"
      : "pending";
  await query(
    `WITH updated AS (
       UPDATE procurement_requests
          SET approved_count = $2,
              status = $3,
              decided_at = CASE WHEN $3 = 'pending' THEN NULL ELSE now() END,
              updated_at = now()
        WHERE id = $1
        RETURNING order_id
     )
     UPDATE orders
        SET approval_status = $3, updated_at = now()
      WHERE id = (SELECT order_id FROM updated)`,
    [requestId, approvedCount, nextStatus]
  );
  await recordAudit({
    actorId: user.id,
    action: decision,
    entityType: "procurement",
    entityId: requestId,
    details: { orderId: request.order_id, nextStatus }
  });
  if (request.customer_id) {
    await queueNotification({
      userId: request.customer_id,
      channel: "in_app",
      subject: `Sifariş #${Number(request.order_number)} təsdiqi`,
      body: nextStatus === "pending"
        ? `Təsdiqlər: ${approvedCount}/${Number(request.required_approvals)}.`
        : `Satınalma qərarı: ${nextStatus === "approved" ? "təsdiqləndi" : "rədd edildi"}.`,
      templateKey: "procurement_decision",
      payload: { requestId, orderId: request.order_id, status: nextStatus }
    });
  }
  return sendJson(res, 200, { ok: true, data: await readProcurementRequest(request.order_id) });
});
