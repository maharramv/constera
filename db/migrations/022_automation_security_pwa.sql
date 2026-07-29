BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_secret text;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_recovery_codes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_enabled_at timestamptz;

CREATE TABLE IF NOT EXISTS auth_challenges (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  challenge_type text NOT NULL CHECK (
    challenge_type IN ('login_2fa', 'setup_2fa')
  ),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_challenges_user_idx
  ON auth_challenges (user_id, challenge_type, expires_at DESC);

CREATE TABLE IF NOT EXISTS catalog_quality_remediations (
  id text PRIMARY KEY,
  run_id text REFERENCES catalog_quality_runs(id) ON DELETE SET NULL,
  issue_id text REFERENCES catalog_quality_issues(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  before_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_quality_remediations_entity_idx
  ON catalog_quality_remediations (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_feeds (
  id text PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  endpoint_url text NOT NULL,
  feed_format text NOT NULL DEFAULT 'csv' CHECK (
    feed_format IN ('csv', 'json')
  ),
  auth_env_key text,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_minutes integer NOT NULL DEFAULT 1440 CHECK (
    schedule_minutes BETWEEN 60 AND 43200
  ),
  active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_status text CHECK (
    last_status IS NULL OR last_status IN ('running', 'completed', 'failed')
  ),
  last_error text,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, endpoint_url)
);

CREATE TABLE IF NOT EXISTS supplier_feed_runs (
  id text PRIMARY KEY,
  feed_id text NOT NULL REFERENCES supplier_feeds(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (
    status IN ('running', 'completed', 'failed')
  ),
  total_rows integer NOT NULL DEFAULT 0,
  matched_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS supplier_feeds_due_idx
  ON supplier_feeds (active, next_run_at);
CREATE INDEX IF NOT EXISTS supplier_feed_runs_feed_idx
  ON supplier_feed_runs (feed_id, started_at DESC);

CREATE TABLE IF NOT EXISTS supplier_offer_history (
  id text PRIMARY KEY,
  product_offer_id text NOT NULL REFERENCES product_offers(id) ON DELETE CASCADE,
  feed_run_id text REFERENCES supplier_feed_runs(id) ON DELETE SET NULL,
  unit_price numeric(14, 2),
  currency char(3) NOT NULL DEFAULT 'AZN',
  price_status text NOT NULL,
  stock_quantity numeric(14, 3),
  minimum_order numeric(14, 3),
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_offer_history_offer_idx
  ON supplier_offer_history (product_offer_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'expired', 'revoked')
  ),
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_idx
  ON web_push_subscriptions (user_id, status, updated_at DESC);

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_channel_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_channel_check
  CHECK (channel IN ('in_app', 'email', 'whatsapp', 'web_push'));

INSERT INTO logistics_zones (
  id, name, cities, base_fee, per_supplier_fee, per_unit_fee,
  minimum_fee, free_above, eta_min_days, eta_max_days, priority
) VALUES
  (
    'log-ganja-gazakh', 'Gəncə-Qazax iqtisadi rayonu',
    '["gəncə","gence","şəmkir","semkir","tovuz","qazax","ağstafa","agstafa","göygöl","goygol","daşkəsən","daskesen","samux","gədəbəy","gedebey"]'::jsonb,
    35, 8, 0.06, 35, 5000, 2, 5, 45
  ),
  (
    'log-guba-khachmaz', 'Quba-Xaçmaz iqtisadi rayonu',
    '["quba","qusar","xaçmaz","xacmaz","şabran","sabran","siyəzən","siyezen"]'::jsonb,
    32, 8, 0.06, 32, 5000, 2, 5, 50
  ),
  (
    'log-shaki-zagatala', 'Şəki-Zaqatala iqtisadi rayonu',
    '["şəki","seki","zaqatala","balakən","balaken","qax","oğuz","oguz","qəbələ","qebele"]'::jsonb,
    38, 9, 0.07, 38, 5500, 3, 6, 55
  ),
  (
    'log-central-aran', 'Mərkəzi Aran iqtisadi rayonu',
    '["mingəçevir","mingecevir","yevlax","ağdaş","agdas","göyçay","goycay","kürdəmir","kurdemir","ucar","zərdab","zerdab"]'::jsonb,
    34, 8, 0.06, 34, 5000, 2, 5, 60
  ),
  (
    'log-mil-mughan', 'Mil-Muğan və Şirvan-Salyan',
    '["beyləqan","beyleqan","imishli","imişli","saatlı","saatli","sabirabad","şirvan","sirvan","salyan","neftçala","neftcala","hacıqabul","haciqabul"]'::jsonb,
    36, 9, 0.07, 36, 5500, 3, 6, 65
  ),
  (
    'log-karabakh', 'Qarabağ və Şərqi Zəngəzur',
    '["şuşa","susa","xankəndi","xankendi","ağdam","agdam","füzuli","fuzuli","cəbrayıl","cebrayil","zəngilan","zengilan","qubadlı","qubadli","laçın","lacin","kəlbəcər","kelbecer","xocavənd","xocavend","xocalı","xocali","tərtər","terter"]'::jsonb,
    48, 12, 0.09, 48, 7500, 4, 8, 70
  ),
  (
    'log-lankaran-astara', 'Lənkəran-Astara iqtisadi rayonu',
    '["lənkəran","lenkeran","astara","masallı","masalli","cəlilabad","celilabad","lerik","yardımlı","yardimli"]'::jsonb,
    40, 10, 0.08, 40, 6000, 3, 7, 75
  ),
  (
    'log-nakhchivan', 'Naxçıvan Muxtar Respublikası',
    '["naxçıvan","naxcivan","şərur","serur","babək","babek","ordubad","culfa","şahbuz","sahbuz","kəngərli","kengerli","sədərək","sederek"]'::jsonb,
    65, 15, 0.12, 65, 10000, 5, 10, 80
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;
