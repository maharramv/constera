BEGIN;

CREATE TABLE IF NOT EXISTS crm_leads (
  id text PRIMARY KEY,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('rfq', 'order', 'rental', 'manual')),
  source_id text,
  customer_id text REFERENCES users(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  email text,
  phone text,
  city text,
  title text NOT NULL,
  value_amount numeric(14, 2),
  currency char(3) NOT NULL DEFAULT 'AZN',
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'qualified', 'proposal', 'won', 'lost')),
  owner_id text REFERENCES users(id) ON DELETE SET NULL,
  next_action_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_source_unique
  ON crm_leads (source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_leads_pipeline_idx
  ON crm_leads (stage, next_action_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_activities (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('note', 'call', 'email', 'meeting', 'status')),
  subject text NOT NULL,
  note text,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_activities_lead_idx
  ON crm_activities (lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rental_bookings (
  id text PRIMARY KEY,
  rental_id text NOT NULL,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  customer_id text REFERENCES users(id) ON DELETE SET NULL,
  rental_title text NOT NULL,
  rental_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  city text NOT NULL,
  address text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 100),
  operator_preference text NOT NULL DEFAULT 'Razılaşma ilə',
  delivery_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'requested' CHECK (
    status IN ('requested', 'quoted', 'confirmed', 'active', 'completed', 'cancelled')
  ),
  quoted_amount numeric(14, 2),
  deposit_amount numeric(14, 2),
  currency char(3) NOT NULL DEFAULT 'AZN',
  note text,
  admin_note text,
  submission_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS rental_bookings_schedule_idx
  ON rental_bookings (rental_id, start_date, end_date, status);

CREATE INDEX IF NOT EXISTS rental_bookings_customer_idx
  ON rental_bookings (customer_id, created_at DESC);

INSERT INTO crm_leads (
  id, source_type, source_id, customer_id, company_name, contact_name,
  email, phone, city, title, stage, note, created_at, updated_at
)
SELECT
  'lead-' || md5('rfq:' || rfq.id),
  'rfq',
  rfq.id,
  rfq.customer_id,
  rfq.company_name,
  COALESCE(NULLIF(rfq.contact_name, ''), rfq.company_name),
  rfq.email,
  rfq.phone,
  rfq.city,
  rfq.title,
  CASE
    WHEN rfq.status = 'Bağlandı' THEN 'won'
    WHEN rfq.status = 'Ləğv edildi' THEN 'lost'
    WHEN rfq.status IN ('Təklif gözləyir', 'Təklif alındı') THEN 'proposal'
    WHEN rfq.status = 'Baxılır' THEN 'qualified'
    ELSE 'new'
  END,
  rfq.note,
  rfq.created_at,
  rfq.updated_at
FROM rfqs rfq
ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

INSERT INTO crm_leads (
  id, source_type, source_id, customer_id, company_name, contact_name,
  email, phone, city, title, value_amount, currency, stage, note, created_at, updated_at
)
SELECT
  'lead-' || md5('order:' || orders.id),
  'order',
  orders.id,
  orders.customer_id,
  orders.company_name,
  orders.contact_name,
  orders.email,
  orders.phone,
  orders.city,
  'Sifariş #' || orders.order_number,
  orders.total_amount,
  orders.currency,
  CASE
    WHEN orders.status = 'completed' THEN 'won'
    WHEN orders.status = 'cancelled' THEN 'lost'
    ELSE 'proposal'
  END,
  orders.note,
  orders.created_at,
  orders.updated_at
FROM orders
ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

COMMIT;
