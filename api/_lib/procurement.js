import { query } from "./db.js";

export const mapProcurementRequest = (row) => ({
  id: row.id,
  orderId: row.order_id,
  orderNumber: row.order_number === undefined ? null : Number(row.order_number),
  requestedBy: row.requested_by,
  requesterName: row.requester_name || "",
  companyId: row.company_id,
  companyName: row.company_name || "",
  status: row.status,
  requiredApprovals: Number(row.required_approvals || 1),
  approvedCount: Number(row.approved_count || 0),
  budgetAmount: row.budget_amount === null ? null : Number(row.budget_amount),
  costCenter: row.cost_center || "",
  note: row.note || "",
  decisions: Array.isArray(row.decisions) ? row.decisions : [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  decidedAt: row.decided_at
});

export const readProcurementRequest = async (orderId) => {
  const rows = await query(
    `SELECT request.*, orders.order_number, requester.name AS requester_name,
            company.name AS company_name,
            COALESCE((
              SELECT json_agg(json_build_object(
                'id', decision.id,
                'actorId', decision.actor_id,
                'actorName', actor.name,
                'decision', decision.decision,
                'note', decision.note,
                'createdAt', decision.created_at
              ) ORDER BY decision.created_at)
              FROM procurement_decisions decision
              JOIN users actor ON actor.id = decision.actor_id
              WHERE decision.request_id = request.id
            ), '[]'::json) AS decisions
       FROM procurement_requests request
       JOIN orders ON orders.id = request.order_id
       LEFT JOIN users requester ON requester.id = request.requested_by
       LEFT JOIN companies company ON company.id = request.company_id
      WHERE request.order_id = $1
      LIMIT 1`,
    [orderId]
  );
  return rows[0] ? mapProcurementRequest(rows[0]) : null;
};
