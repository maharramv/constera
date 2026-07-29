import { ApiError, withApiErrors } from "./_lib/http.js";

const routeLoaders = Object.freeze({
  account: () => import("./_admin/account.js"),
  analytics: () => import("./_admin/analytics.js"),
  audit: () => import("./_admin/audit.js"),
  backup: () => import("./_admin/backup.js"),
  cabinet: () => import("./_admin/cabinet.js"),
  "catalog-quality": () => import("./_admin/catalog-quality.js"),
  "catalog-staging": () => import("./_admin/catalog-staging.js"),
  categories: () => import("./_admin/categories.js"),
  crm: () => import("./_admin/crm.js"),
  entities: () => import("./_admin/entities.js"),
  events: () => import("./_admin/events.js"),
  fulfillments: () => import("./_admin/fulfillments.js"),
  imports: () => import("./_admin/imports.js"),
  integrations: () => import("./_admin/integrations.js"),
  inventory: () => import("./_admin/inventory.js"),
  logistics: () => import("./_admin/logistics.js"),
  media: () => import("./_admin/media.js"),
  notifications: () => import("./_admin/notifications.js"),
  orders: () => import("./_admin/orders.js"),
  "price-monitor": () => import("./_admin/price-monitor.js"),
  procurement: () => import("./_admin/procurement.js"),
  "product-offers": () => import("./_admin/product-offers.js"),
  "purchase-orders": () => import("./_admin/purchase-orders.js"),
  "rental-bookings": () => import("./_admin/rental-bookings.js"),
  reviews: () => import("./_admin/reviews.js"),
  "scheduled-backup": () => import("./_admin/scheduled-backup.js"),
  "supplier-performance": () => import("./_admin/supplier-performance.js"),
  "supplier-feeds": () => import("./_admin/supplier-feeds.js"),
  support: () => import("./_admin/support.js"),
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
