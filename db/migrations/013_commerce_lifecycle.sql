BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_provider text;

CREATE TABLE IF NOT EXISTS order_status_history (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  from_status text,
  to_status text NOT NULL,
  from_payment_status text,
  to_payment_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_documents (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('order_summary', 'proforma_invoice')),
  document_number text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  issued_by text REFERENCES users(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, document_type)
);

CREATE TABLE IF NOT EXISTS supplier_applications (
  id text PRIMARY KEY,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  phone text NOT NULL,
  tax_id text NOT NULL,
  supplier_type text NOT NULL DEFAULT 'Təchizatçı',
  focus text,
  website text,
  document_url text,
  region text NOT NULL DEFAULT 'Azərbaycan',
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  submission_hash text,
  decision_note text,
  reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  company_id text REFERENCES companies(id) ON DELETE SET NULL,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_review_requests (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  reason text NOT NULL DEFAULT 'Qiymətin yenidən təsdiqi tələb olunur',
  due_at timestamptz NOT NULL,
  requested_by text REFERENCES users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  last_reminded_at timestamptz,
  reminder_count integer NOT NULL DEFAULT 0 CHECK (reminder_count >= 0),
  completed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_status_history_order_idx
  ON order_status_history (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_documents_order_idx
  ON order_documents (order_id, issued_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_applications_pending_email_unique
  ON supplier_applications (lower(contact_email))
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS supplier_applications_pending_tax_unique
  ON supplier_applications (tax_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS supplier_applications_status_time_idx
  ON supplier_applications (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS price_review_requests_one_pending_idx
  ON price_review_requests (product_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS price_review_requests_due_idx
  ON price_review_requests (status, due_at);

INSERT INTO order_status_history (
  id, order_id, actor_id, from_status, to_status,
  from_payment_status, to_payment_status, note, created_at
)
SELECT
  'osh-' || md5(o.id || ':' || o.created_at::text),
  o.id,
  o.customer_id,
  NULL,
  o.status,
  NULL,
  o.payment_status,
  'Mövcud sifariş üçün ilkin vəziyyət',
  o.created_at
FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM order_status_history history WHERE history.order_id = o.id
);

INSERT INTO price_review_requests (
  id, product_id, supplier_id, reason, due_at, requested_at
)
SELECT
  'prr-' || md5(p.id),
  p.id,
  p.supplier_id,
  CASE
    WHEN p.price_status = 'expired' THEN 'Qiymətin vaxtı keçib'
    ELSE 'Qiymətin təsdiq müddəti bitmək üzrədir'
  END,
  COALESCE(p.price_verified_at, p.updated_at) + interval '30 days',
  now()
FROM products p
WHERE p.status = 'active'
  AND p.price_status IN ('confirmed', 'expired')
  AND (
    p.price_status = 'expired'
    OR COALESCE(p.price_verified_at, p.updated_at) < now() - interval '21 days'
  )
ON CONFLICT (product_id) WHERE status = 'pending' DO NOTHING;

COMMIT;
