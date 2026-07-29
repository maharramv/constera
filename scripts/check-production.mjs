const origin = String(process.argv[2] || process.env.APP_ORIGIN || "https://constera.az").replace(/\/+$/, "");

const checks = [
  { path: "/api/health", status: 200, json: (body) => body.ok === true && body.database === "ready" },
  { path: "/api/catalog?scope=products&pageSize=1", status: 200, json: (body) => Array.isArray(body.data?.products) },
  { path: "/api/integrations", status: 200, json: (body) => typeof body.data?.readiness === "object" },
  { path: "/api/orders", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/support", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/supplier-performance", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/api/catalog-quality", status: 401, json: (body) => body.error?.code === "authentication_required" },
  { path: "/", status: 200, includes: 'lang="az"' },
  { path: "/catalog.html", status: 200, includes: "ConstEra" },
  { path: "/services.html", status: 200, includes: "ConstEra" },
  { path: "/packages.html", status: 200, includes: "ConstEra" },
  { path: "/rental.html", status: 200, includes: "ConstEra" },
  { path: "/login.html", status: 200, includes: "ConstEra" }
];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const requestWithRetry = async (url, attempts = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, {
        headers: { "User-Agent": "ConstEra production monitor/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000)
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(attempt * 1_000);
    }
  }
  throw lastError;
};

for (const check of checks) {
  const url = `${origin}${check.path}`;
  const response = await requestWithRetry(url);
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
  console.log(`OK ${check.path} HTTP ${response.status}`);
}

console.log(`ConstEra production monitorinqi uğurla tamamlandı: ${checks.length} yoxlama.`);
