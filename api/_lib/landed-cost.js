import { calculateDeliveryQuoteFromZones } from "./logistics.js";

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

const supportsDeliveryMode = (offer, mode) => {
  const modes = Array.isArray(offer.deliveryModes) ? offer.deliveryModes : [];
  if (!modes.length) return true;
  if (mode === "delivery") return modes.includes("delivery") || modes.includes("supplier_delivery");
  if (mode === "supplier_delivery") return modes.includes("supplier_delivery") || modes.includes("delivery");
  return modes.includes(mode);
};

export const calculateOfferLandedCosts = ({
  offers,
  zones,
  city,
  mode = "delivery",
  quantity = 1
}) => {
  const safeQuantity = Math.max(0.001, Number(quantity || 1));
  const results = (Array.isArray(offers) ? offers : []).map((offer) => {
    const reasons = [];
    if (offer.commercialReady === false) {
      const issues = Array.isArray(offer.commercialIssues) ? offer.commercialIssues : [];
      reasons.push(...(issues.length ? issues : ["Kommersiya yoxlaması tamamlanmayıb"]));
    }
    const confirmedPrice = offer.priceStatus === "confirmed"
      && offer.unitPrice !== null
      && offer.currency === "AZN";
    if (!confirmedPrice) reasons.push("Təsdiqli AZN qiyməti yoxdur");
    if (offer.minimumOrder !== null && safeQuantity < offer.minimumOrder) {
      reasons.push(`Minimum sifariş ${offer.minimumOrder} vahiddir`);
    }
    if (offer.stockQuantity !== null && safeQuantity > offer.stockQuantity) {
      reasons.push(`Stokda yalnız ${offer.stockQuantity} vahid var`);
    }
    if (!supportsDeliveryMode(offer, mode)) reasons.push("Seçilmiş çatdırılma üsulu dəstəklənmir");
    const eligible = reasons.length === 0;
    const subtotal = confirmedPrice ? money(offer.unitPrice * safeQuantity) : null;
    const quote = calculateDeliveryQuoteFromZones({
      zones,
      city,
      mode,
      subtotal,
      itemQuantity: safeQuantity,
      supplierCount: 1
    });
    const landedTotal = subtotal === null ? null : money(subtotal + quote.amount);
    const effectiveUnitCost = landedTotal === null ? null : money(landedTotal / safeQuantity);
    const offerLeadTime = Number.isFinite(Number(offer.leadTimeDays))
      ? Number(offer.leadTimeDays)
      : 0;
    return {
      ...offer,
      quantity: safeQuantity,
      eligible,
      reasons,
      stockConfirmed: offer.stockQuantity !== null,
      subtotal,
      deliveryAmount: quote.amount,
      landedTotal,
      effectiveUnitCost,
      deliveryZone: quote.zone?.name || "",
      deliveryEtaMinDays: quote.etaMinDays,
      deliveryEtaMaxDays: quote.etaMaxDays,
      totalEtaMinDays: offerLeadTime + quote.etaMinDays,
      totalEtaMaxDays: offerLeadTime + quote.etaMaxDays,
      deliveryBreakdown: quote.breakdown
    };
  });
  results.sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
    if (left.stockConfirmed !== right.stockConfirmed) return left.stockConfirmed ? -1 : 1;
    if (left.landedTotal !== right.landedTotal) {
      if (left.landedTotal === null) return 1;
      if (right.landedTotal === null) return -1;
      return left.landedTotal - right.landedTotal;
    }
    if (left.totalEtaMaxDays !== right.totalEtaMaxDays) return left.totalEtaMaxDays - right.totalEtaMaxDays;
    return String(left.supplier || "").localeCompare(String(right.supplier || ""), "az");
  });
  const best = results.find((offer) => offer.eligible && offer.landedTotal !== null) || null;
  return results.map((offer) => ({ ...offer, recommended: offer.id === best?.id }));
};
