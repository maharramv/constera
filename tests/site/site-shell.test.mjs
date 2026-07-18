import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { extname, resolve } from "node:path";
import { navigationItems, renderSitePage } from "../../scripts/site-shell.mjs";

const root = resolve(".");
const htmlFiles = readdirSync(root).filter((file) => extname(file) === ".html").sort();
const render = (file) => renderSitePage(readFileSync(resolve(root, file), "utf8"), { file });
const count = (value, pattern) => (value.match(pattern) || []).length;

test("bütün HTML səhifələri ümumi header və main hədəfi alır", () => {
  htmlFiles.forEach((file) => {
    const html = render(file);
    assert.equal(count(html, /\bdata-site-header\b/g), 1, `${file}: header sayı`);
    assert.equal(count(html, /<main\b[^>]*\bid=["']main-content["']/gi), 1, `${file}: main-content sayı`);
  });
});

test("ictimai səhifələr eyni footer şablonundan istifadə edir", () => {
  const excluded = new Set(["admin.html", "login.html"]);
  let referenceFooter = "";

  htmlFiles.forEach((file) => {
    const html = render(file);
    const footer = html.match(/<footer\b[^>]*\bdata-site-footer\b[^>]*>[\s\S]*?<\/footer>/i)?.[0] || "";
    if (excluded.has(file)) {
      assert.equal(footer, "", `${file}: footer olmamalıdır`);
      return;
    }
    assert.ok(footer, `${file}: footer tapılmadı`);
    referenceFooter ||= footer;
    assert.equal(footer, referenceFooter, `${file}: footer şablondan fərqlənir`);
  });
});

test("site naviqasiyasının strukturu bütün səhifələrdə sabitdir", () => {
  const publicFiles = htmlFiles.filter((file) => file !== "login.html");
  let referenceHeader = "";

  publicFiles.forEach((file) => {
    const html = render(file);
    const header = html.match(/<header\b[^>]*\bdata-site-header\b[^>]*>[\s\S]*?<\/header>/i)?.[0] || "";
    const normalized = header.replace(/ aria-current="page"/g, "");
    assert.ok(header, `${file}: header tapılmadı`);
    assert.equal(count(header, /<nav\b/gi), 1, `${file}: nav sayı`);
    assert.equal(count(header, /<a\b/gi), navigationItems.length + 2, `${file}: header link sayı`);
    assert.equal(count(header, /aria-current="page"/g), 1, `${file}: aktiv bölmə sayı`);
    referenceHeader ||= normalized;
    assert.equal(normalized, referenceHeader, `${file}: header şablondan fərqlənir`);
  });
});

test("render edilmiş səhifələr təkrarlanan id yaratmır", () => {
  htmlFiles.forEach((file) => {
    const html = render(file);
    const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${file}: təkrarlanan id var`);
  });
});
