import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("icra mərkəzi müqavilə, BOQ, ölçmə və ödəniş aktını vahid axında saxlayır", () => {
  const html = read("execution-center.html");
  const panels = [...html.matchAll(/data-execution-panel="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(panels, ["contracts", "boq", "measurements", "certificates"]);
  assert.match(html, /data-execution-form="create-contract"/);
  assert.match(html, /data-execution-form="create-boq-item"/);
  assert.match(html, /data-execution-form="create-measurement"/);
  assert.match(html, /data-execution-form="create-certificate"/);
  assert.match(html, /meta name="robots" content="noindex, nofollow"/);
});

test("icra API-si gateway, Vercel və production müştərisinə qoşulub", () => {
  const gateway = read("api/admin.js");
  const vercel = JSON.parse(read("vercel.json"));
  const production = read("assets/js/production.js");
  assert.match(gateway, /execution: \(\) => import\("\.\/_admin\/execution\.js"\)/);
  assert.ok(vercel.rewrites.some((rewrite) => rewrite.source === "/api/execution" && rewrite.destination === "/api/admin?__route=execution"));
  assert.match(production, /executionMutation/);
  assert.match(production, /certificateId/);
});

test("ödəniş aktı özünü təsdiqi, artıq BOQ miqdarını və sübutsuz ödənişi bloklayır", () => {
  const api = read("api/_admin/execution.js");
  assert.match(api, /self_approval_blocked/);
  assert.match(api, /boq_quantity_exceeded/);
  assert.match(api, /payment_reference_required/);
  assert.match(api, /retention_release_pending/);
  assert.match(api, /assertCriticalTwoFactor/);
  assert.match(api, /measurement\.status = 'accepted'/);
  assert.match(read("db/migrations/038_project_execution_payments.sql"), /open_retention_release_idx/);
});

test("akt ayrıca çap və PDF görünüşü ilə təqdim olunur", () => {
  const html = read("execution-certificate.html");
  const client = read("assets/js/execution-certificate.js");
  const css = read("assets/css/execution-certificate.css");
  assert.match(html, /data-certificate-print/);
  assert.match(client, /window\.print\(\)/);
  assert.match(client, /Ödənəcək yekun/);
  assert.match(css, /@media print/);
});

test("yeni icra səhifələri build, şəxsi PWA və kabinet keçidlərinə daxildir", () => {
  const build = read("scripts/vercel-build.mjs");
  const worker = read("service-worker.js");
  assert.match(build, /"execution-center\.html"/);
  assert.match(build, /"execution-certificate\.html"/);
  assert.match(worker, /"\/execution-center\.html"/);
  ["admin.html", "customer-cabinet.html", "project-planner.html", "supplier-portal.html"].forEach((file) => {
    assert.match(read(file), /href="execution-center\.html"/, `${file} keçidi çatışmır`);
  });
});
