import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expandCatalogSearchGroups,
  foldCatalogSearchText
} from "../../api/_lib/catalog-search.js";

test("Azərbaycan hərfləri axtarış üçün sabit şəkildə qatlanır", () => {
  assert.equal(foldCatalogSearchText("DƏMİR, ŞÜŞƏ və döşəmə"), "demir suse ve doseme");
  assert.equal(foldCatalogSearchText("  30 kq   suvaq  "), "30 kq suvaq");
});

test("təbii Azərbaycan sorğusunda xidmət sözləri çıxarılır və sinonimlər saxlanılır", () => {
  const groups = expandCatalogSearchGroups("Mənə 30 kq suvaq lazımdır");

  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0], ["30"]);
  assert.ok(groups[1].includes("kg"));
  assert.ok(groups[2].includes("shtukaturka"));
  assert.ok(groups[2].includes("штукатурка"));
});

test("rusca kataloq sorğusu Azərbaycan termini və ölçü yazılışı ilə genişlənir", () => {
  const groups = expandCatalogSearchGroups("краска 15л");

  assert.ok(groups[0].includes("boya"));
  assert.ok(groups[1].includes("15 l"));
  assert.ok(groups[1].includes("15lt"));
});

test("axtarış qrupları və variantları sorğu ölçüsünü məhdud saxlayır", () => {
  const groups = expandCatalogSearchGroups("boya sement armatur suvaq kabel boru kafel dam alət dizayn", {
    maxGroups: 4,
    maxVariants: 3
  });

  assert.equal(groups.length, 4);
  assert.ok(groups.every((group) => group.length <= 3));
});
