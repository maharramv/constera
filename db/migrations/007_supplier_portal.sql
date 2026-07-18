BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_unique
  ON suppliers (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_supplier_status_idx
  ON products (supplier_id, status, updated_at DESC);

COMMIT;
