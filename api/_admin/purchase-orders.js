import { requireRole } from "../_lib/auth.js";
import { ApiError, assertMethod, sendJson, withApiErrors } from "../_lib/http.js";
import { listSupplierPurchaseOrders } from "../_lib/purchase-orders.js";
import { parseLimit, text } from "../_lib/validation.js";

const allowedRoles = ["super_admin", "admin", "sales", "supplier", "customer"];
const privilegedRoles = ["super_admin", "admin", "sales"];

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const user = await requireRole(req, allowedRoles);
  const filters = {
    id: text(req.query.id, { max: 160 }),
    orderId: text(req.query.orderId, { max: 160 }),
    limit: parseLimit(req.query.limit, 250, 1_000)
  };
  if (user.role === "supplier") {
    if (!user.companyId) return sendJson(res, 200, { ok: true, data: [] });
    filters.supplierCompanyId = user.companyId;
  } else if (user.role === "customer") {
    filters.customerId = user.id;
  } else if (!privilegedRoles.includes(user.role)) {
    throw new ApiError(403, "forbidden", "Təchizatçı alt-sifarişlərinə giriş icazəsi yoxdur.");
  }
  const purchaseOrders = await listSupplierPurchaseOrders(filters);
  if (filters.id && !purchaseOrders.length) {
    throw new ApiError(404, "purchase_order_not_found", "Təchizatçı alt-sifarişi tapılmadı.");
  }
  return sendJson(res, 200, { ok: true, data: purchaseOrders });
});
