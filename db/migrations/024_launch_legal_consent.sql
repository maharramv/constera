BEGIN;

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_source_type_check;
ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_source_type_check
  CHECK (source_type IN ('rfq', 'order', 'rental', 'contact', 'manual'));

CREATE TABLE IF NOT EXISTS policy_consents (
  id text PRIMARY KEY,
  entity_type text NOT NULL CHECK (
    entity_type IN ('order', 'rfq', 'rental_booking', 'supplier_application', 'contact')
  ),
  entity_id text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  submission_hash text,
  policy_version text NOT NULL,
  accepted_terms boolean NOT NULL DEFAULT false,
  accepted_privacy boolean NOT NULL DEFAULT false,
  source_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, policy_version)
);

CREATE INDEX IF NOT EXISTS policy_consents_user_idx
  ON policy_consents (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS policy_consents_submission_idx
  ON policy_consents (submission_hash, created_at DESC)
  WHERE submission_hash IS NOT NULL;

COMMIT;
