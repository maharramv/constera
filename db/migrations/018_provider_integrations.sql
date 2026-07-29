BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('invoice', 'bank_transfer', 'card'));

CREATE TABLE IF NOT EXISTS payment_transactions (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text,
  idempotency_key text NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'requires_action', 'paid', 'failed', 'cancelled', 'refunded')
  ),
  checkout_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_external_unique
  ON payment_transactions (provider, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_transactions_order_idx
  ON payment_transactions (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS electronic_invoices (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'issued', 'failed', 'cancelled')
  ),
  document_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS integration_events (
  id text PRIMARY KEY,
  provider text NOT NULL,
  event_type text NOT NULL,
  external_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS integration_events_provider_idx
  ON integration_events (provider, created_at DESC);

COMMIT;
