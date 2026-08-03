const defaultOrigin = "https://constera.az";

const safeOrigin = () => {
  try {
    const url = new URL(process.env.APP_ORIGIN || defaultOrigin);
    return url.protocol === "https:" ? url.origin : defaultOrigin;
  } catch {
    return defaultOrigin;
  }
};

export const normalizeGoogleMeasurementId = (value = process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID) => {
  const id = String(value || "").trim().toUpperCase();
  return /^G-[A-Z0-9]{5,20}$/.test(id) ? id : "";
};

export const normalizeGoogleVerificationToken = (value = process.env.GOOGLE_SEARCH_CONSOLE_VERIFICATION) => {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{20,200}$/.test(token) ? token : "";
};

const analyticsSecretReady = () => String(process.env.GOOGLE_ANALYTICS_API_SECRET || "").trim().length >= 12;

export const googleMarketingReadiness = () => {
  const origin = safeOrigin();
  const measurementId = normalizeGoogleMeasurementId();
  return {
    analytics: Boolean(measurementId && analyticsSecretReady()),
    analyticsMeasurementId: measurementId || "",
    searchConsole: Boolean(normalizeGoogleVerificationToken()),
    merchantFeed: true,
    merchantFeedUrl: `${origin}/api/merchant-feed`,
    sitemapUrl: `${origin}/sitemap.xml`
  };
};

const analyticsClientId = (visitorHash) => {
  const hash = String(visitorHash || "").replace(/[^a-fA-F0-9]/g, "").padEnd(24, "0");
  const first = Number.parseInt(hash.slice(0, 12), 16) || 1;
  const second = Number.parseInt(hash.slice(12, 24), 16) || 1;
  return `${first}.${second}`;
};

const analyticsParameters = ({ path, entityType, entityId, payload }) => {
  const source = payload && typeof payload === "object" ? payload : {};
  const sourcePath = String(path || "/").replace(/^https?:\/\/[^/]+/i, "");
  const localPath = sourcePath.startsWith("/") && !sourcePath.startsWith("//") ? sourcePath : "/";
  const parameters = {
    page_location: new URL(localPath, `${safeOrigin()}/`).toString(),
    engagement_time_msec: 1
  };
  if (entityType) parameters.content_type = String(entityType).slice(0, 80);
  if (entityId) parameters.item_id = String(entityId).slice(0, 160);
  for (const [sourceKey, targetKey] of [
    ["resultCount", "result_count"],
    ["itemCount", "item_count"],
    ["value", "value"],
    ["currency", "currency"],
    ["category", "item_category"]
  ]) {
    const value = source[sourceKey];
    if (typeof value === "number" && Number.isFinite(value)) parameters[targetKey] = value;
    if (typeof value === "string" && value.trim()) parameters[targetKey] = value.trim().slice(0, 100);
  }
  return parameters;
};

export const forwardGoogleAnalyticsEvent = async ({
  consent,
  visitorHash,
  eventType,
  path,
  entityType,
  entityId,
  payload
} = {}) => {
  const measurementId = normalizeGoogleMeasurementId();
  const apiSecret = String(process.env.GOOGLE_ANALYTICS_API_SECRET || "").trim();
  if (consent !== "analytics") return { configured: Boolean(measurementId && apiSecret), forwarded: false, reason: "consent_required" };
  if (!measurementId || apiSecret.length < 12) return { configured: false, forwarded: false, reason: "not_configured" };

  const endpoint = new URL("https://www.google-analytics.com/mp/collect");
  endpoint.searchParams.set("measurement_id", measurementId);
  endpoint.searchParams.set("api_secret", apiSecret);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: analyticsClientId(visitorHash),
      non_personalized_ads: true,
      events: [{
        name: String(eventType || "page_view").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40),
        params: analyticsParameters({ path, entityType, entityId, payload })
      }]
    }),
    signal: AbortSignal.timeout(4_000)
  });
  if (!response.ok) throw new Error(`Google Analytics HTTP ${response.status} qaytardı.`);
  return { configured: true, forwarded: true, reason: "accepted" };
};
