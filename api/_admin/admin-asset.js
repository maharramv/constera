import { readFileSync } from "node:fs";
import { getSessionUser } from "../_lib/auth.js";

const assets = Object.freeze({
  "admin-v2.js": readFileSync(new URL("../../assets/js/admin-v2.js", import.meta.url), "utf8"),
  "launch-center.js": readFileSync(new URL("../../assets/js/launch-center.js", import.meta.url), "utf8"),
  "enterprise-admin.js": readFileSync(new URL("../../assets/js/enterprise-admin.js", import.meta.url), "utf8"),
  "operations-center.js": readFileSync(new URL("../../assets/js/operations-center.js", import.meta.url), "utf8"),
  "ai-admin.js": readFileSync(new URL("../../assets/js/ai-admin.js", import.meta.url), "utf8")
});

const setPrivateHeaders = (res) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("X-Content-Type-Options", "nosniff");
};

const send = (res, status, message) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.end(message);
};

export default async function adminAssetHandler(req, res) {
  setPrivateHeaders(res);
  if (!["GET", "HEAD"].includes(req.method)) {
    res.setHeader("Allow", "GET, HEAD");
    return send(res, 405, "Method Not Allowed");
  }

  const filename = String(req.query?.file || "").trim();
  if (!Object.hasOwn(assets, filename)) return send(res, 404, "Not Found");

  let user;
  try {
    user = await getSessionUser(req);
  } catch {
    return send(res, 503, "Session unavailable");
  }
  if (!user) return send(res, 401, "Authentication Required");
  if (!["super_admin", "admin"].includes(user.role)) return send(res, 403, "Forbidden");

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  return req.method === "HEAD" ? res.end() : res.end(assets[filename]);
}
