import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { getSessionUser } from "./_lib/auth.js";
import { renderSitePage } from "../scripts/site-shell.mjs";

const source = readFileSync(new URL("../private/admin.html", import.meta.url), "utf8");
const rendered = renderSitePage(source, { file: "admin.html" });
const revision = String(process.env.VERCEL_GIT_COMMIT_SHA || createHash("sha256").update(rendered).digest("hex")).slice(0, 12);
const privateAdminScripts = new Set(["admin-v2.js", "launch-center.js", "enterprise-admin.js", "operations-center.js", "ai-admin.js"]);
const adminHtml = rendered
  .replace(/((?:href|src)=["'])(assets\/(?:css|js)\/[^"'?#]+\.(?:css|js))(?:\?v=[^"']*)?(["'])/g, (_m, prefix, asset, suffix) => {
    const filename = asset.split("/").pop();
    return privateAdminScripts.has(filename)
      ? `${prefix}/api/admin-asset?file=${encodeURIComponent(filename)}&v=${revision}${suffix}`
      : `${prefix}${asset}?v=${revision}${suffix}`;
  })
  .replace(/(href=["'])docs\/([^"']+)(["'])/g, (_m, prefix, file, suffix) => `${prefix}/api/admin-download?file=${encodeURIComponent(file)}${suffix}`);

const privateHeaders = (res) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
};
const send = (res, status, message) => { res.statusCode = status; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end(message); };

export default async function adminPageHandler(req, res) {
  privateHeaders(res);
  if (!["GET", "HEAD"].includes(req.method)) { res.setHeader("Allow", "GET, HEAD"); return send(res, 405, "Method Not Allowed"); }
  let user;
  try { user = await getSessionUser(req); }
  catch { return send(res, 503, "İdarəetmə sessiyası hazırda yoxlanıla bilmir."); }
  if (!user) { res.statusCode = 302; res.setHeader("Location", "/login.html?next=admin.html"); return res.end(); }
  if (!["super_admin", "admin"].includes(user.role)) return send(res, 403, "Bu səhifəyə giriş icazəniz yoxdur.");
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.method === "HEAD") return res.end();
  return res.end(adminHtml);
}
