import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import vm from "node:vm";
import { renderSitePage, siteShellTemplateFiles } from "./site-shell.mjs";

const root = process.cwd();
const htmlFiles = readdirSync(root).filter((file) => extname(file) === ".html").sort();
const errors = [];
const warnings = [];

const requiredProductionFiles = [
  ".env.example",
  "api/health.js",
  "api/auth.js",
  "api/catalog.js",
  "api/_lib/catalog-search.js",
  "api/admin.js",
  "api/cron-price-freshness.js",
  "api/cron-notifications.js",
  "api/_admin/account.js",
  "api/_admin/users.js",
  "api/_admin/categories.js",
  "api/_admin/contact.js",
  "api/_admin/crm.js",
  "api/_admin/entities.js",
  "api/_admin/fulfillments.js",
  "api/_admin/integrations.js",
  "api/_admin/analytics.js",
  "api/_admin/audit.js",
  "api/_admin/backup.js",
  "api/_admin/cabinet.js",
  "api/_admin/catalog-staging.js",
  "api/_admin/catalog-quality.js",
  "api/_admin/events.js",
  "api/_admin/imports.js",
  "api/_admin/inventory.js",
  "api/_admin/media.js",
  "api/_admin/merchant-feed.js",
  "api/_admin/notifications.js",
  "api/_admin/orders.js",
  "api/_admin/price-monitor.js",
  "api/_admin/production-monitor.js",
  "api/_admin/rental-bookings.js",
  "api/_admin/reviews.js",
  "api/_admin/scheduled-backup.js",
  "api/_admin/supplier-performance.js",
  "api/_admin/supplier-feeds.js",
  "api/_admin/support.js",
  "api/_admin/tenders.js",
  "api/_admin/tender-bids.js",
  "api/products.js",
  "api/suppliers.js",
  "api/_lib/price-monitor.js",
  "api/_lib/cloud-backup.js",
  "api/_lib/crm.js",
  "api/_lib/order-lifecycle.js",
  "api/_lib/order-operations.js",
  "api/_lib/policy-consent.js",
  "api/_lib/provider-adapters.js",
  "api/_lib/production-monitor.js",
  "api/_lib/merchant-feed.js",
  "api/_lib/catalog-quality.js",
  "api/_lib/estimate-import.js",
  "api/_lib/supplier-performance.js",
  "api/_lib/supplier-feeds.js",
  "api/_lib/two-factor.js",
  "api/_lib/rfq-order.js",
  "api/_lib/tender-order.js",
  "api/rfqs.js",
  "api/offers.js",
  "api/sync.js",
  "scripts/site-shell.mjs",
  "scripts/audit-build.mjs",
  "scripts/audit-database.mjs",
  "scripts/check-production.mjs",
  "scripts/import-scraper-catalog.mjs",
  "scripts/smoke-commerce.mjs",
  "scripts/smoke-operations.mjs",
  "scripts/smoke-trust.mjs",
  ...siteShellTemplateFiles,
  "playwright.config.mjs",
  "tests/layout/site-layout.spec.mjs",
  "docs/quality-workflow.yml",
  "docs/production-monitor-workflow.yml",
  ".github/dependabot.yml",
  "db/migrations/001_initial.sql",
  "db/migrations/002_indexes.sql",
  "db/migrations/003_marketplace_entities.sql",
  "db/migrations/004_submission_security.sql",
  "db/migrations/005_admin_v2.sql",
  "db/migrations/006_commerce_search.sql",
  "db/migrations/007_supplier_portal.sql",
  "db/migrations/008_customer_inventory_centers.sql",
  "db/migrations/009_catalog_scraper_staging.sql",
  "db/migrations/010_catalog_search_quality.sql",
  "db/migrations/011_rfq_offer_selection.sql",
  "db/migrations/012_price_history_baseline.sql",
  "db/migrations/013_commerce_lifecycle.sql",
  "db/migrations/014_rfq_order_conversion.sql",
  "db/migrations/015_tender_order_conversion.sql",
  "db/migrations/016_fulfillment_inventory.sql",
  "db/migrations/017_crm_rental_bookings.sql",
  "db/migrations/018_provider_integrations.sql",
  "db/migrations/019_b2b_procurement_logistics.sql",
  "db/migrations/020_supplier_purchase_orders.sql",
  "db/migrations/021_trust_analytics_quality.sql",
  "db/migrations/022_automation_security_pwa.sql",
  "db/migrations/023_commercial_security_operations.sql",
  "db/migrations/024_launch_legal_consent.sql",
  "assets/js/order-detail.js",
  "assets/js/enterprise.js",
  "assets/js/enterprise-admin.js",
  "assets/js/supplier-automation.js",
  "assets/js/pwa-notifications.js",
  "assets/css/enterprise.css",
  "assets/css/order-document.css",
  "tools/catalog-scraper/src/main.py",
  "tools/catalog-scraper/config/sources.json",
  "assets/data/azerbaycan-tikinti-temir-paketleri.json",
  "assets/data/azerbaycan-tikinti-texnikasi-icaresi.json",
  "assets/data/azerbaycan-tikinti-texnikasi-icaresi.csv",
  "assets/images/equipment/avtokran-25t-xcmg.webp",
  "assets/images/equipment/mini-ekskavator-new-holland.webp",
  "assets/images/equipment/teleskopik-yukleyici.webp",
  "assets/images/equipment/bekolader-jcb.webp",
  "assets/images/equipment/tekerli-ekskavator-cat.webp",
  "service-worker.js"
];

const report = (collection, file, message) => collection.push(`${file}: ${message}`);

requiredProductionFiles
  .filter((file) => !existsSync(resolve(root, file)))
  .forEach((file) => report(errors, file, "İstehsal infrastrukturu faylı tapılmadı."));

const serverlessFunctionCount = readdirSync(resolve(root, "api"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name) === ".js")
  .length;
if (serverlessFunctionCount > 12) {
  report(errors, "api", `Vercel Hobby limiti aşılır: ${serverlessFunctionCount} funksiya (maksimum 12).`);
}

const getAttribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
};

const getLocalReference = (value) => {
  if (!value || value.startsWith("#")) return null;
  if (value.startsWith("/api/")) return null;
  if (/^(?:[a-z]+:)?\/\//i.test(value) || /^(?:mailto|tel|data|javascript):/i.test(value)) return null;
  return value.split("#")[0].split("?")[0];
};

const resolveLocalReference = (sourceFile, value) => {
  const local = getLocalReference(value);
  if (!local) return null;
  const relative = local.startsWith("/") ? local.slice(1) : join(dirname(sourceFile), local);
  return normalize(relative);
};

const htmlByFile = new Map(htmlFiles.map((file) => {
  const source = readFileSync(join(root, file), "utf8");
  return [file, renderSitePage(source, { file })];
}));

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
  if (!/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']https:\/\/constera\.az(?:\/[^"']*)?["'][^>]*>/i.test(html)) {
    report(errors, file, "constera.az domeninə canonical link tapılmadı.");
  }
  if (!/<header\b[^>]*\bdata-site-header\b/i.test(html)) report(errors, file, "Ümumi site header tətbiq edilməyib.");
  if (file !== "login.html" && file !== "admin.html" && !/<footer\b[^>]*\bdata-site-footer\b/i.test(html)) {
    report(errors, file, "Ümumi site footer tətbiq edilməyib.");
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

  if (/\son[a-z]+\s*=/i.test(html)) {
    report(errors, file, "Inline hadisə atributu Content Security Policy ilə uyğun deyil.");
  }

  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html) || /<style\b|\sstyle\s*=/i.test(html)) {
    report(errors, file, "Inline script və ya stil Content Security Policy ilə uyğun deyil.");
  }

  if (/https:\/\/fonts\.(?:googleapis|gstatic)\.com/i.test(html)) {
    report(errors, file, "Xarici Google Font bağlantısı performans büdcəsinə uyğun deyil.");
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
  if (vercelConfig.buildCommand !== "npm run build:static") report(errors, "vercel.json", "Build əmri npm run build:static olmalıdır.");
  if (vercelConfig.outputDirectory !== "dist") report(errors, "vercel.json", "Çıxış qovluğu dist olmalıdır.");
  if (vercelConfig.installCommand !== "npm ci && npm run verify:deploy") {
    report(errors, "vercel.json", "Install mərhələsi npm ci və birdəfəlik deployment yoxlamasını işlətməlidir.");
  }
  if (!vercelConfig.functions?.["api/*.js"]) report(errors, "vercel.json", "Vercel Functions konfiqurasiyası tapılmadı.");
  const hasWwwRedirect = (source, destination) => vercelConfig.redirects?.some((route) => (
    route.source === source
    && route.permanent === true
    && route.destination === destination
    && route.has?.some((condition) => condition.type === "host" && condition.value === "www.constera.az")
  ));
  if (!hasWwwRedirect("/", "https://constera.az/") || !hasWwwRedirect("/:path*", "https://constera.az/:path*")) {
    report(errors, "vercel.json", "www.constera.az əsas domenə daimi yönləndirilmir.");
  }
  const securityHeaders = new Set((vercelConfig.headers || []).flatMap((rule) =>
    (rule.headers || []).map((header) => String(header.key || "").toLowerCase())));
  ["x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "strict-transport-security", "content-security-policy"]
    .filter((header) => !securityHeaders.has(header))
    .forEach((header) => report(errors, "vercel.json", `Təhlükəsizlik başlığı yoxdur: ${header}.`));
} catch (error) {
  report(errors, "vercel.json", `Vercel konfiqurasiyası oxunmadı: ${error.message}.`);
}

try {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (!packageJson.dependencies?.["@neondatabase/serverless"]) {
    report(errors, "package.json", "Neon PostgreSQL drayveri tapılmadı.");
  }
  if (!packageJson.dependencies?.["@vercel/blob"]) report(errors, "package.json", "Vercel Blob SDK tapılmadı.");
  if (!packageJson.dependencies?.["read-excel-file"]) report(errors, "package.json", "XLSX idxal kitabxanası tapılmadı.");
  if (!packageJson.dependencies?.["web-push"]) report(errors, "package.json", "Web push kitabxanası tapılmadı.");
  ["build:static", "vercel-build", "verify:deploy", "audit:dist", "db:migrate", "db:seed", "db:audit", "db:smoke", "test:api", "test:site", "test:layout", "check:production", "check:full"].forEach((script) => {
    if (!packageJson.scripts?.[script]) report(errors, "package.json", `${script} əmri tapılmadı.`);
  });
} catch (error) {
  report(errors, "package.json", `Paket konfiqurasiyası oxunmadı: ${error.message}.`);
}

const envTemplate = readFileSync(join(root, ".env.example"), "utf8");
[
  "DATABASE_URL",
  "ADMIN_SETUP_TOKEN",
  "CRON_SECRET",
  "PAYMENT_WEBHOOK_URL",
  "PAYMENT_WEBHOOK_SECRET",
  "EINVOICE_WEBHOOK_URL",
  "EINVOICE_WEBHOOK_SECRET",
  "AI_ESTIMATE_WEBHOOK_URL",
  "AI_ESTIMATE_WEBHOOK_SECRET",
  "BACKUP_WEBHOOK_URL",
  "BACKUP_WEBHOOK_SECRET",
  "TWO_FACTOR_ENCRYPTION_KEY",
  "VAPID_SUBJECT",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "APP_ORIGIN"
].forEach((key) => {
  if (!new RegExp(`^${key}=`, "m").test(envTemplate)) report(errors, ".env.example", `${key} dəyişəni tapılmadı.`);
});

if (!/^APP_ORIGIN=https:\/\/constera\.az$/m.test(envTemplate)) {
  report(errors, ".env.example", "APP_ORIGIN istehsal domeni https://constera.az olmalıdır.");
}

const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
if (/<loc>https:\/\/(?!constera\.az\/)/i.test(sitemap)) {
  report(errors, "sitemap.xml", "Sitemap yalnız constera.az domenindən istifadə etməlidir.");
}
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

const isLocalMediaPath = (value) => /^\/?assets\//i.test(String(value || ""));
const validateMedia = (item, collection) => {
  if (!item.imageUrl) return;
  if (/^https:\/\//i.test(item.imageUrl)) return;
  if (!isLocalMediaPath(item.imageUrl)) {
    report(errors, collection, `${item.id} şəkil URL-i təhlükəsiz HTTPS və ya lokal assets yolu deyil.`);
    return;
  }
  const localPath = String(item.imageUrl).replace(/^\/+/, "");
  if (!existsSync(resolve(root, localPath))) report(errors, collection, `${item.id} lokal şəkli tapılmadı: ${localPath}.`);
};

(marketplace.products || []).forEach((product) => {
  const hasConfirmedPrice = product.price && product.price !== "Sorğu əsasında";
  if (hasConfirmedPrice && !product.sourceUrl) report(errors, "products", `${product.id} təsdiqli qiymət üçün mənbə URL-i daşımır.`);
  if (hasConfirmedPrice && !product.sourceLabel) report(errors, "products", `${product.id} təsdiqli qiymət üçün mənbə adı daşımır.`);
  if (product.sourceUrl && !/^https:\/\//i.test(product.sourceUrl)) report(errors, "products", `${product.id} mənbə URL-i HTTPS deyil.`);
  validateMedia(product, "products");
});

[
  ["services", marketplace.services || []],
  ["packages", marketplace.packages || []],
  ["rentals", marketplace.rentals || []]
].forEach(([collection, items]) => {
  items.forEach((item) => {
    if (item.sourceUrl && !/^https:\/\//i.test(item.sourceUrl)) report(errors, collection, `${item.id} mənbə URL-i HTTPS deyil.`);
    if (item.priceAmount !== null && item.priceAmount !== undefined && item.priceAmount !== "" && !item.sourceUrl) {
      report(errors, collection, `${item.id} rəqəmli qiymət üçün mənbə URL-i daşımır.`);
    }
    validateMedia(item, collection);
  });
});

const ranking = context.window.CONSTERA_MARKETPLACE_RANKING;
if (!ranking?.getSourceQualityScore) {
  report(errors, "ranking", "Mənbəli məlumat prioritet modulu tapılmadı.");
} else {
  [
    ["products", "product"],
    ["services", "service"],
    ["packages", "package"],
    ["rentals", "rental"]
  ].forEach(([collection, kind]) => {
    const items = marketplace[collection] || [];
    items.forEach((item, index) => {
      if (!index) return;
      const previousScore = ranking.getSourceQualityScore(items[index - 1], kind);
      const currentScore = ranking.getSourceQualityScore(item, kind);
      if (currentScore > previousScore) {
        report(errors, collection, `${item.id} mənbə keyfiyyəti sıralamasında yanlış mövqedədir.`);
      }
    });
  });
}

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
