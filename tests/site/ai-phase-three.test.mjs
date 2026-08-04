import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("AI Mərhələ 3 sənədi real kataloq və çoxməhsullu RFQ ilə birləşdirir", () => {
  const page = read("ai-smeta.html");
  const marketplace = read("assets/js/marketplace.js");
  const catalogPricing = read("api/_lib/estimate-catalog.js");
  const rfqApi = read("api/rfqs.js");

  assert.match(page, /AI Mərhələ 6/);
  assert.match(page, /AI \+ Neon kataloqu/);
  assert.match(page, /data-ai-smeta-file/);
  assert.match(marketplace, /enrichEstimateWithCatalog/);
  assert.match(marketplace, /items: rfq\.items/);
  assert.match(marketplace, /aiRunId: rfq\.aiRunId/);
  assert.match(marketplace, /data-ai-smeta-legal/);
  assert.match(marketplace, /legalAccepted: rfq\.legalAccepted/);
  assert.match(marketplace, /matchPercent/);
  assert.match(marketplace, /unresolvedRows/);
  assert.match(catalogPricing, /searchAiCatalogCandidates/);
  assert.match(catalogPricing, /LEFT JOIN LATERAL/);
  assert.match(catalogPricing, /alternatives: ranked\.slice/);
  assert.match(rfqApi, /estimate_review/);
  assert.match(rfqApi, /estimate_document/);
});

test("PDF emalı rəsmi Responses fayl formatı və idarə olunan detal səviyyəsi istifadə edir", () => {
  const openAi = read("api/_lib/openai.js");
  const environment = read(".env.example");

  assert.match(openAi, /data:\$\{document\.mimeType\};base64,/);
  assert.match(openAi, /detail: configuration\.pdfDetail/);
  assert.match(openAi, /store: false/);
  assert.match(environment, /AI_PDF_DETAIL=high/);
});
