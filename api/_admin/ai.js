import { requireRole } from "../_lib/auth.js";
import { generateAiEstimate, readAiDashboard, reviewAiRun } from "../_lib/ai-foundation.js";
import { assertMethod, assertSameOrigin, readJson, sendJson, withApiErrors } from "../_lib/http.js";
import { oneOf, text } from "../_lib/validation.js";

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

  const result = await generateAiEstimate({
    user,
    feature: oneOf(body.feature, ["estimate_review"], "estimate_review", "AI funksiyası"),
    input: body.input && typeof body.input === "object" ? body.input : {},
    deterministicEstimate: body.deterministicEstimate && typeof body.deterministicEstimate === "object"
      ? body.deterministicEstimate
      : {}
  });
  return sendJson(res, 200, { ok: true, data: result });
});
