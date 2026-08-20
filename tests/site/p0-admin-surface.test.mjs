import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");

test("P0 admin surface is authenticated through the existing gateway", () => {
  assert.match(read("admin.html"), /\/api\/admin-page/);
  assert.match(read("api/_admin/admin-page.js"), /getSessionUser/);
  assert.match(read("api/_admin/admin-page.js"), /super_admin/);
  assert.match(read("api/_admin/admin-asset.js"), /Authentication Required/);
  assert.match(read("api/_admin/admin-download.js"), /Authentication Required/);
  assert.match(read("api/admin.js"), /admin-page/);
  assert.match(read("vercel.json"), /\/api\/admin-page/);
  assert.equal(existsSync("api/admin-page.js"), false);
  assert.equal(existsSync("api/admin-asset.js"), false);
  assert.equal(existsSync("api/admin-download.js"), false);
});

test("P0 build strips private artifacts and bootstrap UI", () => {
  const post = read("scripts/p0-postbuild.mjs");
  assert.match(post, /dist\/docs/);
  assert.match(post, /dist\/assets\/js\/admin-v2\.js/);
  assert.match(post, /data-setup-form/);
  assert.match(post, /injectMarketplaceSnapshot/);
  assert.match(read("package.json"), /p0-postbuild\.mjs/);
});
