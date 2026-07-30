import { randomUUID } from "node:crypto";
import { assertCriticalTwoFactor, requireRole } from "../_lib/auth.js";
import { backupDeliveryReadiness, verifyCloudBackup } from "../_lib/cloud-backup.js";
import { calculateSettlementAmounts, settlementTransitionAllowed } from "../_lib/commercial-operations.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { entityId, oneOf, text } from "../_lib/validation.js";

const roles = ["super_admin", "admin"];
const contractStatuses = ["draft", "active", "suspended", "expired", "terminated"];
const trackingStatuses = ["in_transit", "exception", "returned"];

const numberBetween = (value, fallback, min, max, field) => {
  const number = value === "" || value === null || value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ApiError(400, "validation_error", `${field} düzgün deyil.`);
  }
  return number;
};

const dateValue = (value, field) => {
  const source = text(value, { field, required: true, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source) || !Number.isFinite(Date.parse(`${source}T00:00:00Z`))) {
    throw new ApiError(400, "validation_error", `${field} düzgün deyil.`);
  }
  return source;
};

const optionalHttpsUrl = (value, field) => {
  const source = text(value, { max: 2_000 });
  if (!source) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw new ApiError(400, "validation_error", `${field} təhlükəsiz HTTPS ünvanı olmalıdır.`);
  }
};

export const contractActivationReadiness = ({ documentUrl, startsOn, endsOn } = {}) => {
  const today = new Date().toISOString().slice(0, 10);
  const missing = [];
  if (!documentUrl) missing.push("İmzalanmış müqavilə sənədi");
  if (!startsOn) missing.push("Başlanğıc tarixi");
  else if (startsOn > today) missing.push("Başlanğıc tarixi hələ çatmayıb");
  if (endsOn && endsOn < today) missing.push("Müqavilənin müddəti bitib");
  return {
    ready: missing.length === 0,
    missing
  };
};

const mapContract = (row) => ({
  id: row.id,
  supplierId: row.supplier_id,
  supplierName: row.supplier_name || "",
  contractNumber: row.contract_number,
  status: row.status,
  commissionRate: Number(row.commission_rate),
  paymentTermsDays: Number(row.payment_terms_days),
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  documentUrl: row.document_url || "",
  note: row.note || "",
  activatedAt: row.activated_at,
  updatedAt: row.updated_at,
  activationReadiness: contractActivationReadiness({
    documentUrl: row.document_url,
    startsOn: row.starts_on,
    endsOn: row.ends_on
  })
});

const mapSettlement = (row) => ({
  id: row.id,
  settlementNumber: Number(row.settlement_number),
  supplierId: row.supplier_id,
  supplierName: row.supplier_name || "",
  contractNumber: row.contract_number || "",
  periodStart: row.period_start,
  periodEnd: row.period_end,
  grossAmount: Number(row.gross_amount),
  commissionAmount: Number(row.commission_amount),
  refundAmount: Number(row.refund_amount),
  adjustmentAmount: Number(row.adjustment_amount),
  netAmount: Number(row.net_amount),
  currency: row.currency,
  status: row.status,
  paymentReference: row.payment_reference || "",
  note: row.note || "",
  itemCount: Number(row.item_count || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const loadOperations = async () => {
  const [
    suppliers,
    contracts,
    settlements,
    fulfillments,
    tracking,
    payments,
    refunds,
    security,
    verifications
  ] = await Promise.all([
    query("SELECT id, name FROM suppliers WHERE status <> 'Arxiv' ORDER BY name"),
    query(
      `SELECT contract.*, supplier.name AS supplier_name
         FROM supplier_contracts contract
         JOIN suppliers supplier ON supplier.id = contract.supplier_id
        ORDER BY contract.updated_at DESC
        LIMIT 300`
    ),
    query(
      `SELECT settlement.*, supplier.name AS supplier_name,
              contract.contract_number,
              (SELECT count(*) FROM supplier_settlement_items item
                WHERE item.settlement_id = settlement.id)::int AS item_count
         FROM supplier_settlements settlement
         JOIN suppliers supplier ON supplier.id = settlement.supplier_id
         LEFT JOIN supplier_contracts contract ON contract.id = settlement.contract_id
        ORDER BY settlement.created_at DESC
        LIMIT 300`
    ),
    query(
      `SELECT fulfillment.id, fulfillment.order_id, fulfillment.status,
              fulfillment.tracking_code, fulfillment.delivery_provider,
              supplier.name AS supplier_name, orders.order_number
         FROM order_fulfillments fulfillment
         JOIN suppliers supplier ON supplier.id = fulfillment.supplier_id
         JOIN orders ON orders.id = fulfillment.order_id
        ORDER BY fulfillment.updated_at DESC
        LIMIT 200`
    ),
    query(
      `SELECT event.*, supplier.name AS supplier_name, orders.order_number
         FROM delivery_tracking_events event
         JOIN order_fulfillments fulfillment ON fulfillment.id = event.fulfillment_id
         JOIN suppliers supplier ON supplier.id = fulfillment.supplier_id
         JOIN orders ON orders.id = event.order_id
        ORDER BY event.occurred_at DESC
        LIMIT 200`
    ),
    query(
      `SELECT transaction.id, transaction.order_id, transaction.provider,
              transaction.amount, transaction.currency, transaction.status,
              transaction.created_at, orders.order_number
         FROM payment_transactions transaction
         JOIN orders ON orders.id = transaction.order_id
        ORDER BY transaction.created_at DESC
        LIMIT 100`
    ),
    query(
      `SELECT refund.id, refund.order_id, refund.provider, refund.amount,
              refund.currency, refund.status, refund.created_at, orders.order_number
         FROM refund_transactions refund
         JOIN orders ON orders.id = refund.order_id
        ORDER BY refund.created_at DESC
        LIMIT 100`
    ),
    query(
      `SELECT event.id, event.event_type, event.succeeded, event.risk_level,
              event.metadata, event.created_at, users.name AS user_name
         FROM security_events event
         LEFT JOIN users ON users.id = event.user_id
        ORDER BY event.created_at DESC
        LIMIT 200`
    ),
    query(
      `SELECT verification.*, users.name AS verified_by_name
         FROM backup_verifications verification
         LEFT JOIN users ON users.id = verification.verified_by
        ORDER BY verification.created_at DESC
        LIMIT 50`
    )
  ]);
  const gross = settlements
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => sum + Number(item.gross_amount || 0), 0);
  const commission = settlements
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => sum + Number(item.commission_amount || 0), 0);
  const backup = backupDeliveryReadiness();
  const contractItems = contracts.map(mapContract);
  return {
    summary: {
      activeContracts: contracts.filter((item) => item.status === "active").length,
      draftContracts: contracts.filter((item) => item.status === "draft").length,
      activationReadyContracts: contractItems.filter((item) =>
        item.status !== "active" && item.activationReadiness.ready
      ).length,
      pendingSettlements: settlements.filter((item) => ["draft", "approved"].includes(item.status)).length,
      settlementGross: Math.round(gross * 100) / 100,
      commissionTotal: Math.round(commission * 100) / 100,
      openShipments: fulfillments.filter((item) => !["delivered", "cancelled"].includes(item.status)).length,
      highRiskEvents: security.filter((item) => ["high", "critical"].includes(item.risk_level)).length,
      backupReady: backup.ready,
      backupChannel: backup.label
    },
    suppliers: suppliers.map((item) => ({ id: item.id, name: item.name })),
    contracts: contractItems,
    settlements: settlements.map(mapSettlement),
    fulfillments: fulfillments.map((item) => ({
      id: item.id,
      orderId: item.order_id,
      orderNumber: Number(item.order_number),
      supplierName: item.supplier_name,
      status: item.status,
      trackingCode: item.tracking_code || "",
      deliveryProvider: item.delivery_provider || ""
    })),
    tracking: tracking.map((item) => ({
      id: item.id,
      fulfillmentId: item.fulfillment_id,
      orderNumber: Number(item.order_number),
      supplierName: item.supplier_name,
      status: item.status,
      location: item.location || "",
      note: item.note || "",
      source: item.source,
      occurredAt: item.occurred_at
    })),
    finance: {
      payments: payments.map((item) => ({ ...item, amount: Number(item.amount), orderNumber: Number(item.order_number) })),
      refunds: refunds.map((item) => ({ ...item, amount: Number(item.amount), orderNumber: Number(item.order_number) }))
    },
    security: security.map((item) => ({
      id: item.id,
      type: item.event_type,
      succeeded: Boolean(item.succeeded),
      riskLevel: item.risk_level,
      userName: item.user_name || "Naməlum hesab",
      metadata: item.metadata || {},
      createdAt: item.created_at
    })),
    backupVerifications: verifications.map((item) => ({
      id: item.id,
      backupId: item.backup_id,
      status: item.status,
      version: item.backup_version || "",
      tableCount: Number(item.table_count),
      recordCount: Number(item.record_count),
      checksum: item.checksum_sha256 || "",
      verifiedBy: item.verified_by_name || "Sistem",
      createdAt: item.created_at
    }))
  };
};

const saveContract = async (user, body) => {
  const id = entityId(body.id, "sct");
  const supplierId = text(body.supplierId, { field: "Təchizatçı", required: true, max: 160 });
  const supplier = (await query(
    "SELECT id FROM suppliers WHERE id = $1 AND status <> 'Arxiv' LIMIT 1",
    [supplierId]
  ))[0];
  if (!supplier) throw new ApiError(404, "supplier_not_found", "Təchizatçı tapılmadı.");
  const status = oneOf(body.status, contractStatuses, "draft", "Müqavilə statusu");
  const startsOn = dateValue(body.startsOn, "Başlanğıc tarixi");
  const endsOn = body.endsOn ? dateValue(body.endsOn, "Bitmə tarixi") : null;
  if (endsOn && endsOn < startsOn) {
    throw new ApiError(400, "validation_error", "Bitmə tarixi başlanğıc tarixindən əvvəl ola bilməz.");
  }
  const documentUrl = optionalHttpsUrl(body.documentUrl, "Müqavilə sənədi");
  if (status === "active") {
    const readiness = contractActivationReadiness({ documentUrl, startsOn, endsOn });
    const legalConfirmed = body.legalConfirmed === true || ["true", "on", "1"].includes(String(body.legalConfirmed));
    if (!readiness.ready || !legalConfirmed) {
      const missing = [
        ...readiness.missing,
        ...(!legalConfirmed ? ["Səlahiyyətli şəxsin hüquqi təsdiqi"] : [])
      ];
      throw new ApiError(
        409,
        "contract_activation_requirements",
        `Müqavilə aktivləşdirilə bilməz: ${missing.join(", ")}.`
      );
    }
    await query(
      `UPDATE supplier_contracts
          SET status = 'suspended', updated_at = now()
        WHERE supplier_id = $1 AND status = 'active' AND id <> $2`,
      [supplierId, id]
    );
  }
  const rows = await query(
    `INSERT INTO supplier_contracts (
       id, supplier_id, contract_number, status, commission_rate,
       payment_terms_days, starts_on, ends_on, document_url, note,
       created_by, reviewed_by, activated_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, CASE WHEN $4 = 'active' THEN $11 ELSE NULL END,
       CASE WHEN $4 = 'active' THEN now() ELSE NULL END, now()
     )
     ON CONFLICT (id) DO UPDATE SET
       supplier_id = EXCLUDED.supplier_id,
       contract_number = EXCLUDED.contract_number,
       status = EXCLUDED.status,
       commission_rate = EXCLUDED.commission_rate,
       payment_terms_days = EXCLUDED.payment_terms_days,
       starts_on = EXCLUDED.starts_on,
       ends_on = EXCLUDED.ends_on,
       document_url = EXCLUDED.document_url,
       note = EXCLUDED.note,
       reviewed_by = CASE WHEN EXCLUDED.status = 'active' THEN $11 ELSE supplier_contracts.reviewed_by END,
       activated_at = CASE
         WHEN EXCLUDED.status = 'active' THEN COALESCE(supplier_contracts.activated_at, now())
         ELSE supplier_contracts.activated_at
       END,
       updated_at = now()
     RETURNING *`,
    [
      id,
      supplierId,
      text(body.contractNumber, { field: "Müqavilə nömrəsi", required: true, max: 120 }),
      status,
      numberBetween(body.commissionRate, 8, 0, 100, "Komissiya faizi"),
      Math.round(numberBetween(body.paymentTermsDays, 14, 0, 365, "Ödəniş müddəti")),
      startsOn,
      endsOn,
      documentUrl,
      text(body.note, { max: 2_000 }) || null,
      user.id
    ]
  );
  await recordAudit({
    actorId: user.id,
    action: body.id ? "update" : "create",
    entityType: "supplier_contract",
    entityId: id,
    details: { supplierId, status, commissionRate: Number(rows[0].commission_rate) }
  });
  return mapContract({ ...rows[0], supplier_name: body.supplierName || "" });
};

const generateSettlement = async (user, body) => {
  const supplierId = text(body.supplierId, { field: "Təchizatçı", required: true, max: 160 });
  const periodStart = dateValue(body.periodStart, "Dövrün başlanğıcı");
  const periodEnd = dateValue(body.periodEnd, "Dövrün sonu");
  if (periodEnd < periodStart) {
    throw new ApiError(400, "validation_error", "Hesablaşma dövrü düzgün deyil.");
  }
  const contract = (await query(
    `SELECT * FROM supplier_contracts
      WHERE supplier_id = $1 AND status = 'active'
        AND starts_on <= $3::date
        AND (ends_on IS NULL OR ends_on >= $2::date)
      ORDER BY activated_at DESC NULLS LAST
      LIMIT 1`,
    [supplierId, periodStart, periodEnd]
  ))[0];
  if (!contract) {
    throw new ApiError(409, "active_contract_required", "Hesablaşma üçün aktiv təchizatçı müqaviləsi tələb olunur.");
  }
  const purchaseOrders = await query(
    `WITH order_totals AS (
       SELECT order_id, sum(total_amount) AS total_amount
         FROM supplier_purchase_orders
        WHERE total_amount IS NOT NULL
        GROUP BY order_id
     )
     SELECT purchase_order.id, purchase_order.order_id, purchase_order.total_amount,
            purchase_order.currency,
            COALESCE((
              SELECT sum(refund.amount * purchase_order.total_amount / NULLIF(order_totals.total_amount, 0))
                FROM refund_transactions refund
               WHERE refund.order_id = purchase_order.order_id
                 AND refund.status = 'completed'
            ), 0) AS refund_amount
       FROM supplier_purchase_orders purchase_order
       JOIN order_fulfillments fulfillment ON fulfillment.id = purchase_order.fulfillment_id
       JOIN order_totals ON order_totals.order_id = purchase_order.order_id
      WHERE purchase_order.supplier_id = $1
        AND purchase_order.status = 'delivered'
        AND purchase_order.total_amount IS NOT NULL
        AND COALESCE(fulfillment.delivered_at, purchase_order.updated_at)::date BETWEEN $2::date AND $3::date
        AND NOT EXISTS (
          SELECT 1 FROM supplier_settlement_items item
           WHERE item.purchase_order_id = purchase_order.id
        )
      ORDER BY purchase_order.purchase_order_number`,
    [supplierId, periodStart, periodEnd]
  );
  if (!purchaseOrders.length) {
    throw new ApiError(409, "settlement_empty", "Bu dövrdə hesablaşmaya daxil ediləcək çatdırılmış alt-sifariş yoxdur.");
  }
  const currencies = [...new Set(purchaseOrders.map((item) => item.currency))];
  if (currencies.length !== 1) {
    throw new ApiError(409, "settlement_currency_mismatch", "Fərqli valyutalı alt-sifarişlər ayrı hesablaşma tələb edir.");
  }
  const items = purchaseOrders.map((item) => ({
    id: `ssi-${randomUUID()}`,
    purchaseOrderId: item.id,
    ...calculateSettlementAmounts({
      grossAmount: item.total_amount,
      refundAmount: item.refund_amount,
      commissionRate: contract.commission_rate
    })
  }));
  const totals = items.reduce((result, item) => ({
    grossAmount: result.grossAmount + item.grossAmount,
    refundAmount: result.refundAmount + item.refundAmount,
    commissionAmount: result.commissionAmount + item.commissionAmount,
    netAmount: result.netAmount + item.netAmount
  }), { grossAmount: 0, refundAmount: 0, commissionAmount: 0, netAmount: 0 });
  const adjustmentAmount = numberBetween(body.adjustmentAmount, 0, -1_000_000_000, 1_000_000_000, "Düzəliş məbləği");
  const settlementId = `sst-${randomUUID()}`;
  const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;
  const settled = {
    grossAmount: roundMoney(totals.grossAmount),
    refundAmount: roundMoney(totals.refundAmount),
    commissionAmount: roundMoney(totals.commissionAmount),
    adjustmentAmount: roundMoney(adjustmentAmount),
    netAmount: roundMoney(totals.netAmount + adjustmentAmount)
  };
  if (settled.netAmount < 0) {
    throw new ApiError(400, "negative_settlement", "Düzəlişdən sonra təchizatçıya ödəniləcək məbləğ mənfi ola bilməz.");
  }
  try {
    const rows = await query(
      `INSERT INTO supplier_settlements (
         id, supplier_id, contract_id, period_start, period_end,
         gross_amount, commission_amount, refund_amount, adjustment_amount,
         net_amount, currency, note, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
       )
       RETURNING *`,
      [
        settlementId,
        supplierId,
        contract.id,
        periodStart,
        periodEnd,
        settled.grossAmount,
        settled.commissionAmount,
        settled.refundAmount,
        settled.adjustmentAmount,
        settled.netAmount,
        currencies[0],
        text(body.note, { max: 2_000 }) || null,
        user.id
      ]
    );
    await query(
      `WITH items AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS item(
           id text, "purchaseOrderId" text, "grossAmount" numeric,
           "commissionAmount" numeric, "refundAmount" numeric, "netAmount" numeric
         )
       )
       INSERT INTO supplier_settlement_items (
         id, settlement_id, purchase_order_id, gross_amount,
         commission_amount, refund_amount, net_amount
       )
       SELECT id, $2, "purchaseOrderId", "grossAmount",
              "commissionAmount", "refundAmount", "netAmount"
         FROM items`,
      [JSON.stringify(items), settlementId]
    );
    await recordAudit({
      actorId: user.id,
      action: "generate",
      entityType: "supplier_settlement",
      entityId: settlementId,
      details: { supplierId, periodStart, periodEnd, itemCount: items.length, ...settled }
    });
    return mapSettlement({ ...rows[0], item_count: items.length });
  } catch (error) {
    await query("DELETE FROM supplier_settlements WHERE id = $1 AND status = 'draft'", [settlementId]).catch(() => null);
    throw error;
  }
};

const updateSettlement = async (user, body) => {
  const id = text(body.id, { field: "Hesablaşma ID-si", required: true, max: 160 });
  const current = (await query("SELECT * FROM supplier_settlements WHERE id = $1 LIMIT 1", [id]))[0];
  if (!current) throw new ApiError(404, "settlement_not_found", "Hesablaşma tapılmadı.");
  const status = oneOf(body.status, ["approved", "paid", "cancelled"], "approved", "Hesablaşma statusu");
  if (!settlementTransitionAllowed(current.status, status)) {
    throw new ApiError(409, "invalid_settlement_transition", "Hesablaşma mərhələsi ardıcıllıqla dəyişdirilməlidir.");
  }
  const paymentReference = text(body.paymentReference, { max: 200 }) || null;
  if (status === "paid" && !paymentReference) {
    throw new ApiError(400, "payment_reference_required", "Ödənilmiş hesablaşma üçün bank və ya ödəniş istinadı tələb olunur.");
  }
  const rows = await query(
    `UPDATE supplier_settlements
        SET status = $2,
            payment_reference = COALESCE($3, payment_reference),
            note = COALESCE($4, note),
            approved_by = CASE WHEN $2 = 'approved' THEN $5 ELSE approved_by END,
            approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE approved_at END,
            paid_by = CASE WHEN $2 = 'paid' THEN $5 ELSE paid_by END,
            paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE paid_at END,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, status, paymentReference, text(body.note, { max: 2_000 }) || null, user.id]
  );
  await recordAudit({
    actorId: user.id,
    action: status,
    entityType: "supplier_settlement",
    entityId: id,
    details: { fromStatus: current.status, toStatus: status, paymentReference }
  });
  return mapSettlement(rows[0]);
};

const addTrackingEvent = async (user, body) => {
  const fulfillmentId = text(body.fulfillmentId, { field: "İcra ID-si", required: true, max: 160 });
  const fulfillment = (await query(
    `SELECT fulfillment.*, purchase_order.id AS purchase_order_id
       FROM order_fulfillments fulfillment
       LEFT JOIN supplier_purchase_orders purchase_order
         ON purchase_order.fulfillment_id = fulfillment.id
      WHERE fulfillment.id = $1
      LIMIT 1`,
    [fulfillmentId]
  ))[0];
  if (!fulfillment) throw new ApiError(404, "fulfillment_not_found", "Sifariş icrası tapılmadı.");
  const status = oneOf(body.status, trackingStatuses, "in_transit", "İzləmə statusu");
  const occurredAt = body.occurredAt && Number.isFinite(Date.parse(body.occurredAt))
    ? new Date(body.occurredAt).toISOString()
    : new Date().toISOString();
  const id = `trk-${randomUUID()}`;
  const rows = await query(
    `INSERT INTO delivery_tracking_events (
       id, fulfillment_id, order_id, purchase_order_id, status,
       location, note, source, actor_id, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9)
     RETURNING *`,
    [
      id,
      fulfillmentId,
      fulfillment.order_id,
      fulfillment.purchase_order_id,
      status,
      text(body.location, { max: 240 }) || null,
      text(body.note, { max: 1_000 }) || null,
      user.id,
      occurredAt
    ]
  );
  await recordAudit({
    actorId: user.id,
    action: "tracking_event",
    entityType: "order_fulfillment",
    entityId: fulfillmentId,
    details: { status, location: rows[0].location || "" }
  });
  return rows[0];
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req, roles);
  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, data: await loadOperations() });
  }
  assertMethod(req, ["POST"]);
  assertSameOrigin(req);
  assertCriticalTwoFactor(user);
  const body = await readJson(req, 100_000);
  const action = oneOf(
    body.action,
    ["save-contract", "generate-settlement", "update-settlement", "add-tracking", "verify-backup"],
    "",
    "Əməliyyat"
  );
  if (action === "save-contract") {
    return sendJson(res, body.id ? 200 : 201, { ok: true, data: await saveContract(user, body) });
  }
  if (action === "generate-settlement") {
    return sendJson(res, 201, { ok: true, data: await generateSettlement(user, body) });
  }
  if (action === "update-settlement") {
    return sendJson(res, 200, { ok: true, data: await updateSettlement(user, body) });
  }
  if (action === "add-tracking") {
    return sendJson(res, 201, { ok: true, data: await addTrackingEvent(user, body) });
  }
  const verification = await verifyCloudBackup({ actorId: user.id });
  await recordAudit({
    actorId: user.id,
    action: "verify",
    entityType: "backup",
    entityId: verification.backupId,
    details: verification
  });
  return sendJson(res, 200, { ok: true, data: verification });
});
