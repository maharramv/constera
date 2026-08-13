import assert from "node:assert/strict";
import test from "node:test";
import {
  productionChecks,
  productionMonitorAlertReadiness,
  runProductionMonitor,
  sendProductionMonitorAlert
} from "../../api/_lib/production-monitor.js";

const withAlertEnvironment = async (values, callback) => {
  const previous = {
    endpoint: process.env.MONITOR_ALERT_WEBHOOK_URL,
    secret: process.env.MONITOR_ALERT_WEBHOOK_SECRET
  };
  process.env.MONITOR_ALERT_WEBHOOK_URL = values.endpoint || "";
  process.env.MONITOR_ALERT_WEBHOOK_SECRET = values.secret || "";
  try {
    return await callback();
  } finally {
    if (previous.endpoint === undefined) delete process.env.MONITOR_ALERT_WEBHOOK_URL;
    else process.env.MONITOR_ALERT_WEBHOOK_URL = previous.endpoint;
    if (previous.secret === undefined) delete process.env.MONITOR_ALERT_WEBHOOK_SECRET;
    else process.env.MONITOR_ALERT_WEBHOOK_SECRET = previous.secret;
  }
};

test("monitor xəbərdarlığı yalnız təhlükəsiz endpoint və güclü sirrlə hazır sayılır", async () => {
  await withAlertEnvironment({
    endpoint: "http://monitor.example.test/hook",
    secret: "short"
  }, () => {
    assert.equal(productionMonitorAlertReadiness(), false);
  });
  await withAlertEnvironment({
    endpoint: "https://monitor.example.test/hook",
    secret: "x".repeat(24)
  }, () => {
    assert.equal(productionMonitorAlertReadiness(), true);
  });
});

test("monitor xətası qorunan webhook-a məhdud JSON hadisəsi göndərir", async () => {
  const previousFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };
  try {
    await withAlertEnvironment({
      endpoint: "https://monitor.example.test/hook",
      secret: "s".repeat(32)
    }, async () => {
      const result = await sendProductionMonitorAlert({
        origin: "https://constera.az/",
        error: new Error("catalog contract failed")
      });
      assert.equal(result.sent, true);
    });
  } finally {
    global.fetch = previousFetch;
  }
  assert.equal(request.url, "https://monitor.example.test/hook");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, `Bearer ${"s".repeat(32)}`);
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.event, "production_monitor_failed");
  assert.equal(payload.origin, "https://constera.az");
  assert.equal(payload.message, "catalog contract failed");
});

test("production monitor SEO, PWA və təhlükəsizlik başlıqlarını da qoruyur", async () => {
  const monitorOrigin = "https://constera.az/";
  const normalizedMonitorOrigin = monitorOrigin.replace(/\/+$/, "");
  const originHost = new URL(normalizedMonitorOrigin).hostname;
  const expectedWwwHost = originHost.startsWith("www.") ? `https://${originHost}` : `https://www.${originHost}`;
  const paths = productionChecks.map((item) => item.path);
  for (const path of [
    expectedWwwHost,
    "/api/launch-center",
    "/api/project-site-control?projectId=monitor",
    "/api/project-site-journal?projectId=monitor",
    "/api/procurement-control",
    "/robots.txt",
    "/sitemap.xml",
    "/service-worker.js",
    "/assets/icons/site.webmanifest",
    "/project-planner.html"
  ]) {
    assert.equal(paths.includes(path), true, path);
  }
  const homepage = productionChecks.find((item) => item.path === "/");
  assert.deepEqual(Object.keys(homepage.headers), [
    "content-security-policy",
    "strict-transport-security",
    "x-content-type-options",
    "referrer-policy"
  ]);

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const path = new URL(url).pathname;
    const check = productionChecks.find((item) => item.url === url)
      || productionChecks.find((item) => item.path.split("?")[0] === path);
    const body = check?.json
      ? JSON.stringify(path === "/api/health"
        ? { ok: true, database: "ready" }
        : path === "/api/catalog"
          ? { data: { products: [] } }
          : path === "/api/integrations"
            ? { data: { readiness: {} } }
            : { error: { code: "authentication_required" } })
      : String(check?.includes || "ok");
    const headers = new Headers({
      "content-type": check?.json ? "application/json" : "text/plain",
      "content-security-policy": "default-src 'self'; object-src 'none'",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin"
    });
    if (check?.location) headers.set("location", check.location);
    return new Response(body, { status: check?.status || 200, headers });
  };
  try {
    const result = await runProductionMonitor({ origin: monitorOrigin });
    assert.equal(result.count, productionChecks.length);
  } finally {
    global.fetch = originalFetch;
  }
});
