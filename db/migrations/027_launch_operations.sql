BEGIN;

ALTER TABLE logistics_zones
  ADD COLUMN IF NOT EXISTS rate_status text NOT NULL DEFAULT 'estimate';
ALTER TABLE logistics_zones
  ADD COLUMN IF NOT EXISTS rate_source_url text;
ALTER TABLE logistics_zones
  ADD COLUMN IF NOT EXISTS rate_verified_at timestamptz;
ALTER TABLE logistics_zones
  ADD COLUMN IF NOT EXISTS rate_verified_by text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE logistics_zones
  ADD COLUMN IF NOT EXISTS rate_valid_until date;
ALTER TABLE logistics_zones
  ADD COLUMN IF NOT EXISTS rate_note text;

ALTER TABLE logistics_zones
  DROP CONSTRAINT IF EXISTS logistics_zones_rate_status_check;
ALTER TABLE logistics_zones
  ADD CONSTRAINT logistics_zones_rate_status_check
  CHECK (rate_status IN ('estimate', 'verified', 'expired'));

ALTER TABLE logistics_zones
  DROP CONSTRAINT IF EXISTS logistics_zones_rate_source_check;
ALTER TABLE logistics_zones
  ADD CONSTRAINT logistics_zones_rate_source_check
  CHECK (rate_source_url IS NULL OR rate_source_url ~ '^https://');

ALTER TABLE logistics_zones
  DROP CONSTRAINT IF EXISTS logistics_zones_verified_rate_evidence_check;
ALTER TABLE logistics_zones
  ADD CONSTRAINT logistics_zones_verified_rate_evidence_check
  CHECK (
    rate_status <> 'verified'
    OR (
      NULLIF(trim(rate_source_url), '') IS NOT NULL
      AND rate_verified_at IS NOT NULL
      AND rate_verified_by IS NOT NULL
      AND rate_valid_until IS NOT NULL
      AND NULLIF(trim(rate_note), '') IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS logistics_zones_rate_status_idx
  ON logistics_zones (rate_status, rate_valid_until, priority)
  WHERE active = true;

COMMIT;
