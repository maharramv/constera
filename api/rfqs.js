import { randomUUID } from "node:crypto";
import { getSessionUser, hashOpaque, requireRole } from "./_lib/auth.js";
import { syncRfqLead } from "./_lib/crm.js";
import { query, recordAudit } from "./_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, getClientIp, readJson, sendJson, withApiErrors } from "./_lib/http.js";
import { queueNotification } from "./_lib/notifications.js";
import { assertPolicyConsent, recordPolicyConsent } from "./_lib/policy-consent.js";
import { email, oneOf, parseLimit, stringList, text } from "./_lib/validation.js";

const statuses = ["Yeni", "Baxılır", "Təklif gözləyir", "Təklif alındı", "Bağlandı", "Ləğv edildi"];
const rfqTypes = ["product", "service", "package", "rental", "custom"];

const prepareRfqItems = ({ body, type, title, quantity }) => {
  const requested = Array.isArray(body.items) && body.items.length
    ? body.items.slice(0, 20)
    : [{ kind: type, itemId: body.sourceId, title, quantityText: quantity, specs: body.specs }];
  return requested.map((item, index) => {
    const itemKind = oneOf(item?.kind || item?.type, rfqTypes, type || "custom", `Sorğu sətri ${index + 1}`);
    const itemTitle = text(item?.title || (index === 0 ? title : ""), {
      field: `Sorğu sətri ${index + 1}`,
      required: true,
      max: 300
    });
    const unit = text(item?.unit, { max: 40 });
    const quantityText = text(
      item?.quantityText || [item?.quantity, unit].filter((value) => value !== undefined && value !== "").join(" ") || (index === 0 ? quantity : ""),
      { field: `${itemTitle} miqdarı`, required: true, max: 160 }
    );
    return {
      id: `rfi-${randomUUID()}`,
      kind: itemKind,
      item_id: text(item?.productId || item?.itemId || (index === 0 ? body.sourceId : ""), { max: 160 }) || null,
      title: itemTitle,
      quantity_text: quantityText,
      unit: unit || null,
      specs: stringList(item?.specs)
    };
  });
};

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const user = await requireRole(req);
    const limit = parseLimit(req.query.limit, 100, 500);
    const values = [];
    const where = [];
    let offerScope = "";
    let proposalScope = "";
    if (user.role === "customer") {
      values.push(user.id);
      where.push(`r.customer_id = $${values.length}`);
      proposalScope = "AND proposal.status <> 'draft'";
    } else if (user.role === "supplier") {
      values.push(user.companyId || "none");
      where.push(`(r.supplier_id IS NULL OR s.company_id = $${values.length})`);
      offerScope = `AND offer_supplier.company_id = $${values.length}`;
      proposalScope = "AND false";
    }
    values.push(limit);
    const rows = await query(
      `SELECT r.*, s.name AS supplier_name,
              COALESCE(json_agg(json_build_object(
                'id', i.id, 'kind', i.item_kind, 'itemId', i.item_id,
                'title', i.title, 'quantity', i.quantity_text, 'unit', i.unit, 'specs', i.specs
              )) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', o.id,
                  'rfqId', o.rfq_id,
                  'supplierId', o.supplier_id,
                  'supplier', offer_supplier.name,
                  'priceAmount', o.price_amount,
                  'price', o.price_text,
                  'currency', o.currency,
                  'leadTime', o.lead_time,
                  'delivery', o.delivery,
                  'warranty', o.warranty,
                  'note', o.note,
                  'status', o.status,
                  'orderId', converted_order.id,
                  'orderNumber', converted_order.order_number,
                  'orderStatus', converted_order.status,
                  'createdAt', o.created_at,
                  'updatedAt', o.updated_at
                ) ORDER BY (o.status = 'accepted') DESC, o.price_amount NULLS LAST, o.created_at DESC)
                FROM offers o
                LEFT JOIN suppliers offer_supplier ON offer_supplier.id = o.supplier_id
                LEFT JOIN orders converted_order ON converted_order.offer_id = o.id
                WHERE o.rfq_id = r.id ${offerScope}
              ), '[]'::json) AS offers,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', proposal.id,
                  'documentNumber', proposal.document_number,
                  'version', proposal.version,
                  'status', CASE
                    WHEN proposal.status = 'issued' AND proposal.valid_until < (now() AT TIME ZONE 'Asia/Baku')::date THEN 'expired'
                    ELSE proposal.status
                  END,
                  'totalAmount', proposal.total_amount,
                  'currency', proposal.currency,
                  'validUntil', proposal.valid_until,
                  'selectedOfferId', proposal.selected_offer_id,
                  'issuedAt', proposal.issued_at,
                  'acceptedAt', proposal.accepted_at,
                  'createdAt', proposal.created_at
                ) ORDER BY proposal.created_at DESC)
                FROM commercial_proposals proposal
                WHERE proposal.rfq_id = r.id ${proposalScope}
              ), '[]'::json) AS proposals
         FROM rfqs r
         LEFT JOIN suppliers s ON s.id = r.supplier_id
         LEFT JOIN rfq_items i ON i.rfq_id = r.id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        GROUP BY r.id, s.name
        ORDER BY r.created_at DESC
        LIMIT $${values.length}`,
      values
    );
    return sendJson(res, 200, { ok: true, data: rows });
  }

  assertMethod(req, ["POST", "PATCH"]);
  assertSameOrigin(req);
  const body = await readJson(req, 60_000);

  if (req.method === "PATCH") {
    const user = await requireRole(req, ["super_admin", "admin", "sales"]);
    const id = text(body.id || req.query.id, { field: "Sorğu ID-si", required: true, max: 160 });
    const currentRows = await query("SELECT * FROM rfqs WHERE id = $1 LIMIT 1", [id]);
    if (!currentRows[0]) throw new ApiError(404, "rfq_not_found", "Qiymət sorğusu tapılmadı.");
    const hasSupplier = Object.prototype.hasOwnProperty.call(body, "supplierId");
    const supplierId = hasSupplier ? text(body.supplierId, { max: 160 }) || null : currentRows[0].supplier_id;
    if (supplierId) {
      const supplierRows = await query("SELECT id FROM suppliers WHERE id = $1 AND status <> 'Arxiv' LIMIT 1", [supplierId]);
      if (!supplierRows[0]) throw new ApiError(404, "supplier_not_found", "Təchizatçı tapılmadı.");
    }
    const defaultStatus = hasSupplier && supplierId ? "Təklif gözləyir" : currentRows[0].status;
    const status = oneOf(body.status, statuses, defaultStatus, "Sorğu statusu");
    const rows = await query(
      "UPDATE rfqs SET status = $2, supplier_id = $3, updated_at = now() WHERE id = $1 RETURNING *",
      [id, status, supplierId]
    );
    if (!rows[0]) throw new ApiError(404, "rfq_not_found", "Qiymət sorğusu tapılmadı.");
    await recordAudit({
      actorId: user.id,
      action: "status_update",
      entityType: "rfq",
      entityId: id,
      details: { status, supplierId }
    });
    await syncRfqLead(id);
    return sendJson(res, 200, { ok: true, data: rows[0] });
  }

  if (text(body.website, { max: 200 })) return sendJson(res, 201, { ok: true, data: { accepted: true } });
  assertPolicyConsent(body);
  const session = await getSessionUser(req);
  const aiRunId = text(body.aiRunId, { max: 160 }) || null;
  const estimateId = text(body.estimateId, { max: 160 }) || null;
  let estimateWorkflow = null;
  if (estimateId) {
    if (!session) throw new ApiError(401, "authentication_required", "Smetanı RFQ-yə çevirmək üçün hesaba daxil ol.");
    const estimateRows = await query(
      `SELECT estimate.*,
              linked_rfq.status AS linked_rfq_status,
              (SELECT count(*)::int FROM rfq_items item WHERE item.rfq_id = estimate.rfq_id) AS linked_item_count
         FROM customer_estimates estimate
         LEFT JOIN rfqs linked_rfq ON linked_rfq.id = estimate.rfq_id
        WHERE estimate.id = $1 AND estimate.customer_id = $2
        LIMIT 1`,
      [estimateId, session.id]
    );
    estimateWorkflow = estimateRows[0];
    if (!estimateWorkflow) throw new ApiError(404, "estimate_not_found", "RFQ üçün seçilmiş smeta tapılmadı.");
    if (estimateWorkflow.rfq_id) {
      return sendJson(res, 200, {
        ok: true,
        data: {
          id: estimateWorkflow.rfq_id,
          status: estimateWorkflow.linked_rfq_status || "Yeni",
          cloud: true,
          duplicate: true,
          itemCount: Number(estimateWorkflow.linked_item_count || 0),
          aiRunId: estimateWorkflow.ai_run_id || null,
          estimateId
        }
      });
    }
    if (estimateWorkflow.workflow_status !== "approved") {
      throw new ApiError(409, "estimate_not_approved", "Smeta insan tərəfindən təsdiqlənmədən RFQ-yə çevrilə bilməz.");
    }
    if (estimateWorkflow.ai_run_id && estimateWorkflow.ai_run_id !== aiRunId) {
      throw new ApiError(409, "estimate_ai_run_mismatch", "Smetanın təsdiqlənmiş AI audit nömrəsi RFQ ilə uyğun deyil.");
    }
  }
  const submissionHash = hashOpaque(getClientIp(req));
  const recentSubmissions = await query(
    `SELECT count(*)::int AS count FROM rfqs
      WHERE submission_hash = $1 AND created_at > now() - interval '1 hour'`,
    [submissionHash]
  );
  if ((recentSubmissions[0]?.count || 0) >= 20) {
    throw new ApiError(429, "rfq_rate_limited", "Bir saat ərzində sorğu limiti dolub. Bir qədər sonra yenidən yoxla.");
  }
  const id = `rfq-${randomUUID()}`;
  const type = oneOf(body.type, rfqTypes, "custom", "Sorğu tipi");
  const title = text(body.product || body.title, { field: "Sorğu mövzusu", required: true, max: 300 });
  const quantity = text(body.quantity, { field: "Miqdar", required: true, max: 160 });
  const company = text(body.company, { field: "Şirkət", required: true, max: 200 });
  const contactName = text(body.contactName || session?.name || company, {
    field: "Əlaqələndirici şəxs",
    required: true,
    max: 160
  });
  const legacyContact = text(body.contact, { max: 300 });
  const legacyEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legacyContact) ? legacyContact : "";
  const contactEmailSource = text(body.email || session?.email || legacyEmail, { max: 254 });
  const contactEmail = contactEmailSource ? email(contactEmailSource) : null;
  const phone = text(body.phone || (legacyEmail ? "" : legacyContact), { field: "Telefon", max: 80 }) || null;
  const contact = [contactName, phone, contactEmail].filter(Boolean).join(" · ");
  const supplierId = text(body.supplierId, { max: 160 }) || null;
  const needDate = text(body.needDate, { max: 10 }) || null;
  if (needDate && !/^\d{4}-\d{2}-\d{2}$/.test(needDate)) throw new ApiError(400, "validation_error", "Tələb tarixi düzgün deyil.");
  const items = prepareRfqItems({ body, type, title, quantity });
  if (aiRunId) {
    if (!session) throw new ApiError(401, "authentication_required", "AI qaralamasını sorğuya bağlamaq üçün hesaba daxil ol.");
    const approvedRuns = await query(
      `SELECT id FROM ai_runs
        WHERE id = $1 AND user_id = $2
          AND feature IN ('rfq_draft', 'estimate_review', 'estimate_document')
          AND status = 'completed' AND approval_status = 'approved' AND expires_at > now()
        LIMIT 1`,
      [aiRunId, session.id]
    );
    if (!approvedRuns[0]) {
      throw new ApiError(409, "ai_rfq_not_approved", "AI smeta və ya RFQ qaralaması təsdiqlənməyib, sənə aid deyil və ya istifadə müddəti bitib.");
    }
  }

  const createdRows = await query(
    `WITH new_rfq AS (
       INSERT INTO rfqs (
         id, customer_id, supplier_id, rfq_type, title, company_name,
         contact, contact_name, email, phone, city, address,
         priority, need_date, budget, delivery_mode, usage_text, note,
         submission_hash, ai_run_id, estimate_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19, $20, $21
       )
       ON CONFLICT (estimate_id) WHERE estimate_id IS NOT NULL DO NOTHING
       RETURNING id
     ), new_items AS (
       INSERT INTO rfq_items (id, rfq_id, item_kind, item_id, title, quantity_text, unit, specs)
       SELECT item.id, new_rfq.id, item.kind, item.item_id, item.title, item.quantity_text,
              item.unit, coalesce(item.specs, '[]'::jsonb)
         FROM new_rfq
         CROSS JOIN LATERAL jsonb_to_recordset($22::jsonb) AS item(
           id text, kind text, item_id text, title text, quantity_text text, unit text, specs jsonb
         )
       RETURNING id
     ), linked_estimate AS (
       UPDATE customer_estimates estimate
          SET rfq_id = new_rfq.id,
              workflow_status = 'converted',
              converted_at = now(),
              version = estimate.version + 1,
              updated_at = now()
         FROM new_rfq
        WHERE estimate.id = $21 AND estimate.customer_id = $2
       RETURNING estimate.id
     )
     SELECT new_rfq.id, (SELECT count(*)::int FROM new_items) AS item_count
       FROM new_rfq`,
    [
      id,
      session?.id || null,
      supplierId,
      type,
      title,
      company,
      contact,
      contactName,
      contactEmail,
      phone,
      text(body.city, { max: 160 }) || null,
      text(body.address, { max: 500 }) || null,
      text(body.priority, { max: 80 }) || "Normal",
      needDate,
      text(body.budget, { max: 160 }) || null,
      text(body.deliveryMode, { max: 200 }) || null,
      text(body.usage, { max: 600 }) || null,
      text(body.note, { max: 3_000 }) || null,
      submissionHash,
      aiRunId,
      estimateId,
      JSON.stringify(items)
    ]
  );
  if (!createdRows[0]) {
    if (estimateId) {
      const existingRows = await query(
        `SELECT rfq.id, rfq.status,
                (SELECT count(*)::int FROM rfq_items item WHERE item.rfq_id = rfq.id) AS item_count
           FROM rfqs rfq
          WHERE rfq.estimate_id = $1 AND rfq.customer_id = $2
          LIMIT 1`,
        [estimateId, session.id]
      );
      if (existingRows[0]) {
        return sendJson(res, 200, {
          ok: true,
          data: {
            id: existingRows[0].id,
            status: existingRows[0].status,
            cloud: true,
            duplicate: true,
            itemCount: Number(existingRows[0].item_count || 0),
            aiRunId,
            estimateId
          }
        });
      }
    }
    throw new ApiError(409, "rfq_not_created", "Qiymət sorğusu yaradılmadı. Məlumatları yenidən yoxla.");
  }
  await recordPolicyConsent({
    entityType: "rfq",
    entityId: id,
    userId: session?.id || null,
    submissionHash,
    sourcePath: text(body.sourcePath, { max: 500 })
  });
  await syncRfqLead(id);
  await recordAudit({
    actorId: session?.id || null,
    action: "create",
    entityType: "rfq",
    entityId: id,
    details: { type, supplierId, itemCount: items.length, aiRunId, estimateId }
  });
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "";
  const notification = {
    subject: "Yeni qiymət sorğusu",
    body: `${company}: ${title} · ${quantity}`,
    templateKey: "rfq_created",
    payload: { rfqId: id, type, supplierId, company, title, quantity }
  };
  if (adminEmail) {
    await queueNotification({ ...notification, channel: "email", recipient: adminEmail });
  } else {
    const admins = await query(
      "SELECT id FROM users WHERE role IN ('super_admin', 'admin', 'sales') AND status = 'active'"
    );
    await Promise.allSettled(admins.map((admin) => queueNotification({
      ...notification,
      userId: admin.id,
      channel: "in_app"
    })));
  }
  return sendJson(res, 201, {
    ok: true,
    data: { id, status: "Yeni", cloud: true, itemCount: Number(createdRows[0].item_count || items.length), aiRunId, estimateId }
  });
});
