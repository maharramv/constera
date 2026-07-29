import { query } from "./db.js";

export const syncRfqLead = async (rfqId) => {
  await query(
    `INSERT INTO crm_leads (
       id, source_type, source_id, customer_id, company_name, contact_name,
       email, phone, city, title, stage, note, created_at, updated_at
     )
     SELECT
       'lead-' || md5('rfq:' || rfq.id),
       'rfq', rfq.id, rfq.customer_id, rfq.company_name,
       COALESCE(NULLIF(rfq.contact_name, ''), rfq.company_name),
       rfq.email, rfq.phone, rfq.city, rfq.title,
       CASE
         WHEN rfq.status = 'Bağlandı' THEN 'won'
         WHEN rfq.status = 'Ləğv edildi' THEN 'lost'
         WHEN rfq.status IN ('Təklif gözləyir', 'Təklif alındı') THEN 'proposal'
         WHEN rfq.status = 'Baxılır' THEN 'qualified'
         ELSE 'new'
       END,
       rfq.note, rfq.created_at, now()
     FROM rfqs rfq
     WHERE rfq.id = $1
     ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       company_name = EXCLUDED.company_name,
       contact_name = EXCLUDED.contact_name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       city = EXCLUDED.city,
       title = EXCLUDED.title,
       stage = EXCLUDED.stage,
       note = EXCLUDED.note,
       updated_at = now()`,
    [rfqId]
  );
};

export const syncOrderLead = async (orderId) => {
  await query(
    `INSERT INTO crm_leads (
       id, source_type, source_id, customer_id, company_name, contact_name,
       email, phone, city, title, value_amount, currency, stage, note, created_at, updated_at
     )
     SELECT
       'lead-' || md5('order:' || orders.id),
       'order', orders.id, orders.customer_id, orders.company_name, orders.contact_name,
       orders.email, orders.phone, orders.city, 'Sifariş #' || orders.order_number,
       orders.total_amount, orders.currency,
       CASE
         WHEN orders.status = 'completed' THEN 'won'
         WHEN orders.status = 'cancelled' THEN 'lost'
         ELSE 'proposal'
       END,
       orders.note, orders.created_at, now()
     FROM orders
     WHERE orders.id = $1
     ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO UPDATE SET
       value_amount = EXCLUDED.value_amount,
       currency = EXCLUDED.currency,
       stage = EXCLUDED.stage,
       note = EXCLUDED.note,
       updated_at = now()`,
    [orderId]
  );
};

export const syncRentalLead = async (bookingId) => {
  await query(
    `INSERT INTO crm_leads (
       id, source_type, source_id, customer_id, company_name, contact_name,
       email, phone, city, title, value_amount, currency, stage, note, created_at, updated_at
     )
     SELECT
       'lead-' || md5('rental:' || booking.id),
       'rental', booking.id, booking.customer_id, booking.company_name, booking.contact_name,
       booking.email, booking.phone, booking.city, 'İcarə: ' || booking.rental_title,
       booking.quoted_amount, booking.currency,
       CASE
         WHEN booking.status = 'completed' THEN 'won'
         WHEN booking.status = 'cancelled' THEN 'lost'
         WHEN booking.status IN ('quoted', 'confirmed', 'active') THEN 'proposal'
         ELSE 'new'
       END,
       booking.note, booking.created_at, now()
     FROM rental_bookings booking
     WHERE booking.id = $1
     ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO UPDATE SET
       value_amount = EXCLUDED.value_amount,
       currency = EXCLUDED.currency,
       stage = EXCLUDED.stage,
       note = EXCLUDED.note,
       updated_at = now()`,
    [bookingId]
  );
};
