import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");

test("GitHub quality gate və xarici production monitoru aktiv workflow kimi saxlanır", () => {
  const quality = read(".github/workflows/quality.yml");
  const monitor = read(".github/workflows/production-monitor.yml");
  assert.match(quality, /npm run check/);
  assert.match(quality, /npm run test:layout/);
  assert.match(quality, /launch:readiness -- --artifact --artifact-dir=outputs --min-score=0/);
  assert.doesNotMatch(quality, /launch:readiness:go-live/);
  assert.match(monitor, /17 \*\/6 \* \* \*/);
  assert.match(monitor, /npm run check:production -- https:\/\/constera\.az/);
  assert.match(monitor, /github\.rest\.issues\.create/);
});

test("təchizatçı kabineti build zamanı ayrılmış bundle və yüngül data profilinə keçir", () => {
  const build = read("scripts/vercel-build.mjs");
  const loader = read("assets/js/catalog-loader.js");
  assert.match(build, /supplier-portal-page\.js/);
  assert.match(build, /supplier-marketplace\.data/);
  assert.match(build, /treeShaking: true/);
  assert.match(loader, /dataset\.catalog/);
});

test("launch sübut paketi admin panelindən əlçatandır", () => {
  const admin = read("admin.html");
  const checklist = read("docs/launch-evidence-checklist.md");
  assert.match(admin, /Buraxılış sübut paketi/);
  assert.match(admin, /supplier-onboarding\.csv/);
  assert.match(admin, /logistics-tariffs\.csv/);
  assert.match(admin, /pilot-order-checklist\.csv/);
  assert.match(checklist, /Administrator təhlükəsizliyi/);
  assert.match(read(".well-known/security.txt"), /Canonical: https:\/\/constera\.az\/\.well-known\/security\.txt/);
});

test("Commercial Launch ölçülə bilən GO-LIVE qapısı və 100 məhsullu assortiment verir", () => {
  const admin = read("admin.html");
  const launch = read("assets/js/launch-center.js");
  const api = read("api/_admin/launch-center.js");
  const runbook = read("docs/commercial-launch-runbook.md");
  assert.match(admin, /Kommersiya buraxılışı/);
  assert.match(admin, /data-commercial-launch-milestones/);
  assert.match(admin, /pilot-customers\.csv/);
  assert.match(launch, /constera-commercial-launch-assortment/);
  assert.match(api, /buildCommercialLaunchProgram/);
  assert.match(api, /LIMIT 100/);
  assert.match(runbook, /3 tam qoşulmuş təchizatçı/);
  assert.match(runbook, /100 satışa tam hazır məhsul/);
  assert.match(runbook, /10 pilot müştəri/);
  assert.match(runbook, /GO-LIVE/);
});

test("pilot assortiment ixracı yalnız oxuyur və hazır olmayan məhsulu açıq işarələyir", () => {
  const packageJson = read("package.json");
  const script = read("scripts/prepare-launch-pilot.mjs");
  assert.match(packageJson, /launch:pilot-candidates/);
  assert.match(script, /SELECT/);
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/);
  assert.match(script, /review_required/);
  assert.match(script, /imageRightsVerified/);
  assert.match(script, /has_active_contract/);
  assert.match(script, /pilot-product-candidates\.csv/);
});

test("təchizatçı qoşulma növbəsi hüquqi sübutları avtomatik təsdiqləmir", () => {
  const packageJson = read("package.json");
  const script = read("scripts/prepare-supplier-onboarding.mjs");
  assert.match(packageJson, /launch:supplier-priority/);
  assert.match(script, /buildSupplierOnboarding/);
  assert.match(script, /review_required/);
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/);
  assert.match(script, /supplier-onboarding-priority\.csv/);
});
