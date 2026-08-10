BEGIN;

CREATE TABLE IF NOT EXISTS project_material_receipts (
  id text PRIMARY KEY,
  receipt_number bigserial UNIQUE,
  receipt_code text NOT NULL UNIQUE,
  project_id text NOT NULL REFERENCES customer_projects(id) ON DELETE CASCADE,
  project_item_id text NOT NULL REFERENCES customer_project_items(id) ON DELETE CASCADE,
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id text REFERENCES order_items(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('accepted', 'partial', 'rejected')),
  delivered_quantity numeric(14, 3) NOT NULL CHECK (delivered_quantity > 0),
  accepted_quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  rejected_quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  unit text NOT NULL,
  supplier_name text,
  delivery_note_number text,
  batch_number text,
  vehicle_plate text,
  condition_note text,
  photo_asset_id text REFERENCES media_assets(id) ON DELETE SET NULL,
  received_by text REFERENCES users(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (accepted_quantity + rejected_quantity <= delivered_quantity)
);

CREATE TABLE IF NOT EXISTS project_material_movements (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES customer_projects(id) ON DELETE CASCADE,
  project_item_id text NOT NULL REFERENCES customer_project_items(id) ON DELETE CASCADE,
  receipt_id text REFERENCES project_material_receipts(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('use', 'waste', 'return')),
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  work_area text,
  note text,
  recorded_by text REFERENCES users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_material_receipts_project_idx
  ON project_material_receipts (project_id, received_at DESC);
CREATE INDEX IF NOT EXISTS project_material_receipts_item_idx
  ON project_material_receipts (project_item_id, received_at DESC);
CREATE INDEX IF NOT EXISTS project_material_movements_project_idx
  ON project_material_movements (project_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS project_material_movements_item_idx
  ON project_material_movements (project_item_id, movement_type, recorded_at DESC);

COMMIT;
