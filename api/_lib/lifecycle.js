const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));

export const summarizeIfc = (source = "") => {
  const text = String(source || "").slice(0, 1_000_000);
  const entityCounts = {};
  const materials = new Set();
  const entityPattern = /#\d+\s*=\s*(IFC[A-Z0-9_]+)\s*\(/gi;
  const materialPattern = /IFCMATERIAL\s*\(\s*'([^']{1,160})'/gi;
  let match;
  while ((match = entityPattern.exec(text))) {
    const name = match[1].toUpperCase();
    entityCounts[name] = (entityCounts[name] || 0) + 1;
  }
  while ((match = materialPattern.exec(text))) materials.add(match[1].trim());
  const extractedItems = [...materials].slice(0, 200).map((name) => ({ name, quantity: null, unit: "mövqe" }));
  const sortedEntities = Object.fromEntries(
    Object.entries(entityCounts).sort((left, right) => right[1] - left[1]).slice(0, 80)
  );
  return {
    elementCount: Object.values(entityCounts).reduce((sum, value) => sum + value, 0),
    materialCount: materials.size,
    entitySummary: sortedEntities,
    extractedItems,
    issueNote: text && Object.keys(entityCounts).length === 0
      ? "Faylda IFC obyekt sətrləri tapılmadı; model əl ilə uyğunlaşdırılmalıdır."
      : ""
  };
};

export const passportCompleteness = (passport = {}) => {
  const environmentalData = passport.environmentalData || passport.environmental_data || {};
  const hasEnvironmentalData = Object.values(environmentalData).some((value) =>
    value !== null && value !== undefined && value !== "" && value !== false
  );
  const checks = {
    manufacturer: Boolean(String(passport.manufacturer || "").trim()),
    origin: Boolean(String(passport.originCountry || passport.origin_country || "").trim()),
    declaration: Boolean(String(passport.declarationUrl || passport.declaration_url || "").trim()),
    safety: Boolean(String(passport.safetyUrl || passport.safety_url || "").trim()),
    certificates: Array.isArray(passport.certificates || passport.certificate_data)
      && (passport.certificates || passport.certificate_data).length > 0,
    warranty: Number(passport.warrantyMonths ?? passport.warranty_months ?? 0) > 0,
    environmental: hasEnvironmentalData
  };
  const completed = Object.values(checks).filter(Boolean).length;
  return { score: Math.round((completed / Object.keys(checks).length) * 100), checks };
};

export const priceLockTerms = ({ unitPrice, quantity = 1, hours = 24, now = new Date() }) => {
  const price = Number(unitPrice);
  const count = Number(quantity);
  const duration = Number(hours);
  if (!Number.isFinite(price) || price < 0) throw new Error("Təsdiqlənmiş qiymət tələb olunur.");
  if (!Number.isFinite(count) || count <= 0 || count > 1_000_000) throw new Error("Miqdar düzgün deyil.");
  if (![24, 48, 72].includes(duration)) throw new Error("Qiymət 24, 48 və ya 72 saat kilidlənə bilər.");
  return {
    lockedUnitPrice: round(price),
    quantity: round(count, 3),
    totalAmount: round(price * count),
    expiresAt: new Date(new Date(now).getTime() + duration * 3_600_000).toISOString()
  };
};

const transitions = Object.freeze({
  change_order: {
    draft: ["submitted", "cancelled"], submitted: ["approved", "rejected", "cancelled"],
    approved: ["implemented", "cancelled"], rejected: [], implemented: [], cancelled: []
  },
  warranty: {
    open: ["in_progress", "waiting_supplier", "rejected"],
    in_progress: ["waiting_supplier", "resolved", "rejected"],
    waiting_supplier: ["in_progress", "resolved", "rejected"],
    resolved: ["closed", "in_progress"], closed: [], rejected: []
  },
  surplus: {
    draft: ["published", "withdrawn"], published: ["reserved", "sold", "withdrawn", "expired"],
    reserved: ["published", "sold", "withdrawn"], sold: [], withdrawn: [], expired: []
  },
  price_lock: { active: ["used", "cancelled", "expired"], used: [], cancelled: [], expired: [] }
});

export const canTransitionLifecycle = (entityType, current, next) =>
  Boolean(transitions[entityType]?.[current]?.includes(next));

export const changeOrderImpact = ({ currentBudget = 0, currentDays = 0, costDelta = 0, daysDelta = 0 }) => ({
  revisedBudget: round(Number(currentBudget || 0) + Number(costDelta || 0)),
  revisedDays: Math.round(Number(currentDays || 0) + Number(daysDelta || 0)),
  costDelta: round(costDelta),
  daysDelta: Math.round(Number(daysDelta || 0))
});
