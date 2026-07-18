BEGIN;

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS auth_attempts_identity_time_idx ON auth_attempts (identity_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON categories (parent_id);
CREATE INDEX IF NOT EXISTS categories_kind_active_idx ON categories (kind, active);
CREATE INDEX IF NOT EXISTS products_category_active_idx ON products (category_id, status);
CREATE INDEX IF NOT EXISTS products_brand_lower_idx ON products (lower(brand));
CREATE INDEX IF NOT EXISTS products_name_lower_idx ON products (lower(name));
CREATE INDEX IF NOT EXISTS products_updated_at_idx ON products (updated_at DESC);
CREATE INDEX IF NOT EXISTS price_history_product_time_idx ON price_history (product_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS rfqs_status_time_idx ON rfqs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS rfqs_supplier_time_idx ON rfqs (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rfqs_customer_time_idx ON rfqs (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS offers_rfq_time_idx ON offers (rfq_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);

COMMIT;
