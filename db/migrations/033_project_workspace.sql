BEGIN;

ALTER TABLE customer_projects
  ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE customer_projects
  ADD COLUMN IF NOT EXISTS target_end_date date;
ALTER TABLE customer_projects
  ADD COLUMN IF NOT EXISTS rfq_id text REFERENCES rfqs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS customer_project_items (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES customer_projects(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('product', 'service', 'package', 'rental')),
  item_id text NOT NULL,
  title text NOT NULL,
  quantity numeric(14, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'mövqe',
  unit_price numeric(14, 2) CHECK (unit_price IS NULL OR unit_price >= 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  price_status text NOT NULL DEFAULT 'request' CHECK (price_status IN ('confirmed', 'request', 'expired')),
  source_url text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS customer_project_milestones (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES customer_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  milestone_type text NOT NULL DEFAULT 'other' CHECK (
    milestone_type IN ('planning', 'procurement', 'service', 'rental', 'delivery', 'payment', 'handover', 'other')
  ),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  note text,
  reminder_notification_id text REFERENCES notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_project_supplier_matches (
  project_id text NOT NULL REFERENCES customer_projects(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  score numeric(5, 2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  coverage_count integer NOT NULL DEFAULT 0 CHECK (coverage_count >= 0),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, supplier_id)
);

ALTER TABLE media_assets
  DROP CONSTRAINT IF EXISTS media_assets_entity_type_check;
ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_entity_type_check
  CHECK (entity_type IN ('product', 'supplier', 'service', 'package', 'rental', 'project', 'general'));

CREATE INDEX IF NOT EXISTS customer_project_items_project_idx
  ON customer_project_items (project_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS customer_project_milestones_due_idx
  ON customer_project_milestones (project_id, status, due_date);
CREATE INDEX IF NOT EXISTS customer_project_supplier_matches_score_idx
  ON customer_project_supplier_matches (project_id, score DESC, matched_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS customer_projects_rfq_unique
  ON customer_projects (rfq_id) WHERE rfq_id IS NOT NULL;

COMMIT;
