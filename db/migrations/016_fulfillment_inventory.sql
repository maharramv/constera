BEGIN;

CREATE TABLE IF NOT EXISTS warehouses (
  id text PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text NOT NULL DEFAULT 'Bakı',
  address text,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default_per_supplier_idx
  ON warehouses (supplier_id)
  WHERE is_default = true AND status = 'active';

CREATE TABLE IF NOT EXISTS inventory_levels (
  id text PRIMARY KEY,
  warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  reserved_quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);

CREATE TABLE IF NOT EXISTS order_fulfillments (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled')
  ),
  tracking_code text,
  delivery_provider text,
  note text,
  accepted_by text REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id text NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'shortage', 'released', 'consumed')
  ),
  reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id)
);

INSERT INTO warehouses (id, supplier_id, name, city, is_default)
SELECT
  'wh-' || md5(supplier.id),
  supplier.id,
  supplier.name || ' əsas anbarı',
  CASE
    WHEN supplier.region IS NULL OR btrim(supplier.region) = '' THEN 'Bakı'
    ELSE supplier.region
  END,
  true
FROM suppliers supplier
WHERE supplier.status <> 'Arxiv'
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory_levels (id, warehouse_id, product_id, stock_quantity)
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
WHERE product.stock_quantity IS NOT NULL
ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
  stock_quantity = EXCLUDED.stock_quantity,
  updated_at = now();

INSERT INTO order_fulfillments (id, order_id, supplier_id)
SELECT
  'ful-' || md5(item.order_id || ':' || item.supplier_id),
  item.order_id,
  item.supplier_id
FROM order_items item
WHERE item.supplier_id IS NOT NULL
GROUP BY item.order_id, item.supplier_id
ON CONFLICT (order_id, supplier_id) DO NOTHING;

WITH ranked_items AS (
  SELECT
    item.id,
    item.order_id,
    item.product_id,
    COALESCE(item.supplier_id, product.supplier_id) AS supplier_id,
    item.quantity,
    product.stock_quantity,
    sum(item.quantity) OVER (
      PARTITION BY item.product_id
      ORDER BY orders.created_at, item.created_at, item.id
    ) AS cumulative_quantity
  FROM order_items item
  JOIN orders ON orders.id = item.order_id
  JOIN products product ON product.id = item.product_id
  WHERE orders.status NOT IN ('completed', 'cancelled')
    AND product.stock_quantity IS NOT NULL
)
INSERT INTO inventory_reservations (
  id, order_id, order_item_id, product_id, supplier_id,
  quantity, status, reason, expires_at
)
SELECT
  'res-' || md5(ranked.id),
  ranked.order_id,
  ranked.id,
  ranked.product_id,
  ranked.supplier_id,
  ranked.quantity,
  CASE WHEN ranked.cumulative_quantity <= ranked.stock_quantity THEN 'active' ELSE 'shortage' END,
  CASE
    WHEN ranked.cumulative_quantity <= ranked.stock_quantity THEN 'Mövcud sifariş üçün migrasiya zamanı rezerv edildi'
    ELSE 'Mövcud sifariş üçün kifayət qədər sərbəst stok yoxdur'
  END,
  now() + interval '7 days'
FROM ranked_items ranked
ON CONFLICT (order_item_id) DO NOTHING;

UPDATE inventory_levels level
SET reserved_quantity = COALESCE((
      SELECT sum(reservation.quantity)
      FROM inventory_reservations reservation
      WHERE reservation.product_id = level.product_id
        AND reservation.status = 'active'
    ), 0),
    updated_at = now();

CREATE INDEX IF NOT EXISTS warehouses_supplier_idx
  ON warehouses (supplier_id, status, name);

CREATE INDEX IF NOT EXISTS inventory_levels_product_idx
  ON inventory_levels (product_id, warehouse_id);

CREATE INDEX IF NOT EXISTS order_fulfillments_supplier_idx
  ON order_fulfillments (supplier_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS order_fulfillments_order_idx
  ON order_fulfillments (order_id, status);

CREATE INDEX IF NOT EXISTS inventory_reservations_product_idx
  ON inventory_reservations (product_id, status, created_at);

CREATE INDEX IF NOT EXISTS inventory_reservations_order_idx
  ON inventory_reservations (order_id, status);

COMMIT;
