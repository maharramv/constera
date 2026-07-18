import "./load-local-env.mjs";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(".");
const port = Number(process.env.PORT || 3000);
const maxBodyBytes = 8_000_000;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const readBody = (req) => new Promise((resolveBody, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > maxBodyBytes) {
      reject(new Error("Sorğu gövdəsi maksimum ölçünü keçdi."));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => resolveBody(Buffer.concat(chunks)));
  req.on("error", reject);
});

const handleApi = async (req, res, url) => {
  const route = url.pathname.replace(/^\/api\//, "");
  if (!/^[a-z0-9-]+$/i.test(route)) return false;
  const file = resolve(root, "api", `${route}.js`);
  if (!existsSync(file)) return false;

  const bodyBuffer = ["GET", "HEAD"].includes(req.method) ? Buffer.alloc(0) : await readBody(req);
  req.body = bodyBuffer;
  req.query = Object.fromEntries(url.searchParams.entries());
  req.url = `${url.pathname}${url.search}`;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.hasHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
    return res;
  };
  const module = await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
  await module.default(req, res);
  return true;
};

const handleStatic = (req, res, url) => {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = resolve(root, `.${pathname}`);
  const localPath = relative(root, file);
  if (localPath.startsWith("..") || !existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Səhifə tapılmadı.");
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", mimeTypes[extname(file).toLowerCase()] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${port}`}`);
    if (url.pathname.startsWith("/api/") && await handleApi(req, res, url)) return;
    handleStatic(req, res, url);
  } catch (error) {
    console.error("Lokal server xətası", error);
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: { code: "dev_server_error", message: "Lokal server sorğunu tamamlaya bilmədi." } }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ConstEra lokal serveri: http://127.0.0.1:${port}`);
});

const close = () => server.close(() => process.exit(0));
process.on("SIGINT", close);
process.on("SIGTERM", close);
