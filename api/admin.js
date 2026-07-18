import { ApiError, withApiErrors } from "./_lib/http.js";

const routeLoaders = Object.freeze({
  account: () => import("./_admin/account.js"),
  analytics: () => import("./_admin/analytics.js"),
  audit: () => import("./_admin/audit.js"),
  backup: () => import("./_admin/backup.js"),
  categories: () => import("./_admin/categories.js"),
  entities: () => import("./_admin/entities.js"),
  imports: () => import("./_admin/imports.js"),
  media: () => import("./_admin/media.js"),
  notifications: () => import("./_admin/notifications.js"),
  "tender-bids": () => import("./_admin/tender-bids.js"),
  tenders: () => import("./_admin/tenders.js"),
  users: () => import("./_admin/users.js")
});

export default withApiErrors(async (req, res) => {
  const route = String(req.query?.__route || "").trim().toLowerCase();
  const load = routeLoaders[route];
  if (!load) throw new ApiError(404, "admin_route_not_found", "İdarəetmə API marşrutu tapılmadı.");
  const module = await load();
  if (typeof module.default !== "function") {
    throw new ApiError(500, "invalid_admin_handler", "İdarəetmə modulu yüklənmədi.");
  }
  return module.default(req, res);
});
