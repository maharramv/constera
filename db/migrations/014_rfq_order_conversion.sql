BEGIN;

ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS rfq_id text REFERENCES rfqs(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS offer_id text REFERENCES offers(id) ON DELETE SET NULL;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL;

UPDATE rfqs
SET contact_name = company_name
WHERE contact_name IS NULL OR btrim(contact_name) = '';

UPDATE rfqs
SET email = lower(btrim(contact))
WHERE (email IS NULL OR btrim(email) = '')
  AND contact ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

UPDATE rfqs
SET phone = contact
WHERE (phone IS NULL OR btrim(phone) = '')
  AND contact IS NOT NULL
  AND contact !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

UPDATE order_items item
SET supplier_id = product.supplier_id
FROM products product
WHERE item.product_id = product.id
  AND item.supplier_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_offer_unique
  ON orders (offer_id)
  WHERE offer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_rfq_unique
  ON orders (rfq_id)
  WHERE rfq_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_items_supplier_idx
  ON order_items (supplier_id, created_at DESC)
  WHERE supplier_id IS NOT NULL;

DELETE FROM order_status_history duplicate
USING order_status_history canonical
WHERE duplicate.order_id = canonical.order_id
  AND duplicate.from_status IS NULL
  AND canonical.from_status IS NULL
  AND (
    duplicate.created_at > canonical.created_at
    OR (duplicate.created_at = canonical.created_at AND duplicate.id > canonical.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS order_status_history_initial_unique
  ON order_status_history (order_id)
  WHERE from_status IS NULL;

COMMIT;
