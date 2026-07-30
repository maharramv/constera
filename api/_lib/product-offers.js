import { query } from "./db.js";

export const productOfferFields = `offer.id, offer.product_id, offer.supplier_id,
  offer.supplier_sku, offer.unit_price, offer.currency, offer.price_text,
  offer.price_status, offer.stock_quantity, offer.minimum_order, offer.lead_time_days,
  offer.delivery_modes, offer.source_url, offer.source_label, offer.price_verified_at,
  offer.is_featured, offer.status, offer.created_at, offer.updated_at,
  supplier.name AS supplier_name, supplier.region AS supplier_region,
  supplier.rating AS supplier_rating, supplier.response_time AS supplier_response_time,
  EXISTS (
    SELECT 1 FROM supplier_contracts contract
     WHERE contract.supplier_id = offer.supplier_id
       AND contract.status = 'active'
       AND contract.starts_on <= current_date
       AND (contract.ends_on IS NULL OR contract.ends_on >= current_date)
  ) AS has_active_contract,
  EXISTS (
    SELECT 1 FROM media_assets media
     WHERE media.entity_type = 'product'
       AND media.entity_id = offer.product_id
       AND media.status = 'active'
       AND media.content_type LIKE 'image/%'
       AND media.license_type IN ('own', 'supplier', 'official', 'licensed')
       AND media.url ~ '^https://'
  ) AS has_licensed_media`;

export const mapProductOffer = (row) => {
  const unitPrice = row.unit_price === null ? null : Number(row.unit_price);
  const stockQuantity = row.stock_quantity === null ? null : Number(row.stock_quantity);
  const priceVerifiedAt = row.price_verified_at;
  const priceFresh = Boolean(
    priceVerifiedAt
      && Number.isFinite(Date.parse(priceVerifiedAt))
      && Date.now() - Date.parse(priceVerifiedAt) <= 30 * 86_400_000
  );
  const commercialIssues = [];
  if (!row.has_active_contract) commercialIssues.push("Təchizatçı müqaviləsi aktiv deyil");
  if (!row.has_licensed_media) commercialIssues.push("Lisenziyalı məhsul fotosu yoxdur");
  if (row.price_status !== "confirmed" || unitPrice === null || unitPrice <= 0 || row.currency !== "AZN") {
    commercialIssues.push("Təsdiqli AZN qiyməti yoxdur");
  }
  if (!priceFresh) commercialIssues.push("Qiymət son 30 gündə təsdiqlənməyib");
  if (stockQuantity === null || stockQuantity <= 0) commercialIssues.push("Stok təsdiqlənməyib");
  if (!/^https:\/\//i.test(String(row.source_url || ""))) {
    commercialIssues.push("Qiymət mənbəyi təsdiqlənməyib");
  }

  return {
    id: row.id,
    productId: row.product_id,
    supplierId: row.supplier_id,
    supplier: row.supplier_name || "",
    supplierRegion: row.supplier_region || "",
    supplierRating: row.supplier_rating || "",
    supplierResponseTime: row.supplier_response_time || "",
    supplierSku: row.supplier_sku || "",
    unitPrice,
    currency: row.currency || "AZN",
    price: row.price_text || "Sorğu əsasında",
    priceStatus: row.price_status,
    stockQuantity,
    minimumOrder: row.minimum_order === null ? null : Number(row.minimum_order),
    leadTimeDays: row.lead_time_days === null ? null : Number(row.lead_time_days),
    deliveryModes: Array.isArray(row.delivery_modes) ? row.delivery_modes : [],
    sourceUrl: row.source_url || "",
    sourceLabel: row.source_label || "",
    priceVerifiedAt,
    hasActiveContract: Boolean(row.has_active_contract),
    hasLicensedMedia: Boolean(row.has_licensed_media),
    commercialReady: commercialIssues.length === 0,
    commercialIssues,
    featured: Boolean(row.is_featured),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export const productOfferOrder = `has_active_contract DESC,
  has_licensed_media DESC,
  CASE WHEN offer.price_verified_at >= now() - interval '30 days' THEN 0 ELSE 1 END,
  CASE offer.price_status
    WHEN 'confirmed' THEN 0
    WHEN 'request' THEN 1
    ELSE 2
  END,
  CASE WHEN offer.stock_quantity IS NULL THEN 1 WHEN offer.stock_quantity > 0 THEN 0 ELSE 2 END,
  offer.is_featured DESC,
  offer.unit_price ASC NULLS LAST,
  offer.updated_at DESC`;

export const listProductOffers = async (productId, { includeInactive = false } = {}) => {
  const rows = await query(
    `SELECT ${productOfferFields}
       FROM product_offers offer
       JOIN suppliers supplier ON supplier.id = offer.supplier_id
      WHERE offer.product_id = $1
        ${includeInactive ? "" : "AND offer.status = 'active' AND supplier.status <> 'Arxiv'"}
      ORDER BY ${productOfferOrder}`,
    [productId]
  );
  return rows.map(mapProductOffer);
};

export const loadOffersForProducts = async (productIds) => {
  if (!productIds.length) return new Map();
  const rows = await query(
    `SELECT ${productOfferFields}
       FROM product_offers offer
       JOIN suppliers supplier ON supplier.id = offer.supplier_id
      WHERE offer.product_id = ANY($1::text[])
        AND offer.status = 'active'
        AND supplier.status <> 'Arxiv'
      ORDER BY offer.product_id, ${productOfferOrder}`,
    [productIds]
  );
  return rows.reduce((groups, row) => {
    const offer = mapProductOffer(row);
    if (!groups.has(offer.productId)) groups.set(offer.productId, []);
    groups.get(offer.productId).push(offer);
    return groups;
  }, new Map());
};

export const chooseProductOffer = (offers, requestedId = "") => {
  if (!Array.isArray(offers) || !offers.length) return null;
  if (requestedId) return offers.find((offer) => offer.id === requestedId) || null;
  return offers[0] || null;
};

export const syncCanonicalProductOffer = async (productId) => {
  const rows = await query(
    `SELECT ${productOfferFields}
       FROM product_offers offer
       JOIN suppliers supplier ON supplier.id = offer.supplier_id
      WHERE offer.product_id = $1
        AND offer.status = 'active'
        AND supplier.status <> 'Arxiv'
      ORDER BY ${productOfferOrder}
      LIMIT 1`,
    [productId]
  );
  if (!rows[0]) {
    await query(
      `UPDATE products
          SET price_amount = NULL,
              price_text = 'Sorğu əsasında',
              price_status = 'request',
              stock_quantity = NULL,
              price_verified_at = NULL,
              updated_at = now()
        WHERE id = $1`,
      [productId]
    );
    return null;
  }
  const offer = mapProductOffer(rows[0]);
  await query(
    `UPDATE products
        SET price_amount = $2,
            price_currency = $3,
            price_text = $4,
            price_status = $5,
            stock_quantity = $6,
            minimum_order = $7,
            price_verified_at = $8,
            source_url = COALESCE(NULLIF($9, ''), source_url),
            source_label = COALESCE(NULLIF($10, ''), source_label),
            updated_at = now()
      WHERE id = $1`,
    [
      productId, offer.unitPrice, offer.currency, offer.price, offer.priceStatus,
      offer.stockQuantity, offer.minimumOrder,
      offer.priceVerifiedAt, offer.sourceUrl, offer.sourceLabel
    ]
  );
  return offer;
};
