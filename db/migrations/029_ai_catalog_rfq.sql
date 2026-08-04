BEGIN;

ALTER TABLE rfqs
  ADD COLUMN IF NOT EXISTS ai_run_id text REFERENCES ai_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rfqs_ai_run_idx
  ON rfqs (ai_run_id)
  WHERE ai_run_id IS NOT NULL;

COMMIT;
