import { readFileSync } from "node:fs";
import { getSessionUser } from "./_lib/auth.js";
const allowedFiles = new Set(["admin-v2.js", "launch-center.js", "enterprise-admin.js", "operations-center.js", "ai-admin.js"]);
const assets = new Map([...allowedFiles].map((filename) => [filename, readFileSync(new URL(`../assets/js/${filename}`, import.meta.url), "utf8")]));
const headers = (res) => { res.setHeader("Cache-Control", "private, no-store, max-age=0"); res.setHeader("Vary", "Cookie"); res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive"); res.setHeader("X-Content-Type-Options", "nosniff"); };
const send = (res, status, message) => { res.statusCode = status; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end(message); };
export default async function handler(req, res) {
  headers(res);
  if (!["GET", "HEAD"].includes(req.method)) return send(res, 405, "Method Not Allowed");
  const filename = String(req.query?.file || "").trim();
  if (!allowedFiles.has(filename)) return send(res, 404, "Not Found");
  let user; try { user = await getSessionUser(req); } catch { return send(res, 503, "Session unavailable"); }
  if (!user) return send(res, 401, "Authentication Required");
  if (!["super_admin", "admin"].includes(user.role)) return send(res, 403, "Forbidden");
  res.statusCode = 200; res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  return req.method === "HEAD" ? res.end() : res.end(assets.get(filename));
}
