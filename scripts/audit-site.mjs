import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const htmlFiles = readdirSync(root).filter((file) => extname(file) === ".html").sort();
const errors = [];
const warnings = [];

const report = (collection, file, message) => collection.push(`${file}: ${message}`);

const getAttribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
};

const getLocalReference = (value) => {
  if (!value || value.startsWith("#")) return null;
  if (/^(?:[a-z]+:)?\/\//i.test(value) || /^(?:mailto|tel|data|javascript):/i.test(value)) return null;
  return value.split("#")[0].split("?")[0];
};

const resolveLocalReference = (sourceFile, value) => {
  const local = getLocalReference(value);
  if (!local) return null;
  const relative = local.startsWith("/") ? local.slice(1) : join(dirname(sourceFile), local);
  return normalize(relative);
};

const htmlByFile = new Map(htmlFiles.map((file) => [file, readFileSync(join(root, file), "utf8")]));

for (const file of htmlFiles) {
  const html = htmlByFile.get(file);

  if (!/^<!doctype html>/i.test(html.trimStart())) report(errors, file, "DOCTYPE tapılmadı.");
  if (!/<html\b[^>]*\blang=["']az["']/i.test(html)) report(errors, file, "html lang=\"az\" olmalıdır.");
  if (!/<meta\b[^>]*\bname=["']viewport["'][^>]*>/i.test(html)) report(errors, file, "viewport meta teqi yoxdur.");
  if (!/<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["'][^"']{30,}["'][^>]*>/i.test(html)) {
    report(errors, file, "30 simvoldan uzun meta description tapılmadı.");
  }
  if (!/<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'](?:index|noindex),\s*(?:follow|nofollow)["'][^>]*>/i.test(html)) {
    report(errors, file, "robots meta teqi yoxdur və ya düzgün deyil.");
  }
  if (!/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']https:\/\/[^"']+["'][^>]*>/i.test(html)) {
    report(errors, file, "HTTPS canonical link tapılmadı.");
  }

  const title = html.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1].trim();
  if (!title) report(errors, file, "Səhifə başlığı boşdur.");
  if (title && title.length > 65) report(warnings, file, `Səhifə başlığı uzundur (${title.length} simvol).`);

  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count !== 1) report(errors, file, `Bir H1 gözlənilir, tapıldı: ${h1Count}.`);

  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  duplicateIds.forEach((id) => report(errors, file, `Təkrarlanan id: ${id}.`));

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const alt = getAttribute(match[0], "alt");
    if (alt === null) report(errors, file, `Şəkildə alt yoxdur: ${match[0].slice(0, 100)}.`);
  }

  for (const match of html.matchAll(/<button\b[^>]*>/gi)) {
    if (getAttribute(match[0], "type") === null) {
      report(errors, file, `Düymədə type atributu yoxdur: ${match[0].slice(0, 100)}.`);
    }
  }

  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = getAttribute(match[0], "href");
    if (href === null || href.trim() === "") report(errors, file, "Linkdə href yoxdur və ya boşdur.");
    if (getAttribute(match[0], "target") === "_blank") {
      const rel = getAttribute(match[0], "rel") || "";
      if (!rel.includes("noopener")) report(errors, file, "target=\"_blank\" linkində rel=\"noopener\" yoxdur.");
    }
  }

  const referenceTags = [
    ...html.matchAll(/<(?:a|link)\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi),
    ...html.matchAll(/<(?:img|script|source)\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)
  ];

  for (const match of referenceTags) {
    const value = match[1] ?? match[2] ?? "";
    const target = resolveLocalReference(file, value);
    if (target && !existsSync(resolve(root, target))) report(errors, file, `Lokal resurs tapılmadı: ${value}.`);
  }

  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']#([^"']+)["'][^>]*>/gi)) {
    if (!ids.includes(match[1])) report(errors, file, `Səhifədaxili hədəf tapılmadı: #${match[1]}.`);
  }

  const visibleText = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  if (/[\u0400-\u04ff]/u.test(visibleText)) report(errors, file, "Görünən mətndə kiril simvolları tapıldı.");
}

const css = readFileSync(join(root, "assets/css/styles.css"), "utf8");
for (const match of css.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\)/gi)) {
  const value = match[1] ?? match[2] ?? match[3] ?? "";
  const target = resolveLocalReference("assets/css/styles.css", value);
  if (target && !existsSync(resolve(root, target))) report(errors, "assets/css/styles.css", `Lokal resurs tapılmadı: ${value}.`);
}

const manifestFile = "assets/icons/site.webmanifest";
try {
  const manifest = JSON.parse(readFileSync(join(root, manifestFile), "utf8"));
  if (!manifest.name || /^MyWebSite$/i.test(manifest.name)) report(errors, manifestFile, "Tətbiq adı düzgün deyil.");
  if (manifest.lang !== "az") report(errors, manifestFile, "Tətbiq dili az olmalıdır.");
  (manifest.icons || []).forEach((icon) => {
    const iconPath = normalize(join(dirname(manifestFile), icon.src || ""));
    if (!icon.src || !existsSync(resolve(root, iconPath))) report(errors, manifestFile, `Manifest ikonu tapılmadı: ${icon.src || "boş yol"}.`);
  });
} catch (error) {
  report(errors, manifestFile, `Manifest JSON oxunmadı: ${error.message}.`);
}

const buildScript = readFileSync(join(root, "scripts/vercel-build.mjs"), "utf8");
htmlFiles.forEach((file) => {
  if (!buildScript.includes(`"${file}"`)) report(errors, "scripts/vercel-build.mjs", `${file} statik export siyahısında yoxdur.`);
});

try {
  const vercelConfig = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  if (vercelConfig.framework !== null) report(errors, "vercel.json", "Statik layihə üçün framework null olmalıdır.");
  if (vercelConfig.buildCommand !== "npm run vercel-build") report(errors, "vercel.json", "Build əmri npm run vercel-build olmalıdır.");
  if (vercelConfig.outputDirectory !== "dist") report(errors, "vercel.json", "Çıxış qovluğu dist olmalıdır.");
  const securityHeaders = new Set((vercelConfig.headers || []).flatMap((rule) =>
    (rule.headers || []).map((header) => String(header.key || "").toLowerCase())));
  ["x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "strict-transport-security"]
    .filter((header) => !securityHeaders.has(header))
    .forEach((header) => report(errors, "vercel.json", `Təhlükəsizlik başlığı yoxdur: ${header}.`));
} catch (error) {
  report(errors, "vercel.json", `Vercel konfiqurasiyası oxunmadı: ${error.message}.`);
}

const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
for (const match of sitemap.matchAll(/<loc>https:\/\/[^/]+\/(.*?)<\/loc>/g)) {
  const target = match[1] || "index.html";
  if (target && !existsSync(resolve(root, target))) report(errors, "sitemap.xml", `Səhifə tapılmadı: ${target}.`);
}

const context = { window: {}, console };
vm.createContext(context);
[
  "assets/js/catalog-data.js",
  "assets/js/taxonomy-expansion.js",
  "assets/js/azerbaijan-real-products.js"
].forEach((file) => vm.runInContext(readFileSync(join(root, file), "utf8"), context, { filename: file }));

const marketplace = context.window.CONSTERA_MARKETPLACE;
const collections = [
  ["categories", "products", "name"],
  ["serviceCategories", "services", "title"],
  ["packageCategories", "packages", "title"],
  ["rentalCategories", "rentals", "name"]
];

for (const [categoryKey, itemKey, titleKey] of collections) {
  const categories = marketplace[categoryKey] || [];
  const items = marketplace[itemKey] || [];
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const ids = items.map((item) => item.id).filter(Boolean);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  duplicates.forEach((id) => report(errors, itemKey, `Təkrarlanan id: ${id}.`));

  items.forEach((item, index) => {
    const label = item.id || `${index + 1}`;
    if (!item.id) report(errors, itemKey, `${index + 1}-ci elementdə id yoxdur.`);
    if (!item[titleKey]) report(errors, itemKey, `${label} elementində ad yoxdur.`);
    const category = categoryMap.get(item.category);
    if (!category) {
      report(errors, itemKey, `${label} naməlum kateqoriyaya bağlıdır: ${item.category}.`);
      return;
    }
    if (item.subcategory && !(category.subcategories || []).includes(item.subcategory)) {
      report(errors, itemKey, `${label} naməlum subkateqoriyaya bağlıdır: ${item.subcategory}.`);
    }
  });
}

(marketplace.products || []).forEach((product) => {
  const hasConfirmedPrice = product.price && product.price !== "Sorğu əsasında";
  if (hasConfirmedPrice && !product.sourceUrl) report(errors, "products", `${product.id} təsdiqli qiymət üçün mənbə URL-i daşımır.`);
  if (hasConfirmedPrice && !product.sourceLabel) report(errors, "products", `${product.id} təsdiqli qiymət üçün mənbə adı daşımır.`);
  if (product.sourceUrl && !/^https:\/\//i.test(product.sourceUrl)) report(errors, "products", `${product.id} mənbə URL-i HTTPS deyil.`);
  if (product.imageUrl && !/^https:\/\//i.test(product.imageUrl)) report(errors, "products", `${product.id} şəkil URL-i HTTPS deyil.`);
});

const productSkus = (marketplace.products || [])
  .map((product) => String(product.sku || "").trim().toUpperCase())
  .filter(Boolean);
const duplicateSkus = [...new Set(productSkus.filter((sku, index) => productSkus.indexOf(sku) !== index))];
duplicateSkus.forEach((sku) => report(errors, "products", `Təkrarlanan SKU: ${sku}.`));

const counts = {
  səhifə: htmlFiles.length,
  kateqoriya: marketplace.categories?.length || 0,
  məhsul: marketplace.products?.length || 0,
  xidmət: marketplace.services?.length || 0,
  paket: marketplace.packages?.length || 0,
  icarə: marketplace.rentals?.length || 0
};

console.log(`ConstEra auditi: ${Object.entries(counts).map(([key, value]) => `${value} ${key}`).join(", ")}.`);
warnings.forEach((issue) => console.warn(`XƏBƏRDARLIQ ${issue}`));
errors.forEach((issue) => console.error(`XƏTA ${issue}`));

if (errors.length > 0) {
  console.error(`Audit uğursuz oldu: ${errors.length} xəta, ${warnings.length} xəbərdarlıq.`);
  process.exit(1);
}

console.log(`Audit uğurla tamamlandı: 0 xəta, ${warnings.length} xəbərdarlıq.`);
