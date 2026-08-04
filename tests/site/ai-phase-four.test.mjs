import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("AI Mərhələ 4 təklif müqayisəsini RFQ və insan təsdiqi ilə birləşdirir", () => {
  const page = read("rfq-dashboard.html");
  const marketplace = read("assets/js/marketplace.js");
  const production = read("assets/js/production.js");
  const route = read("api/_admin/ai.js");
  const foundation = read("api/_lib/ai-foundation.js");
  const grounding = read("api/_lib/ai-offer-comparison.js");
  const admin = read("assets/js/ai-admin.js");
  const migration = read("db/migrations/030_ai_offer_comparison.sql");

  assert.match(page, /AI Mərhələ 4/);
  assert.match(page, /data-rfq-ai-compare/);
  assert.match(page, /data-rfq-ai-comparison/);
  assert.match(marketplace, /aiOfferComparison/);
  assert.match(marketplace, /data-rfq-ai-review/);
  assert.match(marketplace, /Tövsiyə olunan təklifi seç/);
  assert.match(production, /feature: "offer_comparison"/);
  assert.match(route, /loadRfqOfferComparison/);
  assert.match(foundation, /offer-comparison-v1/);
  assert.match(admin, /offer_comparison: "Təklif müqayisəsi"/);
  assert.match(grounding, /user\.role === "customer"/);
  assert.match(grounding, /offer\.status <> 'withdrawn'/);
  assert.match(migration, /'offer_comparison'/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS rfq_id/);
});

test("Təklif müqayisəsi rəqib məlumatını supplier roluna açmır və AI fakt uydurmur", () => {
  const policy = read("api/_lib/ai-foundation.js");
  const grounding = read("api/_lib/ai-offer-comparison.js");
  const openAi = read("api/_lib/openai.js");

  assert.match(policy, /const procurementRoles = \["super_admin", "admin", "sales", "customer"\]/);
  assert.match(grounding, /comparisonRoles/);
  assert.match(grounding, /Təchizatçı təkliflərinin AI müqayisəsi üçün icazən yoxdur/);
  assert.match(openAi, /Yalnız allowedOffers siyahısındakı offerId/);
  assert.match(openAi, /dəyişmə və uydurma/);
  assert.match(openAi, /qalib yalnız insan təsdiqindən sonra seçilə bilər/i);
});
