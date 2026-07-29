BEGIN;

CREATE TABLE IF NOT EXISTS product_offers (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_sku text,
  unit_price numeric(14, 2),
  currency char(3) NOT NULL DEFAULT 'AZN',
  price_text text NOT NULL DEFAULT 'Sorğu əsasında',
  price_status text NOT NULL DEFAULT 'request' CHECK (
    price_status IN ('confirmed', 'request', 'expired')
  ),
  stock_quantity numeric(14, 3) CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  minimum_order numeric(14, 3) CHECK (minimum_order IS NULL OR minimum_order >= 0),
  lead_time_days integer CHECK (lead_time_days IS NULL OR lead_time_days BETWEEN 0 AND 3650),
  delivery_modes jsonb NOT NULL DEFAULT '["pickup", "supplier_delivery"]'::jsonb,
  source_url text,
  source_label text,
  price_verified_at timestamptz,
  is_featured boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, supplier_id)
);

INSERT INTO product_offers (
  id, product_id, supplier_id, supplier_sku, unit_price, currency,
  price_text, price_status, stock_quantity, minimum_order,
  source_url, source_label, price_verified_at, is_featured, status
)
SELECT
  'pof-' || md5(product.id || ':' || product.supplier_id),
  product.id,
  product.supplier_id,
  product.sku,
  product.price_amount,
  product.price_currency,
  product.price_text,
  product.price_status,
  product.stock_quantity,
  product.minimum_order,
  product.source_url,
  product.source_label,
  product.price_verified_at,
  true,
  product.status
FROM products product
WHERE product.supplier_id IS NOT NULL
ON CONFLICT (product_id, supplier_id) DO UPDATE SET
  supplier_sku = EXCLUDED.supplier_sku,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  price_text = EXCLUDED.price_text,
  price_status = EXCLUDED.price_status,
  stock_quantity = EXCLUDED.stock_quantity,
  minimum_order = EXCLUDED.minimum_order,
  source_url = EXCLUDED.source_url,
  source_label = EXCLUDED.source_label,
  price_verified_at = EXCLUDED.price_verified_at,
  updated_at = now();

CREATE INDEX IF NOT EXISTS product_offers_product_idx
  ON product_offers (product_id, status, price_status, unit_price);

CREATE INDEX IF NOT EXISTS product_offers_supplier_idx
  ON product_offers (supplier_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS logistics_zones (
  id text PRIMARY KEY,
  name text NOT NULL,
  cities jsonb NOT NULL DEFAULT '[]'::jsonb,
  base_fee numeric(14, 2) NOT NULL DEFAULT 0 CHECK (base_fee >= 0),
  per_supplier_fee numeric(14, 2) NOT NULL DEFAULT 0 CHECK (per_supplier_fee >= 0),
  per_unit_fee numeric(14, 4) NOT NULL DEFAULT 0 CHECK (per_unit_fee >= 0),
  minimum_fee numeric(14, 2) NOT NULL DEFAULT 0 CHECK (minimum_fee >= 0),
  free_above numeric(14, 2) CHECK (free_above IS NULL OR free_above >= 0),
  eta_min_days integer NOT NULL DEFAULT 1 CHECK (eta_min_days BETWEEN 0 AND 365),
  eta_max_days integer NOT NULL DEFAULT 3 CHECK (eta_max_days BETWEEN 0 AND 365),
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (eta_max_days >= eta_min_days)
);

INSERT INTO logistics_zones (
  id, name, cities, base_fee, per_supplier_fee, per_unit_fee,
  minimum_fee, free_above, eta_min_days, eta_max_days, priority
) VALUES
  ('log-baku', 'Bakı şəhəri', '["baki", "bakı"]'::jsonb, 8, 3, 0.02, 8, 1500, 1, 2, 10),
  ('log-absheron', 'Abşeron', '["abseron", "abşeron", "xirdalan", "xırdalan"]'::jsonb, 12, 4, 0.03, 12, 2500, 1, 3, 20),
  ('log-sumgayit', 'Sumqayıt', '["sumqayit", "sumqayıt"]'::jsonb, 15, 5, 0.04, 15, 3000, 2, 4, 30),
  ('log-ganja', 'Gəncə', '["gence", "gəncə"]'::jsonb, 35, 8, 0.06, 35, 5000, 2, 5, 40),
  ('log-azerbaijan', 'Azərbaycan üzrə', '[]'::jsonb, 28, 8, 0.08, 28, 7500, 3, 7, 1000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS delivery_quotes (
  id text PRIMARY KEY,
  order_id text UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_id text REFERENCES users(id) ON DELETE SET NULL,
  zone_id text REFERENCES logistics_zones(id) ON DELETE SET NULL,
  city text NOT NULL,
  mode text NOT NULL DEFAULT 'delivery' CHECK (
    mode IN ('delivery', 'pickup', 'supplier_delivery')
  ),
  supplier_count integer NOT NULL DEFAULT 1 CHECK (supplier_count >= 0),
  item_quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (item_quantity >= 0),
  subtotal numeric(14, 2),
  amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  eta_min_days integer NOT NULL DEFAULT 0,
  eta_max_days integer NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'quoted' CHECK (
    status IN ('quoted', 'accepted', 'expired', 'cancelled')
  ),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS product_offer_id text REFERENCES product_offers(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required' CHECK (
    approval_status IN ('not_required', 'pending', 'approved', 'rejected')
  );

CREATE TABLE IF NOT EXISTS procurement_requests (
  id text PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  requested_by text REFERENCES users(id) ON DELETE SET NULL,
  company_id text REFERENCES companies(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'cancelled')
  ),
  required_approvals integer NOT NULL DEFAULT 1 CHECK (required_approvals BETWEEN 1 AND 5),
  approved_count integer NOT NULL DEFAULT 0 CHECK (approved_count >= 0),
  budget_amount numeric(14, 2) CHECK (budget_amount IS NULL OR budget_amount >= 0),
  cost_center text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS procurement_decisions (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, actor_id)
);

CREATE INDEX IF NOT EXISTS delivery_quotes_customer_idx
  ON delivery_quotes (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS procurement_requests_company_idx
  ON procurement_requests (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS procurement_decisions_request_idx
  ON procurement_decisions (request_id, created_at);

CREATE INDEX IF NOT EXISTS order_items_product_offer_idx
  ON order_items (product_offer_id);

COMMIT;
