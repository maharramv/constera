BEGIN;

CREATE SEQUENCE IF NOT EXISTS project_work_contract_sequence START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS project_work_measurement_sequence START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS project_payment_certificate_sequence START WITH 1001;

CREATE TABLE IF NOT EXISTS project_work_contracts (
  id text PRIMARY KEY,
  contract_number bigint NOT NULL DEFAULT nextval('project_work_contract_sequence'),
  project_id text NOT NULL REFERENCES customer_projects(id) ON DELETE CASCADE,
  contractor_supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  external_contract_number text,
  title text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'AZN',
  contract_amount numeric(14, 2) NOT NULL CHECK (contract_amount > 0),
  advance_percent numeric(5, 2) NOT NULL DEFAULT 0 CHECK (advance_percent BETWEEN 0 AND 100),
  advance_recovery_percent numeric(5, 2) NOT NULL DEFAULT 20 CHECK (advance_recovery_percent BETWEEN 0 AND 100),
  retention_percent numeric(5, 2) NOT NULL DEFAULT 5 CHECK (retention_percent BETWEEN 0 AND 100),
  tax_percent numeric(5, 2) NOT NULL DEFAULT 18 CHECK (tax_percent BETWEEN 0 AND 100),
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'suspended', 'completed', 'cancelled')),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by text REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_number)
);

CREATE TABLE IF NOT EXISTS project_boq_items (
  id text PRIMARY KEY,
  contract_id text NOT NULL REFERENCES project_work_contracts(id) ON DELETE CASCADE,
  item_code text NOT NULL,
  title text NOT NULL,
  work_category text,
  unit text NOT NULL,
  contract_quantity numeric(14, 3) NOT NULL CHECK (contract_quantity > 0),
  unit_rate numeric(14, 2) NOT NULL CHECK (unit_rate >= 0),
  linked_change_order_id text REFERENCES project_change_orders(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'cancelled')),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, item_code)
);

CREATE TABLE IF NOT EXISTS project_work_measurements (
  id text PRIMARY KEY,
  measurement_number bigint NOT NULL DEFAULT nextval('project_work_measurement_sequence'),
  contract_id text NOT NULL REFERENCES project_work_contracts(id) ON DELETE CASCADE,
  boq_item_id text NOT NULL REFERENCES project_boq_items(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  measured_quantity numeric(14, 3) NOT NULL CHECK (measured_quantity > 0),
  location_text text,
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'accepted', 'rejected', 'cancelled')),
  submitted_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (measurement_number)
);

CREATE TABLE IF NOT EXISTS project_payment_certificates (
  id text PRIMARY KEY,
  certificate_number bigint NOT NULL DEFAULT nextval('project_payment_certificate_sequence'),
  contract_id text NOT NULL REFERENCES project_work_contracts(id) ON DELETE RESTRICT,
  certificate_type text NOT NULL DEFAULT 'interim' CHECK (certificate_type IN ('interim', 'final')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  work_amount numeric(14, 2) NOT NULL CHECK (work_amount >= 0),
  advance_recovery_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (advance_recovery_amount >= 0),
  retention_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (retention_amount >= 0),
  retention_release_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (retention_release_amount >= 0),
  other_deductions numeric(14, 2) NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
  tax_percent numeric(5, 2) NOT NULL DEFAULT 18 CHECK (tax_percent BETWEEN 0 AND 100),
  tax_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  net_payable numeric(14, 2) NOT NULL CHECK (net_payable >= 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'certified', 'rejected', 'paid', 'cancelled')),
  note text,
  submitted_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  certified_by text REFERENCES users(id) ON DELETE SET NULL,
  certified_at timestamptz,
  paid_by text REFERENCES users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (certificate_number),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS project_payment_certificate_items (
  id text PRIMARY KEY,
  certificate_id text NOT NULL REFERENCES project_payment_certificates(id) ON DELETE CASCADE,
  measurement_id text NOT NULL UNIQUE REFERENCES project_work_measurements(id) ON DELETE RESTRICT,
  boq_item_id text NOT NULL REFERENCES project_boq_items(id) ON DELETE RESTRICT,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  unit_rate numeric(14, 2) NOT NULL CHECK (unit_rate >= 0),
  line_amount numeric(14, 2) NOT NULL CHECK (line_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_work_contracts_project_idx
  ON project_work_contracts (project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS project_work_contracts_contractor_idx
  ON project_work_contracts (contractor_supplier_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS project_boq_items_contract_idx
  ON project_boq_items (contract_id, status, sort_order, created_at);
CREATE INDEX IF NOT EXISTS project_work_measurements_contract_idx
  ON project_work_measurements (contract_id, status, work_date DESC);
CREATE INDEX IF NOT EXISTS project_work_measurements_boq_idx
  ON project_work_measurements (boq_item_id, status, work_date DESC);
CREATE INDEX IF NOT EXISTS project_payment_certificates_contract_idx
  ON project_payment_certificates (contract_id, status, period_end DESC);
CREATE UNIQUE INDEX IF NOT EXISTS project_payment_certificates_open_retention_release_idx
  ON project_payment_certificates (contract_id)
  WHERE retention_release_amount > 0 AND status IN ('draft', 'submitted', 'certified');
CREATE INDEX IF NOT EXISTS project_payment_certificate_items_certificate_idx
  ON project_payment_certificate_items (certificate_id, boq_item_id);

COMMIT;
