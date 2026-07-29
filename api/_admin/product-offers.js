import { randomUUID } from "node:crypto";
import { requireRole } from "../_lib/auth.js";
import { query, recordAudit } from "../_lib/db.js";
import { ApiError, assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import {
  listProductOffers,
  mapProductOffer,
  productOfferFields,
  productOfferOrder,
  syncCanonicalProductOffer
} from "../_lib/product-offers.js";
import { oneOf, parseLimit, parsePriceAmount, safeUrl, text } from "../_lib/validation.js";

const managementRoles = ["super_admin", "admin", "supplier"];
const deliveryModes = ["delivery", "pickup", "supplier_delivery"];

const supplierForUser = async (user) => {
  if (user.role !== "supplier" || !user.companyId) return null;
  const rows = await query(
    "SELECT id, name FROM suppliers WHERE company_id = $1 AND status <> 'Arxiv' LIMIT 1",
    [user.companyId]
  );
  return rows[0] || null;
};

const normalizeOffer = (body) => {
  const unitPrice = parsePriceAmount(body.unitPrice);
  const sourceUrl = safeUrl(body.sourceUrl, "Mənbə URL-i");
  let priceStatus = oneOf(body.priceStatus, ["confirmed", "request", "expired"], "request", "Qiymət statusu");
  if (priceStatus === "confirmed" && (unitPrice === null || !sourceUrl)) priceStatus = "request";
  const rawLeadTime = body.leadTimeDays === "" || body.leadTimeDays === null || body.leadTimeDays === undefined
    ? null
    : Number.parseInt(String(body.leadTimeDays), 10);
  if (rawLeadTime !== null && (!Number.isFinite(rawLeadTime) || rawLeadTime < 0 || rawLeadTime > 3650)) {
    throw new ApiError(400, "validation_error", "Təslimat müddəti düzgün deyil.");
  }
  const modes = (Array.isArray(body.deliveryModes) ? body.deliveryModes : String(body.deliveryModes || "").split(","))
    .map((mode) => String(mode).trim())
    .filter((mode, index, values) => deliveryModes.includes(mode) && values.indexOf(mode) === index);
  return {
    productId: text(body.productId, { field: "Məhsul", required: true, max: 160 }),
    supplierId: text(body.supplierId, { field: "Təchizatçı", required: true, max: 160 }),
    supplierSku: text(body.supplierSku, { max: 120 }),
    unitPrice: priceStatus === "confirmed" ? unitPrice : null,
    currency: oneOf(body.currency, ["AZN", "USD", "EUR"], "AZN", "Valyuta"),
    priceText: priceStatus === "confirmed"
      ? (text(body.price, { max: 120 }) || `${unitPrice.toFixed(2)} AZN`)
      : "Sorğu əsasında",
    priceStatus,
    stockQuantity: parsePriceAmount(body.stockQuantity),
    minimumOrder: parsePriceAmount(body.minimumOrder),
    leadTimeDays: rawLeadTime,
    deliveryModes: modes.length ? modes : ["pickup", "supplier_delivery"],
    sourceUrl,
    sourceLabel: text(body.sourceLabel, { max: 160 }),
    priceVerifiedAt: priceStatus === "confirmed"
      ? (Number.isFinite(Date.parse(body.priceVerifiedAt)) ? new Date(body.priceVerifiedAt).toISOString() : new Date().toISOString())
      : null,
    featured: body.featured === true || ["true", "on", "1"].includes(String(body.featured).toLowerCase()),
    status: oneOf(body.status, ["active", "draft", "archived"], "active", "Təklif statusu")
  };
};

export default withApiErrors(async (req, res) => {
  if (req.method === "GET") {
    const productId = text(req.query.productId, { max: 160 });
    const manage = req.query.scope === "manage";
    if (productId && !manage) {
      return sendJson(res, 200, { ok: true, data: await listProductOffers(productId) });
    }
    const user = await requireRole(req, managementRoles);
    const ownSupplier = await supplierForUser(user);
    if (user.role === "supplier" && !ownSupplier) return sendJson(res, 200, { ok: true, data: [] });
    const values = [];
    const where = [];
    if (productId) {
      values.push(productId);
      where.push(`offer.product_id = $${values.length}`);
    }
    if (ownSupplier) {
      values.push(ownSupplier.id);
      where.push(`offer.supplier_id = $${values.length}`);
    }
    values.push(parseLimit(req.query.limit, 250, 1_000));
    const rows = await query(
      `SELECT ${productOfferFields}, product.name AS product_name, product.sku AS product_sku
         FROM product_offers offer
         JOIN suppliers supplier ON supplier.id = offer.supplier_id
         JOIN products product ON product.id = offer.product_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY offer.product_id, ${productOfferOrder}
        LIMIT $${values.length}`,
      values
    );
    return sendJson(res, 200, {
      ok: true,
      data: rows.map((row) => ({
        ...mapProductOffer(row),
        productName: row.product_name,
        productSku: row.product_sku
      }))
    });
  }

  assertMethod(req, ["POST", "PATCH", "DELETE"]);
  assertSameOrigin(req);
  const user = await requireRole(req, managementRoles);
  const ownSupplier = await supplierForUser(user);
  if (user.role === "supplier" && !ownSupplier) {
    throw new ApiError(409, "supplier_profile_required", "Hesaba bağlı təchizatçı profili tapılmadı.");
  }
  const body = await readJson(req, 40_000);

  if (req.method === "DELETE") {
    const id = text(body.id || req.query.id, { field: "Təklif ID-si", required: true, max: 160 });
    const rows = await query(
      `UPDATE product_offers
          SET status = 'archived', updated_at = now()
        WHERE id = $1 ${ownSupplier ? "AND supplier_id = $2" : ""}
        RETURNING id, product_id`,
      ownSupplier ? [id, ownSupplier.id] : [id]
    );
    if (!rows[0]) throw new ApiError(404, "product_offer_not_found", "Məhsul təklifi tapılmadı.");
    await syncCanonicalProductOffer(rows[0].product_id);
    await recordAudit({ actorId: user.id, action: "archive", entityType: "product_offer", entityId: id });
    return sendJson(res, 200, { ok: true, data: { id, status: "archived" } });
  }

  let source = body;
  let id = "";
  if (req.method === "PATCH") {
    id = text(body.id || req.query.id, { field: "Təklif ID-si", required: true, max: 160 });
    const existingRows = await query(
      `SELECT * FROM product_offers WHERE id = $1 ${ownSupplier ? "AND supplier_id = $2" : ""} LIMIT 1`,
      ownSupplier ? [id, ownSupplier.id] : [id]
    );
    if (!existingRows[0]) throw new ApiError(404, "product_offer_not_found", "Məhsul təklifi tapılmadı.");
    const existing = existingRows[0];
    source = {
      productId: existing.product_id,
      supplierId: existing.supplier_id,
      supplierSku: existing.supplier_sku,
      unitPrice: existing.unit_price,
      currency: existing.currency,
      price: existing.price_text,
      priceStatus: existing.price_status,
      stockQuantity: existing.stock_quantity,
      minimumOrder: existing.minimum_order,
      leadTimeDays: existing.lead_time_days,
      deliveryModes: existing.delivery_modes,
      sourceUrl: existing.source_url,
      sourceLabel: existing.source_label,
      priceVerifiedAt: existing.price_verified_at,
      featured: existing.is_featured,
      status: existing.status,
      ...body,
      productId: existing.product_id,
      supplierId: existing.supplier_id
    };
  }
  if (ownSupplier) source = { ...source, supplierId: ownSupplier.id };
  const offer = normalizeOffer(source);
  const [productRows, supplierRows] = await Promise.all([
    query("SELECT id FROM products WHERE id = $1 AND status <> 'archived' LIMIT 1", [offer.productId]),
    query("SELECT id FROM suppliers WHERE id = $1 AND status <> 'Arxiv' LIMIT 1", [offer.supplierId])
  ]);
  if (!productRows[0]) throw new ApiError(404, "product_not_found", "Məhsul tapılmadı.");
  if (!supplierRows[0]) throw new ApiError(404, "supplier_not_found", "Təchizatçı tapılmadı.");
  if (!id) id = `pof-${randomUUID()}`;

  try {
    const rows = await query(
      `INSERT INTO product_offers (
         id, product_id, supplier_id, supplier_sku, unit_price, currency,
         price_text, price_status, stock_quantity, minimum_order, lead_time_days,
         delivery_modes, source_url, source_label, price_verified_at, is_featured,
         status, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12::jsonb, $13, $14, $15, $16, $17, now()
       )
       ON CONFLICT (id) DO UPDATE SET
         supplier_sku = EXCLUDED.supplier_sku,
         unit_price = EXCLUDED.unit_price,
         currency = EXCLUDED.currency,
         price_text = EXCLUDED.price_text,
         price_status = EXCLUDED.price_status,
         stock_quantity = EXCLUDED.stock_quantity,
         minimum_order = EXCLUDED.minimum_order,
         lead_time_days = EXCLUDED.lead_time_days,
         delivery_modes = EXCLUDED.delivery_modes,
         source_url = EXCLUDED.source_url,
         source_label = EXCLUDED.source_label,
         price_verified_at = EXCLUDED.price_verified_at,
         is_featured = EXCLUDED.is_featured,
         status = EXCLUDED.status,
         updated_at = now()
       RETURNING *`,
      [
        id, offer.productId, offer.supplierId, offer.supplierSku || null,
        offer.unitPrice, offer.currency, offer.priceText, offer.priceStatus,
        offer.stockQuantity, offer.minimumOrder, offer.leadTimeDays,
        JSON.stringify(offer.deliveryModes), offer.sourceUrl || null,
        offer.sourceLabel || null, offer.priceVerifiedAt, offer.featured, offer.status
      ]
    );
    await syncCanonicalProductOffer(offer.productId);
    const resultRows = await query(
      `SELECT ${productOfferFields}
         FROM product_offers offer
         JOIN suppliers supplier ON supplier.id = offer.supplier_id
        WHERE offer.id = $1`,
      [id]
    );
    await recordAudit({
      actorId: user.id,
      action: req.method === "POST" ? "create" : "update",
      entityType: "product_offer",
      entityId: id,
      details: { productId: offer.productId, supplierId: offer.supplierId }
    });
    return sendJson(res, req.method === "POST" ? 201 : 200, {
      ok: true,
      data: resultRows[0] ? mapProductOffer(resultRows[0]) : rows[0]
    });
  } catch (error) {
    if (error?.code === "23505") {
      throw new ApiError(409, "duplicate_product_offer", "Bu təchizatçının məhsul üçün aktiv təklifi artıq mövcuddur.");
    }
    throw error;
  }
});
