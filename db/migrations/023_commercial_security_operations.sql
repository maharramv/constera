BEGIN;

CREATE TABLE IF NOT EXISTS supplier_contracts (
  id text PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  contract_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'active', 'suspended', 'expired', 'terminated')
  ),
  commission_rate numeric(5, 2) NOT NULL DEFAULT 8 CHECK (
    commission_rate >= 0 AND commission_rate <= 100
  ),
  payment_terms_days integer NOT NULL DEFAULT 14 CHECK (
    payment_terms_days BETWEEN 0 AND 365
  ),
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  document_url text,
  note text,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_contracts_one_active_idx
  ON supplier_contracts (supplier_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS supplier_contracts_supplier_idx
  ON supplier_contracts (supplier_id, status, updated_at DESC);

INSERT INTO supplier_contracts (
  id, supplier_id, contract_number, status, commission_rate, payment_terms_days
)
SELECT
  'sct-' || md5(supplier.id),
  supplier.id,
  'CE-SUP-' || upper(substr(md5(supplier.id), 1, 12)),
  'draft',
  8,
  14
FROM suppliers supplier
WHERE supplier.status <> 'Arxiv'
  AND NOT EXISTS (
    SELECT 1 FROM supplier_contracts contract
     WHERE contract.supplier_id = supplier.id
  )
ON CONFLICT DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS supplier_settlement_number_seq
  START WITH 10001
  INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS supplier_settlements (
  id text PRIMARY KEY,
  settlement_number bigint NOT NULL DEFAULT nextval('supplier_settlement_number_seq'),
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  contract_id text REFERENCES supplier_contracts(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  commission_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  refund_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  adjustment_amount numeric(14, 2) NOT NULL DEFAULT 0,
  net_amount numeric(14, 2) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'AZN',
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'approved', 'paid', 'cancelled')
  ),
  payment_reference text,
  note text,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  approved_by text REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_by text REFERENCES users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, period_start, period_end),
  UNIQUE (settlement_number),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS supplier_settlement_items (
  id text PRIMARY KEY,
  settlement_id text NOT NULL REFERENCES supplier_settlements(id) ON DELETE CASCADE,
  purchase_order_id text NOT NULL UNIQUE REFERENCES supplier_purchase_orders(id) ON DELETE RESTRICT,
  gross_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  commission_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  refund_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  net_amount numeric(14, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_settlements_supplier_idx
  ON supplier_settlements (supplier_id, status, period_end DESC);

CREATE INDEX IF NOT EXISTS supplier_settlement_items_settlement_idx
  ON supplier_settlement_items (settlement_id, purchase_order_id);

CREATE TABLE IF NOT EXISTS supplier_feed_changes (
  id text PRIMARY KEY,
  feed_run_id text NOT NULL REFERENCES supplier_feed_runs(id) ON DELETE CASCADE,
  product_offer_id text NOT NULL REFERENCES product_offers(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  before_data jsonb,
  after_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_run_id, product_offer_id)
);

ALTER TABLE supplier_feed_runs
  ADD COLUMN IF NOT EXISTS rollback_status text NOT NULL DEFAULT 'available';
ALTER TABLE supplier_feed_runs
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz;
ALTER TABLE supplier_feed_runs
  ADD COLUMN IF NOT EXISTS rolled_back_by text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE supplier_feed_runs
  DROP CONSTRAINT IF EXISTS supplier_feed_runs_rollback_status_check;
ALTER TABLE supplier_feed_runs
  ADD CONSTRAINT supplier_feed_runs_rollback_status_check
  CHECK (rollback_status IN ('available', 'completed', 'failed', 'unavailable'));

CREATE INDEX IF NOT EXISTS supplier_feed_changes_run_idx
  ON supplier_feed_changes (feed_run_id, created_at);

UPDATE supplier_feed_runs run
SET rollback_status = 'unavailable'
WHERE NOT EXISTS (
  SELECT 1 FROM supplier_feed_changes snapshot
   WHERE snapshot.feed_run_id = run.id
);

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS license_type text NOT NULL DEFAULT 'unspecified';
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS license_note text;
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS checksum_sha256 text;
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE media_assets
  DROP CONSTRAINT IF EXISTS media_assets_license_type_check;
ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_license_type_check
  CHECK (license_type IN ('own', 'supplier', 'official', 'licensed', 'unspecified'));

CREATE UNIQUE INDEX IF NOT EXISTS media_assets_one_primary_idx
  ON media_assets (entity_type, entity_id)
  WHERE status = 'active' AND is_primary = true AND entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS media_assets_checksum_idx
  ON media_assets (checksum_sha256)
  WHERE checksum_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS delivery_tracking_events (
  id text PRIMARY KEY,
  fulfillment_id text NOT NULL REFERENCES order_fulfillments(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  purchase_order_id text REFERENCES supplier_purchase_orders(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (
    status IN (
      'pending', 'accepted', 'preparing', 'ready', 'shipped', 'in_transit',
      'delivered', 'exception', 'returned', 'cancelled'
    )
  ),
  location text,
  note text,
  source text NOT NULL DEFAULT 'manual' CHECK (
    source IN ('manual', 'supplier', 'carrier', 'system')
  ),
  external_event_id text,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_tracking_external_unique
  ON delivery_tracking_events (source, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS delivery_tracking_fulfillment_idx
  ON delivery_tracking_events (fulfillment_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS delivery_tracking_order_idx
  ON delivery_tracking_events (order_id, occurred_at DESC);

INSERT INTO delivery_tracking_events (
  id, fulfillment_id, order_id, purchase_order_id, status,
  note, source, occurred_at
)
SELECT
  'trk-' || md5(fulfillment.id || ':baseline'),
  fulfillment.id,
  fulfillment.order_id,
  purchase_order.id,
  fulfillment.status,
  'Miqrasiya zamanı mövcud icra vəziyyətindən yaradılıb',
  'system',
  fulfillment.updated_at
FROM order_fulfillments fulfillment
LEFT JOIN supplier_purchase_orders purchase_order
  ON purchase_order.fulfillment_id = fulfillment.id
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS security_events (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  email_hash text,
  event_type text NOT NULL CHECK (
    event_type IN (
      'login_succeeded', 'login_failed', 'login_blocked', 'login_challenged',
      'two_factor_succeeded', 'two_factor_failed',
      'password_reset_requested', 'password_reset_completed',
      'sessions_revoked'
    )
  ),
  succeeded boolean NOT NULL DEFAULT false,
  ip_hash text,
  user_agent_hash text,
  risk_level text NOT NULL DEFAULT 'low' CHECK (
    risk_level IN ('low', 'medium', 'high', 'critical')
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_events_created_idx
  ON security_events (created_at DESC, risk_level);

CREATE INDEX IF NOT EXISTS security_events_user_idx
  ON security_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS backup_verifications (
  id text PRIMARY KEY,
  backup_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('verified', 'failed')),
  backup_version text,
  schema_migrations integer,
  table_count integer NOT NULL DEFAULT 0 CHECK (table_count >= 0),
  record_count bigint NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  checksum_sha256 text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backup_verifications_created_idx
  ON backup_verifications (created_at DESC, status);

COMMIT;
