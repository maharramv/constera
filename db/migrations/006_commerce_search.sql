BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  order_number bigserial UNIQUE,
  customer_id text REFERENCES users(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  city text NOT NULL,
  address text NOT NULL,
  delivery_mode text NOT NULL DEFAULT 'delivery' CHECK (delivery_mode IN ('delivery', 'pickup', 'supplier_delivery')),
  payment_method text NOT NULL DEFAULT 'invoice' CHECK (payment_method IN ('invoice', 'bank_transfer')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'awaiting', 'paid', 'failed', 'refunded')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled')),
  subtotal numeric(14, 2),
  delivery_amount numeric(14, 2),
  total_amount numeric(14, 2),
  currency char(3) NOT NULL DEFAULT 'AZN',
  has_pending_price boolean NOT NULL DEFAULT false,
  note text,
  submission_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id text REFERENCES products(id) ON DELETE SET NULL,
  sku text NOT NULL,
  title text NOT NULL,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'ədəd',
  unit_price numeric(14, 2),
  price_text text NOT NULL,
  line_total numeric(14, 2),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_search_trgm_idx
  ON products USING gin (
    (lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(subcategory, ''))) gin_trgm_ops
  );
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx
  ON password_reset_tokens (expires_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_customer_idx
  ON orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx
  ON orders (status, payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_submission_idx
  ON orders (submission_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_idx
  ON order_items (order_id, created_at);
CREATE INDEX IF NOT EXISTS order_items_product_idx
  ON order_items (product_id, created_at DESC);

COMMIT;
