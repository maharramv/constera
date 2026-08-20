import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(file)=>readFileSync(file,"utf8");
test("P0 admin surface is authenticated",()=>{assert.match(read("admin.html"),/\/api\/admin-page/);assert.match(read("api/admin-page.js"),/getSessionUser/);assert.match(read("api/admin-page.js"),/super_admin/);assert.match(read("api/admin-asset.js"),/Authentication Required/);assert.match(read("api/admin-download.js"),/Authentication Required/);});
test("P0 build strips private artifacts and bootstrap UI",()=>{const post=read("scripts/p0-postbuild.mjs");assert.match(post,/dist\/docs/);assert.match(post,/dist\/assets\/js\/admin-v2\.js/);assert.match(post,/data-setup-form/);assert.match(post,/injectMarketplaceSnapshot/);assert.match(read("package.json"),/p0-postbuild\.mjs/);});
