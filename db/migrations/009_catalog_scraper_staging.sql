BEGIN;

CREATE TABLE IF NOT EXISTS catalog_import_runs (
  id text PRIMARY KEY,
  source_file text NOT NULL,
  source_hash text NOT NULL,
  schema_version text NOT NULL,
  status text NOT NULL DEFAULT 'staging'
    CHECK (status IN ('staging', 'staged', 'reviewed', 'failed')),
  total_items integer NOT NULL DEFAULT 0,
  valid_items integer NOT NULL DEFAULT 0,
  rejected_items integer NOT NULL DEFAULT 0,
  duplicate_items integer NOT NULL DEFAULT 0,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_report jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS catalog_import_items (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES catalog_import_runs(id) ON DELETE CASCADE,
  item_kind text NOT NULL CHECK (item_kind IN ('product', 'service', 'package', 'rental')),
  source_id text NOT NULL,
  source_item_id text NOT NULL,
  source_url text NOT NULL,
  dedupe_key text NOT NULL,
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'merged')),
  existing_entity_id text,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, source_url)
);

CREATE INDEX IF NOT EXISTS catalog_import_runs_status_idx
  ON catalog_import_runs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_import_items_review_idx
  ON catalog_import_items (review_status, item_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_import_items_dedupe_idx
  ON catalog_import_items (dedupe_key, source_id);

COMMIT;
