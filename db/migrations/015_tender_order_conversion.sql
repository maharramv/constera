BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tender_id text REFERENCES tenders(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tender_bid_id text REFERENCES tender_bids(id) ON DELETE SET NULL;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY tender_id
    ORDER BY updated_at DESC, created_at DESC, id
  ) AS rank
  FROM tender_bids
  WHERE status = 'accepted'
)
UPDATE tender_bids bid
SET status = 'rejected', updated_at = now()
FROM ranked
WHERE bid.id = ranked.id
  AND ranked.rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS tender_bids_one_accepted_per_tender_idx
  ON tender_bids (tender_id)
  WHERE status = 'accepted';

CREATE UNIQUE INDEX IF NOT EXISTS orders_tender_unique
  ON orders (tender_id)
  WHERE tender_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_tender_bid_unique
  ON orders (tender_bid_id)
  WHERE tender_bid_id IS NOT NULL;

COMMIT;
