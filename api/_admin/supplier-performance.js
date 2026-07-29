import { requireRole } from "../_lib/auth.js";
import { loadSupplierPerformance } from "../_lib/supplier-performance.js";
import { ApiError, assertMethod, sendJson, withApiErrors } from "../_lib/http.js";
import { text } from "../_lib/validation.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const user = await requireRole(req, ["super_admin", "admin", "sales", "supplier"]);
  if (user.role === "supplier" && !user.companyId) {
    return sendJson(res, 200, { ok: true, data: { scorecards: [] } });
  }
  if (!["super_admin", "admin", "sales", "supplier"].includes(user.role)) {
    throw new ApiError(403, "performance_forbidden", "Performans panelinə giriş icazəsi yoxdur.");
  }
  const scorecards = await loadSupplierPerformance({
    companyId: user.role === "supplier" ? user.companyId : "",
    supplierId: user.role === "supplier" ? "" : text(req.query.supplierId, { max: 160 })
  });
  return sendJson(res, 200, { ok: true, data: { scorecards, generatedAt: new Date().toISOString() } });
});
