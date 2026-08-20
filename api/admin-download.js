import { readFileSync } from "node:fs";
import { getSessionUser } from "./_lib/auth.js";
const allowedFiles = new Set(["commercial-launch-runbook.md", "launch-evidence-checklist.md", "csv-templates/supplier-onboarding.csv", "csv-templates/media-urls.csv", "csv-templates/logistics-tariffs.csv", "csv-templates/pilot-order-checklist.csv", "csv-templates/pilot-customers.csv", "csv-templates/products.csv", "csv-templates/services.csv", "csv-templates/packages.csv", "csv-templates/rentals.csv"]);
const documents = new Map([...allowedFiles].map((filename) => [filename, readFileSync(new URL(`../docs/${filename}`, import.meta.url))]));
const send = (res, status, message) => { res.statusCode = status; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end(message); };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0"); res.setHeader("Vary", "Cookie"); res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive"); res.setHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD"].includes(req.method)) return send(res, 405, "Method Not Allowed");
  const filename = String(req.query?.file || "").trim();
  if (!allowedFiles.has(filename)) return send(res, 404, "Not Found");
  let user; try { user = await getSessionUser(req); } catch { return send(res, 503, "Session unavailable"); }
  if (!user) return send(res, 401, "Authentication Required");
  if (!["super_admin", "admin"].includes(user.role)) return send(res, 403, "Forbidden");
  const name = filename.split("/").pop().replace(/[^a-zA-Z0-9._-]/g, "-");
  res.statusCode = 200; res.setHeader("Content-Type", filename.endsWith(".csv") ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  return req.method === "HEAD" ? res.end() : res.end(documents.get(filename));
}
