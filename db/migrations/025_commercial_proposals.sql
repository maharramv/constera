BEGIN;

CREATE SEQUENCE IF NOT EXISTS commercial_proposal_number_seq
  START WITH 1001;

CREATE TABLE IF NOT EXISTS commercial_proposals (
  id text PRIMARY KEY,
  document_number text NOT NULL UNIQUE,
  rfq_id text NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  selected_offer_id text REFERENCES offers(id) ON DELETE SET NULL,
  customer_id text REFERENCES users(id) ON DELETE SET NULL,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'accepted', 'expired', 'cancelled')),
  currency char(3) NOT NULL DEFAULT 'AZN',
  subtotal numeric(14, 2) NOT NULL CHECK (subtotal >= 0),
  discount_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  delivery_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (delivery_amount >= 0),
  vat_mode text NOT NULL DEFAULT 'excluded'
    CHECK (vat_mode IN ('excluded', 'included', 'not_applicable')),
  vat_rate numeric(5, 2) NOT NULL DEFAULT 18 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  vat_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount numeric(14, 2) NOT NULL CHECK (total_amount >= 0),
  valid_until date NOT NULL,
  payment_terms text,
  delivery_terms text,
  warranty_terms text,
  note text,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  supplier_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  offer_comparison jsonb NOT NULL DEFAULT '[]'::jsonb,
  issued_at timestamptz,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, version)
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS commercial_proposal_id text
  REFERENCES commercial_proposals(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount numeric(14, 2) NOT NULL DEFAULT 0
  CHECK (discount_amount >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_mode text NOT NULL DEFAULT 'not_applicable'
  CHECK (vat_mode IN ('excluded', 'included', 'not_applicable'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate numeric(5, 2) NOT NULL DEFAULT 0
  CHECK (vat_rate >= 0 AND vat_rate <= 100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_amount numeric(14, 2) NOT NULL DEFAULT 0
  CHECK (vat_amount >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS orders_commercial_proposal_unique
  ON orders (commercial_proposal_id)
  WHERE commercial_proposal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS commercial_proposals_rfq_time_idx
  ON commercial_proposals (rfq_id, created_at DESC);

CREATE INDEX IF NOT EXISTS commercial_proposals_customer_status_idx
  ON commercial_proposals (customer_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS commercial_proposals_validity_idx
  ON commercial_proposals (status, valid_until)
  WHERE status = 'issued';

COMMIT;
