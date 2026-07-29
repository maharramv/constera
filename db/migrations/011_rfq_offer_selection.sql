BEGIN;

WITH ranked_acceptances AS (
  SELECT id,
         row_number() OVER (PARTITION BY rfq_id ORDER BY updated_at DESC, created_at DESC, id) AS rank
  FROM offers
  WHERE status = 'accepted'
)
UPDATE offers
SET status = 'rejected', updated_at = now()
WHERE id IN (SELECT id FROM ranked_acceptances WHERE rank > 1);

CREATE UNIQUE INDEX IF NOT EXISTS offers_one_accepted_per_rfq_idx
  ON offers (rfq_id)
  WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS offers_supplier_status_time_idx
  ON offers (supplier_id, status, updated_at DESC);

COMMIT;
