BEGIN;

CREATE TABLE IF NOT EXISTS marketplace_entities (
  id text PRIMARY KEY,
  entity_kind text NOT NULL CHECK (entity_kind IN ('service', 'package', 'rental')),
  category_id text REFERENCES categories(id) ON DELETE SET NULL,
  subcategory text NOT NULL DEFAULT 'Ümumi',
  title text NOT NULL,
  slug text NOT NULL,
  unit text,
  price_text text NOT NULL DEFAULT 'Sorğu əsasında',
  extra_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_kind, slug)
);

CREATE INDEX IF NOT EXISTS marketplace_entities_kind_category_idx ON marketplace_entities (entity_kind, category_id, status);

COMMIT;
