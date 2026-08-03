BEGIN;

ALTER TABLE supplier_contracts
  ADD COLUMN IF NOT EXISTS legal_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE supplier_contracts
  ADD COLUMN IF NOT EXISTS legal_confirmed_by text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE supplier_contracts
  ADD COLUMN IF NOT EXISTS legal_confirmed_at timestamptz;
ALTER TABLE supplier_contracts
  ADD COLUMN IF NOT EXISTS legal_confirmation_note text;

CREATE INDEX IF NOT EXISTS supplier_contracts_legal_status_idx
  ON supplier_contracts (supplier_id, status, legal_confirmed, updated_at DESC);

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS rights_status text NOT NULL DEFAULT 'pending';
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS rights_verified_by text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS rights_verified_at timestamptz;
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS rights_expires_on date;
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS rights_review_note text;

ALTER TABLE media_assets
  DROP CONSTRAINT IF EXISTS media_assets_license_type_check;
ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_license_type_check
  CHECK (license_type IN ('own', 'supplier', 'official', 'licensed', 'reference', 'unspecified'));

ALTER TABLE media_assets
  DROP CONSTRAINT IF EXISTS media_assets_rights_status_check;
ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_rights_status_check
  CHECK (rights_status IN ('pending', 'verified', 'rejected', 'expired'));

CREATE INDEX IF NOT EXISTS media_assets_rights_review_idx
  ON media_assets (rights_status, updated_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS media_assets_verified_product_idx
  ON media_assets (entity_id, is_primary DESC, created_at DESC)
  WHERE status = 'active'
    AND entity_type = 'product'
    AND rights_status = 'verified';

COMMIT;
