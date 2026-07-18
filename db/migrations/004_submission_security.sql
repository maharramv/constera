BEGIN;

ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS submission_hash text;
CREATE INDEX IF NOT EXISTS rfqs_submission_time_idx ON rfqs (submission_hash, created_at DESC);

COMMIT;
