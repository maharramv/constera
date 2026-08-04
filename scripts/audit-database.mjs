import "./load-local-env.mjs";
import { query } from "../api/_lib/db.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const [counts] = await query(`
  SELECT
    (SELECT count(*)::int FROM categories WHERE kind = 'material' AND parent_id IS NULL AND active = true) AS material_categories,
    (SELECT count(*)::int FROM categories WHERE kind = 'material' AND parent_id IS NOT NULL AND active = true) AS material_subcategories,
    (SELECT count(*)::int FROM products WHERE status = 'active') AS products,
    (SELECT count(*)::int FROM product_offers WHERE status = 'active') AS product_offers,
    (SELECT count(*)::int FROM suppliers WHERE status <> 'Arxiv') AS suppliers,
    (SELECT count(*)::int FROM marketplace_entities WHERE entity_kind = 'service' AND status = 'active') AS services,
    (SELECT count(*)::int FROM marketplace_entities WHERE entity_kind = 'package' AND status = 'active') AS packages,
    (SELECT count(*)::int FROM marketplace_entities WHERE entity_kind = 'rental' AND status = 'active') AS rentals,
    (SELECT count(*)::int FROM orders) AS orders,
    (SELECT count(*)::int FROM commercial_proposals) AS commercial_proposals,
    (SELECT count(*)::int FROM delivery_quotes WHERE status = 'accepted') AS accepted_delivery_quotes,
    (SELECT count(*)::int FROM procurement_requests) AS procurement_requests,
    (SELECT count(*)::int FROM procurement_requests WHERE status = 'pending') AS pending_procurement_requests,
    (SELECT count(*)::int FROM orders WHERE offer_id IS NOT NULL) AS rfq_converted_orders,
    (SELECT count(*)::int FROM orders WHERE tender_bid_id IS NOT NULL) AS tender_converted_orders,
    (SELECT count(*)::int FROM order_documents) AS order_documents,
    (SELECT count(*)::int FROM order_fulfillments) AS order_fulfillments,
    (SELECT count(*)::int FROM supplier_purchase_orders) AS supplier_purchase_orders,
    (SELECT count(*)::int FROM inventory_reservations WHERE status = 'active') AS active_reservations,
    (SELECT count(*)::int FROM inventory_reservations WHERE status = 'shortage') AS shortage_reservations,
    (SELECT count(*)::int FROM crm_leads) AS crm_leads,
    (SELECT count(*)::int FROM rental_bookings) AS rental_bookings,
    (SELECT count(*)::int FROM payment_transactions) AS payment_transactions,
    (SELECT count(*)::int FROM payment_transactions
      WHERE provider = 'bank_transfer' AND status = 'pending') AS pending_bank_transfers,
    (SELECT count(*)::int FROM electronic_invoices WHERE status = 'issued') AS issued_invoices,
    (SELECT count(*)::int FROM supplier_applications WHERE status = 'pending') AS pending_supplier_applications,
    (SELECT count(*)::int FROM price_review_requests WHERE status = 'pending') AS pending_price_reviews,
    (SELECT count(*)::int FROM users WHERE status = 'active') AS active_users,
    (SELECT count(*)::int FROM customer_estimates) AS customer_estimates,
    (SELECT count(*)::int FROM customer_estimates WHERE workflow_status = 'approved') AS approved_estimates,
    (SELECT count(*)::int FROM customer_estimates WHERE workflow_status = 'converted') AS converted_estimates,
    (SELECT count(*)::int FROM catalog_import_runs) AS scraper_runs,
    (SELECT count(*)::int FROM catalog_import_items WHERE review_status = 'pending') AS scraper_pending,
    (SELECT count(*)::int FROM support_cases) AS support_cases,
    (SELECT count(*)::int FROM support_cases WHERE status NOT IN ('resolved', 'rejected', 'closed')) AS open_support_cases,
    (SELECT count(*)::int FROM marketplace_reviews WHERE status = 'published') AS published_reviews,
    (SELECT count(*)::int FROM analytics_events) AS analytics_events,
    (SELECT count(*)::int FROM catalog_quality_issues WHERE status = 'open') AS open_quality_issues,
    (SELECT count(*)::int FROM catalog_quality_remediations) AS quality_remediations,
    (SELECT count(*)::int FROM supplier_feeds WHERE active = true) AS active_supplier_feeds,
    (SELECT count(*)::int FROM supplier_feed_runs) AS supplier_feed_runs,
    (SELECT count(*)::int FROM supplier_feed_changes) AS supplier_feed_changes,
    (SELECT count(*)::int FROM supplier_contracts) AS supplier_contracts,
    (SELECT count(*)::int FROM supplier_contracts WHERE status = 'active') AS active_supplier_contracts,
    (SELECT count(*)::int FROM supplier_contracts
      WHERE status = 'active' AND legal_confirmed = true) AS legally_confirmed_supplier_contracts,
    (SELECT count(*)::int FROM supplier_settlements) AS supplier_settlements,
    (SELECT count(*)::int FROM delivery_tracking_events) AS delivery_tracking_events,
    (SELECT count(*)::int FROM security_events) AS security_events,
    (SELECT count(*)::int FROM backup_verifications) AS backup_verifications,
    (SELECT count(*)::int FROM media_assets WHERE status = 'active' AND is_primary = true) AS primary_media_assets,
    (SELECT count(*)::int FROM media_assets
      WHERE status = 'active' AND rights_status = 'pending') AS pending_media_rights,
    (SELECT count(*)::int FROM media_assets
      WHERE status = 'active' AND rights_status = 'rejected') AS rejected_media_rights,
    (SELECT count(*)::int FROM media_assets
      WHERE status = 'active' AND content_type LIKE 'image/%'
        AND license_type IN ('own', 'supplier', 'official', 'licensed')
        AND rights_status = 'verified'
        AND (rights_expires_on IS NULL OR rights_expires_on >= current_date)) AS licensed_media_assets,
    (SELECT count(*)::int FROM web_push_subscriptions WHERE status = 'active') AS active_push_subscriptions
`);

const [integrity] = await query(`
  SELECT
    (SELECT count(*)::int FROM products
      WHERE status = 'active' AND price_status = 'confirmed'
        AND (price_amount IS NULL OR source_url IS NULL OR source_url = '')) AS invalid_confirmed_prices,
    (SELECT count(*)::int FROM (
      SELECT sku FROM products WHERE status = 'active' GROUP BY sku HAVING count(*) > 1
    ) duplicate_skus) AS duplicate_skus,
    (SELECT count(*)::int FROM products
      WHERE price_verified_at > now() + interval '5 minutes') AS future_price_dates,
    (SELECT count(*)::int FROM products p
      WHERE p.status = 'active' AND p.price_status = 'confirmed'
        AND NOT EXISTS (SELECT 1 FROM price_history h WHERE h.product_id = p.id)) AS confirmed_products_without_history,
    (SELECT count(*)::int FROM order_items WHERE quantity <= 0) AS invalid_order_quantities,
    (SELECT count(*)::int FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_status_history history WHERE history.order_id = o.id)) AS orders_without_history,
    (SELECT count(*)::int FROM orders o
      WHERE o.offer_id IS NOT NULL AND (
        o.rfq_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM order_items item
          WHERE item.order_id = o.id AND item.supplier_id IS NOT NULL
        )
      )) AS incomplete_rfq_order_conversions,
    (SELECT count(*)::int FROM orders o
      WHERE o.tender_bid_id IS NOT NULL AND (
        o.tender_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM order_items item
          WHERE item.order_id = o.id AND item.supplier_id IS NOT NULL
        )
      )) AS incomplete_tender_order_conversions,
    (SELECT count(*)::int FROM (
      SELECT tender_id FROM tender_bids WHERE status = 'accepted'
      GROUP BY tender_id HAVING count(*) > 1
    ) duplicate_tender_acceptances) AS tenders_with_multiple_accepted_bids,
    (SELECT count(*)::int FROM order_items item
      JOIN orders o ON o.id = item.order_id
      JOIN products product ON product.id = item.product_id
      WHERE o.status NOT IN ('completed', 'cancelled')
        AND product.stock_quantity IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM inventory_reservations reservation
          WHERE reservation.order_item_id = item.id
        )) AS active_order_items_without_reservation,
    (SELECT count(*)::int FROM order_fulfillments fulfillment
      WHERE NOT EXISTS (
        SELECT 1 FROM order_items item
        WHERE item.order_id = fulfillment.order_id
          AND item.supplier_id = fulfillment.supplier_id
      )) AS orphan_fulfillments,
    (SELECT count(*)::int FROM inventory_levels level
      WHERE level.reserved_quantity > level.stock_quantity) AS inventory_over_reserved,
    (SELECT count(*)::int FROM inventory_levels level
      JOIN warehouses warehouse ON warehouse.id = level.warehouse_id
      WHERE warehouse.is_default = true
        AND level.reserved_quantity <> COALESCE((
        SELECT sum(reservation.quantity)
        FROM inventory_reservations reservation
        WHERE reservation.product_id = level.product_id
          AND reservation.status = 'active'
      ), 0)) AS inventory_reservation_mismatch,
    (SELECT count(*)::int FROM electronic_invoices
      WHERE status = 'issued' AND NULLIF(document_url, '') IS NULL) AS issued_invoices_without_document,
    (SELECT count(*)::int FROM payment_transactions transaction
      JOIN orders orders ON orders.id = transaction.order_id
      WHERE transaction.provider = 'bank_transfer'
        AND (
          NULLIF(transaction.payload->'submission'->>'reference', '') IS NULL
          OR (transaction.status = 'pending' AND orders.payment_status <> 'awaiting')
          OR (transaction.status = 'paid' AND orders.payment_status <> 'paid')
        )) AS invalid_bank_transfer_state,
    (SELECT count(*)::int FROM order_documents document
      JOIN orders o ON o.id = document.order_id
      WHERE document.document_type = 'proforma_invoice'
        AND (o.has_pending_price OR o.total_amount IS NULL)) AS invalid_proforma_documents,
    (SELECT count(*)::int FROM commercial_proposals proposal
      WHERE proposal.status = 'accepted'
        AND NOT EXISTS (
          SELECT 1 FROM orders orders
          WHERE orders.commercial_proposal_id = proposal.id
        )) AS accepted_proposals_without_order,
    (SELECT count(*)::int FROM orders orders
      JOIN commercial_proposals proposal ON proposal.id = orders.commercial_proposal_id
      WHERE abs(orders.total_amount - proposal.total_amount) > 0.01
        OR abs(orders.discount_amount - proposal.discount_amount) > 0.01
        OR abs(orders.delivery_amount - proposal.delivery_amount) > 0.01
        OR abs(orders.vat_amount - proposal.vat_amount) > 0.01
        OR orders.vat_mode <> proposal.vat_mode
        OR orders.currency <> proposal.currency) AS proposal_order_financial_mismatch,
    (SELECT count(*)::int FROM supplier_applications
      WHERE status = 'approved'
        AND (company_id IS NULL OR supplier_id IS NULL OR user_id IS NULL)) AS incomplete_supplier_approvals,
    (SELECT count(*)::int FROM (
      SELECT product_id FROM price_review_requests WHERE status = 'pending'
      GROUP BY product_id HAVING count(*) > 1
    ) duplicate_price_reviews) AS duplicate_pending_price_reviews,
    (SELECT count(*)::int FROM users u
      WHERE u.role = 'supplier' AND u.status = 'active' AND (
        u.company_id IS NULL OR NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.company_id = u.company_id)
      )) AS supplier_users_without_profile,
    (SELECT count(*)::int FROM products p
      JOIN suppliers s ON s.id = p.supplier_id
      WHERE lower(coalesce(p.supplier_name, '')) <> lower(s.name)) AS supplier_product_scope_mismatch,
    (SELECT count(*)::int FROM product_offers offer
      WHERE offer.status = 'active' AND offer.price_status = 'confirmed'
        AND (offer.unit_price IS NULL OR NULLIF(offer.source_url, '') IS NULL)) AS invalid_confirmed_product_offers,
    (SELECT count(*)::int FROM order_items item
      JOIN product_offers offer ON offer.id = item.product_offer_id
      WHERE offer.product_id <> item.product_id
         OR offer.supplier_id <> item.supplier_id) AS mismatched_order_product_offers,
    (SELECT count(*)::int FROM delivery_quotes quote
      JOIN orders orders ON orders.id = quote.order_id
      WHERE quote.status = 'accepted'
        AND orders.delivery_amount IS DISTINCT FROM quote.amount) AS delivery_quote_amount_mismatch,
    (SELECT count(*)::int FROM orders orders
      WHERE orders.approval_status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM procurement_requests request
          WHERE request.order_id = orders.id AND request.status = 'pending'
        )) AS pending_orders_without_procurement,
    (SELECT count(*)::int FROM procurement_requests request
      JOIN orders orders ON orders.id = request.order_id
      WHERE request.status <> orders.approval_status
        AND NOT (request.status = 'cancelled' AND orders.approval_status = 'not_required')) AS procurement_order_status_mismatch,
    (SELECT count(*)::int FROM procurement_requests request
      WHERE request.approved_count <> (
        SELECT count(*) FROM procurement_decisions decision
        WHERE decision.request_id = request.id AND decision.decision = 'approved'
      )) AS procurement_approval_count_mismatch,
    (SELECT count(*)::int FROM (
      SELECT DISTINCT item.order_id, item.supplier_id
      FROM order_items item
      WHERE item.supplier_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM supplier_purchase_orders purchase_order
          WHERE purchase_order.order_id = item.order_id
            AND purchase_order.supplier_id = item.supplier_id
        )
    ) missing_purchase_orders) AS supplier_groups_without_purchase_order,
    (SELECT count(*)::int FROM supplier_purchase_orders purchase_order
      WHERE NOT EXISTS (
        SELECT 1 FROM supplier_purchase_order_items purchase_item
        WHERE purchase_item.purchase_order_id = purchase_order.id
      )) AS purchase_orders_without_items,
    (SELECT count(*)::int FROM supplier_purchase_order_items purchase_item
      JOIN supplier_purchase_orders purchase_order ON purchase_order.id = purchase_item.purchase_order_id
      JOIN order_items item ON item.id = purchase_item.order_item_id
      WHERE purchase_order.order_id <> item.order_id
         OR purchase_order.supplier_id <> item.supplier_id) AS purchase_order_item_scope_mismatch,
    (SELECT count(*)::int FROM supplier_purchase_orders purchase_order
      WHERE purchase_order.total_amount IS DISTINCT FROM (
        CASE
          WHEN purchase_order.subtotal IS NULL THEN NULL
          ELSE purchase_order.subtotal + purchase_order.delivery_amount
        END
      )) AS purchase_order_total_mismatch,
    (SELECT count(*)::int FROM orders orders
      WHERE EXISTS (
        SELECT 1 FROM supplier_purchase_orders purchase_order
        WHERE purchase_order.order_id = orders.id
      )
        AND abs(
          COALESCE(orders.delivery_amount, 0)
          - COALESCE((
            SELECT sum(purchase_order.delivery_amount)
            FROM supplier_purchase_orders purchase_order
            WHERE purchase_order.order_id = orders.id
          ), 0)
        ) > 0.01) AS purchase_order_delivery_mismatch,
    (SELECT count(*)::int FROM (
      SELECT rfq_id FROM offers WHERE status = 'accepted'
      GROUP BY rfq_id HAVING count(*) > 1
    ) duplicate_acceptances) AS rfqs_with_multiple_accepted_offers,
    (SELECT count(*)::int FROM tenders t
      WHERE t.visibility = 'invited' AND NOT EXISTS (
        SELECT 1 FROM tender_invitations ti WHERE ti.tender_id = t.id
      )) AS invited_tenders_without_supplier,
    (SELECT count(*)::int FROM catalog_import_items
      WHERE (payload->>'price_status') = 'confirmed'
        AND (
          NULLIF(payload->>'source_url', '') IS NULL
          OR NULLIF(payload->>'verified_at', '') IS NULL
          OR NULLIF(payload->>'price', '') IS NULL
        )) AS invalid_scraper_confirmed_prices,
    (SELECT count(*)::int FROM catalog_import_runs
      WHERE source_file ~ '(^/|^[A-Za-z]:[\\/])') AS scraper_absolute_source_paths,
    (SELECT count(DISTINCT i.id)::int
       FROM catalog_import_items i
       CROSS JOIN LATERAL jsonb_array_elements_text(
         CASE
           WHEN jsonb_typeof(i.payload->'image_urls') = 'array' THEN i.payload->'image_urls'
           ELSE '[]'::jsonb
         END
       ) AS media(url)
      WHERE CASE i.source_id
        WHEN 'elem' THEN media.url !~* '^https://(www\\.)?elem\\.az/'
        WHEN 'tvim' THEN media.url !~* '^https://(www\\.)?tvim\\.az/'
        WHEN 'omid' THEN media.url !~* '^https://(www\\.)?omid\\.az/'
        WHEN 'insaat' THEN media.url !~* '^https://(www\\.)?insaat\\.az/'
        ELSE true
      END) AS invalid_scraper_media_hosts,
    (SELECT count(*)::int FROM support_cases support
      JOIN orders orders ON orders.id = support.order_id
      WHERE support.customer_id <> orders.customer_id) AS support_order_customer_mismatch,
    (SELECT count(*)::int FROM refund_transactions refund
      JOIN orders orders ON orders.id = refund.order_id
      WHERE refund.amount > orders.total_amount + 0.01) AS refund_exceeds_order_total,
    (SELECT count(*)::int FROM refund_transactions
      WHERE status = 'completed' AND completed_at IS NULL) AS completed_refunds_without_date,
    (SELECT count(*)::int FROM marketplace_reviews review
      WHERE review.verified = true AND (
        (review.source_type = 'order' AND NOT EXISTS (
          SELECT 1 FROM orders orders
          WHERE orders.id = review.source_id
            AND orders.customer_id = review.customer_id
            AND orders.status = 'completed'
        ))
        OR
        (review.source_type = 'rental_booking' AND NOT EXISTS (
          SELECT 1 FROM rental_bookings booking
          WHERE booking.id = review.source_id
            AND booking.customer_id = review.customer_id
            AND booking.status = 'completed'
        ))
      )) AS reviews_without_verified_source,
    (SELECT count(*)::int FROM catalog_quality_runs
      WHERE status = 'running' AND started_at < now() - interval '15 minutes') AS stale_quality_runs,
    (SELECT count(*)::int FROM supplier_feed_runs
      WHERE status = 'running' AND started_at < now() - interval '30 minutes') AS stale_supplier_feed_runs,
    (SELECT count(*)::int FROM supplier_feeds
      WHERE active = true AND (
        endpoint_url !~ '^https://'
        OR (auth_env_key IS NOT NULL AND auth_env_key !~ '^[A-Z][A-Z0-9_]{2,89}$')
      )) AS invalid_supplier_feeds,
    (SELECT count(*)::int FROM users
      WHERE two_factor_enabled = true AND (
        NULLIF(two_factor_secret, '') IS NULL
        OR jsonb_typeof(two_factor_recovery_codes) <> 'array'
      )) AS invalid_two_factor_accounts,
    (SELECT count(*)::int FROM web_push_subscriptions
      WHERE status = 'active' AND (
        endpoint !~ '^https://'
        OR NULLIF(p256dh, '') IS NULL
        OR NULLIF(auth, '') IS NULL
      )) AS invalid_push_subscriptions,
    (SELECT count(*)::int FROM suppliers supplier
      WHERE supplier.status <> 'Arxiv'
        AND NOT EXISTS (
          SELECT 1 FROM supplier_contracts contract
          WHERE contract.supplier_id = supplier.id
        )) AS suppliers_without_contract,
    (SELECT count(*)::int FROM supplier_contracts
      WHERE ends_on IS NOT NULL AND ends_on < starts_on) AS invalid_supplier_contract_dates,
    (SELECT count(*)::int FROM (
      SELECT supplier_id FROM supplier_contracts
      WHERE status = 'active'
      GROUP BY supplier_id HAVING count(*) > 1
    ) duplicate_active_contracts) AS suppliers_with_multiple_active_contracts,
    (SELECT count(*)::int FROM supplier_settlements settlement
      WHERE abs(
        settlement.net_amount
        - (
          settlement.gross_amount
          - settlement.refund_amount
          - settlement.commission_amount
          + settlement.adjustment_amount
        )
      ) > 0.01) AS settlement_amount_mismatch,
    (SELECT count(*)::int FROM supplier_settlements settlement
      WHERE settlement.status = 'paid'
        AND (NULLIF(settlement.payment_reference, '') IS NULL OR settlement.paid_at IS NULL)
    ) AS paid_settlements_without_reference,
    (SELECT count(*)::int FROM supplier_settlements settlement
      WHERE EXISTS (
        SELECT 1
          FROM supplier_settlement_items item
         WHERE item.settlement_id = settlement.id
         GROUP BY item.settlement_id
        HAVING abs(sum(item.gross_amount) - settlement.gross_amount) > 0.01
            OR abs(sum(item.refund_amount) - settlement.refund_amount) > 0.01
            OR abs(sum(item.commission_amount) - settlement.commission_amount) > 0.01
            OR abs(sum(item.net_amount) + settlement.adjustment_amount - settlement.net_amount) > 0.01
      )) AS settlement_item_total_mismatch,
    (SELECT count(*)::int FROM supplier_feed_runs run
      WHERE run.rollback_status = 'available'
        AND NOT EXISTS (
          SELECT 1 FROM supplier_feed_changes change
          WHERE change.feed_run_id = run.id
        )) AS rollback_runs_without_snapshot,
    (SELECT count(*)::int FROM delivery_tracking_events event
      JOIN order_fulfillments fulfillment ON fulfillment.id = event.fulfillment_id
      LEFT JOIN supplier_purchase_orders purchase_order ON purchase_order.id = event.purchase_order_id
      WHERE event.order_id <> fulfillment.order_id
         OR (event.purchase_order_id IS NOT NULL AND (
           purchase_order.fulfillment_id <> event.fulfillment_id
           OR purchase_order.order_id <> event.order_id
         ))) AS tracking_scope_mismatch,
    (SELECT count(*)::int FROM media_assets
      WHERE status = 'active' AND is_primary = true
        AND content_type NOT LIKE 'image/%') AS non_image_primary_media,
    (SELECT count(*)::int FROM media_assets
      WHERE status = 'active'
        AND license_type <> 'own'
        AND NULLIF(source_url, '') IS NULL) AS sourced_media_without_source,
    (SELECT count(*)::int FROM media_assets
      WHERE status = 'active' AND provider = 'external'
        AND (
          url !~ '^https://'
          OR license_type NOT IN ('own', 'supplier', 'official', 'licensed', 'reference')
          OR NULLIF(source_url, '') IS NULL
        )) AS invalid_external_media,
    (SELECT count(*)::int FROM supplier_contracts
      WHERE status = 'active' AND legal_confirmed <> true) AS active_contracts_without_legal_confirmation,
    (SELECT count(*)::int FROM media_assets
      WHERE status = 'active' AND rights_status = 'verified'
        AND (
          rights_verified_by IS NULL
          OR rights_verified_at IS NULL
          OR NULLIF(trim(rights_review_note), '') IS NULL
          OR license_type NOT IN ('own', 'supplier', 'official', 'licensed')
          OR (rights_expires_on IS NOT NULL AND rights_expires_on < current_date)
        )) AS invalid_verified_media_rights,
    (SELECT count(*)::int FROM customer_estimates estimate
      WHERE estimate.workflow_status = 'converted'
        AND (
          estimate.rfq_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM rfqs rfq
            WHERE rfq.id = estimate.rfq_id AND rfq.estimate_id = estimate.id
          )
        )) AS invalid_estimate_conversions,
    (SELECT count(*)::int FROM customer_estimates estimate
      JOIN ai_runs run ON run.id = estimate.ai_run_id
      WHERE estimate.workflow_status = 'approved'
        AND run.approval_status <> 'approved') AS approved_estimates_without_ai_approval,
    COALESCE((
      SELECT CASE
        WHEN verification.schema_migrations = 29
          AND NULLIF(verification.checksum_sha256, '') IS NOT NULL THEN 0
        ELSE 1
      END
      FROM backup_verifications verification
      WHERE verification.status = 'verified'
      ORDER BY verification.created_at DESC
      LIMIT 1
    ), 1)::int AS invalid_backup_verifications
`);

const [schema] = await query(`
  SELECT
    to_regclass('public.orders') IS NOT NULL AS orders_ready,
    to_regclass('public.product_offers') IS NOT NULL AS product_offers_ready,
    to_regclass('public.logistics_zones') IS NOT NULL AS logistics_zones_ready,
    to_regclass('public.delivery_quotes') IS NOT NULL AS delivery_quotes_ready,
    to_regclass('public.procurement_requests') IS NOT NULL AS procurement_requests_ready,
    to_regclass('public.procurement_decisions') IS NOT NULL AS procurement_decisions_ready,
    to_regclass('public.order_items') IS NOT NULL AS order_items_ready,
    to_regclass('public.order_status_history') IS NOT NULL AS order_history_ready,
    to_regclass('public.order_documents') IS NOT NULL AS order_documents_ready,
    to_regclass('public.commercial_proposals') IS NOT NULL AS commercial_proposals_ready,
    to_regclass('public.order_fulfillments') IS NOT NULL AS order_fulfillments_ready,
    to_regclass('public.supplier_purchase_orders') IS NOT NULL AS supplier_purchase_orders_ready,
    to_regclass('public.supplier_purchase_order_items') IS NOT NULL AS supplier_purchase_order_items_ready,
    to_regclass('public.inventory_reservations') IS NOT NULL AS inventory_reservations_ready,
    to_regclass('public.inventory_levels') IS NOT NULL AS inventory_levels_ready,
    to_regclass('public.warehouses') IS NOT NULL AS warehouses_ready,
    to_regclass('public.crm_leads') IS NOT NULL AS crm_leads_ready,
    to_regclass('public.crm_activities') IS NOT NULL AS crm_activities_ready,
    to_regclass('public.rental_bookings') IS NOT NULL AS rental_bookings_ready,
    to_regclass('public.payment_transactions') IS NOT NULL AS payment_transactions_ready,
    to_regclass('public.electronic_invoices') IS NOT NULL AS electronic_invoices_ready,
    to_regclass('public.supplier_applications') IS NOT NULL AS supplier_applications_ready,
    to_regclass('public.price_review_requests') IS NOT NULL AS price_reviews_ready,
    to_regclass('public.password_reset_tokens') IS NOT NULL AS password_reset_ready,
    to_regclass('public.customer_projects') IS NOT NULL AS customer_projects_ready,
    to_regclass('public.saved_products') IS NOT NULL AS saved_products_ready,
    to_regclass('public.customer_estimates') IS NOT NULL AS customer_estimates_ready,
    to_regclass('public.catalog_import_runs') IS NOT NULL AS scraper_runs_ready,
    to_regclass('public.catalog_import_items') IS NOT NULL AS scraper_items_ready,
    to_regclass('public.support_cases') IS NOT NULL AS support_cases_ready,
    to_regclass('public.support_case_messages') IS NOT NULL AS support_messages_ready,
    to_regclass('public.refund_transactions') IS NOT NULL AS refunds_ready,
    to_regclass('public.marketplace_reviews') IS NOT NULL AS reviews_ready,
    to_regclass('public.analytics_events') IS NOT NULL AS analytics_events_ready,
    to_regclass('public.catalog_quality_runs') IS NOT NULL AS quality_runs_ready,
    to_regclass('public.catalog_quality_issues') IS NOT NULL AS quality_issues_ready,
    to_regclass('public.catalog_quality_remediations') IS NOT NULL AS quality_remediations_ready,
    to_regclass('public.auth_challenges') IS NOT NULL AS auth_challenges_ready,
    to_regclass('public.supplier_feeds') IS NOT NULL AS supplier_feeds_ready,
    to_regclass('public.supplier_feed_runs') IS NOT NULL AS supplier_feed_runs_ready,
    to_regclass('public.supplier_offer_history') IS NOT NULL AS supplier_offer_history_ready,
    to_regclass('public.supplier_feed_changes') IS NOT NULL AS supplier_feed_changes_ready,
    to_regclass('public.supplier_contracts') IS NOT NULL AS supplier_contracts_ready,
    to_regclass('public.supplier_settlements') IS NOT NULL AS supplier_settlements_ready,
    to_regclass('public.supplier_settlement_items') IS NOT NULL AS supplier_settlement_items_ready,
    to_regclass('public.delivery_tracking_events') IS NOT NULL AS delivery_tracking_events_ready,
    to_regclass('public.security_events') IS NOT NULL AS security_events_ready,
    to_regclass('public.backup_verifications') IS NOT NULL AS backup_verifications_ready,
    to_regclass('public.ai_usage_counters') IS NOT NULL AS ai_usage_counters_ready,
    to_regclass('public.ai_runs') IS NOT NULL AS ai_runs_ready,
    to_regclass('public.web_push_subscriptions') IS NOT NULL AS web_push_subscriptions_ready,
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS search_ready,
    to_regclass('public.products_search_folded_trgm_idx') IS NOT NULL AS folded_search_ready,
    to_regclass('public.suppliers_company_unique') IS NOT NULL AS supplier_scope_ready,
    to_regclass('public.offers_one_accepted_per_rfq_idx') IS NOT NULL AS offer_selection_ready,
    to_regclass('public.price_review_requests_one_pending_idx') IS NOT NULL AS price_review_scope_ready,
    to_regclass('public.orders_offer_unique') IS NOT NULL
      AND to_regclass('public.orders_rfq_unique') IS NOT NULL AS rfq_order_scope_ready,
    to_regclass('public.orders_commercial_proposal_unique') IS NOT NULL
      AND to_regclass('public.commercial_proposals_rfq_time_idx') IS NOT NULL
      AND to_regclass('public.commercial_proposals_customer_status_idx') IS NOT NULL
      AS commercial_proposal_scope_ready,
    to_regclass('public.orders_tender_unique') IS NOT NULL
      AND to_regclass('public.orders_tender_bid_unique') IS NOT NULL AS tender_order_scope_ready,
    to_regclass('public.tender_bids_one_accepted_per_tender_idx') IS NOT NULL AS tender_selection_ready,
    to_regclass('public.crm_leads_source_unique') IS NOT NULL AS crm_source_scope_ready,
    to_regclass('public.order_items_supplier_idx') IS NOT NULL AS order_supplier_scope_ready,
    to_regclass('public.product_offers_product_idx') IS NOT NULL AS product_offer_search_ready,
    to_regclass('public.procurement_requests_company_idx') IS NOT NULL AS procurement_scope_ready,
    to_regclass('public.supplier_purchase_orders_supplier_idx') IS NOT NULL AS purchase_order_scope_ready,
    to_regclass('public.supplier_contracts_one_active_idx') IS NOT NULL AS supplier_contract_scope_ready,
    to_regclass('public.media_assets_one_primary_idx') IS NOT NULL AS media_primary_scope_ready,
    to_regclass('public.supplier_contracts_legal_status_idx') IS NOT NULL AS supplier_legal_scope_ready,
    to_regclass('public.media_assets_rights_review_idx') IS NOT NULL AS media_rights_scope_ready,
    to_regclass('public.ai_runs_pending_review_idx') IS NOT NULL AS ai_review_scope_ready,
    to_regclass('public.rfqs_ai_run_idx') IS NOT NULL AS ai_rfq_scope_ready,
    to_regclass('public.rfqs_estimate_unique') IS NOT NULL
      AND to_regclass('public.customer_estimates_workflow_idx') IS NOT NULL
      AND to_regclass('public.customer_estimates_ai_run_unique') IS NOT NULL
      AS ai_estimate_workflow_ready
`);

const minimums = {
  material_categories: 70,
  material_subcategories: 695,
  products: 826,
  services: 118,
  packages: 75,
  rentals: 108
};
const problems = [];

Object.entries(minimums).forEach(([key, minimum]) => {
  if (Number(counts[key] || 0) < minimum) problems.push(`${key}: ${counts[key] || 0}, minimum ${minimum}`);
});
Object.entries(integrity).forEach(([key, value]) => {
  if (Number(value || 0) !== 0) problems.push(`${key}: ${value}`);
});
Object.entries(schema).forEach(([key, value]) => {
  if (!value) problems.push(`${key}: hazır deyil`);
});

console.log("ConstEra Neon auditi:");
Object.entries(counts).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
console.log(`- schema: ${Object.values(schema).every(Boolean) ? "hazır" : "natamam"}`);
console.log(`- data_integrity: ${Object.values(integrity).every((value) => Number(value || 0) === 0) ? "təmiz" : "problemli"}`);

if (problems.length) {
  console.error("Neon auditi uğursuz oldu:");
  problems.forEach((problem) => console.error(`- ${problem}`));
  process.exit(1);
}

console.log("Neon auditi uğurla tamamlandı.");
