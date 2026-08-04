BEGIN;

ALTER TABLE ai_runs
  DROP CONSTRAINT IF EXISTS ai_runs_feature_check;

ALTER TABLE ai_runs
  ADD CONSTRAINT ai_runs_feature_check CHECK (
    feature IN (
      'estimate_review', 'estimate_document', 'catalog_enrichment',
      'rfq_draft', 'offer_comparison', 'procurement_plan'
    )
  );

CREATE TABLE IF NOT EXISTS procurement_plans (
  id text PRIMARY KEY,
  estimate_id text NOT NULL UNIQUE REFERENCES customer_estimates(id) ON DELETE CASCADE,
  customer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ai_run_id text UNIQUE REFERENCES ai_runs(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'review_pending' CHECK (
    status IN ('draft', 'review_pending', 'approved', 'rejected', 'activated')
  ),
  project_start_date date NOT NULL,
  target_end_date date NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 30 AND 730),
  currency char(3) NOT NULL DEFAULT 'AZN',
  total_budget numeric(16, 2) NOT NULL DEFAULT 0 CHECK (total_budget >= 0),
  priced_rows integer NOT NULL DEFAULT 0 CHECK (priced_rows >= 0),
  unpriced_rows integer NOT NULL DEFAULT 0 CHECK (unpriced_rows >= 0),
  summary text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  confidence numeric(5, 4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  human_edited_at timestamptz,
  approved_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (target_end_date >= project_start_date)
);

CREATE TABLE IF NOT EXISTS procurement_plan_phases (
  id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES procurement_plans(id) ON DELETE CASCADE,
  wave_key text NOT NULL,
  phase_key text NOT NULL,
  title text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  need_by_date date NOT NULL,
  lead_time_days integer NOT NULL CHECK (lead_time_days BETWEEN 1 AND 90),
  budget numeric(16, 2) CHECK (budget IS NULL OR budget >= 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  row_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(row_keys) = 'array'),
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count BETWEEN 0 AND 20),
  unpriced_count integer NOT NULL DEFAULT 0 CHECK (unpriced_count >= 0),
  included boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'approved', 'rfq_created', 'skipped')),
  reason text,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checks) = 'array'),
  rfq_id text REFERENCES rfqs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, wave_key),
  UNIQUE (plan_id, sequence),
  CHECK (end_date >= start_date),
  CHECK (need_by_date <= start_date)
);

ALTER TABLE customer_estimates
  ADD COLUMN IF NOT EXISTS procurement_plan_id text REFERENCES procurement_plans(id) ON DELETE SET NULL;

ALTER TABLE rfqs
  ADD COLUMN IF NOT EXISTS procurement_plan_phase_id text REFERENCES procurement_plan_phases(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS rfqs_estimate_unique;

CREATE UNIQUE INDEX IF NOT EXISTS rfqs_estimate_unique
  ON rfqs (estimate_id)
  WHERE estimate_id IS NOT NULL AND procurement_plan_phase_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rfqs_procurement_plan_phase_unique
  ON rfqs (procurement_plan_phase_id)
  WHERE procurement_plan_phase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS procurement_plans_customer_status_idx
  ON procurement_plans (customer_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS procurement_plan_phases_plan_sequence_idx
  ON procurement_plan_phases (plan_id, sequence);

CREATE INDEX IF NOT EXISTS procurement_plan_phases_need_date_idx
  ON procurement_plan_phases (need_by_date, status)
  WHERE included = true;

COMMIT;
