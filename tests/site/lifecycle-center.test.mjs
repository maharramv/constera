import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("həyat dövrü mərkəzi səkkiz əlaqəli modulu bir iş səthində saxlayır", () => {
  const html = read("lifecycle-center.html");
  const panels = [...html.matchAll(/data-lifecycle-panel="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(panels, ["passport", "models", "changes", "warranty", "surplus", "handover", "contractor", "locks"]);
  assert.match(html, /data-lifecycle-form="save-passport"/);
  assert.match(html, /data-lifecycle-form="analyze-model"/);
  assert.match(html, /data-lifecycle-form="create-rental-handover"/);
  assert.match(html, /data-lifecycle-form="lock-price"/);
  assert.match(html, /meta name="robots" content="noindex, nofollow"/);
});

test("həyat dövrü API-si gateway və production müştərisinə qoşulub", () => {
  const gateway = read("api/admin.js");
  const vercel = JSON.parse(read("vercel.json"));
  const production = read("assets/js/production.js");
  assert.match(gateway, /lifecycle: \(\) => import\("\.\/_admin\/lifecycle\.js"\)/);
  assert.ok(
    vercel.rewrites?.some((rewrite) => rewrite.source === "/api/lifecycle" && rewrite.destination === "/api/admin?__route=lifecycle"),
    "Vercel həyat dövrü marşrutu çatışmır"
  );
  assert.match(production, /lifecycleMutation/);
  assert.match(production, /publicProductPassport/);
});

test("rəqəmsal pasport məhsul səhifəsində yalnız dərc edilmiş məlumatı göstərir", () => {
  const detail = read("product-detail.html");
  const client = read("assets/js/lifecycle-public.js");
  const api = read("api/_admin/lifecycle.js");
  assert.match(detail, /assets\/js\/lifecycle-public\.js/);
  assert.match(client, /publicProductPassport/);
  assert.match(client, /error\.status !== 404/);
  assert.match(api, /passport\.status = 'published'/);
  assert.match(api, /completeness\.score < 70/);
});

test("yeni modul build, audit və şəxsi PWA qaydalarına daxildir", () => {
  const build = read("scripts/vercel-build.mjs");
  const audit = read("scripts/audit-site.mjs");
  const worker = read("service-worker.js");
  assert.match(build, /"lifecycle-center\.html"/);
  assert.match(build, /"assets\/js\/lifecycle-center\.js"/);
  assert.match(audit, /"db\/migrations\/037_asset_lifecycle_center\.sql"/);
  assert.match(audit, /"api\/_admin\/lifecycle\.js"/);
  assert.match(worker, /"\/lifecycle-center\.html"/);
});

test("əsas kabinetlər vahid həyat dövrü mərkəzinə keçid verir", () => {
  ["admin.html", "customer-cabinet.html", "project-planner.html", "supplier-portal.html"].forEach((file) => {
    assert.match(read(file), /href="lifecycle-center\.html"/, `${file} keçidi çatışmır`);
  });
});
