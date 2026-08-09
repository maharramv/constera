import { randomUUID } from "node:crypto";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { entityId, oneOf, parsePriceAmount, safeUrl, text } from "../_lib/validation.js";

const projectTypes = ["apartment", "villa", "office", "commercial", "industrial", "landscape", "other"];
const projectStatuses = ["planning", "estimating", "procurement", "active", "completed", "archived"];
const itemTypes = ["product", "service", "package", "rental"];
const milestoneTypes = ["planning", "procurement", "service", "rental", "delivery", "payment", "handover", "other"];
const milestoneStatuses = ["planned", "in_progress", "completed", "cancelled"];

const dateValue = (value, field, required = false) => {
  const result = text(value, { field, required, max: 10 });
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00Z`))) {
    throw new ApiError(400, "validation_error", `${field} düzgün tarix olmalıdır.`);
  }
  return result;
};

const finiteQuantity = (value) => {
  const quantity = Number(value || 1);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new ApiError(400, "validation_error", "Layihə mövqeyinin miqdarı düzgün deyil.");
  }
  return quantity;
};

const safeSnapshot = (item) => ({
  title: text(item.title, { max: 300 }),
  category: text(item.category, { max: 200 }),
  subcategory: text(item.subcategory, { max: 200 }),
  brand: text(item.brand, { max: 160 }),
  supplier: text(item.supplier || item.providerName, { max: 240 }),
  supplierId: text(item.supplierId, { max: 160 }),
  image: text(item.image || item.imageUrl, { max: 2_000 }),
  priceText: text(item.priceText || item.price, { max: 160 })
});

const normalizeItems = (value) => {
  if (!Array.isArray(value)) throw new ApiError(400, "validation_error", "Layihə səbəti massiv olmalıdır.");
  if (value.length > 200) throw new ApiError(400, "project_item_limit", "Layihədə maksimum 200 mövqe ola bilər.");
  const seen = new Set();
  return value.map((item, index) => {
    const itemType = oneOf(item?.type || item?.itemType, itemTypes, "product", `Mövqe ${index + 1} tipi`);
    const itemId = text(item?.id || item?.itemId, { field: `Mövqe ${index + 1}`, required: true, max: 160 });
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(itemId)) throw new ApiError(400, "validation_error", "Layihə mövqeyi ID-si düzgün deyil.");
    const key = `${itemType}:${itemId}`;
    if (seen.has(key)) throw new ApiError(400, "duplicate_project_item", "Layihə səbətində təkrar mövqe var.");
    seen.add(key);
    const snapshot = safeSnapshot(item?.snapshot && typeof item.snapshot === "object" ? { ...item.snapshot, ...item } : item || {});
    const unitPrice = parsePriceAmount(item?.unitPrice ?? item?.priceAmount);
    return {
      id: entityId(item?.rowId, "project-item"),
      itemType,
      itemId,
      title: text(item?.title || snapshot.title, { field: `Mövqe ${index + 1} adı`, required: true, max: 300 }),
      quantity: finiteQuantity(item?.quantity),
      unit: text(item?.unit, { max: 80 }) || "mövqe",
      unitPrice,
      currency: oneOf(item?.currency, ["AZN", "USD", "EUR"], "AZN", "Valyuta"),
      priceStatus: oneOf(item?.priceStatus, ["confirmed", "request", "expired"], unitPrice === null ? "request" : "confirmed", "Qiymət statusu"),
      sourceUrl: safeUrl(item?.sourceUrl, "Mənbə URL-i") || null,
      snapshot,
      sortOrder: index
    };
  });
};

const mapItem = (row) => ({
  rowId: row.id,
  type: row.item_type,
  id: row.item_id,
  title: row.title,
  quantity: Number(row.quantity),
  unit: row.unit,
  unitPrice: row.unit_price === null ? null : Number(row.unit_price),
  currency: row.currency,
  priceStatus: row.price_status,
  sourceUrl: row.source_url || "",
  snapshot: row.snapshot || {}
});

const mapMilestone = (row) => ({
  id: row.id,
  title: row.title,
  type: row.milestone_type,
  dueDate: row.due_date,
  status: row.status,
  note: row.note || "",
  reminderScheduled: Boolean(row.reminder_notification_id),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapMatch = (row) => ({
  supplierId: row.supplier_id,
  supplier: row.supplier_name || row.snapshot?.name || "Təchizatçı",
  score: Number(row.score),
  coverageCount: Number(row.coverage_count || 0),
  reasons: row.reasons || [],
  region: row.region || row.snapshot?.region || "Azərbaycan",
  website: row.website || row.snapshot?.website || "",
  rating: row.rating || row.snapshot?.rating || "Yeni",
  reviewAverage: Number(row.review_average || row.snapshot?.reviewAverage || 0),
  verifiedReviews: Number(row.verified_reviews || row.snapshot?.verifiedReviews || 0),
  matchedAt: row.matched_at
});

const requireProject = async (projectId, user) => {
  const rows = await query("SELECT * FROM customer_projects WHERE id = $1 AND customer_id = $2 LIMIT 1", [projectId, user.id]);
  if (!rows[0]) throw new ApiError(404, "project_not_found", "Layihə tapılmadı.");
  return rows[0];
};

const readWorkspace = async (projectId, user) => {
  const project = await requireProject(projectId, user);
  const [items, milestones, matches, documents, commerceRows] = await Promise.all([
    query("SELECT * FROM customer_project_items WHERE project_id = $1 ORDER BY sort_order, created_at", [projectId]),
    query("SELECT * FROM customer_project_milestones WHERE project_id = $1 ORDER BY due_date, created_at", [projectId]),
    query(
      `SELECT match.*, supplier.name AS supplier_name, supplier.region, supplier.website, supplier.rating,
              review.average_rating AS review_average, review.verified_reviews
         FROM customer_project_supplier_matches match
         JOIN suppliers supplier ON supplier.id = match.supplier_id
         LEFT JOIN LATERAL (
           SELECT avg(rating)::numeric(5, 2) AS average_rating,
                  count(*) FILTER (WHERE verified = true)::int AS verified_reviews
             FROM marketplace_reviews
            WHERE target_type = 'supplier' AND target_id = supplier.id AND status = 'published'
         ) review ON true
        WHERE match.project_id = $1
        ORDER BY match.score DESC, match.matched_at DESC`,
      [projectId]
    ),
    query(
      `SELECT id, filename, url, content_type, size_bytes, created_at
         FROM media_assets
        WHERE entity_type = 'project' AND entity_id = $1 AND owner_id = $2 AND status = 'active'
        ORDER BY created_at DESC`,
      [projectId, user.id]
    ),
    project.rfq_id ? query(
      `SELECT rfq.id AS rfq_id, rfq.status AS rfq_status,
              proposal.id AS proposal_id, proposal.document_number, proposal.status AS proposal_status,
              proposal.total_amount AS proposal_total, proposal.currency AS proposal_currency,
              orders.id AS order_id, orders.order_number, orders.status AS order_status,
              orders.payment_status, orders.total_amount AS order_total,
              payment.id AS payment_id, payment.status AS transaction_status
         FROM rfqs rfq
         LEFT JOIN LATERAL (
           SELECT * FROM commercial_proposals item
            WHERE item.rfq_id = rfq.id ORDER BY item.created_at DESC LIMIT 1
         ) proposal ON true
         LEFT JOIN LATERAL (
           SELECT * FROM orders item
            WHERE item.rfq_id = rfq.id ORDER BY item.created_at DESC LIMIT 1
         ) orders ON true
         LEFT JOIN LATERAL (
           SELECT * FROM payment_transactions item
            WHERE item.order_id = orders.id ORDER BY item.created_at DESC LIMIT 1
         ) payment ON true
        WHERE rfq.id = $1 LIMIT 1`,
      [project.rfq_id]
    ) : Promise.resolve([])
  ]);
  const commerce = commerceRows[0] || {};
  return {
    project: {
      id: project.id,
      title: project.title,
      projectType: project.project_type,
      city: project.city || "",
      area: project.area === null ? null : Number(project.area),
      budget: project.budget === null ? null : Number(project.budget),
      currency: project.currency,
      status: project.status,
      note: project.note || "",
      startDate: project.start_date || "",
      targetEndDate: project.target_end_date || "",
      rfqId: project.rfq_id || null,
      createdAt: project.created_at,
      updatedAt: project.updated_at
    },
    items: items.map(mapItem),
    milestones: milestones.map(mapMilestone),
    supplierMatches: matches.map(mapMatch),
    documents: documents.map((row) => ({
      id: row.id,
      filename: row.filename,
      url: row.url,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes || 0),
      createdAt: row.created_at
    })),
    commerce: {
      rfqId: commerce.rfq_id || null,
      rfqStatus: commerce.rfq_status || "",
      proposalId: commerce.proposal_id || null,
      proposalNumber: commerce.document_number || "",
      proposalStatus: commerce.proposal_status || "",
      proposalTotal: commerce.proposal_total === null || commerce.proposal_total === undefined ? null : Number(commerce.proposal_total),
      proposalCurrency: commerce.proposal_currency || "AZN",
      orderId: commerce.order_id || null,
      orderNumber: commerce.order_number ? Number(commerce.order_number) : null,
      orderStatus: commerce.order_status || "",
      paymentStatus: commerce.payment_status || "",
      orderTotal: commerce.order_total === null || commerce.order_total === undefined ? null : Number(commerce.order_total),
      paymentId: commerce.payment_id || null,
      transactionStatus: commerce.transaction_status || ""
    }
  };
};

const saveProject = async (body, user) => {
  const id = entityId(body.id, "project");
  const items = normalizeItems(body.items || []);
  const title = text(body.title, { field: "Layihə adı", required: true, max: 240 });
  const rows = await query(
    `WITH upserted AS (
       INSERT INTO customer_projects (
         id, customer_id, title, project_type, city, area, budget, currency,
         status, note, start_date, target_end_date, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, project_type = EXCLUDED.project_type, city = EXCLUDED.city,
         area = EXCLUDED.area, budget = EXCLUDED.budget, currency = EXCLUDED.currency,
         status = EXCLUDED.status, note = EXCLUDED.note, start_date = EXCLUDED.start_date,
         target_end_date = EXCLUDED.target_end_date, updated_at = now()
       WHERE customer_projects.customer_id = EXCLUDED.customer_id
       RETURNING id
     ), cleared AS (
       DELETE FROM customer_project_items item
        WHERE item.project_id IN (SELECT id FROM upserted)
     ), inserted AS (
       INSERT INTO customer_project_items (
         id, project_id, item_type, item_id, title, quantity, unit, unit_price,
         currency, price_status, source_url, snapshot, sort_order, updated_at
       )
       SELECT item.id, upserted.id, item.item_type, item.item_id, item.title,
              item.quantity, item.unit, item.unit_price, item.currency, item.price_status,
              item.source_url, item.snapshot, item.sort_order, now()
         FROM upserted
         CROSS JOIN LATERAL jsonb_to_recordset($13::jsonb) AS item(
           id text, item_type text, item_id text, title text, quantity numeric,
           unit text, unit_price numeric, currency text, price_status text,
           source_url text, snapshot jsonb, sort_order integer
         )
       RETURNING id
     )
     SELECT id, (SELECT count(*)::int FROM inserted) AS item_count FROM upserted`,
    [
      id, user.id, title,
      oneOf(body.projectType, projectTypes, "other", "Layihə tipi"),
      text(body.city, { max: 160 }) || null,
      parsePriceAmount(body.area), parsePriceAmount(body.budget),
      oneOf(body.currency, ["AZN", "USD", "EUR"], "AZN", "Valyuta"),
      oneOf(body.status, projectStatuses, "planning", "Layihə statusu"),
      text(body.note, { max: 3_000 }) || null,
      dateValue(body.startDate, "Başlama tarixi"),
      dateValue(body.targetEndDate, "Hədəf bitmə tarixi"),
      JSON.stringify(items.map((item) => ({
        id: item.id,
        item_type: item.itemType,
        item_id: item.itemId,
        title: item.title,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unitPrice,
        currency: item.currency,
        price_status: item.priceStatus,
        source_url: item.sourceUrl,
        snapshot: item.snapshot,
        sort_order: item.sortOrder
      })))
    ]
  );
  if (!rows[0]) throw new ApiError(403, "project_forbidden", "Bu layihəni dəyişmək icazəsi yoxdur.");
  await recordAudit({ actorId: user.id, action: "sync", entityType: "customer_project", entityId: id, details: { itemCount: items.length } });
  return id;
};

const supplierTokens = (value) => new Set(String(value || "").toLocaleLowerCase("az-AZ").split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4));

const matchSuppliers = async (projectId, user) => {
  const project = await requireProject(projectId, user);
  const [items, suppliers, resolvedProducts, resolvedEntities] = await Promise.all([
    query("SELECT * FROM customer_project_items WHERE project_id = $1", [projectId]),
    query(
      `SELECT supplier.*,
              COALESCE(array_agg(DISTINCT product.category_id) FILTER (WHERE product.category_id IS NOT NULL), '{}') AS category_ids,
              count(DISTINCT product.id)::int AS product_count,
              review.average_rating, review.verified_reviews
         FROM suppliers supplier
         LEFT JOIN products product ON product.supplier_id = supplier.id AND product.status = 'active'
         LEFT JOIN LATERAL (
           SELECT avg(rating)::numeric(5, 2) AS average_rating,
                  count(*) FILTER (WHERE verified = true)::int AS verified_reviews
             FROM marketplace_reviews
            WHERE target_type = 'supplier' AND target_id = supplier.id AND status = 'published'
         ) review ON true
        WHERE supplier.status <> 'Arxiv'
        GROUP BY supplier.id, review.average_rating, review.verified_reviews`,
      []
    ),
    query(
      "SELECT id, supplier_id, category_id, subcategory FROM products WHERE id = ANY($1::text[]) AND status = 'active'",
      [items.filter((item) => item.item_type === "product").map((item) => item.item_id)]
    ),
    query(
      "SELECT id, category_id, subcategory, extra_data->>'supplierId' AS supplier_id FROM marketplace_entities WHERE id = ANY($1::text[]) AND status = 'active'",
      [items.filter((item) => item.item_type !== "product").map((item) => item.item_id)]
    )
  ]);
  if (!items.length) throw new ApiError(409, "project_items_required", "Təchizatçı uyğunlaşdırması üçün layihəyə mövqe əlavə et.");
  const resolved = [...resolvedProducts, ...resolvedEntities];
  const directBySupplier = new Map();
  const projectCategories = new Set();
  resolved.forEach((item) => {
    if (item.category_id) projectCategories.add(item.category_id);
    if (item.supplier_id) directBySupplier.set(item.supplier_id, (directBySupplier.get(item.supplier_id) || 0) + 1);
  });
  items.forEach((item) => {
    const supplierId = text(item.snapshot?.supplierId, { max: 160 });
    if (supplierId) directBySupplier.set(supplierId, (directBySupplier.get(supplierId) || 0) + 1);
  });
  const projectWords = supplierTokens([
    project.title, project.project_type, project.city, project.note,
    ...items.flatMap((item) => [item.title, item.snapshot?.category, item.snapshot?.subcategory, item.snapshot?.brand])
  ].join(" "));
  const matches = suppliers.map((supplier) => {
    const direct = directBySupplier.get(supplier.id) || 0;
    const categoryCoverage = (supplier.category_ids || []).filter((category) => projectCategories.has(category)).length;
    const focusWords = supplierTokens(`${supplier.name} ${supplier.focus || ""}`);
    const tokenMatches = [...focusWords].filter((word) => projectWords.has(word)).length;
    const reviewAverage = Number(supplier.average_rating || 0);
    const verifiedReviews = Number(supplier.verified_reviews || 0);
    const regionFit = project.city && String(supplier.region || "").toLocaleLowerCase("az-AZ").includes(String(project.city).split(",")[0].trim().toLocaleLowerCase("az-AZ"));
    const score = Math.min(100,
      (direct ? 42 + Math.min(18, direct * 6) : 0)
      + Math.min(22, categoryCoverage * 7)
      + Math.min(10, tokenMatches * 2)
      + (regionFit ? 5 : 0)
      + Math.min(5, reviewAverage)
      + Math.min(4, verifiedReviews)
      + (Number(supplier.product_count || 0) > 0 ? 2 : 0)
    );
    const reasons = [
      direct ? `${direct} mövqe üzrə birbaşa təchizatçı` : "",
      categoryCoverage ? `${categoryCoverage} kateqoriya uyğunluğu` : "",
      tokenMatches ? "İxtisaslaşma layihə ehtiyacı ilə uyğun gəlir" : "",
      regionFit ? "Region uyğunluğu" : "",
      verifiedReviews ? `${verifiedReviews} təsdiqlənmiş rəy` : ""
    ].filter(Boolean);
    return { supplier, direct, categoryCoverage, score: Number(score.toFixed(2)), reasons, reviewAverage, verifiedReviews };
  }).filter((item) => item.score >= 8).sort((a, b) => b.score - a.score).slice(0, 10);
  await query(
    `WITH cleared AS (
       DELETE FROM customer_project_supplier_matches WHERE project_id = $1
     )
     INSERT INTO customer_project_supplier_matches (
       project_id, supplier_id, score, coverage_count, reasons, snapshot, matched_at
     )
     SELECT $1, match.supplier_id, match.score, match.coverage_count,
            match.reasons, match.snapshot, now()
       FROM jsonb_to_recordset($2::jsonb) AS match(
         supplier_id text, score numeric, coverage_count integer, reasons jsonb, snapshot jsonb
       )`,
    [projectId, JSON.stringify(matches.map((item) => ({
      supplier_id: item.supplier.id,
      score: item.score,
      coverage_count: item.direct + item.categoryCoverage,
      reasons: item.reasons,
      snapshot: {
        name: item.supplier.name,
        region: item.supplier.region,
        website: item.supplier.website,
        rating: item.supplier.rating,
        reviewAverage: item.reviewAverage,
        verifiedReviews: item.verifiedReviews
      }
    })))]
  );
  await queueNotification({
    userId: user.id,
    channel: "in_app",
    subject: "Layihə üçün təchizatçılar seçildi",
    body: `${project.title}: ${matches.length} uyğun təchizatçı tapıldı.`,
    templateKey: "project_supplier_matches",
    payload: { projectId, url: `/project-planner.html?project=${encodeURIComponent(projectId)}` }
  });
  await recordAudit({ actorId: user.id, action: "match_suppliers", entityType: "customer_project", entityId: projectId, details: { matchCount: matches.length } });
};

const saveMilestone = async (body, user) => {
  const projectId = text(body.projectId, { field: "Layihə", required: true, max: 160 });
  const project = await requireProject(projectId, user);
  const id = entityId(body.id, "milestone");
  const title = text(body.title, { field: "Mərhələ adı", required: true, max: 240 });
  const dueDate = dateValue(body.dueDate, "Mərhələ tarixi", true);
  await query(
    `UPDATE notifications SET status = 'cancelled', updated_at = now()
      WHERE status = 'pending' AND template_key = 'project_milestone_due'
        AND payload->>'milestoneId' = $1`,
    [id]
  );
  const remindAt = new Date(`${dueDate}T09:00:00+04:00`);
  remindAt.setUTCDate(remindAt.getUTCDate() - 3);
  const availableAt = remindAt > new Date() ? remindAt.toISOString() : new Date().toISOString();
  const reminderId = body.reminder === false || String(body.reminder) === "false" ? null : await queueNotification({
    userId: user.id,
    channel: "in_app",
    subject: `Layihə xatırlatması: ${title}`,
    body: `${project.title} layihəsində “${title}” mərhələsinin tarixi ${dueDate}-dir.`,
    templateKey: "project_milestone_due",
    payload: { projectId, milestoneId: id, url: `/project-planner.html?project=${encodeURIComponent(projectId)}` },
    availableAt
  });
  if (reminderId && process.env.EMAIL_WEBHOOK_URL && user.email) {
    await queueNotification({
      userId: user.id,
      channel: "email",
      recipient: user.email,
      subject: `Layihə xatırlatması: ${title}`,
      body: `${project.title} layihəsində “${title}” mərhələsinin tarixi ${dueDate}-dir.`,
      templateKey: "project_milestone_due",
      payload: { projectId, milestoneId: id, url: `/project-planner.html?project=${encodeURIComponent(projectId)}` },
      availableAt
    });
  }
  if (reminderId && process.env.WHATSAPP_WEBHOOK_URL && user.companyId) {
    const company = (await query("SELECT phone FROM companies WHERE id = $1 LIMIT 1", [user.companyId]))[0];
    if (company?.phone) {
      await queueNotification({
        userId: user.id,
        channel: "whatsapp",
        recipient: company.phone,
        subject: `Layihə xatırlatması: ${title}`,
        body: `${project.title}: “${title}” mərhələsinin tarixi ${dueDate}-dir.`,
        templateKey: "project_milestone_due",
        payload: { projectId, milestoneId: id, url: `/project-planner.html?project=${encodeURIComponent(projectId)}` },
        availableAt
      });
    }
  }
  const rows = await query(
    `INSERT INTO customer_project_milestones (
       id, project_id, title, milestone_type, due_date, status, note, reminder_notification_id, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title, milestone_type = EXCLUDED.milestone_type,
       due_date = EXCLUDED.due_date, status = EXCLUDED.status, note = EXCLUDED.note,
       reminder_notification_id = EXCLUDED.reminder_notification_id, updated_at = now()
     WHERE customer_project_milestones.project_id = EXCLUDED.project_id
     RETURNING id`,
    [
      id, projectId, title,
      oneOf(body.type, milestoneTypes, "other", "Mərhələ tipi"), dueDate,
      oneOf(body.status, milestoneStatuses, "planned", "Mərhələ statusu"),
      text(body.note, { max: 1_000 }) || null, reminderId
    ]
  );
  if (!rows[0]) throw new ApiError(403, "milestone_forbidden", "Bu mərhələni dəyişmək icazəsi yoxdur.");
  await recordAudit({ actorId: user.id, action: "upsert", entityType: "project_milestone", entityId: id, details: { projectId, dueDate } });
  return projectId;
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req);
  if (req.method === "GET") {
    const projectId = text(req.query.id || req.query.projectId, { field: "Layihə", required: true, max: 160 });
    return sendJson(res, 200, { ok: true, data: await readWorkspace(projectId, user) });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const body = await readJson(req, 300_000);
  const action = text(body.action, { field: "Əməliyyat", required: true, max: 60 });

  if (req.method === "DELETE") {
    if (action === "delete-milestone") {
      const id = text(body.id, { field: "Mərhələ", required: true, max: 160 });
      const rows = await query(
        `DELETE FROM customer_project_milestones milestone
          USING customer_projects project
         WHERE milestone.id = $1 AND milestone.project_id = project.id AND project.customer_id = $2
         RETURNING milestone.project_id, milestone.reminder_notification_id`,
        [id, user.id]
      );
      if (!rows[0]) throw new ApiError(404, "milestone_not_found", "Mərhələ tapılmadı.");
      await query(
        `UPDATE notifications SET status = 'cancelled', updated_at = now()
          WHERE status = 'pending' AND template_key = 'project_milestone_due'
            AND payload->>'milestoneId' = $1`,
        [id]
      );
      await recordAudit({ actorId: user.id, action: "delete", entityType: "project_milestone", entityId: id });
      return sendJson(res, 200, { ok: true, data: await readWorkspace(rows[0].project_id, user) });
    }
    throw new ApiError(400, "invalid_action", "Silinmə əməliyyatı dəstəklənmir.");
  }

  let projectId;
  if (action === "sync") projectId = await saveProject(body, user);
  else if (action === "match-suppliers") {
    projectId = text(body.projectId, { field: "Layihə", required: true, max: 160 });
    await matchSuppliers(projectId, user);
  } else if (action === "save-milestone") projectId = await saveMilestone(body, user);
  else throw new ApiError(400, "invalid_action", "Layihə əməliyyatı dəstəklənmir.");

  return sendJson(res, 200, { ok: true, data: await readWorkspace(projectId, user) });
});
