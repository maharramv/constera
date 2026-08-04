import { query } from "./db.js";
import { ApiError } from "./http.js";
import { loadSupplierPerformance } from "./supplier-performance.js";

const comparisonRoles = new Set(["super_admin", "admin", "sales", "customer"]);
const selectableStatuses = new Set(["submitted", "accepted"]);

const cleanText = (value, maximum = 1_000) => String(value ?? "").trim().slice(0, maximum);
const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const unique = (items, limit = 20) => [...new Set(items.filter(Boolean))].slice(0, limit);
const numericAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
};

const folded = (value) => cleanText(value, 200)
  .toLocaleLowerCase("az-AZ")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/ə/g, "e")
  .replace(/ı/g, "i")
  .replace(/ş/g, "s")
  .replace(/ç/g, "c")
  .replace(/ğ/g, "g")
  .replace(/ö/g, "o")
  .replace(/ü/g, "u");

export const parseLeadTimeDays = (value) => {
  const source = folded(value).replace(/,/g, ".");
  if (!source) return null;
  const match = source.match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|\/|ile|ila)?\s*(\d+(?:\.\d+)?)?\s*(saat|gun|hefte|ay)/i);
  if (!match) return null;
  const conservativeValue = Math.max(Number(match[1]), Number(match[2] || match[1]));
  const unit = match[3].toLowerCase();
  if (unit === "saat") return Math.max(1, Math.ceil(conservativeValue / 24));
  if (unit === "hefte") return Math.max(1, Math.ceil(conservativeValue * 7));
  if (unit === "ay") return Math.max(1, Math.ceil(conservativeValue * 30));
  return Math.max(1, Math.ceil(conservativeValue));
};

const supplierRatingScore = (rating) => {
  const parsed = Number.parseFloat(String(rating || "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 70;
  return Math.round(clamp(parsed <= 5 ? parsed / 5 : parsed / 100) * 100);
};

const normalizeOffer = (offer, performance) => {
  const priceAmount = numericAmount(offer.price_amount ?? offer.priceAmount);
  const currency = cleanText(offer.currency || "AZN", 12).toUpperCase();
  const leadTime = cleanText(offer.lead_time ?? offer.leadTime, 160);
  const delivery = cleanText(offer.delivery, 300);
  const warranty = cleanText(offer.warranty, 200);
  const note = cleanText(offer.note, 2_000);
  const status = cleanText(offer.status || "submitted", 40);
  const supplierScore = Math.round(clamp(
    Number.isFinite(Number(performance?.score))
      ? Number(performance.score) / 100
      : supplierRatingScore(offer.supplier_rating) / 100
  ) * 100);
  const completeness = [leadTime, delivery, warranty, note].filter(Boolean).length / 4;
  const selectable = selectableStatuses.has(status)
    && Boolean(offer.supplier_id ?? offer.supplierId)
    && priceAmount !== null;
  return {
    id: cleanText(offer.id, 160),
    supplierId: cleanText(offer.supplier_id ?? offer.supplierId, 160),
    supplier: cleanText(offer.supplier_name ?? offer.supplier, 240) || "Təchizatçı",
    supplierStatus: cleanText(offer.supplier_status, 80),
    supplierScore,
    supplierGrade: cleanText(performance?.grade, 12),
    supplierResponseTime: cleanText(offer.supplier_response_time, 160),
    priceAmount,
    price: cleanText(offer.price_text ?? offer.price, 160)
      || (priceAmount === null ? "Sorğu əsasında" : `${priceAmount.toFixed(2)} ${currency}`),
    currency,
    leadTime,
    leadTimeDays: parseLeadTimeDays(leadTime),
    delivery,
    warranty,
    note,
    status,
    completeness: Math.round(completeness * 100),
    selectable,
    eligible: selectable && currency === "AZN"
  };
};

export const rankRfqOffers = ({ offers = [], performanceBySupplier = new Map() } = {}) => {
  const normalized = offers
    .slice(0, 30)
    .map((offer) => normalizeOffer(offer, performanceBySupplier.get(offer.supplier_id ?? offer.supplierId)))
    .filter((offer) => offer.id && offer.status !== "withdrawn");
  const eligible = normalized.filter((offer) => offer.eligible);
  const minimumPrice = eligible.length ? Math.min(...eligible.map((offer) => offer.priceAmount)) : null;
  const leadTimes = eligible.map((offer) => offer.leadTimeDays).filter(Number.isFinite);
  const minimumLeadTime = leadTimes.length ? Math.min(...leadTimes) : null;
  const accepted = normalized.find((offer) => offer.status === "accepted") || null;

  const ranked = normalized.map((offer) => {
    const priceScore = offer.eligible && minimumPrice
      ? clamp(minimumPrice / offer.priceAmount)
      : 0;
    const leadTimeScore = offer.leadTimeDays && minimumLeadTime
      ? clamp(minimumLeadTime / offer.leadTimeDays)
      : 0.35;
    const score = offer.eligible
      ? Math.round((priceScore * 0.5
        + leadTimeScore * 0.2
        + (offer.completeness / 100) * 0.15
        + (offer.supplierScore / 100) * 0.15) * 100)
      : 0;
    const strengths = unique([
      offer.eligible && offer.priceAmount === minimumPrice ? "Ən aşağı müqayisə olunan AZN qiyməti" : "",
      offer.leadTimeDays && offer.leadTimeDays === minimumLeadTime ? "Ən qısa göstərilən icra müddəti" : "",
      offer.completeness === 100 ? "Əsas kommersiya şərtləri tam göstərilib" : "",
      offer.supplierScore >= 80 ? "Təchizatçı performans göstəricisi yüksəkdir" : "",
      offer.status === "accepted" ? "Artıq qalib kimi təsdiqlənib" : ""
    ], 8);
    const risks = unique([
      offer.priceAmount === null ? "Rəqəmlə təsdiqlənmiş yekun qiymət yoxdur" : "",
      offer.currency !== "AZN" ? "Qiymət AZN deyil; məzənnə və tarix dəqiqləşdirilməlidir" : "",
      !offer.leadTime ? "İcra müddəti göstərilməyib" : "",
      !offer.delivery ? "Çatdırılma şərti göstərilməyib" : "",
      !offer.warranty ? "Zəmanət şərti göstərilməyib" : "",
      offer.supplierScore < 60 ? "Təchizatçı performans göstəricisi aşağıdır" : "",
      offer.status === "rejected" ? "Təklif artıq rədd edilib" : ""
    ], 10);
    return { ...offer, deterministicScore: score, strengths, risks };
  }).sort((left, right) => {
    if (left.status === "accepted" && right.status !== "accepted") return -1;
    if (right.status === "accepted" && left.status !== "accepted") return 1;
    return right.deterministicScore - left.deterministicScore
      || (left.priceAmount ?? Number.POSITIVE_INFINITY) - (right.priceAmount ?? Number.POSITIVE_INFINITY);
  }).map((offer, index) => ({ ...offer, deterministicRank: index + 1 }));

  const recommended = accepted || ranked.find((offer) => offer.eligible) || null;
  const warnings = unique([
    normalized.some((offer) => offer.currency !== "AZN") ? "Fərqli valyutadakı təkliflər birbaşa müqayisə edilmir." : "",
    normalized.some((offer) => !offer.leadTime) ? "Bəzi təkliflərdə icra müddəti göstərilməyib." : "",
    normalized.some((offer) => !offer.delivery) ? "Bəzi təkliflərdə çatdırılma şərti göstərilməyib." : "",
    normalized.some((offer) => !offer.warranty) ? "Bəzi təkliflərdə zəmanət şərti göstərilməyib." : "",
    !recommended ? "Qalib seçimi üçün AZN ilə rəqəmsal qiyməti olan aktiv təklif yoxdur." : "",
    accepted ? "RFQ artıq qalib təklifə bağlanıb; müqayisə yalnız məlumat xarakterlidir." : ""
  ], 12);
  return {
    offers: ranked,
    eligibleCount: eligible.length,
    acceptedOfferId: accepted?.id || "",
    recommendedOfferId: recommended?.id || "",
    warnings
  };
};

export const loadRfqOfferComparison = async ({ user, rfqId }) => {
  if (!comparisonRoles.has(user?.role)) {
    throw new ApiError(403, "ai_permission_denied", "Təchizatçı təkliflərinin AI müqayisəsi üçün icazən yoxdur.");
  }
  const id = cleanText(rfqId, 160);
  if (!id) throw new ApiError(400, "rfq_required", "Müqayisə üçün qiymət sorğusu seçilməlidir.");
  const values = [id];
  let scope = "";
  if (user.role === "customer") {
    values.push(user.id);
    scope = `AND r.customer_id = $${values.length}`;
  }
  const rfqRows = await query(
    `SELECT r.id, r.customer_id, r.rfq_type, r.title, r.company_name, r.city, r.address,
            r.priority, r.need_date, r.budget, r.delivery_mode, r.usage_text, r.note, r.status
       FROM rfqs r
      WHERE r.id = $1 ${scope}
      LIMIT 1`,
    values
  );
  const rfq = rfqRows[0];
  if (!rfq) throw new ApiError(404, "rfq_not_found", "Qiymət sorğusu tapılmadı.");

  const [items, offerRows] = await Promise.all([
    query(
      `SELECT id, item_kind, item_id, title, quantity_text, unit, specs
         FROM rfq_items WHERE rfq_id = $1 ORDER BY created_at, id LIMIT 20`,
      [id]
    ),
    query(
      `SELECT offer.id, offer.supplier_id, offer.price_amount, offer.price_text, offer.currency,
              offer.lead_time, offer.delivery, offer.warranty, offer.note, offer.status,
              supplier.name AS supplier_name, supplier.status AS supplier_status,
              supplier.rating AS supplier_rating, supplier.response_time AS supplier_response_time
         FROM offers offer
         LEFT JOIN suppliers supplier ON supplier.id = offer.supplier_id
        WHERE offer.rfq_id = $1 AND offer.status <> 'withdrawn'
        ORDER BY (offer.status = 'accepted') DESC, offer.created_at DESC
        LIMIT 30`,
      [id]
    )
  ]);
  if (offerRows.length < 2) {
    throw new ApiError(409, "offer_comparison_insufficient", "AI müqayisəsi üçün ən azı iki təchizatçı təklifi lazımdır.");
  }

  const supplierIds = unique(offerRows.map((offer) => cleanText(offer.supplier_id, 160)), 30);
  const performance = supplierIds.length ? await loadSupplierPerformance({ supplierIds }) : [];
  const ranked = rankRfqOffers({
    offers: offerRows,
    performanceBySupplier: new Map(performance.map((scorecard) => [scorecard.supplierId, scorecard]))
  });
  return {
    rfq: {
      id: rfq.id,
      type: rfq.rfq_type,
      title: rfq.title,
      company: rfq.company_name,
      city: rfq.city || "",
      address: rfq.address || "",
      priority: rfq.priority || "Normal",
      needDate: rfq.need_date || "",
      budget: rfq.budget || "",
      deliveryMode: rfq.delivery_mode || "",
      usage: rfq.usage_text || "",
      note: rfq.note || "",
      status: rfq.status,
      acceptedOfferId: ranked.acceptedOfferId
    },
    items: items.map((item) => ({
      id: item.id,
      kind: item.item_kind,
      itemId: item.item_id || "",
      title: item.title,
      quantity: item.quantity_text,
      unit: item.unit || "",
      specs: Array.isArray(item.specs) ? item.specs : []
    })),
    offers: ranked.offers,
    eligibleCount: ranked.eligibleCount,
    deterministicRecommendedOfferId: ranked.recommendedOfferId,
    warnings: ranked.warnings
  };
};
