BEGIN;

INSERT INTO price_history (
  product_id,
  price_amount,
  price_currency,
  price_text,
  source_url,
  captured_at
)
SELECT
  product.id,
  product.price_amount,
  product.price_currency,
  product.price_text,
  product.source_url,
  coalesce(product.price_verified_at, product.updated_at, now())
FROM products product
WHERE product.status = 'active'
  AND product.price_status = 'confirmed'
  AND product.price_amount IS NOT NULL
  AND NULLIF(trim(coalesce(product.source_url, '')), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM price_history history WHERE history.product_id = product.id
  );

COMMIT;
