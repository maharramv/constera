import assert from "node:assert/strict";
import test from "node:test";
import {
  productionMonitorAlertReadiness,
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
