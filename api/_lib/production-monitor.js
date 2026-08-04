const defaultOrigin = "https://constera.az";
const minimumAlertSecretLength = 24;

export const productionChecks = Object.freeze([
  {
    path: "www.constera.az",
    url: "https://www.constera.az/",
    status: 308,
    location: "https://constera.az/"
  },
  { path: "/api/health", status: 200, json: (body) => body.ok === true && body.database === "ready" },
  { path: "/api/catalog?scope=products&pageSize=1", status: 200, json: (body) => Array.isArray(body.data?.products) },
  { path: "/api/integrations", status: 200, json: (body) => typeof body.data?.readiness === "object" },
  { path: "/api/ai", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/orders", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/support", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/supplier-performance", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/catalog-quality", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/launch-center", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/merchant-feed", status: 200, includes: "<rss" },
  { path: "/.well-known/security.txt", status: 200, includes: "Canonical: https://constera.az/.well-known/security.txt" },
  {
    path: "/",
    status: 200,
    includes: 'lang="az"',
    headers: {
      "content-security-policy": (value) => value.includes("default-src 'self'") && value.includes("object-src 'none'"),
      "strict-transport-security": (value) => value.includes("max-age=31536000"),
      "x-content-type-options": (value) => value.toLowerCase() === "nosniff",
      "referrer-policy": (value) => value === "strict-origin-when-cross-origin"
    }
  },
  { path: "/robots.txt", status: 200, includes: "Sitemap: https://constera.az/sitemap.xml" },
  { path: "/sitemap.xml", status: 200, includes: "<urlset" },
  { path: "/service-worker.js", status: 200, includes: "constera-shell-" },
  { path: "/assets/icons/site.webmanifest", status: 200, includes: '"lang":"az"' },
  { path: "/catalog.html", status: 200, includes: "ConstEra" },
  { path: "/services.html", status: 200, includes: "ConstEra" },
  { path: "/packages.html", status: 200, includes: "ConstEra" },
  { path: "/rental.html", status: 200, includes: "ConstEra" },
  { path: "/ai-smeta.html", status: 200, includes: "AI Mərhələ 5" },
  { path: "/login.html", status: 200, includes: "ConstEra" }
]);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const alertConfiguration = () => {
  const endpoint = String(process.env.MONITOR_ALERT_WEBHOOK_URL || "").trim();
  const secret = String(process.env.MONITOR_ALERT_WEBHOOK_SECRET || "").trim();
  let endpointValid = false;
  try {
    const url = new URL(endpoint);
    endpointValid = url.protocol === "https:" && !url.username && !url.password;
  } catch {
    endpointValid = false;
  }
  return {
    endpoint,
    secret,
    endpointValid,
    ready: endpointValid && secret.length >= minimumAlertSecretLength
  };
};

export const productionMonitorAlertReadiness = () => alertConfiguration().ready;

export const sendProductionMonitorAlert = async ({
  origin = process.env.APP_ORIGIN || defaultOrigin,
  error
} = {}) => {
  const configuration = alertConfiguration();
  if (!configuration.ready) return { sent: false, reason: "not_configured" };
  const payload = {
    event: "production_monitor_failed",
    source: "ConstEra",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    origin: String(origin || defaultOrigin).replace(/\/+$/, ""),
    message: String(error?.message || error || "Naməlum monitor xətası").slice(0, 1_000),
    occurredAt: new Date().toISOString()
  };
  const response = await fetch(configuration.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.secret}`,
      "Content-Type": "application/json",
      "User-Agent": "ConstEra production monitor/1.0"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000)
  });
  await response.body?.cancel().catch(() => null);
  if (!response.ok) {
    throw new Error(`Monitor bildiriş kanalı HTTP ${response.status} qaytardı.`);
  }
  return { sent: true };
};

const requestWithRetry = async (url, { attempts = 2, redirect = "follow" } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, {
        headers: { "User-Agent": "ConstEra production monitor/1.0" },
        redirect,
        signal: AbortSignal.timeout(8_000)
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(attempt * 750);
    }
  }
  throw lastError;
};

const inspectCheck = async (origin, check) => {
  const startedAt = Date.now();
  const response = await requestWithRetry(check.url || `${origin}${check.path}`, {
    redirect: check.location ? "manual" : "follow"
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (response.status !== check.status) {
    throw new Error(`${check.path}: HTTP ${response.status}, gözlənilən ${check.status}.`);
  }
  if (check.json && !check.json(body)) {
    throw new Error(`${check.path}: JSON cavabının müqaviləsi pozulub.`);
  }
  if (check.includes && !String(body).includes(check.includes)) {
    throw new Error(`${check.path}: gözlənilən səhifə məzmunu tapılmadı.`);
  }
  if (check.location && response.headers.get("location") !== check.location) {
    throw new Error(`${check.path}: əsas domenə daimi yönləndirmə düzgün deyil.`);
  }
  for (const [name, validate] of Object.entries(check.headers || {})) {
    const value = String(response.headers.get(name) || "");
    if (!value || !validate(value)) {
      throw new Error(`${check.path}: ${name} təhlükəsizlik başlığı düzgün deyil.`);
    }
  }
  return {
    path: check.path,
    status: response.status,
    durationMs: Date.now() - startedAt
  };
};

export const runProductionMonitor = async ({
  origin = process.env.APP_ORIGIN || defaultOrigin
} = {}) => {
  const normalizedOrigin = String(origin || defaultOrigin).replace(/\/+$/, "");
  const checks = await Promise.all(productionChecks.map((check) => inspectCheck(normalizedOrigin, check)));
  return {
    origin: normalizedOrigin,
    checks,
    count: checks.length,
    completedAt: new Date().toISOString()
  };
};
