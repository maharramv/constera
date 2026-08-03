import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");

test("GitHub quality gate və xarici production monitoru aktiv workflow kimi saxlanır", () => {
  const quality = read(".github/workflows/quality.yml");
  const monitor = read(".github/workflows/production-monitor.yml");
  assert.match(quality, /npm run check/);
  assert.match(quality, /npm run test:layout/);
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
