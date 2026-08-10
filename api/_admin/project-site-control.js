import { randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { queueNotification } from "../_lib/notifications.js";
import { buildProjectMaterialSummary, receiptStatus } from "../_lib/project-site-control.js";
import { entityId, oneOf, text } from "../_lib/validation.js";

const privilegedRoles = new Set(["super_admin", "admin", "sales"]);
const movementTypes = ["use", "waste", "return"];

const quantity = (value, field) => {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 1_000_000) {
    throw new ApiError(400, "validation_error", `${field} düzgün miqdar olmalıdır.`);
  }
  return Number(result.toFixed(3));
};

const dateTime = (value, field) => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new ApiError(400, "validation_error", `${field} düzgün tarix olmalıdır.`);
  return parsed.toISOString();
};

const requireProject = async (projectId, user) => {
  const rows = await query(
    `SELECT project.*
       FROM customer_projects project
      WHERE project.id = $1
        AND (project.customer_id = $2 OR $3::boolean = true)
      LIMIT 1`,
    [projectId, user.id, privilegedRoles.has(user.role)]
  );
  if (!rows[0]) throw new ApiError(404, "project_not_found", "Layihə tapılmadı və ya giriş icazəsi yoxdur.");
  return rows[0];
};

const requireProjectItem = async (projectId, projectItemId) => {
  const rows = await query(
    `SELECT id, project_id, item_id, item_type, title, quantity, unit, snapshot
       FROM customer_project_items
      WHERE id = $1 AND project_id = $2 AND item_type = 'product'
      LIMIT 1`,
    [projectItemId, projectId]
  );
  if (!rows[0]) throw new ApiError(404, "project_material_not_found", "Layihənin material mövqeyi tapılmadı.");
  return rows[0];
};

const mapReceipt = (row) => ({
  id: row.id,
  number: Number(row.receipt_number),
  code: row.receipt_code,
  projectId: row.project_id,
  projectItemId: row.project_item_id,
  orderId: row.order_id || null,
  orderItemId: row.order_item_id || null,
  title: row.item_title,
  status: row.status,
  deliveredQuantity: Number(row.delivered_quantity),
  acceptedQuantity: Number(row.accepted_quantity),
  rejectedQuantity: Number(row.rejected_quantity),
  unit: row.unit,
  supplierName: row.supplier_name || "",
  deliveryNoteNumber: row.delivery_note_number || "",
  batchNumber: row.batch_number || "",
  vehiclePlate: row.vehicle_plate || "",
  conditionNote: row.condition_note || "",
  photoAssetId: row.photo_asset_id || null,
  photoUrl: row.photo_url || "",
  receivedBy: row.received_by_name || "İstifadəçi",
  receivedAt: row.received_at,
  createdAt: row.created_at
});

const mapMovement = (row) => ({
  id: row.id,
  projectId: row.project_id,
  projectItemId: row.project_item_id,
  receiptId: row.receipt_id || null,
  title: row.item_title,
  type: row.movement_type,
  quantity: Number(row.quantity),
  unit: row.unit,
  workArea: row.work_area || "",
  note: row.note || "",
  recordedBy: row.recorded_by_name || "İstifadəçi",
  recordedAt: row.recorded_at
});

const readSiteControl = async (projectId, user) => {
  const project = await requireProject(projectId, user);
  const [itemRows, receiptRows, movementRows, orderItemRows] = await Promise.all([
    query(
      `SELECT id, item_id, title, quantity, unit, snapshot
         FROM customer_project_items
        WHERE project_id = $1 AND item_type = 'product'
        ORDER BY sort_order, created_at`,
      [projectId]
    ),
    query(
      `SELECT receipt.*, item.title AS item_title, media.url AS photo_url,
              COALESCE(person.name, person.email) AS received_by_name
         FROM project_material_receipts receipt
         JOIN customer_project_items item ON item.id = receipt.project_item_id
         LEFT JOIN media_assets media ON media.id = receipt.photo_asset_id AND media.status = 'active'
         LEFT JOIN users person ON person.id = receipt.received_by
        WHERE receipt.project_id = $1
        ORDER BY receipt.received_at DESC, receipt.created_at DESC
        LIMIT 300`,
      [projectId]
    ),
    query(
      `SELECT movement.*, item.title AS item_title,
              COALESCE(person.name, person.email) AS recorded_by_name
         FROM project_material_movements movement
         JOIN customer_project_items item ON item.id = movement.project_item_id
         LEFT JOIN users person ON person.id = movement.recorded_by
        WHERE movement.project_id = $1
        ORDER BY movement.recorded_at DESC, movement.created_at DESC
        LIMIT 500`,
      [projectId]
    ),
    project.rfq_id ? query(
      `SELECT item.id, item.order_id, item.product_id, item.title, item.quantity, item.unit,
              orders.order_number, item.snapshot->>'supplier' AS supplier_name
         FROM orders
         JOIN order_items item ON item.order_id = orders.id
        WHERE orders.rfq_id = $1 AND orders.customer_id = $2
        ORDER BY orders.created_at DESC, item.created_at`,
      [project.rfq_id, project.customer_id]
    ) : Promise.resolve([])
  ]);

  const projectItems = itemRows.map((row) => ({
    rowId: row.id,
    id: row.item_id,
    title: row.title,
    quantity: Number(row.quantity),
    unit: row.unit,
    snapshot: row.snapshot || {}
  }));
  const receipts = receiptRows.map(mapReceipt);
  const movements = movementRows.map(mapMovement);
  return {
    project: { id: project.id, title: project.title, status: project.status },
    projectItems,
    receipts,
    movements,
    orderItems: orderItemRows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      orderNumber: Number(row.order_number),
      productId: row.product_id || null,
      title: row.title,
      quantity: Number(row.quantity),
      unit: row.unit,
      supplierName: row.supplier_name || ""
    })),
    summary: buildProjectMaterialSummary(projectItems, receipts, movements)
  };
};

const createReceipt = async (body, user) => {
  const projectId = text(body.projectId, { field: "Layihə", required: true, max: 160 });
  const project = await requireProject(projectId, user);
  const projectItemId = text(body.projectItemId, { field: "Material", required: true, max: 160 });
  const item = await requireProjectItem(projectId, projectItemId);
  const deliveredQuantity = quantity(body.deliveredQuantity, "Çatdırılan miqdar");
  const acceptedQuantity = quantity(body.acceptedQuantity, "Qəbul edilən miqdar");
  const rejectedQuantity = quantity(body.rejectedQuantity, "Rədd edilən miqdar");
  const status = receiptStatus({ deliveredQuantity, acceptedQuantity, rejectedQuantity });
  if (status === "invalid" || deliveredQuantity === 0) {
    throw new ApiError(400, "invalid_receipt_quantities", "Qəbul miqdarları çatdırılan miqdarı aşa bilməz.");
  }

  let orderId = null;
  let orderItemId = text(body.orderItemId, { max: 160 }) || null;
  if (orderItemId) {
    const orderRows = await query(
      `SELECT item.order_id, item.product_id
         FROM order_items item
         JOIN orders ON orders.id = item.order_id
        WHERE item.id = $1 AND orders.customer_id = $2
          AND ($3::text IS NULL OR orders.rfq_id = $3)
        LIMIT 1`,
      [orderItemId, project.customer_id, project.rfq_id]
    );
    if (!orderRows[0]) throw new ApiError(409, "order_item_mismatch", "Sifariş mövqeyi bu layihəyə aid deyil.");
    orderId = orderRows[0].order_id;
  }

  const photoAssetId = text(body.photoAssetId, { max: 160 }) || null;
  if (photoAssetId) {
    const mediaRows = await query(
      `SELECT id FROM media_assets
        WHERE id = $1 AND entity_type = 'project' AND entity_id = $2
          AND status = 'active' AND (owner_id = $3 OR $4::boolean = true)
        LIMIT 1`,
      [photoAssetId, projectId, user.id, privilegedRoles.has(user.role)]
    );
    if (!mediaRows[0]) throw new ApiError(409, "receipt_photo_mismatch", "Qəbul fotosu bu layihəyə aid deyil.");
  }

  const id = entityId(body.id, "receipt");
  const code = `CE-QB-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
  const rows = await query(
    `INSERT INTO project_material_receipts (
       id, receipt_code, project_id, project_item_id, order_id, order_item_id,
       status, delivered_quantity, accepted_quantity, rejected_quantity, unit,
       supplier_name, delivery_note_number, batch_number, vehicle_plate,
       condition_note, photo_asset_id, received_by, received_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16, $17, $18, $19, now()
     ) RETURNING id`,
    [
      id, code, projectId, projectItemId, orderId, orderItemId, status,
      deliveredQuantity, acceptedQuantity, rejectedQuantity, item.unit,
      text(body.supplierName, { max: 240 }) || null,
      text(body.deliveryNoteNumber, { max: 120 }) || null,
      text(body.batchNumber, { max: 120 }) || null,
      text(body.vehiclePlate, { max: 40 }) || null,
      text(body.conditionNote, { max: 2_000 }) || null,
      photoAssetId, user.id, dateTime(body.receivedAt, "Qəbul tarixi")
    ]
  );
  await recordAudit({
    actorId: user.id,
    action: "material_receipt",
    entityType: "project_material_receipt",
    entityId: rows[0].id,
    details: { projectId, projectItemId, deliveredQuantity, acceptedQuantity, rejectedQuantity, status }
  });
  if (rejectedQuantity > 0) {
    await queueNotification({
      userId: project.customer_id,
      channel: "in_app",
      subject: `Material qəbulunda uyğunsuzluq: ${item.title}`,
      body: `${rejectedQuantity} ${item.unit} material qəbul zamanı rədd edildi. Qəbul kodu: ${code}.`,
      templateKey: "project_material_rejected",
      payload: { projectId, receiptId: rows[0].id, url: `/project-planner.html?project=${encodeURIComponent(projectId)}&receipt=${encodeURIComponent(rows[0].id)}` }
    });
  }
  return projectId;
};

const createMovement = async (body, user) => {
  const projectId = text(body.projectId, { field: "Layihə", required: true, max: 160 });
  await requireProject(projectId, user);
  const projectItemId = text(body.projectItemId, { field: "Material", required: true, max: 160 });
  const item = await requireProjectItem(projectId, projectItemId);
  const type = oneOf(body.type, movementTypes, "use", "Hərəkət tipi");
  const movementQuantity = quantity(body.quantity, "Hərəkət miqdarı");
  if (movementQuantity === 0) throw new ApiError(400, "invalid_movement_quantity", "Hərəkət miqdarı sıfırdan böyük olmalıdır.");
  const receiptId = text(body.receiptId, { max: 160 }) || null;
  if (receiptId) {
    const receiptRows = await query(
      "SELECT id FROM project_material_receipts WHERE id = $1 AND project_id = $2 AND project_item_id = $3 LIMIT 1",
      [receiptId, projectId, projectItemId]
    );
    if (!receiptRows[0]) throw new ApiError(409, "receipt_material_mismatch", "Qəbul aktı seçilmiş materiala aid deyil.");
  }

  if (["use", "waste"].includes(type)) {
    const balanceRows = await query(
      `SELECT
         COALESCE((SELECT sum(accepted_quantity) FROM project_material_receipts WHERE project_item_id = $1), 0)
         - COALESCE((SELECT sum(quantity) FROM project_material_movements WHERE project_item_id = $1 AND movement_type IN ('use', 'waste')), 0)
         + COALESCE((SELECT sum(quantity) FROM project_material_movements WHERE project_item_id = $1 AND movement_type = 'return'), 0)
         AS available`,
      [projectItemId]
    );
    if (movementQuantity > Number(balanceRows[0]?.available || 0)) {
      throw new ApiError(409, "insufficient_project_material", "Sərfiyyat obyekt üzrə qəbul edilmiş mövcud material qalığını aşır.");
    }
  }

  const id = `movement-${randomUUID()}`;
  await query(
    `INSERT INTO project_material_movements (
       id, project_id, project_item_id, receipt_id, movement_type,
       quantity, unit, work_area, note, recorded_by, recorded_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id, projectId, projectItemId, receiptId, type, movementQuantity, item.unit,
      text(body.workArea, { max: 240 }) || null,
      text(body.note, { max: 1_000 }) || null,
      user.id, dateTime(body.recordedAt, "Sərfiyyat tarixi")
    ]
  );
  await recordAudit({
    actorId: user.id,
    action: "material_movement",
    entityType: "project_material_movement",
    entityId: id,
    details: { projectId, projectItemId, type, quantity: movementQuantity }
  });
  return projectId;
};

const qrPayload = (projectId, receipt) => {
  const origin = String(process.env.PUBLIC_SITE_URL || "https://constera.az").replace(/\/$/, "");
  const url = new URL(`${origin}/project-planner.html`);
  url.searchParams.set("project", projectId);
  url.searchParams.set("receipt", receipt.id);
  url.searchParams.set("code", receipt.receipt_code);
  url.hash = "project-site-control";
  return url.toString();
};

export default withApiErrors(async (req, res) => {
  const user = await requireRole(req);
  if (req.method === "GET") {
    const projectId = text(req.query.projectId, { field: "Layihə", required: true, max: 160 });
    await requireProject(projectId, user);
    const qrReceiptId = text(req.query.qrReceiptId, { max: 160 });
    if (qrReceiptId) {
      const rows = await query(
        "SELECT id, receipt_code FROM project_material_receipts WHERE id = $1 AND project_id = $2 LIMIT 1",
        [qrReceiptId, projectId]
      );
      if (!rows[0]) throw new ApiError(404, "receipt_not_found", "Qəbul aktı tapılmadı.");
      const payload = qrPayload(projectId, rows[0]);
      const svg = await QRCode.toString(payload, { type: "svg", width: 240, margin: 1, errorCorrectionLevel: "M" });
      return sendJson(res, 200, { ok: true, data: { receiptId: rows[0].id, code: rows[0].receipt_code, payload, svg } });
    }
    return sendJson(res, 200, { ok: true, data: await readSiteControl(projectId, user) });
  }

  assertMethod(req, ["POST", "DELETE"]);
  assertSameOrigin(req);
  const body = await readJson(req, 300_000);
  const action = text(body.action, { field: "Əməliyyat", required: true, max: 60 });

  if (req.method === "DELETE") {
    const id = text(body.id, { field: "Qeyd", required: true, max: 160 });
    const table = action === "delete-receipt"
      ? "project_material_receipts"
      : action === "delete-movement" ? "project_material_movements" : "";
    if (!table) throw new ApiError(400, "invalid_action", "Silinmə əməliyyatı dəstəklənmir.");
    const rows = await query(
      `DELETE FROM ${table} entry
        USING customer_projects project
       WHERE entry.id = $1 AND entry.project_id = project.id
         AND (project.customer_id = $2 OR $3::boolean = true)
       RETURNING entry.project_id`,
      [id, user.id, privilegedRoles.has(user.role)]
    );
    if (!rows[0]) throw new ApiError(404, "site_control_entry_not_found", "Obyekt nəzarəti qeydi tapılmadı.");
    await recordAudit({ actorId: user.id, action: "delete", entityType: table, entityId: id });
    return sendJson(res, 200, { ok: true, data: await readSiteControl(rows[0].project_id, user) });
  }

  let projectId;
  if (action === "create-receipt") projectId = await createReceipt(body, user);
  else if (action === "create-movement") projectId = await createMovement(body, user);
  else throw new ApiError(400, "invalid_action", "Obyekt nəzarəti əməliyyatı dəstəklənmir.");
  return sendJson(res, 200, { ok: true, data: await readSiteControl(projectId, user) });
});
