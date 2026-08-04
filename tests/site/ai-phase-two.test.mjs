import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("AI Mərhələ 2 kataloq məsləhətini və insan təsdiqli RFQ axınını birləşdirir", () => {
  const catalog = read("catalog.html");
  const rfq = read("rfq.html");
  const marketplace = read("assets/js/marketplace.js");
  const production = read("assets/js/production.js");
  const aiRoute = read("api/_admin/ai.js");
  const foundation = read("api/_lib/ai-foundation.js");
  const catalogGrounding = read("api/_lib/ai-catalog.js");
  const rfqApi = read("api/rfqs.js");
  const migration = read("db/migrations/029_ai_catalog_rfq.sql");

  assert.match(catalog, /data-catalog-ai-submit/);
  assert.match(rfq, /data-rfq-ai-generate/);
  assert.match(rfq, /data-rfq-ai-result/);
  assert.match(marketplace, /aiCatalogAdvice/);
  assert.match(marketplace, /data-rfq-ai-approve/);
  assert.match(marketplace, /reviewAiRun/);
  assert.match(production, /feature: "catalog_enrichment"/);
  assert.match(production, /feature: "rfq_draft"/);
  assert.match(aiRoute, /searchAiCatalogCandidates/);
  assert.match(foundation, /catalog-advice-v1/);
  assert.match(foundation, /rfq-draft-v1/);
  assert.match(catalogGrounding, /p\.status = 'active'/);
  assert.match(rfqApi, /approval_status = 'approved'/);
  assert.match(rfqApi, /jsonb_to_recordset/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS ai_run_id/);
});

test("AI nəticəsi qiymət və stok uydurmaq əvəzinə server mənbələrini göstərir", () => {
  const openAi = read("api/_lib/openai.js");
  const foundation = read("api/_lib/ai-foundation.js");

  assert.match(openAi, /Qiyməti, stoku, texniki göstəricini, sertifikatı və mənbəni dəyişmə və uydurma/);
  assert.match(openAi, /yalnız allowedProducts siyahısındakı productId-ni istifadə et/i);
  assert.match(foundation, /allowed\.get\(productId\)/);
  assert.match(foundation, /price: candidate\.price/);
});
