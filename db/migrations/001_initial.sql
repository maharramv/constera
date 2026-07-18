BEGIN;

CREATE TABLE IF NOT EXISTS companies (
  id text PRIMARY KEY,
  name text NOT NULL,
  company_type text NOT NULL DEFAULT 'customer' CHECK (company_type IN ('internal', 'supplier', 'customer')),
  tax_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
  contact_email text,
  phone text,
  region text NOT NULL DEFAULT 'Azərbaycan',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  company_id text REFERENCES companies(id) ON DELETE SET NULL,
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('super_admin', 'admin', 'sales', 'supplier', 'customer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  user_agent text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id bigserial PRIMARY KEY,
  identity_hash text NOT NULL,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  parent_id text REFERENCES categories(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'material' CHECK (kind IN ('material', 'service', 'package', 'rental')),
  title text NOT NULL,
  slug text NOT NULL,
  subtitle text,
  group_name text NOT NULL DEFAULT 'Ümumi',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, slug)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  company_id text REFERENCES companies(id) ON DELETE SET NULL,
  name text NOT NULL,
  supplier_type text NOT NULL DEFAULT 'Təchizatçı',
  focus text,
  website text,
  status text NOT NULL DEFAULT 'Aktiv',
  region text NOT NULL DEFAULT 'Azərbaycan',
  contact text,
  rating text,
  response_time text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_lower_unique ON suppliers (lower(name));

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  slug text NOT NULL,
  brand text NOT NULL DEFAULT 'Brendsiz',
  category_id text REFERENCES categories(id) ON DELETE SET NULL,
  subcategory text NOT NULL DEFAULT 'Ümumi',
  package_text text,
  origin text,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  price_amount numeric(14, 2),
  price_currency char(3) NOT NULL DEFAULT 'AZN',
  price_text text NOT NULL DEFAULT 'Sorğu əsasında',
  price_note text,
  price_status text NOT NULL DEFAULT 'request' CHECK (price_status IN ('confirmed', 'request', 'expired')),
  availability text NOT NULL DEFAULT 'Stok sorğu ilə',
  image_url text,
  source_url text,
  source_label text,
  specs jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_history (
  id bigserial PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_amount numeric(14, 2),
  price_currency char(3) NOT NULL DEFAULT 'AZN',
  price_text text NOT NULL,
  source_url text,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rfqs (
  id text PRIMARY KEY,
  customer_id text REFERENCES users(id) ON DELETE SET NULL,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  rfq_type text NOT NULL DEFAULT 'custom' CHECK (rfq_type IN ('product', 'service', 'package', 'rental', 'custom')),
  title text NOT NULL,
  company_name text NOT NULL,
  contact text NOT NULL,
  city text,
  status text NOT NULL DEFAULT 'Yeni' CHECK (status IN ('Yeni', 'Baxılır', 'Təklif gözləyir', 'Təklif alındı', 'Bağlandı', 'Ləğv edildi')),
  priority text NOT NULL DEFAULT 'Normal',
  need_date date,
  budget text,
  delivery_mode text,
  usage_text text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rfq_items (
  id text PRIMARY KEY,
  rfq_id text NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  item_kind text NOT NULL DEFAULT 'custom',
  item_id text,
  title text NOT NULL,
  quantity_text text NOT NULL,
  unit text,
  specs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offers (
  id text PRIMARY KEY,
  rfq_id text NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  price_amount numeric(14, 2),
  price_text text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'AZN',
  lead_time text,
  delivery text,
  warranty text,
  note text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
