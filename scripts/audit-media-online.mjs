import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const context = { window: {}, console };
vm.createContext(context);
[
  "assets/js/catalog-data.js",
  "assets/js/taxonomy-expansion.js",
  "assets/js/azerbaijan-real-products.js"
].forEach((file) => vm.runInContext(readFileSync(resolve(root, file), "utf8"), context, { filename: file }));

const marketplace = context.window.CONSTERA_MARKETPLACE || {};
const collections = ["products", "services", "packages", "rentals"];
const references = new Map();
for (const collection of collections) {
  for (const item of marketplace[collection] || []) {
    const urls = [item.imageUrl, ...(Array.isArray(item.gallery) ? item.gallery : [])].filter(Boolean);
    for (const url of urls) {
      const key = String(url).trim();
      if (!references.has(key)) references.set(key, []);
      references.get(key).push(`${collection}:${item.id || item.sku || item.name || item.title || "naməlum"}`);
    }
  }
}

const failures = [];
const remote = [];
for (const [url, owners] of references) {
  if (/^\/?assets\//i.test(url)) {
    const path = resolve(root, url.replace(/^\/+/, ""));
    if (!existsSync(path)) failures.push({ url, owners, reason: "lokal fayl tapılmadı" });
  } else if (/^https:\/\//i.test(url)) {
    remote.push([url, owners]);
  } else {
    failures.push({ url, owners, reason: "yalnız HTTPS və ya lokal assets yolu qəbul olunur" });
  }
}

const hasImageSignature = (bytes) => {
  if (!bytes?.length) return false;
  const ascii = new TextDecoder().decode(bytes.slice(0, 16)).trimStart().toLowerCase();
  return (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    || (ascii.startsWith("riff") && ascii.slice(8, 12) === "webp")
    || ascii.startsWith("<svg")
    || ascii.startsWith("<?xml");
};

const inspectRemote = async ([url, owners]) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Range: "bytes=0-4095",
        "User-Agent": "Mozilla/5.0 (compatible; ConstEraMediaAudit/1.0; +https://constera.az/)"
      }
    });
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const reader = response.body?.getReader();
    const firstChunk = reader ? await reader.read() : { value: null };
    await reader?.cancel();
    if (!response.ok) return { url, owners, reason: `HTTP ${response.status}` };
    if (!contentType.startsWith("image/") && !hasImageSignature(firstChunk.value)) {
      return { url, owners, reason: `şəkil olmayan content-type: ${contentType || "boş"}` };
    }
    return null;
  } catch (error) {
    return { url, owners, reason: error?.name === "AbortError" ? "12 saniyə vaxt limiti" : String(error?.message || error) };
  } finally {
    clearTimeout(timeout);
  }
};

const concurrency = 10;
let cursor = 0;
const workers = Array.from({ length: Math.min(concurrency, remote.length) }, async () => {
  while (cursor < remote.length) {
    const entry = remote[cursor];
    cursor += 1;
    const failure = await inspectRemote(entry);
    if (failure) failures.push(failure);
  }
});
await Promise.all(workers);

console.log(`Media auditi: ${references.size} unikal şəkil, ${remote.length} uzaq URL.`);
if (failures.length) {
  failures.sort((left, right) => left.url.localeCompare(right.url)).forEach((failure) => {
    console.error(`XƏTA ${failure.url} · ${failure.reason} · ${failure.owners.join(", ")}`);
  });
  console.error(`Media auditi ${failures.length} xəta ilə tamamlandı.`);
  process.exitCode = 1;
} else {
  console.log("Bütün kataloq şəkilləri açılır və etibarlı media tipi və ya şəkil imzası daşıyır.");
}
