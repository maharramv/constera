import { isDatabaseConfigured, query } from "./_lib/db.js";
import { sendJson, withApiErrors } from "./_lib/http.js";

export default withApiErrors(async (req, res) => {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: { code: "method_not_allowed", message: "Yalnız GET dəstəklənir." } }, { Allow: "GET" });

  const configured = isDatabaseConfigured();
  let database = "not_configured";
  if (configured) {
    try {
      await query("SELECT 1 AS ready");
      database = "ready";
    } catch {
      database = "unreachable";
    }
  }

  return sendJson(res, database === "unreachable" ? 503 : 200, {
    ok: database !== "unreachable",
    service: "constera-api",
    version: "1.0.0",
    database,
    timestamp: new Date().toISOString()
  });
});
