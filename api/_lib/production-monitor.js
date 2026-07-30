const defaultOrigin = "https://constera.az";

export const productionChecks = Object.freeze([
  { path: "/api/health", status: 200, json: (body) => body.ok === true && body.database === "ready" },
  { path: "/api/catalog?scope=products&pageSize=1", status: 200, json: (body) => Array.isArray(body.data?.products) },
  { path: "/api/integrations", status: 200, json: (body) => typeof body.data?.readiness === "object" },
  { path: "/api/orders", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/support", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/supplier-performance", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/catalog-quality", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/merchant-feed", status: 200, includes: "<rss" },
  { path: "/", status: 200, includes: 'lang="az"' },
  { path: "/catalog.html", status: 200, includes: "ConstEra" },
  { path: "/services.html", status: 200, includes: "ConstEra" },
  { path: "/packages.html", status: 200, includes: "ConstEra" },
  { path: "/rental.html", status: 200, includes: "ConstEra" },
  { path: "/login.html", status: 200, includes: "ConstEra" }
]);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const requestWithRetry = async (url, attempts = 2) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, {
        headers: { "User-Agent": "ConstEra production monitor/1.0" },
        redirect: "follow",
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
  const response = await requestWithRetry(`${origin}${check.path}`);
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
