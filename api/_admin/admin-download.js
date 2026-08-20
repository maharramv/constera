import { readFileSync } from "node:fs";
import { getSessionUser } from "../_lib/auth.js";

const documents = Object.freeze({
  "commercial-launch-runbook.md": readFileSync(new URL("../../docs/commercial-launch-runbook.md", import.meta.url)),
  "launch-evidence-checklist.md": readFileSync(new URL("../../docs/launch-evidence-checklist.md", import.meta.url)),
  "csv-templates/supplier-onboarding.csv": readFileSync(new URL("../../docs/csv-templates/supplier-onboarding.csv", import.meta.url)),
  "csv-templates/media-urls.csv": readFileSync(new URL("../../docs/csv-templates/media-urls.csv", import.meta.url)),
  "csv-templates/logistics-tariffs.csv": readFileSync(new URL("../../docs/csv-templates/logistics-tariffs.csv", import.meta.url)),
  "csv-templates/pilot-order-checklist.csv": readFileSync(new URL("../../docs/csv-templates/pilot-order-checklist.csv", import.meta.url)),
  "csv-templates/pilot-customers.csv": readFileSync(new URL("../../docs/csv-templates/pilot-customers.csv", import.meta.url)),
  "csv-templates/products.csv": readFileSync(new URL("../../docs/csv-templates/products.csv", import.meta.url)),
  "csv-templates/services.csv": readFileSync(new URL("../../docs/csv-templates/services.csv", import.meta.url)),
  "csv-templates/packages.csv": readFileSync(new URL("../../docs/csv-templates/packages.csv", import.meta.url)),
  "csv-templates/rentals.csv": readFileSync(new URL("../../docs/csv-templates/rentals.csv", import.meta.url))
});

const send = (res, status, message) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.end(message);
};

export default async function adminDownloadHandler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (!["GET", "HEAD"].includes(req.method)) {
    res.setHeader("Allow", "GET, HEAD");
    return send(res, 405, "Method Not Allowed");
  }

  const filename = String(req.query?.file || "").trim();
  if (!Object.hasOwn(documents, filename)) return send(res, 404, "Not Found");

  let user;
  try {
    user = await getSessionUser(req);
  } catch {
    return send(res, 503, "Session unavailable");
  }
  if (!user) return send(res, 401, "Authentication Required");
  if (!["super_admin", "admin"].includes(user.role)) return send(res, 403, "Forbidden");

  const name = filename.split("/").pop().replace(/[^a-zA-Z0-9._-]/g, "-");
  res.statusCode = 200;
  res.setHeader(
    "Content-Type",
    filename.endsWith(".csv") ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  return req.method === "HEAD" ? res.end() : res.end(documents[filename]);
}
