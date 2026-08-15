BEGIN;

CREATE SEQUENCE IF NOT EXISTS project_change_order_sequence START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS warranty_case_sequence START WITH 1001;

CREATE TABLE IF NOT EXISTS product_digital_passports (
  id text PRIMARY KEY,
  product_id text NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  passport_code text NOT NULL UNIQUE,
  manufacturer text NOT NULL,
  origin_country text,
  model_code text,
  gtin text,
  warranty_months integer NOT NULL DEFAULT 0 CHECK (warranty_months BETWEEN 0 AND 600),
  batch_tracking boolean NOT NULL DEFAULT false,
  declaration_url text,
  safety_url text,
  installation_url text,
  certificate_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  environmental_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'expired', 'archived')),
  valid_until date,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  updated_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_model_imports (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES customer_projects(id) ON DELETE CASCADE,
  filename text NOT NULL,
  model_format text NOT NULL CHECK (model_format IN ('ifc', 'dwg', 'bcf', 'other')),
  source_url text,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'analyzed', 'mapped', 'failed')),
  element_count integer NOT NULL DEFAULT 0 CHECK (element_count >= 0),
  material_count integer NOT NULL DEFAULT 0 CHECK (material_count >= 0),
  extracted_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  entity_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  issue_note text,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_change_orders (
  id text PRIMARY KEY,
  change_number bigint NOT NULL DEFAULT nextval('project_change_order_sequence'),
  project_id text NOT NULL REFERENCES customer_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  reason text NOT NULL,
  scope_description text NOT NULL,
  cost_delta numeric(14, 2) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'AZN',
  days_delta integer NOT NULL DEFAULT 0 CHECK (days_delta BETWEEN -3650 AND 3650),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'implemented', 'cancelled')),
  requested_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (change_number)
);

CREATE TABLE IF NOT EXISTS warranty_cases (
  id text PRIMARY KEY,
  case_number bigint NOT NULL DEFAULT nextval('warranty_case_sequence'),
  customer_id text REFERENCES users(id) ON DELETE SET NULL,
  project_id text REFERENCES customer_projects(id) ON DELETE SET NULL,
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  product_id text REFERENCES products(id) ON DELETE SET NULL,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_supplier', 'resolved', 'closed', 'rejected')),
  due_at timestamptz,
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolution_note text,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  assigned_to text REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_number)
);

CREATE TABLE IF NOT EXISTS surplus_listings (
  id text PRIMARY KEY,
  project_id text REFERENCES customer_projects(id) ON DELETE SET NULL,
  product_id text REFERENCES products(id) ON DELETE SET NULL,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  condition text NOT NULL DEFAULT 'unused' CHECK (condition IN ('unused', 'opened', 'used_good', 'reclaimed')),
  unit_price numeric(14, 2) CHECK (unit_price IS NULL OR unit_price >= 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  city text NOT NULL,
  photo_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'reserved', 'sold', 'withdrawn', 'expired')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rental_handover_reports (
  id text PRIMARY KEY,
  booking_id text NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('checkout', 'checkin')),
  equipment_condition text NOT NULL CHECK (equipment_condition IN ('excellent', 'good', 'fair', 'damaged')),
  engine_hours numeric(12, 2) CHECK (engine_hours IS NULL OR engine_hours >= 0),
  fuel_level integer CHECK (fuel_level IS NULL OR fuel_level BETWEEN 0 AND 100),
  location_text text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  damage_notes text,
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer_signature text,
  supplier_signature text,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, report_type)
);

CREATE TABLE IF NOT EXISTS contractor_passports (
  id text PRIMARY KEY,
  supplier_id text NOT NULL UNIQUE REFERENCES suppliers(id) ON DELETE CASCADE,
  contractor_type text NOT NULL DEFAULT 'general' CHECK (contractor_type IN ('general', 'specialist', 'design', 'installation', 'rental', 'logistics')),
  voen text,
  license_number text,
  license_valid_until date,
  insurance_number text,
  insurance_valid_until date,
  team_size integer NOT NULL DEFAULT 0 CHECK (team_size BETWEEN 0 AND 100000),
  annual_capacity text,
  regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  specialties jsonb NOT NULL DEFAULT '[]'::jsonb,
  portfolio_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'verified', 'suspended', 'expired')),
  verification_note text,
  verified_by text REFERENCES users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offer_price_locks (
  id text PRIMARY KEY,
  product_offer_id text NOT NULL REFERENCES product_offers(id) ON DELETE CASCADE,
  customer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id text REFERENCES customer_projects(id) ON DELETE SET NULL,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  locked_unit_price numeric(14, 2) NOT NULL CHECK (locked_unit_price >= 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_digital_passports_status_idx ON product_digital_passports (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS project_model_imports_project_idx ON project_model_imports (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_change_orders_project_idx ON project_change_orders (project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS warranty_cases_customer_idx ON warranty_cases (customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS warranty_cases_supplier_idx ON warranty_cases (supplier_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS surplus_listings_market_idx ON surplus_listings (status, city, created_at DESC);
CREATE INDEX IF NOT EXISTS rental_handover_reports_booking_idx ON rental_handover_reports (booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contractor_passports_status_idx ON contractor_passports (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS offer_price_locks_customer_idx ON offer_price_locks (customer_id, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS offer_price_locks_offer_idx ON offer_price_locks (product_offer_id, status, expires_at DESC);

COMMIT;
