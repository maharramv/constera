import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogStructuralIssues,
  catalogLinkIssueTransition,
  hasImageFileSignature
} from "../../api/_lib/catalog-quality.js";

const product = (overrides = {}) => ({
  id: "product-1",
  name: "Mənbəli məhsul",
  brand: "Test",
  category_id: "material-test",
  specs: ["Ölçü: 10 mm", "Material: Polad"],
  image_url: null,
  source_url: "https://supplier.example/product-1",
  price_status: "request",
  price_verified_at: null,
  stock_quantity: null,
  availability: "Stok sorğu ilə",
  has_licensed_media: false,
  has_eligible_offer: false,
  ...overrides
});

test("RFQ məhsulunda təsdiqsiz media xəbərdarlıqdır, satışa hazır təklifdə isə yüksək riskdir", () => {
  const requestIssues = buildCatalogStructuralIssues([product()], []);
  assert.equal(
    requestIssues.find((item) => item.issueType === "missing_licensed_media")?.severity,
    "medium"
  );
  assert.equal(
    requestIssues.find((item) => item.issueType === "missing_image")?.severity,
    "medium"
  );

  const saleIssues = buildCatalogStructuralIssues([product({ has_eligible_offer: true })], []);
  assert.equal(
    saleIssues.find((item) => item.issueType === "missing_licensed_media")?.severity,
    "high"
  );
  assert.equal(
    saleIssues.find((item) => item.issueType === "missing_image")?.severity,
    "high"
  );
});

test("iki struktur texniki atributu olan məhsul xüsusiyyətsiz sayılmır", () => {
  const product = {
    id: "product-attributes-ready",
    name: "Test məhsulu",
    brand: "Test",
    category_id: "category-test",
    specs: [],
    extra_data: {
      attributes: [
        { label: "Ölçü", value: "1200 x 2400 mm" },
        { label: "Qalınlıq", value: "12,5 mm" }
      ]
    },
    image_url: "/assets/test.webp",
    source_url: "https://example.com/product",
    price_status: "request",
    stock_quantity: null,
    availability: "Sorğu əsasında",
    has_eligible_offer: false,
    has_licensed_media: true
  };
  const issues = buildCatalogStructuralIssues([product], []);
  assert.equal(issues.some((item) => item.issueType === "missing_specs"), false);
});

test("şəkil imzası yanlış MIME başlığından asılı olmadan təhlükəsiz tanınır", () => {
  assert.equal(hasImageFileSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(hasImageFileSignature(new TextEncoder().encode("<svg viewBox='0 0 1 1'></svg>")), true);
  assert.equal(hasImageFileSignature(new TextEncoder().encode("application data")), false);
});

test("uğurlu link yoxlaması bütün köhnə şəkil xəta tiplərini bağlayır", () => {
  assert.deepEqual(catalogLinkIssueTransition("image", { ok: true }), {
    activeIssueType: "broken_image_url",
    resolvedIssueTypes: ["broken_image_url", "invalid_image_content"]
  });
  assert.deepEqual(catalogLinkIssueTransition("image", { ok: false, contentMismatch: true }), {
    activeIssueType: "invalid_image_content",
    resolvedIssueTypes: ["broken_image_url"]
  });
});
