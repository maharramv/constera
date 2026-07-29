BEGIN;

CREATE INDEX IF NOT EXISTS products_search_folded_trgm_idx
ON products USING gin (
  (
    translate(
      lower(
        coalesce(name, '') || ' ' ||
        coalesce(sku, '') || ' ' ||
        coalesce(brand, '') || ' ' ||
        coalesce(subcategory, '') || ' ' ||
        coalesce(package_text, '') || ' ' ||
        coalesce(supplier_name, '') || ' ' ||
        coalesce(origin, '') || ' ' ||
        coalesce(specs::text, '')
      ),
      'əğıöşüç',
      'egiosuc'
    )
  ) gin_trgm_ops
)
WHERE status = 'active';

COMMIT;
