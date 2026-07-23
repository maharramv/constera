import { createHash } from "node:crypto";

const allowedKinds = new Set(["product", "service", "package", "rental"]);
const allowedSourceHosts = Object.freeze({
  elem: new Set(["elem.az"]),
  tvim: new Set(["tvim.az"]),
  omid: new Set(["omid.az"]),
  insaat: new Set(["insaat.az"])
});

const value = (input, max = 2_000) => String(input ?? "").trim().slice(0, max);
const keyPart = (input) => value(input).toLocaleLowerCase("az-AZ").replace(/[^a-z0-9əöüğışç]+/g, "");
const digest = (input) => createHash("sha256").update(input).digest("hex");

const safeSourceUrl = (input, sourceId) => {
  try {
    const parsed = new URL(value(input));
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) return "";
    if (!allowedSourceHosts[sourceId]?.has(hostname)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const safeMediaUrls = (input, sourceId) => {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((entry) => {
    try {
      const parsed = new URL(value(entry));
      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
      return parsed.protocol === "https:"
        && !parsed.username
        && !parsed.password
        && (!parsed.port || parsed.port === "443")
        && allowedSourceHosts[sourceId]?.has(hostname)
        ? parsed.toString()
        : "";
    } catch {
      return "";
    }
  }).filter(Boolean))].slice(0, 8);
};

const numericPrice = (input) => {
  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10_000_000
    ? Math.round(parsed * 100) / 100
    : null;
};

const isoDate = (input) => {
  const timestamp = Date.parse(value(input));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

const dedupeKey = (item) => {
  const kind = value(item.kind, 20);
  const sku = keyPart(item.sku);
  const brand = keyPart(item.brand);
  if (sku) return `${kind}:sku:${brand}:${sku}`;
  return `${kind}:name:${brand}:${keyPart(item.name)}`;
};

const quality = (item) =>
  (item.price_status === "confirmed" ? 300 : 0)
  + (item.image_urls?.length ? 180 : 0)
  + (item.sku ? 90 : 0)
  + (item.brand ? 50 : 0)
  + (item.description ? 40 : 0);

const normalizeItem = (input, index) => {
  const errors = [];
  const kind = value(input?.kind, 20);
  const sourceId = value(input?.source_id, 40).toLowerCase();
  const name = value(input?.name, 260);
  const sourceUrl = safeSourceUrl(input?.source_url, sourceId);
  if (!allowedKinds.has(kind)) errors.push("dəstəklənməyən qeyd növü");
  if (!allowedSourceHosts[sourceId]) errors.push("naməlum mənbə");
  if (!name) errors.push("ad yoxdur");
  if (!sourceUrl) errors.push("mənbə URL-i etibarsızdır və ya domenlə uyğun deyil");

  const verifiedAt = isoDate(input?.verified_at);
  let price = numericPrice(input?.price);
  let priceStatus = input?.price_status === "confirmed" ? "confirmed" : "request";
  if (priceStatus === "confirmed" && (!price || !verifiedAt || value(input?.currency, 3).toUpperCase() !== "AZN")) {
    errors.push("təsdiqlənmiş qiymət üçün AZN məbləği və yoxlama vaxtı tələb olunur");
    price = null;
    priceStatus = "request";
  }
  if (priceStatus === "request") price = null;

  const normalized = {
    id: value(input?.id, 180) || `${sourceId}-${digest(`${sourceUrl}|${name}`).slice(0, 16)}`,
    kind,
    name,
    slug: value(input?.slug, 260),
    source_id: sourceId,
    source_label: value(input?.source_label, 160) || sourceId.toUpperCase(),
    source_url: sourceUrl,
    category: value(input?.category, 200),
    subcategory: value(input?.subcategory, 200),
    brand: value(input?.brand, 160),
    sku: value(input?.sku, 120),
    provider: value(input?.provider, 200),
    city: value(input?.city, 120),
    price,
    price_min: numericPrice(input?.price_min),
    price_max: numericPrice(input?.price_max),
    currency: "AZN",
    price_text: price === null ? "Qiymət sorğu əsasında" : `${price.toFixed(2)} AZN`,
    price_status: priceStatus,
    unit: value(input?.unit, 120),
    stock_status: value(input?.stock_status, 160),
    stock_quantity: numericPrice(input?.stock_quantity),
    description: value(input?.description, 8_000),
    image_urls: safeMediaUrls(input?.image_urls, sourceId),
    local_images: [],
    specifications: input?.specifications && typeof input.specifications === "object" && !Array.isArray(input.specifications)
      ? input.specifications
      : {},
    status: "pending",
    verified_at: verifiedAt,
    fetched_at: isoDate(input?.fetched_at),
    content_hash: value(input?.content_hash, 64)
  };
  const recordHash = digest(JSON.stringify(normalized));
  return {
    index,
    errors,
    item: normalized,
    sourceUrl,
    dedupeKey: dedupeKey(normalized),
    contentHash: recordHash,
    quality: quality(normalized)
  };
};

export const normalizeScraperCatalog = (payload) => {
  if (!payload || typeof payload !== "object") throw new TypeError("Scraper faylı JSON obyekti olmalıdır.");
  if (String(payload.schema_version || "") !== "4.0") throw new TypeError("Yalnız scraper schema_version 4.0 qəbul olunur.");
  if (!Array.isArray(payload.items)) throw new TypeError("Scraper faylında items massivi yoxdur.");
  if (payload.items.length > 5_000) throw new RangeError("Bir staging idxalında maksimum 5000 qeyd qəbul olunur.");

  const rejected = [];
  const candidates = [];
  payload.items.forEach((item, index) => {
    const normalized = normalizeItem(item, index + 1);
    const fatal = normalized.errors.some((error) =>
      error.includes("növü") || error.includes("mənbə") || error.includes("domen") || error === "ad yoxdur"
    );
    if (fatal) {
      rejected.push({ index: index + 1, id: value(item?.id, 180), errors: normalized.errors });
      return;
    }
    candidates.push(normalized);
  });

  const selected = new Map();
  const duplicates = [];
  for (const candidate of candidates) {
    const key = candidate.sourceUrl || candidate.dedupeKey;
    const current = selected.get(key);
    if (!current || candidate.quality > current.quality) {
      if (current) duplicates.push({ kept: candidate.item.id, discarded: current.item.id, reason: "source_url" });
      selected.set(key, candidate);
    } else {
      duplicates.push({ kept: current.item.id, discarded: candidate.item.id, reason: "source_url" });
    }
  }

  const byIdentity = new Map();
  for (const candidate of selected.values()) {
    const current = byIdentity.get(candidate.dedupeKey);
    if (!current || candidate.quality > current.quality) {
      if (current) duplicates.push({ kept: candidate.item.id, discarded: current.item.id, reason: "identity" });
      byIdentity.set(candidate.dedupeKey, candidate);
    } else {
      duplicates.push({ kept: current.item.id, discarded: candidate.item.id, reason: "identity" });
    }
  }

  const records = [...byIdentity.values()].map((candidate) => ({
    ...candidate,
    validationErrors: candidate.errors
  }));
  const counts = records.reduce((result, record) => {
    result[record.item.kind] = (result[record.item.kind] || 0) + 1;
    return result;
  }, {});
  return { records, rejected, duplicates, counts };
};

export const scraperRunId = (sourceHash) => `scraper-${value(sourceHash, 64).slice(0, 24)}`;
export const scraperItemId = (runId, record) =>
  `scraper-item-${digest(`${runId}|${record.item.source_id}|${record.sourceUrl}`).slice(0, 24)}`;
