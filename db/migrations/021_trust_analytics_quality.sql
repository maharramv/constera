BEGIN;

CREATE SEQUENCE IF NOT EXISTS support_case_number_seq
  START WITH 10001
  INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS support_cases (
  id text PRIMARY KEY,
  case_number bigint NOT NULL DEFAULT nextval('support_case_number_seq'),
  customer_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  rental_booking_id text REFERENCES rental_bookings(id) ON DELETE SET NULL,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  case_type text NOT NULL CHECK (
    case_type IN ('support', 'return', 'refund', 'dispute')
  ),
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN (
      'open', 'in_review', 'awaiting_customer', 'awaiting_supplier',
      'approved', 'refund_pending', 'resolved', 'rejected', 'closed'
    )
  ),
  priority text NOT NULL DEFAULT 'normal' CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  requested_amount numeric(14, 2) CHECK (requested_amount IS NULL OR requested_amount >= 0),
  approved_amount numeric(14, 2) CHECK (approved_amount IS NULL OR approved_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  resolution text,
  assigned_to text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (case_number),
  CHECK (order_id IS NOT NULL OR rental_booking_id IS NOT NULL OR case_type = 'support')
);

CREATE TABLE IF NOT EXISTS support_case_items (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  order_item_id text REFERENCES order_items(id) ON DELETE SET NULL,
  quantity numeric(14, 3) CHECK (quantity IS NULL OR quantity > 0),
  reason text,
  condition text,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, order_item_id)
);

CREATE TABLE IF NOT EXISTS support_case_messages (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  author_id text REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_note boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refund_transactions (
  id text PRIMARY KEY,
  case_id text NOT NULL UNIQUE REFERENCES support_cases(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_transaction_id text REFERENCES payment_transactions(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'manual',
  external_id text,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')
  ),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text,
  processed_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_type text NOT NULL CHECK (
    target_type IN ('product', 'supplier', 'service', 'package', 'rental')
  ),
  target_id text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('order', 'rental_booking')),
  source_id text NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL,
  body text NOT NULL,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'published', 'rejected')
  ),
  moderation_note text,
  moderated_by text REFERENCES users(id) ON DELETE SET NULL,
  moderated_at timestamptz,
  supplier_response text,
  supplier_responded_by text REFERENCES users(id) ON DELETE SET NULL,
  supplier_responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, target_type, target_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id text PRIMARY KEY,
  event_type text NOT NULL CHECK (
    event_type IN (
      'page_view', 'search', 'product_view', 'add_to_cart', 'checkout_start',
      'order_created', 'rfq_created', 'estimate_created', 'review_submitted',
      'support_case_created'
    )
  ),
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  visitor_hash text NOT NULL,
  session_hash text NOT NULL,
  path text,
  entity_type text,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_dedupe_unique
  ON analytics_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_quality_runs (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'running' CHECK (
    status IN ('running', 'completed', 'failed')
  ),
  scanned_products integer NOT NULL DEFAULT 0,
  scanned_offers integer NOT NULL DEFAULT 0,
  open_issues integer NOT NULL DEFAULT 0,
  resolved_issues integer NOT NULL DEFAULT 0,
  probed_urls integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS catalog_quality_issues (
  id text PRIMARY KEY,
  issue_key text NOT NULL UNIQUE,
  entity_type text NOT NULL CHECK (entity_type IN ('product', 'product_offer')),
  entity_id text NOT NULL,
  issue_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (
    severity IN ('low', 'medium', 'high', 'critical')
  ),
  detail text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'ignored', 'resolved')
  ),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  last_run_id text REFERENCES catalog_quality_runs(id) ON DELETE SET NULL,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_cases_customer_idx
  ON support_cases (customer_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_cases_supplier_idx
  ON support_cases (supplier_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_cases_order_idx
  ON support_cases (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_case_messages_case_idx
  ON support_case_messages (case_id, created_at);
CREATE INDEX IF NOT EXISTS marketplace_reviews_target_idx
  ON marketplace_reviews (target_type, target_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_reviews_customer_idx
  ON marketplace_reviews (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_funnel_idx
  ON analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx
  ON analytics_events (session_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_quality_issues_status_idx
  ON catalog_quality_issues (status, severity, last_seen_at DESC);

COMMIT;
