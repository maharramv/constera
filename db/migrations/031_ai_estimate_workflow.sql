BEGIN;

ALTER TABLE customer_estimates
  ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_file_name text,
  ADD COLUMN IF NOT EXISTS ai_run_id text REFERENCES ai_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rfq_id text REFERENCES rfqs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

ALTER TABLE customer_estimates
  DROP CONSTRAINT IF EXISTS customer_estimates_workflow_status_check;

ALTER TABLE customer_estimates
  ADD CONSTRAINT customer_estimates_workflow_status_check CHECK (
    workflow_status IN ('draft', 'review_pending', 'approved', 'rejected', 'converted')
  );

ALTER TABLE customer_estimates
  DROP CONSTRAINT IF EXISTS customer_estimates_version_check;

ALTER TABLE customer_estimates
  ADD CONSTRAINT customer_estimates_version_check CHECK (version >= 1);

ALTER TABLE rfqs
  ADD COLUMN IF NOT EXISTS estimate_id text REFERENCES customer_estimates(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rfqs_estimate_unique
  ON rfqs (estimate_id)
  WHERE estimate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_estimates_workflow_idx
  ON customer_estimates (customer_id, workflow_status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS customer_estimates_ai_run_unique
  ON customer_estimates (ai_run_id)
  WHERE ai_run_id IS NOT NULL;

COMMIT;
