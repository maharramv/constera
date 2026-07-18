BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

UPDATE users
   SET password_changed_at = COALESCE(password_changed_at, updated_at, created_at)
 WHERE password_changed_at IS NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity numeric(14, 2) CHECK (stock_quantity IS NULL OR stock_quantity >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_order numeric(14, 2) CHECK (minimum_order IS NULL OR minimum_order >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_verified_at timestamptz;

UPDATE products
   SET price_verified_at = COALESCE(price_verified_at, updated_at, created_at)
 WHERE price_status = 'confirmed' AND price_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS tenders (
  id text PRIMARY KEY,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  customer_id text REFERENCES users(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  title text NOT NULL,
  description text,
  city text,
  deadline date,
  budget_text text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'evaluation', 'awarded', 'closed', 'cancelled')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'invited')),
  contact text,
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tender_lots (
  id text PRIMARY KEY,
  tender_id text NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  title text NOT NULL,
  quantity_text text NOT NULL,
  unit text,
  specifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tender_invitations (
  tender_id text NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'viewed', 'submitted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tender_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS tender_bids (
  id text PRIMARY KEY,
  tender_id text NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  price_amount numeric(14, 2),
  price_text text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'AZN',
  validity text,
  delivery text,
  note text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_assets (
  id text PRIMARY KEY,
  owner_id text REFERENCES users(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('product', 'supplier', 'service', 'package', 'rental', 'general')),
  entity_id text,
  filename text NOT NULL,
  pathname text NOT NULL,
  url text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0),
  provider text NOT NULL DEFAULT 'vercel_blob',
  alt_text text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id text PRIMARY KEY,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  import_type text NOT NULL CHECK (import_type IN ('product', 'service', 'package', 'rental')),
  filename text,
  status text NOT NULL DEFAULT 'validating' CHECK (status IN ('validating', 'validated', 'processing', 'completed', 'failed')),
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_report jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp')),
  recipient text,
  subject text,
  body text NOT NULL,
  template_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, status);
CREATE INDEX IF NOT EXISTS products_price_verified_idx ON products (price_status, price_verified_at);
CREATE INDEX IF NOT EXISTS tenders_status_deadline_idx ON tenders (status, deadline, created_at DESC);
CREATE INDEX IF NOT EXISTS tenders_creator_idx ON tenders (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS tender_lots_tender_idx ON tender_lots (tender_id, sort_order);
CREATE INDEX IF NOT EXISTS tender_bids_tender_idx ON tender_bids (tender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_entity_idx ON media_assets (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_creator_idx ON import_jobs (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_delivery_idx ON notifications (status, available_at, created_at);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

COMMIT;
