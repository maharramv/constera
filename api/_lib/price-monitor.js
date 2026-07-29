import { query } from "./db.js";
import { queueNotification } from "./notifications.js";

const notifySupplierUsers = async (requests, templateKey, subject, bodyFor) => {
  const supplierIds = [...new Set(requests.map((item) => item.supplier_id).filter(Boolean))];
  if (!supplierIds.length) return 0;
  const users = await query(
    `SELECT users.id, users.email, supplier.id AS supplier_id
       FROM suppliers supplier
       JOIN users ON users.company_id = supplier.company_id
      WHERE supplier.id = ANY($1::text[])
        AND users.role = 'supplier' AND users.status = 'active'`,
    [supplierIds]
  );
  let queued = 0;
  for (const user of users) {
    const supplierRequests = requests.filter((item) => item.supplier_id === user.supplier_id);
    if (!supplierRequests.length) continue;
    await queueNotification({
      userId: user.id,
      channel: process.env.EMAIL_WEBHOOK_URL ? "email" : "in_app",
      recipient: process.env.EMAIL_WEBHOOK_URL ? user.email : null,
      subject,
      body: bodyFor(supplierRequests),
      templateKey,
      payload: {
        supplierId: user.supplier_id,
        requestIds: supplierRequests.map((item) => item.id),
        productIds: supplierRequests.map((item) => item.product_id)
      }
    });
    queued += 1;
  }
  return queued;
};

export const runPriceFreshnessScan = async ({ actorId = null, notify = true } = {}) => {
  const expired = await query(
    `UPDATE products
        SET price_status = 'expired',
            price_note = CASE
              WHEN coalesce(price_note, '') ILIKE '%30 gündən köhnə qiymət%' THEN price_note
              ELSE coalesce(price_note, '') ||
                CASE WHEN coalesce(price_note, '') = '' THEN '' ELSE ' · ' END ||
                '30 gündən köhnə qiymət'
            END,
            updated_at = now()
      WHERE status = 'active'
        AND price_status = 'confirmed'
        AND COALESCE(price_verified_at, updated_at) < now() - interval '30 days'
      RETURNING id`
  );
  const created = await query(
    `INSERT INTO price_review_requests (
       id, product_id, supplier_id, reason, due_at, requested_by
     )
     SELECT
       'prr-' || md5(product.id || ':' || clock_timestamp()::text),
       product.id,
       product.supplier_id,
       CASE
         WHEN product.price_status = 'expired' THEN 'Qiymətin vaxtı keçib'
         ELSE 'Qiymətin təsdiq müddəti bitmək üzrədir'
       END,
       CASE
         WHEN product.price_status = 'expired' THEN now()
         ELSE COALESCE(product.price_verified_at, product.updated_at) + interval '30 days'
       END,
       $1
     FROM products product
     WHERE product.status = 'active'
       AND product.price_status IN ('confirmed', 'expired')
       AND (
         product.price_status = 'expired'
         OR COALESCE(product.price_verified_at, product.updated_at) < now() - interval '21 days'
       )
     ON CONFLICT (product_id) WHERE status = 'pending' DO NOTHING
     RETURNING id, product_id, supplier_id, reason, due_at`,
    [actorId]
  );
  const notifiedUsers = notify && created.length
    ? await notifySupplierUsers(
        created,
        "price_review_requested",
        "ConstEra qiymət təsdiqi tələb edir",
        (items) => `${items.length} məhsulun qiymətini və stokunu təchizatçı kabinetində yenidən təsdiqlə.`
      )
    : 0;
  return {
    expiredProducts: expired.length,
    createdRequests: created.length,
    notifiedUsers
  };
};

export const remindPriceReview = async (requestId) => {
  const rows = await query(
    `SELECT request.id, request.product_id, request.supplier_id, request.reason, request.due_at,
            product.name, product.sku
       FROM price_review_requests request
       JOIN products product ON product.id = request.product_id
      WHERE request.id = $1 AND request.status = 'pending'
      LIMIT 1`,
    [requestId]
  );
  const item = rows[0];
  if (!item) return null;
  const notifiedUsers = await notifySupplierUsers(
    [item],
    "price_review_reminder",
    "Qiymət yeniləmə xatırlatması",
    () => `${item.name} (${item.sku}) üçün qiymət və stok təsdiqi gözlənilir.`
  );
  await query(
    `UPDATE price_review_requests
        SET reminder_count = reminder_count + 1,
            last_reminded_at = now(), updated_at = now()
      WHERE id = $1`,
    [requestId]
  );
  return { request: item, notifiedUsers };
};
