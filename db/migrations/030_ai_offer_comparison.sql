BEGIN;

ALTER TABLE ai_runs
  DROP CONSTRAINT IF EXISTS ai_runs_feature_check;

ALTER TABLE ai_runs
  ADD CONSTRAINT ai_runs_feature_check CHECK (
    feature IN (
      'estimate_review',
      'estimate_document',
      'catalog_enrichment',
      'rfq_draft',
      'offer_comparison'
    )
  );

ALTER TABLE ai_runs
  ADD COLUMN IF NOT EXISTS rfq_id text REFERENCES rfqs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_runs_rfq_created_idx
  ON ai_runs (rfq_id, created_at DESC)
  WHERE rfq_id IS NOT NULL;

COMMIT;
