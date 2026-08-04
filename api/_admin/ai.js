import { requireRole } from "../_lib/auth.js";
import {
  assertAiFeatureAccess,
  generateAiCatalogAdvice,
  generateAiEstimate,
  generateAiOfferComparison,
  generateAiRfqDraft,
  readAiDashboard,
  reviewAiRun
} from "../_lib/ai-foundation.js";
import { searchAiCatalogCandidates } from "../_lib/ai-catalog.js";
import { loadRfqOfferComparison } from "../_lib/ai-offer-comparison.js";
import { assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { oneOf, stringList, text } from "../_lib/validation.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET", "POST", "PATCH"]);
  const user = await requireRole(req);

  if (req.method === "GET") {
    const scope = oneOf(req.query.scope, ["mine", "all"], "mine", "AI görünüşü");
    const data = await readAiDashboard({ user, scope, limit: req.query.limit });
    return sendJson(res, 200, { ok: true, data });
  }

  assertSameOrigin(req);
  const body = await readJson(req, 1_750_000);
  if (req.method === "PATCH") {
    const data = await reviewAiRun({
      user,
      runId: text(body.runId, { field: "AI nəticəsi", required: true, max: 160 }),
      decision: oneOf(body.decision, ["approve", "reject"], "approve", "AI qərarı"),
      note: text(body.note, { max: 1_000 })
    });
    return sendJson(res, 200, { ok: true, data });
  }

  const feature = oneOf(
    body.feature,
    ["estimate_review", "catalog_enrichment", "rfq_draft", "offer_comparison"],
    "estimate_review",
    "AI funksiyası"
  );
  const input = body.input && typeof body.input === "object" ? body.input : {};
  let result;
  if (feature === "estimate_review") {
    result = await generateAiEstimate({
      user,
      feature,
      input,
      deterministicEstimate: body.deterministicEstimate && typeof body.deterministicEstimate === "object"
        ? body.deterministicEstimate
        : {}
    });
  } else if (feature === "offer_comparison") {
    assertAiFeatureAccess(user, feature);
    const rfqId = text(input.rfqId, { field: "Qiymət sorğusu", required: true, max: 160 });
    const comparison = await loadRfqOfferComparison({ user, rfqId });
    result = await generateAiOfferComparison({ user, comparison });
  } else {
    const prompt = text(input.prompt, {
      field: feature === "rfq_draft" ? "RFQ ehtiyacı" : "Kataloq ehtiyacı",
      required: true,
      min: 8,
      max: feature === "rfq_draft" ? 4_000 : 2_000
    });
    const hints = stringList(input.hints, 10);
    const productIds = stringList(input.productIds, 30);
    const candidates = await searchAiCatalogCandidates({ prompt, hints, productIds });
    const normalizedInput = { ...input, prompt, hints, productIds };
    result = feature === "catalog_enrichment"
      ? await generateAiCatalogAdvice({ user, input: normalizedInput, candidates })
      : await generateAiRfqDraft({ user, input: normalizedInput, candidates });
  }
  return sendJson(res, 200, { ok: true, data: result });
});
