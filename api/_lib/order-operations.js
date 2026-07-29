import { randomUUID } from "node:crypto";
import { query } from "./db.js";

export const mapFulfillment = (row) => ({
  id: row.id,
  orderId: row.order_id,
  supplierId: row.supplier_id,
  supplierName: row.supplier_name || "",
  status: row.status,
  trackingCode: row.tracking_code || "",
  deliveryProvider: row.delivery_provider || "",
  note: row.note || "",
  acceptedAt: row.accepted_at,
  shippedAt: row.shipped_at,
  deliveredAt: row.delivered_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const mapReservation = (row) => ({
  id: row.id,
  orderId: row.order_id,
  orderItemId: row.order_item_id,
  productId: row.product_id,
  supplierId: row.supplier_id,
  quantity: Number(row.quantity),
  status: row.status,
  reason: row.reason || "",
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const readOrderOperations = async (orderId) => {
  const [fulfillments, reservations] = await Promise.all([
    query(
      `SELECT fulfillment.*, supplier.name AS supplier_name
         FROM order_fulfillments fulfillment
         JOIN suppliers supplier ON supplier.id = fulfillment.supplier_id
        WHERE fulfillment.order_id = $1
        ORDER BY supplier.name`,
      [orderId]
    ),
    query(
      `SELECT *
         FROM inventory_reservations
        WHERE order_id = $1
        ORDER BY created_at`,
      [orderId]
    )
  ]);
  return {
    fulfillments: fulfillments.map(mapFulfillment),
    reservations: reservations.map(mapReservation)
  };
};

export const syncProductInventoryLevels = async (productIds = []) => {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return 0;
  await query(
    `INSERT INTO warehouses (id, supplier_id, name, city, is_default)
     SELECT
       'wh-' || md5(supplier.id),
       supplier.id,
       supplier.name || ' əsas anbarı',
       CASE WHEN supplier.region IS NULL OR btrim(supplier.region) = '' THEN 'Bakı' ELSE supplier.region END,
       true
     FROM suppliers supplier
     WHERE supplier.id IN (
       SELECT product.supplier_id
       FROM products product
       WHERE product.id = ANY($1::text[])
         AND product.supplier_id IS NOT NULL
     )
     ON CONFLICT (id) DO NOTHING`,
    [ids]
  );
  const rows = await query(
    `INSERT INTO inventory_levels (id, warehouse_id, product_id, stock_quantity)
     SELECT
       'ivl-' || md5(warehouse.id || ':' || product.id),
       warehouse.id,
       product.id,
       product.stock_quantity
     FROM products product
     JOIN warehouses warehouse
       ON warehouse.supplier_id = product.supplier_id
      AND warehouse.is_default = true
      AND warehouse.status = 'active'
     WHERE product.id = ANY($1::text[])
       AND product.stock_quantity IS NOT NULL
     ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
       stock_quantity = EXCLUDED.stock_quantity,
       updated_at = now()
     WHERE EXCLUDED.stock_quantity >= inventory_levels.reserved_quantity
     RETURNING product_id`,
    [ids]
  );
  await reconcileShortageReservations(rows.map((item) => item.product_id));
  return rows.length;
};

export const ensureOrderOperations = async (orderId) => {
  await query(
    `INSERT INTO order_fulfillments (id, order_id, supplier_id)
     SELECT
       'ful-' || md5(item.order_id || ':' || item.supplier_id),
       item.order_id,
       item.supplier_id
     FROM order_items item
     WHERE item.order_id = $1
       AND item.supplier_id IS NOT NULL
     GROUP BY item.order_id, item.supplier_id
     ON CONFLICT (order_id, supplier_id) DO NOTHING`,
    [orderId]
  );

  await query(
    `INSERT INTO warehouses (id, supplier_id, name, city, is_default)
     SELECT
       'wh-' || md5(supplier.id),
       supplier.id,
       supplier.name || ' əsas anbarı',
       CASE WHEN supplier.region IS NULL OR btrim(supplier.region) = '' THEN 'Bakı' ELSE supplier.region END,
       true
     FROM suppliers supplier
     WHERE supplier.id IN (
       SELECT item.supplier_id
       FROM order_items item
       WHERE item.order_id = $1
         AND item.supplier_id IS NOT NULL
     )
     ON CONFLICT (id) DO NOTHING`,
    [orderId]
  );

  await query(
    `INSERT INTO inventory_levels (id, warehouse_id, product_id, stock_quantity)
     SELECT
       'ivl-' || md5(warehouse.id || ':' || product.id),
       warehouse.id,
       product.id,
       COALESCE(
         offer.stock_quantity,
         CASE WHEN item.supplier_id = product.supplier_id THEN product.stock_quantity ELSE NULL END
       )
     FROM order_items item
     JOIN products product ON product.id = item.product_id
     LEFT JOIN product_offers offer ON offer.id = item.product_offer_id
     JOIN warehouses warehouse
       ON warehouse.supplier_id = item.supplier_id
      AND warehouse.is_default = true
      AND warehouse.status = 'active'
     WHERE item.order_id = $1
       AND COALESCE(
         offer.stock_quantity,
         CASE WHEN item.supplier_id = product.supplier_id THEN product.stock_quantity ELSE NULL END
       ) IS NOT NULL
     ON CONFLICT (warehouse_id, product_id) DO NOTHING`,
    [orderId]
  );

  const inserted = await query(
    `WITH candidates AS MATERIALIZED (
       SELECT
         item.id AS order_item_id,
         item.order_id,
         item.product_id,
         COALESCE(item.supplier_id, product.supplier_id) AS supplier_id,
         item.quantity,
         COALESCE(
           offer.stock_quantity,
           CASE
             WHEN COALESCE(item.supplier_id, product.supplier_id) = product.supplier_id
               THEN product.stock_quantity
             ELSE NULL
           END
         ) AS available_stock
       FROM order_items item
       JOIN products product ON product.id = item.product_id
       LEFT JOIN product_offers offer ON offer.id = item.product_offer_id
       WHERE item.order_id = $1
         AND item.product_id IS NOT NULL
         AND COALESCE(
           offer.stock_quantity,
           CASE
             WHEN COALESCE(item.supplier_id, product.supplier_id) = product.supplier_id
               THEN product.stock_quantity
             ELSE NULL
           END
         ) IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM inventory_reservations existing
           WHERE existing.order_item_id = item.id
         )
     ), requested AS (
       SELECT product_id, supplier_id, sum(quantity) AS quantity
       FROM candidates
       GROUP BY product_id, supplier_id
     ), granted AS (
       UPDATE inventory_levels level
          SET reserved_quantity = level.reserved_quantity + requested.quantity,
              updated_at = now()
         FROM requested, warehouses warehouse
        WHERE level.product_id = requested.product_id
          AND level.warehouse_id = warehouse.id
          AND warehouse.supplier_id = requested.supplier_id
          AND warehouse.is_default = true
          AND warehouse.status = 'active'
          AND level.stock_quantity - level.reserved_quantity >= requested.quantity
       RETURNING level.product_id, warehouse.supplier_id
     )
     INSERT INTO inventory_reservations (
       id, order_id, order_item_id, product_id, supplier_id,
       quantity, status, reason, expires_at
     )
     SELECT
       $2 || md5(candidate.order_item_id),
       candidate.order_id,
       candidate.order_item_id,
       candidate.product_id,
       candidate.supplier_id,
       candidate.quantity,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM granted
           WHERE granted.product_id = candidate.product_id
             AND granted.supplier_id = candidate.supplier_id
         )
           THEN 'active'
         ELSE 'shortage'
       END,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM granted
           WHERE granted.product_id = candidate.product_id
             AND granted.supplier_id = candidate.supplier_id
         )
           THEN 'Sifariş üçün rezerv edildi'
         ELSE 'Kifayət qədər sərbəst stok yoxdur'
       END,
       now() + interval '7 days'
     FROM candidates candidate
     ON CONFLICT (order_item_id) DO NOTHING
     RETURNING product_id, status`,
    [orderId, `res-${randomUUID().slice(0, 8)}-`]
  );
  if (!inserted.length) return readOrderOperations(orderId);
  return readOrderOperations(orderId);
};

export const releaseOrderReservations = async (orderId, supplierId = null, reason = "Sifariş ləğv edildi") => {
  const values = [orderId, reason];
  let scope = "";
  if (supplierId) {
    values.push(supplierId);
    scope = `AND supplier_id = $${values.length}`;
  }
  const released = await query(
    `WITH candidates AS MATERIALIZED (
       SELECT id, product_id, supplier_id, quantity, status
       FROM inventory_reservations
       WHERE order_id = $1
         AND status IN ('active', 'shortage')
         ${scope}
       FOR UPDATE
     ), changed AS (
       UPDATE inventory_reservations reservation
          SET status = 'released', reason = $2, updated_at = now()
         FROM candidates
        WHERE reservation.id = candidates.id
       RETURNING candidates.product_id, candidates.supplier_id,
                 candidates.quantity, candidates.status AS previous_status
     ), totals AS (
       SELECT product_id, supplier_id, sum(quantity) AS quantity
       FROM changed
       WHERE previous_status = 'active'
       GROUP BY product_id, supplier_id
     ), levels_updated AS (
       UPDATE inventory_levels level
          SET reserved_quantity = greatest(0, level.reserved_quantity - totals.quantity),
              updated_at = now()
         FROM totals, warehouses warehouse
        WHERE level.product_id = totals.product_id
          AND level.warehouse_id = warehouse.id
          AND warehouse.supplier_id = totals.supplier_id
          AND warehouse.is_default = true
       RETURNING level.product_id
     )
     SELECT product_id FROM changed`,
    values
  );
  return released.length;
};

export const consumeOrderReservations = async (orderId, supplierId = null) => {
  const values = [orderId];
  let supplierScope = "";
  if (supplierId) {
    values.push(supplierId);
    supplierScope = `AND supplier_id = $${values.length}`;
  }
  const consumed = await query(
    `WITH claimed AS (
       UPDATE inventory_reservations
          SET status = 'consumed', reason = 'Tamamlanmış sifariş üzrə stokdan çıxıldı', updated_at = now()
        WHERE order_id = $1
          AND status = 'active'
          ${supplierScope}
       RETURNING product_id, supplier_id, quantity
     ), totals AS (
       SELECT product_id, supplier_id, sum(quantity) AS quantity
       FROM claimed
       GROUP BY product_id, supplier_id
     ), canonical_totals AS (
       SELECT totals.product_id, sum(totals.quantity) AS quantity
       FROM totals
       JOIN products product
         ON product.id = totals.product_id
        AND product.supplier_id = totals.supplier_id
       GROUP BY totals.product_id
     ), products_updated AS (
       UPDATE products product
          SET stock_quantity = greatest(0, product.stock_quantity - canonical_totals.quantity),
              availability = CASE
                WHEN greatest(0, product.stock_quantity - canonical_totals.quantity) > 0 THEN product.availability
                ELSE 'Stokda yoxdur'
              END,
              updated_at = now()
         FROM canonical_totals
        WHERE product.id = canonical_totals.product_id
       RETURNING product.id
     ), levels_updated AS (
       UPDATE inventory_levels level
          SET stock_quantity = greatest(0, level.stock_quantity - totals.quantity),
              reserved_quantity = greatest(0, level.reserved_quantity - totals.quantity),
              updated_at = now()
         FROM totals, warehouses warehouse
        WHERE level.product_id = totals.product_id
          AND warehouse.id = level.warehouse_id
          AND warehouse.supplier_id = totals.supplier_id
          AND warehouse.is_default = true
       RETURNING level.product_id
     )
     SELECT product_id FROM claimed`,
    values
  );
  return consumed.length;
};

export const reconcileShortageReservations = async (productIds = []) => {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return 0;
  const promoted = await query(
    `WITH capacity AS MATERIALIZED (
       SELECT level.product_id, warehouse.supplier_id,
              greatest(level.stock_quantity - level.reserved_quantity, 0) AS available_quantity
       FROM inventory_levels level
       JOIN warehouses warehouse ON warehouse.id = level.warehouse_id
       WHERE level.product_id = ANY($1::text[])
         AND warehouse.is_default = true
         AND warehouse.status = 'active'
     ), queued AS MATERIALIZED (
       SELECT shortage.id, shortage.product_id,
              shortage.supplier_id,
              shortage.quantity,
              sum(shortage.quantity) OVER (
                PARTITION BY shortage.product_id, shortage.supplier_id
                ORDER BY shortage.created_at, shortage.id
              ) AS cumulative_quantity
         FROM inventory_reservations shortage
        WHERE shortage.product_id = ANY($1::text[])
          AND shortage.status = 'shortage'
     ), selected AS (
       SELECT queued.*
       FROM queued
       JOIN capacity
         ON capacity.product_id = queued.product_id
        AND capacity.supplier_id = queued.supplier_id
       WHERE queued.cumulative_quantity <= capacity.available_quantity
     ), requested AS (
       SELECT product_id, supplier_id, sum(quantity) AS quantity
       FROM selected
       GROUP BY product_id, supplier_id
     ), levels_updated AS (
       UPDATE inventory_levels level
          SET reserved_quantity = level.reserved_quantity + requested.quantity,
              updated_at = now()
         FROM requested, warehouses warehouse
        WHERE level.product_id = requested.product_id
          AND level.warehouse_id = warehouse.id
          AND warehouse.supplier_id = requested.supplier_id
          AND warehouse.is_default = true
          AND level.stock_quantity - level.reserved_quantity >= requested.quantity
       RETURNING level.product_id, warehouse.supplier_id
     )
     UPDATE inventory_reservations reservation
        SET status = 'active',
            reason = 'Stok yeniləndikdən sonra avtomatik rezerv edildi',
            expires_at = now() + interval '7 days',
            updated_at = now()
       FROM selected, levels_updated
      WHERE reservation.id = selected.id
        AND levels_updated.product_id = selected.product_id
        AND levels_updated.supplier_id = selected.supplier_id
     RETURNING reservation.product_id`,
    [ids]
  );
  return promoted.length;
};

export const syncOperationsForOrderStatus = async (orderId, status) => {
  if (status === "cancelled") {
    await query(
      `UPDATE order_fulfillments
          SET status = 'cancelled', updated_at = now()
        WHERE order_id = $1 AND status NOT IN ('delivered', 'cancelled')`,
      [orderId]
    );
    await releaseOrderReservations(orderId);
  } else if (status === "completed") {
    await query(
      `UPDATE order_fulfillments
          SET status = 'delivered', delivered_at = COALESCE(delivered_at, now()), updated_at = now()
        WHERE order_id = $1 AND status <> 'cancelled'`,
      [orderId]
    );
    await consumeOrderReservations(orderId);
  }
};
