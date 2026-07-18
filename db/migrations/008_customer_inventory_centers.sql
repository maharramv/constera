BEGIN;

CREATE TABLE IF NOT EXISTS customer_projects (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  project_type text NOT NULL DEFAULT 'other',
  city text,
  area numeric(14, 2) CHECK (area IS NULL OR area >= 0),
  budget numeric(14, 2) CHECK (budget IS NULL OR budget >= 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'estimating', 'procurement', 'active', 'completed', 'archived')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_products (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  list_type text NOT NULL CHECK (list_type IN ('favorite', 'compare')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id, list_type)
);

CREATE TABLE IF NOT EXISTS customer_estimates (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_projects_user_status_idx
  ON customer_projects (customer_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS saved_products_user_type_idx
  ON saved_products (user_id, list_type, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_estimates_user_time_idx
  ON customer_estimates (customer_id, updated_at DESC);

COMMIT;
