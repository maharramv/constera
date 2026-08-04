import "./load-local-env.mjs";
import { randomBytes, randomUUID } from "node:crypto";
import fulfillmentHandler from "../api/_admin/fulfillments.js";
import ordersHandler from "../api/_admin/orders.js";
import procurementHandler from "../api/_admin/procurement.js";
import rentalBookingsHandler from "../api/_admin/rental-bookings.js";
import tenderBidsHandler from "../api/_admin/tender-bids.js";
import integrationsHandler from "../api/_admin/integrations.js";
import { getCookieName, hashOpaque } from "../api/_lib/auth.js";
import { query } from "../api/_lib/db.js";
import {
  releaseOrderReservations,
  syncProductInventoryLevels
} from "../api/_lib/order-operations.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const createResponse = () => ({
  headers: {},
  statusCode: 200,
  payload: null,
  setHeader(key, value) {
    this.headers[key] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
  end(value) {
    this.payload = value ? JSON.parse(value) : null;
    return this;
  }
});

const requestHeaders = (token, ip = "127.0.0.247") => ({
  ...(token ? { cookie: `${getCookieName()}=${token}` } : {}),
  origin: "https://constera.az",
  host: "constera.az",
  "x-forwarded-for": ip
});

const jsonBody = (value) => Buffer.from(JSON.stringify(value));
const dateOnly = (date) => date.toISOString().slice(0, 10);

const [admin] = await query(
  "SELECT id FROM users WHERE role IN ('super_admin', 'admin') AND status = 'active' ORDER BY (role = 'super_admin') DESC LIMIT 1"
);
if (!admin) throw new Error("Əməliyyat smoke testi üçün aktiv administrator tapılmadı.");

const sessionId = `ses-smoke-operations-${randomUUID()}`;
const sessionToken = randomBytes(32).toString("base64url");
await query(
  `INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_hash)
   VALUES ($1, $2, $3, now() + interval '15 minutes', 'ConstEra operations smoke test', $4)`,
  [sessionId, admin.id, hashOpaque(sessionToken), hashOpaque("127.0.0.247")]
);

let orderId = "";
let tenderId = "";
let tenderOrderId = "";
let bookingId = "";

try {
  let [stockProduct] = await query(
    `SELECT product.id, product.name, product.package_text, offer.supplier_id,
            offer.id AS offer_id, offer.minimum_order, level.reserved_quantity
       FROM product_offers offer
       JOIN products product
         ON product.id = offer.product_id
        AND product.status = 'active'
       JOIN suppliers supplier
         ON supplier.id = offer.supplier_id
        AND supplier.status <> 'Arxiv'
       JOIN warehouses warehouse
         ON warehouse.supplier_id = offer.supplier_id
        AND warehouse.is_default = true
        AND warehouse.status = 'active'
       JOIN inventory_levels level
         ON level.warehouse_id = warehouse.id
        AND level.product_id = product.id
      WHERE offer.status = 'active'
        AND offer.price_status = 'confirmed'
        AND offer.unit_price > 0
        AND offer.currency = 'AZN'
        AND offer.price_verified_at >= now() - interval '30 days'
        AND offer.stock_quantity > 0
        AND offer.source_url ~ '^https://'
        AND level.stock_quantity - level.reserved_quantity >= GREATEST(COALESCE(offer.minimum_order, 1), 1)
        AND NULLIF(trim(supplier.contact), '') IS NOT NULL
        AND supplier.website ~ '^https://'
        AND EXISTS (
          SELECT 1 FROM supplier_contracts contract
           WHERE contract.supplier_id = offer.supplier_id
             AND contract.status = 'active'
             AND contract.legal_confirmed = true
             AND contract.starts_on <= current_date
             AND (contract.ends_on IS NULL OR contract.ends_on >= current_date)
        )
        AND EXISTS (
          SELECT 1 FROM companies company
           WHERE company.id = supplier.company_id
             AND company.status = 'active'
             AND NULLIF(trim(company.tax_id), '') IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM users supplier_user
           WHERE supplier_user.company_id = supplier.company_id
             AND supplier_user.role = 'supplier'
             AND supplier_user.status = 'active'
        )
        AND EXISTS (
          SELECT 1 FROM media_assets media
           WHERE media.entity_type = 'product'
             AND media.entity_id = product.id
             AND media.status = 'active'
             AND media.content_type LIKE 'image/%'
             AND media.license_type IN ('own', 'supplier', 'official', 'licensed')
             AND media.rights_status = 'verified'
             AND (media.rights_expires_on IS NULL OR media.rights_expires_on >= current_date)
             AND media.url ~ '^https://'
        )
      ORDER BY offer.is_featured DESC, offer.updated_at DESC
      LIMIT 1`
  );
  if (!stockProduct) [stockProduct] = await query(
    `SELECT product.id, product.name, product.package_text, product.supplier_id,
            NULL::text AS offer_id, NULL::numeric AS minimum_order, level.reserved_quantity
       FROM products product
       JOIN warehouses warehouse
         ON warehouse.supplier_id = product.supplier_id
        AND warehouse.is_default = true
        AND warehouse.status = 'active'
       JOIN inventory_levels level
         ON level.warehouse_id = warehouse.id
        AND level.product_id = product.id
      WHERE product.status = 'active'
        AND product.stock_quantity IS NOT NULL
        AND level.stock_quantity - level.reserved_quantity >= 2
      ORDER BY product.updated_at DESC
      LIMIT 1`
  );
  if (!stockProduct) throw new Error("Rezerv smoke testi üçün ən azı 2 sərbəst stoklu məhsul tapılmadı.");
  if (await syncProductInventoryLevels([stockProduct.id]) !== 1) {
    throw new Error("Məhsul stokunu əsas anbar səviyyəsi ilə sinxronlaşdırmaq mümkün olmadı.");
  }
  const reservedBefore = Number(stockProduct.reserved_quantity || 0);
  const smokeQuantity = Math.max(1, Number(stockProduct.minimum_order || 1));

  const orderResponse = createResponse();
  await ordersHandler({
    method: "POST",
    headers: requestHeaders(sessionToken),
    query: {},
    body: jsonBody({
      companyName: "ConstEra əməliyyat smoke testi",
      contactName: "Smoke test",
      email: "operations-smoke@constera.az",
      phone: "+994 00 000 00 03",
      city: "Bakı",
      address: "Avtomatik əməliyyat test ünvanı",
      deliveryMode: "supplier_delivery",
      paymentMethod: "invoice",
      requiresApproval: true,
      requiredApprovals: 1,
      budgetAmount: 10_000,
      costCenter: "SMOKE-B2B",
      legalAccepted: true,
      sourcePath: "/checkout.html",
      items: [{
        productId: stockProduct.id,
        offerId: stockProduct.offer_id || undefined,
        quantity: smokeQuantity,
        unit: stockProduct.package_text || "ədəd"
      }]
    })
  }, orderResponse);
  orderId = orderResponse.payload?.data?.id || "";
  const fulfillment = orderResponse.payload?.data?.fulfillments?.[0];
  const reservation = orderResponse.payload?.data?.reservations?.[0];
  const purchaseOrder = orderResponse.payload?.data?.purchaseOrders?.[0];
  if (
    orderResponse.statusCode !== 201
    || !orderId
    || orderResponse.payload?.data?.approvalStatus !== "pending"
    || !orderResponse.payload?.data?.procurement?.id
    || orderResponse.payload?.data?.deliveryQuote?.status !== "accepted"
  ) {
    throw new Error(`Rezervli sifariş yaradılmadı: HTTP ${orderResponse.statusCode}`);
  }
  const hasCommercialOperations = Boolean(fulfillment?.id && purchaseOrder?.id && reservation?.id);
  if (!hasCommercialOperations) {
    if (
      fulfillment
      || purchaseOrder
      || reservation
      || orderResponse.payload?.data?.hasPendingPrice !== true
      || stockProduct.offer_id
    ) {
      throw new Error("Kommersiya yoxlamasından keçməyən sifariş təhlükəsiz sorğu rejimində qalmadı.");
    }
    console.log("B2B qoruması: hazır real təklif olmadığı üçün sifariş rezerv və alt-sifariş yaratmadan sorğu rejimində qaldı.");
  } else {
    if (purchaseOrder.status !== "draft" || reservation.status !== "active" || !stockProduct.offer_id) {
      throw new Error("Kommersiya hazır təklif üçün rezerv və alt-sifariş ardıcıl yaradılmadı.");
    }

    const blockedConfirmation = createResponse();
    await ordersHandler({
      method: "PATCH",
      headers: requestHeaders(sessionToken),
      query: {},
      body: jsonBody({ id: orderId, status: "confirmed" })
    }, blockedConfirmation);
    if (
      blockedConfirmation.statusCode !== 409
      || blockedConfirmation.payload?.error?.code !== "procurement_approval_required"
    ) {
      throw new Error("Təsdiq gözləyən sifariş bloklanmadı.");
    }

    const procurementResponse = createResponse();
    await procurementHandler({
      method: "PATCH",
      headers: requestHeaders(sessionToken),
      query: {},
      body: jsonBody({
        id: orderResponse.payload.data.procurement.id,
        action: "decide",
        decision: "approved",
        note: "Smoke-test satınalma təsdiqi"
      })
    }, procurementResponse);
    if (
      procurementResponse.statusCode !== 200
      || procurementResponse.payload?.data?.status !== "approved"
    ) {
      throw new Error(`Satınalma təsdiqi uğursuz oldu: HTTP ${procurementResponse.statusCode}`);
    }
    const [issuedPurchaseOrder] = await query(
      "SELECT status FROM supplier_purchase_orders WHERE order_id = $1 LIMIT 1",
      [orderId]
    );
    if (issuedPurchaseOrder?.status !== "issued") {
      throw new Error("Satınalma təsdiqindən sonra təchizatçı alt-sifarişi göndərilmədi.");
    }

    const confirmedOrder = createResponse();
    await ordersHandler({
      method: "PATCH",
      headers: requestHeaders(sessionToken),
      query: {},
      body: jsonBody({ id: orderId, status: "confirmed", historyNote: "Smoke-test təsdiqi" })
    }, confirmedOrder);
    if (
      confirmedOrder.statusCode !== 200
      || confirmedOrder.payload?.data?.status !== "confirmed"
      || confirmedOrder.payload?.data?.approvalStatus !== "approved"
    ) {
      throw new Error(`Təsdiqdən sonrakı sifariş keçidi uğursuz oldu: HTTP ${confirmedOrder.statusCode}`);
    }
    console.log("B2B: logistika təklifi, satınalma bloku və təsdiqdən sonrakı sifariş keçidi yoxlanıldı.");

    const acceptedResponse = createResponse();
    await fulfillmentHandler({
      method: "PATCH",
      headers: requestHeaders(sessionToken),
      query: {},
      body: jsonBody({ id: fulfillment.id, status: "accepted", note: "Smoke-test qəbulu" })
    }, acceptedResponse);
    if (acceptedResponse.statusCode !== 200 || acceptedResponse.payload?.data?.status !== "accepted") {
      throw new Error(`Fulfillment qəbulu uğursuz oldu: HTTP ${acceptedResponse.statusCode}`);
    }
    const [acceptedPurchaseOrder] = await query(
      "SELECT status FROM supplier_purchase_orders WHERE order_id = $1 LIMIT 1",
      [orderId]
    );
    if (acceptedPurchaseOrder?.status !== "accepted") {
      throw new Error("Təchizatçı qəbulu alt-sifariş statusuna ötürülmədi.");
    }

    const cancelledResponse = createResponse();
    await fulfillmentHandler({
      method: "PATCH",
      headers: requestHeaders(sessionToken),
      query: {},
      body: jsonBody({ id: fulfillment.id, status: "cancelled", note: "Smoke-test ləğvi" })
    }, cancelledResponse);
    const [releasedReservation] = await query(
      "SELECT status FROM inventory_reservations WHERE order_id = $1 LIMIT 1",
      [orderId]
    );
    const [levelAfter] = await query(
      `SELECT level.reserved_quantity
         FROM inventory_levels level
         JOIN warehouses warehouse ON warehouse.id = level.warehouse_id
        WHERE level.product_id = $1 AND warehouse.is_default = true
        LIMIT 1`,
      [stockProduct.id]
    );
    const [orderLead] = await query(
      "SELECT stage FROM crm_leads WHERE source_type = 'order' AND source_id = $1",
      [orderId]
    );
    const [cancelledPurchaseOrder] = await query(
      "SELECT status FROM supplier_purchase_orders WHERE order_id = $1 LIMIT 1",
      [orderId]
    );
    if (
      cancelledResponse.statusCode !== 200
      || cancelledResponse.payload?.data?.status !== "cancelled"
      || releasedReservation?.status !== "released"
      || Number(levelAfter?.reserved_quantity || 0) !== reservedBefore
      || orderLead?.stage !== "lost"
      || cancelledPurchaseOrder?.status !== "cancelled"
    ) {
      throw new Error("Fulfillment ləğvi rezervi buraxmadı və CRM mərhələsini yeniləmədi.");
    }
    console.log("Fulfillment: stok atomik rezerv edildi, qəbul olundu və ləğvdə sərbəst buraxıldı.");
  }

  const supplierRows = await query("SELECT id FROM suppliers WHERE status <> 'Arxiv' ORDER BY id LIMIT 2");
  if (supplierRows.length < 2) throw new Error("Tender smoke testi üçün iki təchizatçı tapılmadı.");
  tenderId = `tnd-smoke-${randomUUID()}`;
  const firstBidId = `tbd-smoke-${randomUUID()}`;
  const winnerBidId = `tbd-smoke-${randomUUID()}`;
  await query(
    `INSERT INTO tenders (
       id, created_by, customer_id, company_name, title, description,
       city, status, visibility, contact
     ) VALUES (
       $1, $2, $2, 'ConstEra smoke test', 'Avtomatik tender çevrilməsi',
       'Test tamamlandıqdan sonra silinir', 'Bakı', 'evaluation', 'public',
       'operations-smoke@constera.az · +994 00 000 00 03'
     )`,
    [tenderId, admin.id]
  );
  await query(
    `INSERT INTO tender_lots (id, tender_id, title, quantity_text, unit, specifications)
     VALUES ($1, $2, 'Sınaq material lotu', '10 ədəd', 'ədəd', '[]'::jsonb)`,
    [`tlot-smoke-${randomUUID()}`, tenderId]
  );
  await query(
    `INSERT INTO tender_bids (
       id, tender_id, supplier_id, created_by, price_amount, price_text, status
     ) VALUES
       ($1, $3, $5, $4, 250, '250 AZN', 'accepted'),
       ($2, $3, $6, $4, 225, '225 AZN', 'submitted')`,
    [firstBidId, winnerBidId, tenderId, admin.id, supplierRows[0].id, supplierRows[1].id]
  );

  const winnerResponse = createResponse();
  await tenderBidsHandler({
    method: "PATCH",
    headers: requestHeaders(sessionToken),
    query: {},
    body: jsonBody({ id: winnerBidId, status: "accepted" })
  }, winnerResponse);
  tenderOrderId = winnerResponse.payload?.data?.order?.id || "";
  if (
    winnerResponse.statusCode !== 200
    || !tenderOrderId
    || winnerResponse.payload?.data?.conversionCreated !== true
    || winnerResponse.payload.data.order.tenderId !== tenderId
    || winnerResponse.payload.data.order.tenderBidId !== winnerBidId
    || winnerResponse.payload.data.order.totalAmount !== 225
    || winnerResponse.payload.data.order.documents?.length !== 2
  ) {
    throw new Error(`Tender sifariş çevrilməsi uğursuz oldu: HTTP ${winnerResponse.statusCode}`);
  }

  const repeatedWinnerResponse = createResponse();
  await tenderBidsHandler({
    method: "PATCH",
    headers: requestHeaders(sessionToken),
    query: {},
    body: jsonBody({ id: winnerBidId, status: "accepted" })
  }, repeatedWinnerResponse);
  const [tenderCounts] = await query(
    `SELECT
       (SELECT count(*)::int FROM orders WHERE tender_id = $1) AS orders,
       (SELECT count(*)::int FROM order_status_history WHERE order_id = $2 AND from_status IS NULL) AS history,
       (SELECT count(*)::int FROM order_documents WHERE order_id = $2) AS documents`,
    [tenderId, tenderOrderId]
  );
  if (
    repeatedWinnerResponse.statusCode !== 200
    || repeatedWinnerResponse.payload?.data?.conversionCreated !== false
    || tenderCounts.orders !== 1
    || tenderCounts.history !== 1
    || tenderCounts.documents !== 2
  ) {
    throw new Error("Tender sifariş çevrilməsi təkrar çağırışda idempotent qalmadı.");
  }
  console.log("Tender: qalib təklif bir sifarişə və iki dəyişməz sənədə çevrildi.");

  const [rental] = await query(
    `SELECT id, title
       FROM marketplace_entities
      WHERE entity_kind = 'rental' AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1`
  );
  if (!rental) throw new Error("İcarə smoke testi üçün aktiv avadanlıq tapılmadı.");
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() + 400);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 2);
  const bookingResponse = createResponse();
  await rentalBookingsHandler({
    method: "POST",
    headers: requestHeaders(sessionToken, "127.0.0.246"),
    query: {},
    body: jsonBody({
      rentalId: rental.id,
      companyName: "ConstEra icarə smoke testi",
      contactName: "Smoke test",
      email: "rental-smoke@constera.az",
      phone: "+994 00 000 00 04",
      city: "Bakı",
      address: "Avtomatik icarə test ünvanı",
      startDate: dateOnly(startDate),
      endDate: dateOnly(endDate),
      quantity: 1,
      operatorPreference: "Operator ilə",
      deliveryRequired: true,
      legalAccepted: true,
      sourcePath: "/rental-detail.html"
    })
  }, bookingResponse);
  bookingId = bookingResponse.payload?.data?.id || "";
  if (bookingResponse.statusCode !== 201 || !bookingId) {
    throw new Error(`İcarə rezervasiyası yaradılmadı: HTTP ${bookingResponse.statusCode}`);
  }

  const quotedResponse = createResponse();
  await rentalBookingsHandler({
    method: "PATCH",
    headers: requestHeaders(sessionToken),
    query: {},
    body: jsonBody({ id: bookingId, status: "quoted", quotedAmount: 450, depositAmount: 100 })
  }, quotedResponse);
  const confirmedResponse = createResponse();
  await rentalBookingsHandler({
    method: "PATCH",
    headers: requestHeaders(sessionToken),
    query: {},
    body: jsonBody({ id: bookingId, status: "confirmed", quotedAmount: 450, depositAmount: 100 })
  }, confirmedResponse);
  const [rentalLead] = await query(
    "SELECT stage, value_amount FROM crm_leads WHERE source_type = 'rental' AND source_id = $1",
    [bookingId]
  );
  if (
    quotedResponse.statusCode !== 200
    || confirmedResponse.statusCode !== 200
    || confirmedResponse.payload?.data?.status !== "confirmed"
    || rentalLead?.stage !== "proposal"
    || Number(rentalLead?.value_amount || 0) !== 450
  ) {
    throw new Error("İcarə təklifi, tarix təsdiqi və CRM sinxronizasiyası tamamlanmadı.");
  }
  console.log("İcarə: tarix rezervasiyası qiymətləndirildi, təsdiqləndi və CRM-ə yazıldı.");

  const readinessResponse = createResponse();
  await integrationsHandler({ method: "GET", headers: {}, query: {} }, readinessResponse);
  if (readinessResponse.statusCode !== 200 || typeof readinessResponse.payload?.data?.readiness !== "object") {
    throw new Error("Provider hazırlıq endpoint-i işləmədi.");
  }
  console.log("Provider adapterləri: açarsız xidmətlər hazır deyil kimi düzgün işarələndi.");
} finally {
  if (bookingId) {
    await query("DELETE FROM notifications WHERE payload->>'bookingId' = $1", [bookingId]);
    await query("DELETE FROM audit_logs WHERE entity_type = 'rental_booking' AND entity_id = $1", [bookingId]);
    await query("DELETE FROM crm_leads WHERE source_type = 'rental' AND source_id = $1", [bookingId]);
    await query("DELETE FROM rental_bookings WHERE id = $1", [bookingId]);
  }
  if (tenderOrderId) {
    await releaseOrderReservations(tenderOrderId, null, "Smoke-test təmizlənməsi");
    await query("DELETE FROM notifications WHERE payload->>'orderId' = $1", [tenderOrderId]);
    await query("DELETE FROM audit_logs WHERE entity_type = 'order' AND entity_id = $1", [tenderOrderId]);
    await query("DELETE FROM crm_leads WHERE source_type = 'order' AND source_id = $1", [tenderOrderId]);
    await query("DELETE FROM orders WHERE id = $1", [tenderOrderId]);
  }
  if (tenderId) {
    await query("DELETE FROM notifications WHERE payload->>'tenderId' = $1", [tenderId]);
    await query("DELETE FROM audit_logs WHERE entity_type = 'tender_bid' AND details->>'tenderId' = $1", [tenderId]);
    await query("DELETE FROM tenders WHERE id = $1", [tenderId]);
  }
  if (orderId) {
    await releaseOrderReservations(orderId, null, "Smoke-test təmizlənməsi");
    await query("DELETE FROM notifications WHERE payload->>'orderId' = $1", [orderId]);
    await query("DELETE FROM audit_logs WHERE entity_id = $1 OR details->>'orderId' = $1", [orderId]);
    await query("DELETE FROM crm_leads WHERE source_type = 'order' AND source_id = $1", [orderId]);
    await query("DELETE FROM orders WHERE id = $1", [orderId]);
  }
  await query("DELETE FROM sessions WHERE id = $1", [sessionId]);
}

console.log("ConstEra əməliyyat smoke testi uğurla tamamlandı.");
