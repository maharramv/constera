const number = (value) => Math.max(0, Number(value || 0));
const isHttps = (value) => /^https:\/\//i.test(String(value || ""));
const hasImage = (value) => /^(?:\/|assets\/|https:\/\/)/i.test(String(value || ""));
const freshPrice = (value, now) => {
  const timestamp = new Date(value || "").getTime();
  return Number.isFinite(timestamp) && now - timestamp <= 30 * 86_400_000;
};

const gateDefinitions = Object.freeze([
  { key: "attributes", label: "Texniki atributlar", shortLabel: "Tex", target: "trust", action: "Atributları tamamla" },
  { key: "source", label: "Açıq məhsul mənbəsi", shortLabel: "Mənbə", target: "products", action: "Mənbəni əlavə et" },
  { key: "image", label: "Real məhsul fotosu", shortLabel: "Foto", target: "media", action: "Foto əlavə et" },
  { key: "media", label: "Media istifadə hüququ", shortLabel: "Hüquq", target: "media", action: "Media hüququnu təsdiqlə" },
  { key: "offer", label: "Təchizatçı təklifi", shortLabel: "Təklif", target: "b2b", action: "Təklif əlavə et" },
  { key: "price", label: "Təsdiqli qiymət", shortLabel: "Qiymət", target: "b2b", action: "Qiyməti təsdiqlə" },
  { key: "freshness", label: "30 günlük qiymət yoxlaması", shortLabel: "Aktual", target: "b2b", action: "Qiyməti yenilə" },
  { key: "stock", label: "Müsbət stok", shortLabel: "Stok", target: "b2b", action: "Stoku daxil et" },
  { key: "supplier", label: "Təchizatçı profili və VÖEN", shortLabel: "Profil", target: "suppliers", action: "Təchizatçını tamamla" },
  { key: "contract", label: "Aktiv hüquqi müqavilə", shortLabel: "Müqavilə", target: "operations", action: "Müqaviləni aktivləşdir" },
  { key: "logistics", label: "Təsdiqli logistika tarifi", shortLabel: "Logistika", target: "b2b", action: "Tarifi təsdiqlə" }
]);
const nextActionOrder = [
  "image", "media", "supplier", "contract", "offer", "price",
  "freshness", "stock", "source", "attributes", "logistics"
];

const buildChecks = (item, { now, verifiedLogisticsZones }) => {
  const values = {
    attributes: number(item.technicalAttributeCount) >= 2,
    source: isHttps(item.sourceUrl) || isHttps(item.offerSourceUrl),
    image: hasImage(item.licensedImageUrl || item.imageUrl),
    media: Boolean(item.hasLicensedMedia && isHttps(item.licensedImageUrl)),
    offer: Boolean(item.offerId && item.supplierId),
    price: item.priceStatus === "confirmed" && number(item.unitPrice) > 0,
    freshness: item.priceStatus === "confirmed" && freshPrice(item.priceVerifiedAt, now),
    stock: number(item.stockQuantity) > 0,
    supplier: Boolean(item.supplierProfileReady),
    contract: Boolean(item.hasActiveContract),
    logistics: number(verifiedLogisticsZones) > 0
  };
  return gateDefinitions.map((definition) => ({ ...definition, ready: Boolean(values[definition.key]) }));
};

const diversify = (items, limit) => {
  const selected = [];
  const deferred = [];
  const categoryCounts = new Map();
  for (const item of items) {
    const category = item.category || "Digər";
    if (number(categoryCounts.get(category)) < 4 && selected.length < limit) {
      selected.push(item);
      categoryCounts.set(category, number(categoryCounts.get(category)) + 1);
    } else {
      deferred.push(item);
    }
  }
  for (const item of deferred) {
    if (selected.length >= limit) break;
    selected.push(item);
  }
  return selected;
};

export const commercialPilotTarget = 20;

export const buildCommercialPilotCenter = (
  sourceItems = [],
  { target = commercialPilotTarget, verifiedLogisticsZones = 0, now = Date.now() } = {}
) => {
  const safeTarget = Math.max(1, Math.min(Number(target) || commercialPilotTarget, 50));
  const ranked = (Array.isArray(sourceItems) ? sourceItems : []).map((source) => {
    const checks = buildChecks(source, { now, verifiedLogisticsZones });
    const completed = checks.filter((item) => item.ready).length;
    const missing = checks.filter((item) => !item.ready);
    const score = Math.round(completed / checks.length * 100);
    const nextAction = nextActionOrder
      .map((key) => missing.find((item) => item.key === key))
      .find(Boolean) || null;
    return {
      ...source,
      unitPrice: source.unitPrice === null || source.unitPrice === undefined ? null : Number(source.unitPrice),
      stockQuantity: source.stockQuantity === null || source.stockQuantity === undefined ? null : Number(source.stockQuantity),
      technicalAttributeCount: number(source.technicalAttributeCount),
      checks,
      completedGates: completed,
      totalGates: checks.length,
      blockerCount: missing.length,
      score,
      status: score === 100 ? "ready" : score >= 60 ? "near_ready" : "blocked",
      nextAction
    };
  }).sort((left, right) => right.score - left.score
    || Number(right.hasLicensedMedia) - Number(left.hasLicensedMedia)
    || number(right.stockQuantity) - number(left.stockQuantity)
    || String(left.name || "").localeCompare(String(right.name || ""), "az"));

  const items = diversify(ranked, safeTarget).map((item, index) => ({ ...item, priority: index + 1 }));
  const gateSummary = gateDefinitions.map((gate) => ({
    key: gate.key,
    label: gate.label,
    shortLabel: gate.shortLabel,
    ready: items.filter((item) => item.checks.find((check) => check.key === gate.key)?.ready).length,
    missing: items.filter((item) => !item.checks.find((check) => check.key === gate.key)?.ready).length,
    target: gate.target,
    action: gate.action
  }));

  return {
    target: safeTarget,
    candidateCount: ranked.length,
    selectedCount: items.length,
    readyCount: items.filter((item) => item.status === "ready").length,
    nearReadyCount: items.filter((item) => item.status === "near_ready").length,
    blockedCount: items.filter((item) => item.status === "blocked").length,
    averageScore: items.length
      ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
      : 0,
    gateSummary,
    items
  };
};

export const commercialPilotGates = gateDefinitions;
