BEGIN;

ALTER TABLE ai_runs
  DROP CONSTRAINT IF EXISTS ai_runs_feature_check;

ALTER TABLE ai_runs
  ADD CONSTRAINT ai_runs_feature_check CHECK (
    feature IN (
      'estimate_review', 'estimate_document', 'catalog_enrichment',
      'rfq_draft', 'offer_comparison', 'procurement_plan', 'invoice_document'
    )
  );

CREATE SEQUENCE IF NOT EXISTS procurement_goods_receipt_number_seq
  START WITH 10001
  INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS procurement_goods_receipts (
  id text PRIMARY KEY,
  receipt_number bigint NOT NULL DEFAULT nextval('procurement_goods_receipt_number_seq'),
  purchase_order_id text NOT NULL REFERENCES supplier_purchase_orders(id) ON DELETE RESTRICT,
  delivery_note_number text,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'void')),
  media_asset_id text REFERENCES media_assets(id) ON DELETE SET NULL,
  note text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  voided_by text REFERENCES users(id) ON DELETE SET NULL,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_number)
);

CREATE TABLE IF NOT EXISTS procurement_goods_receipt_items (
  id text PRIMARY KEY,
  receipt_id text NOT NULL REFERENCES procurement_goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id text NOT NULL REFERENCES supplier_purchase_order_items(id) ON DELETE RESTRICT,
  received_quantity numeric(14, 3) NOT NULL CHECK (received_quantity > 0),
  accepted_quantity numeric(14, 3) NOT NULL CHECK (accepted_quantity >= 0),
  rejected_quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (accepted_quantity + rejected_quantity = received_quantity),
  UNIQUE (receipt_id, purchase_order_item_id)
);

CREATE SEQUENCE IF NOT EXISTS supplier_invoice_sequence
  START WITH 10001
  INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id text PRIMARY KEY,
  internal_number bigint NOT NULL DEFAULT nextval('supplier_invoice_sequence'),
  purchase_order_id text NOT NULL REFERENCES supplier_purchase_orders(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  due_date date,
  subtotal numeric(14, 2) NOT NULL CHECK (subtotal >= 0),
  tax_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  delivery_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (delivery_amount >= 0),
  total_amount numeric(14, 2) NOT NULL CHECK (total_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  status text NOT NULL DEFAULT 'registered' CHECK (
    status IN ('registered', 'matched', 'exception', 'approved', 'paid', 'cancelled')
  ),
  match_status text NOT NULL DEFAULT 'not_evaluated' CHECK (
    match_status IN ('not_evaluated', 'matched', 'exception')
  ),
  match_score numeric(5, 2) CHECK (match_score IS NULL OR match_score BETWEEN 0 AND 100),
  match_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_asset_id text REFERENCES media_assets(id) ON DELETE SET NULL,
  ai_run_id text REFERENCES ai_runs(id) ON DELETE SET NULL,
  note text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by text REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_by text REFERENCES users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  payment_reference text,
  cancelled_by text REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (internal_number),
  UNIQUE (purchase_order_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS supplier_invoice_items (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  purchase_order_item_id text NOT NULL REFERENCES supplier_purchase_order_items(id) ON DELETE RESTRICT,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(14, 2) NOT NULL CHECK (line_total >= 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, purchase_order_item_id)
);

CREATE INDEX IF NOT EXISTS procurement_goods_receipts_order_idx
  ON procurement_goods_receipts (purchase_order_id, status, received_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS procurement_goods_receipts_delivery_note_unique
  ON procurement_goods_receipts (purchase_order_id, delivery_note_number)
  WHERE delivery_note_number IS NOT NULL AND status <> 'void';

CREATE INDEX IF NOT EXISTS procurement_goods_receipt_items_order_item_idx
  ON procurement_goods_receipt_items (purchase_order_item_id, receipt_id);

CREATE INDEX IF NOT EXISTS supplier_invoices_order_idx
  ON supplier_invoices (purchase_order_id, status, invoice_date DESC);

CREATE INDEX IF NOT EXISTS supplier_invoices_match_queue_idx
  ON supplier_invoices (match_status, created_at DESC)
  WHERE status NOT IN ('paid', 'cancelled');

CREATE INDEX IF NOT EXISTS supplier_invoice_items_order_item_idx
  ON supplier_invoice_items (purchase_order_item_id, invoice_id);

COMMIT;
