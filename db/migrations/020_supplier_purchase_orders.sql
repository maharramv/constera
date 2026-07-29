BEGIN;

CREATE SEQUENCE IF NOT EXISTS supplier_purchase_order_number_seq
  START WITH 10001
  INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS supplier_purchase_orders (
  id text PRIMARY KEY,
  purchase_order_number bigint NOT NULL DEFAULT nextval('supplier_purchase_order_number_seq'),
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  fulfillment_id text REFERENCES order_fulfillments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'issued', 'accepted', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled')
  ),
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  total_quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  subtotal numeric(14, 2),
  delivery_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (delivery_amount >= 0),
  total_amount numeric(14, 2),
  currency char(3) NOT NULL DEFAULT 'AZN',
  has_pending_price boolean NOT NULL DEFAULT false,
  lead_time_days integer CHECK (lead_time_days IS NULL OR lead_time_days BETWEEN 0 AND 3650),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, supplier_id),
  UNIQUE (purchase_order_number)
);

CREATE TABLE IF NOT EXISTS supplier_purchase_order_items (
  id text PRIMARY KEY,
  purchase_order_id text NOT NULL REFERENCES supplier_purchase_orders(id) ON DELETE CASCADE,
  order_item_id text NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  unit_price numeric(14, 2),
  line_total numeric(14, 2),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id)
);

WITH supplier_groups AS (
  SELECT
    item.order_id,
    item.supplier_id,
    fulfillment.id AS fulfillment_id,
    count(*)::int AS item_count,
    sum(item.quantity) AS total_quantity,
    CASE
      WHEN count(*) FILTER (WHERE item.line_total IS NULL) > 0 THEN NULL
      ELSE sum(item.line_total)
    END AS subtotal,
    count(*) FILTER (WHERE item.line_total IS NULL) > 0 AS has_pending_price,
    max(
      CASE
        WHEN (item.snapshot->>'leadTimeDays') ~ '^[0-9]+$'
          THEN (item.snapshot->>'leadTimeDays')::int
        ELSE NULL
      END
    ) AS lead_time_days
  FROM order_items item
  LEFT JOIN order_fulfillments fulfillment
    ON fulfillment.order_id = item.order_id
   AND fulfillment.supplier_id = item.supplier_id
  WHERE item.supplier_id IS NOT NULL
  GROUP BY item.order_id, item.supplier_id, fulfillment.id
), order_weights AS (
  SELECT
    supplier_groups.*,
    sum(COALESCE(supplier_groups.subtotal, 0)) OVER (PARTITION BY supplier_groups.order_id) AS priced_total,
    sum(supplier_groups.total_quantity) OVER (PARTITION BY supplier_groups.order_id) AS quantity_total
  FROM supplier_groups
)
INSERT INTO supplier_purchase_orders (
  id, order_id, supplier_id, fulfillment_id, status,
  item_count, total_quantity, subtotal, delivery_amount, total_amount,
  currency, has_pending_price, lead_time_days, snapshot, issued_at
)
SELECT
  'spo-' || md5(order_weights.order_id || ':' || order_weights.supplier_id),
  order_weights.order_id,
  order_weights.supplier_id,
  order_weights.fulfillment_id,
  CASE
    WHEN orders.status = 'cancelled' OR orders.approval_status = 'rejected' THEN 'cancelled'
    WHEN orders.approval_status = 'pending' THEN 'draft'
    WHEN fulfillment.status IN ('accepted', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled')
      THEN fulfillment.status
    ELSE 'issued'
  END,
  order_weights.item_count,
  order_weights.total_quantity,
  order_weights.subtotal,
  round(
    COALESCE(orders.delivery_amount, 0)
    * CASE
        WHEN order_weights.priced_total > 0 AND order_weights.subtotal IS NOT NULL
          THEN order_weights.subtotal / order_weights.priced_total
        WHEN order_weights.quantity_total > 0
          THEN order_weights.total_quantity / order_weights.quantity_total
        ELSE 0
      END,
    2
  ),
  CASE
    WHEN order_weights.subtotal IS NULL THEN NULL
    ELSE order_weights.subtotal + round(
      COALESCE(orders.delivery_amount, 0)
      * CASE
          WHEN order_weights.priced_total > 0
            THEN order_weights.subtotal / order_weights.priced_total
          WHEN order_weights.quantity_total > 0
            THEN order_weights.total_quantity / order_weights.quantity_total
          ELSE 0
        END,
      2
    )
  END,
  orders.currency,
  order_weights.has_pending_price,
  order_weights.lead_time_days,
  jsonb_build_object(
    'orderNumber', orders.order_number,
    'companyName', orders.company_name,
    'city', orders.city,
    'deliveryMode', orders.delivery_mode
  ),
  CASE
    WHEN orders.approval_status IN ('not_required', 'approved') THEN now()
    ELSE NULL
  END
FROM order_weights
JOIN orders ON orders.id = order_weights.order_id
LEFT JOIN order_fulfillments fulfillment ON fulfillment.id = order_weights.fulfillment_id
ON CONFLICT (order_id, supplier_id) DO NOTHING;

INSERT INTO supplier_purchase_order_items (
  id, purchase_order_id, order_item_id, quantity, unit, unit_price, line_total, snapshot
)
SELECT
  'spi-' || md5(item.id),
  purchase_order.id,
  item.id,
  item.quantity,
  item.unit,
  item.unit_price,
  item.line_total,
  item.snapshot
FROM order_items item
JOIN supplier_purchase_orders purchase_order
  ON purchase_order.order_id = item.order_id
 AND purchase_order.supplier_id = item.supplier_id
ON CONFLICT (order_item_id) DO NOTHING;

WITH allocation_difference AS (
  SELECT
    orders.id AS order_id,
    max(purchase_order.purchase_order_number) AS target_number,
    round(COALESCE(orders.delivery_amount, 0) - sum(purchase_order.delivery_amount), 2) AS difference
  FROM orders
  JOIN supplier_purchase_orders purchase_order ON purchase_order.order_id = orders.id
  GROUP BY orders.id, orders.delivery_amount
)
UPDATE supplier_purchase_orders purchase_order
SET delivery_amount = purchase_order.delivery_amount + allocation_difference.difference,
    total_amount = CASE
      WHEN purchase_order.subtotal IS NULL THEN NULL
      ELSE purchase_order.subtotal + purchase_order.delivery_amount + allocation_difference.difference
    END,
    updated_at = now()
FROM allocation_difference
WHERE purchase_order.order_id = allocation_difference.order_id
  AND purchase_order.purchase_order_number = allocation_difference.target_number
  AND allocation_difference.difference <> 0;

CREATE INDEX IF NOT EXISTS supplier_purchase_orders_supplier_idx
  ON supplier_purchase_orders (supplier_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS supplier_purchase_orders_order_idx
  ON supplier_purchase_orders (order_id, supplier_id);

CREATE INDEX IF NOT EXISTS supplier_purchase_order_items_order_idx
  ON supplier_purchase_order_items (purchase_order_id, order_item_id);

COMMIT;
