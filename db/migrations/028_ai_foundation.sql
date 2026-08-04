BEGIN;

CREATE TABLE IF NOT EXISTS ai_usage_counters (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_period date NOT NULL DEFAULT current_date,
  daily_requests integer NOT NULL DEFAULT 0 CHECK (daily_requests >= 0),
  monthly_period date NOT NULL DEFAULT date_trunc('month', current_date)::date,
  monthly_requests integer NOT NULL DEFAULT 0 CHECK (monthly_requests >= 0),
  monthly_tokens bigint NOT NULL DEFAULT 0 CHECK (monthly_tokens >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_runs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id text REFERENCES companies(id) ON DELETE SET NULL,
  feature text NOT NULL CHECK (feature IN ('estimate_review', 'estimate_document', 'catalog_enrichment', 'rfq_draft')),
  provider text NOT NULL CHECK (provider IN ('openai', 'webhook', 'none')),
  model text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  input_hash char(64) NOT NULL,
  prompt_version text NOT NULL,
  request_bytes integer NOT NULL DEFAULT 0 CHECK (request_bytes >= 0),
  response_bytes integer NOT NULL DEFAULT 0 CHECK (response_bytes >= 0),
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  reserved_tokens integer NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
  estimated_cost_usd numeric(18, 8),
  confidence numeric(5, 4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_approval boolean NOT NULL DEFAULT true,
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'not_required')),
  reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  error_code text,
  error_text text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_runs_user_created_idx
  ON ai_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_runs_pending_review_idx
  ON ai_runs (created_at DESC)
  WHERE status = 'completed' AND approval_status = 'pending';

CREATE INDEX IF NOT EXISTS ai_runs_expiry_idx
  ON ai_runs (expires_at);

COMMIT;
