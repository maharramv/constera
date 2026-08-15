import { accessSync, constants, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import { gzipSync } from "node:zlib";
import vm from "node:vm";
import { buildSync, transformSync } from "esbuild";
import { renderSitePage, siteShellTemplateFiles } from "./site-shell.mjs";

const requiredFiles = [
  "index.html",
  "catalog.html",
  "category.html",
  "subcategory.html",
  "product-detail.html",
  "lifecycle-center.html",
  "execution-center.html",
  "execution-certificate.html",
  "services.html",
  "service-detail.html",
  "packages.html",
  "package-detail.html",
  "project-planner.html",
  "rental.html",
  "rental-detail.html",
  "brands.html",
  "suppliers.html",
  "supplier-portal.html",
  "price-import.html",
  "customer-cabinet.html",
  "checkout.html",
  "order-detail.html",
  "proposal-detail.html",
  "rfq.html",
  "rfq-dashboard.html",
  "tender.html",
  "ai-smeta.html",
  "contact.html",
  "privacy.html",
  "terms.html",
  "delivery-returns.html",
  "admin.html",
  "login.html",
  "offline.html",
  "assets/css/styles.css",
  "assets/css/catalog-assistant.css",
  "assets/css/launch-center.css",
  "assets/css/b2b-marketplace.css",
  "assets/css/checkout-procurement.css",
  "assets/css/admin-quality.css",
  "assets/css/product-workflow.css",
  "assets/css/order-document.css",
  "assets/css/rfq-workflow.css",
  "assets/css/supplier-workflow.css",
  "assets/css/enterprise.css",
  "assets/css/lifecycle-center.css",
  "assets/css/lifecycle-public.css",
  "assets/css/execution-center.css",
  "assets/css/execution-certificate.css",
  "assets/js/script.js",
  "assets/js/catalog-data.js",
  "assets/js/taxonomy-expansion.js",
  "assets/js/azerbaijan-real-products.js",
  "assets/js/catalog-loader.js",
  "assets/js/production.js",
  "assets/js/supplier-automation.js",
  "assets/js/pwa-notifications.js",
  "assets/js/order-detail.js",
  "assets/js/proposal-detail.js",
  "assets/js/admin-v2.js",
  "assets/js/ai-admin.js",
  "assets/js/catalog-assistant.js",
  "assets/js/launch-center.js",
  "assets/js/marketplace.js",
  "assets/js/enterprise.js",
  "assets/js/enterprise-admin.js",
  "assets/js/operations-center.js",
  "assets/js/project-site-control.js",
  "assets/js/lifecycle-center.js",
  "assets/js/lifecycle-public.js",
  "assets/js/execution-center.js",
  "assets/js/execution-certificate.js",
  "service-worker.js",
  ".well-known/security.txt",
  "docs/commercial-launch-runbook.md",
  "docs/csv-templates/pilot-customers.csv",
  "scripts/site-shell.mjs",
  ...siteShellTemplateFiles
];

const staticEntries = [
  "index.html",
  "catalog.html",
  "category.html",
  "subcategory.html",
  "product-detail.html",
  "lifecycle-center.html",
  "execution-center.html",
  "execution-certificate.html",
  "services.html",
  "service-detail.html",
  "packages.html",
  "package-detail.html",
  "project-planner.html",
  "rental.html",
  "rental-detail.html",
  "brands.html",
  "suppliers.html",
  "supplier-portal.html",
  "price-import.html",
  "customer-cabinet.html",
  "checkout.html",
  "order-detail.html",
  "proposal-detail.html",
  "rfq.html",
  "rfq-dashboard.html",
  "tender.html",
  "ai-smeta.html",
  "contact.html",
  "privacy.html",
  "terms.html",
  "delivery-returns.html",
  "admin.html",
  "login.html",
  "offline.html",
  "assets",
  "docs",
  "robots.txt",
  "sitemap.xml",
  "service-worker.js",
  ".well-known"
];

const missingFiles = requiredFiles.filter((file) => {
  try {
    accessSync(file, constants.R_OK);
    return false;
  } catch {
    return true;
  }
});

if (missingFiles.length > 0) {
  console.error("ConstEra statik yığım yoxlaması uğursuz oldu. Çatışmayan fayllar:");
  missingFiles.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

staticEntries.forEach((entry) => {
  try {
    accessSync(entry, constants.R_OK);
    cpSync(entry, `dist/${entry}`, { recursive: true });
  } catch {
    // Könüllü fayllar statik ixracı dayandırmadan buraxıla bilər.
  }
});

// Mənbə idxal faylları repoda qalır, lakin ictimai production paketinə daxil edilmir.
rmSync("dist/docs/imports", { recursive: true, force: true });
rmSync("dist/docs/launch-runbook.md", { force: true });
rmSync("dist/docs/quality-workflow.yml", { force: true });
rmSync("dist/docs/production-monitor-workflow.yml", { force: true });

staticEntries
  .filter((entry) => entry.endsWith(".html"))
  .forEach((entry) => {
    let rendered = renderSitePage(readFileSync(entry, "utf8"), { file: entry }).replace(
      /\s*<script src="assets\/js\/catalog-data\.js"><\/script>\s*<script src="assets\/js\/taxonomy-expansion\.js"><\/script>\s*<script src="assets\/js\/azerbaijan-real-products\.js"><\/script>/,
      '\n    <script src="assets/js/catalog-loader.js"></script>'
    );
    if (entry === "supplier-portal.html") {
      rendered = rendered
        .replace(
          '<script src="assets/js/catalog-loader.js"></script>',
          '<script src="assets/js/catalog-loader.js" data-catalog="supplier-marketplace.data"></script>'
        )
        .replace(
          '<script src="assets/js/marketplace.js"></script>',
          '<script src="assets/js/supplier-portal-page.js"></script>'
        );
    }
    if (entry === "customer-cabinet.html") {
      rendered = rendered
        .replace(
          '<script src="assets/js/marketplace.js"></script>',
          '<script src="assets/js/customer-cabinet-page.js"></script>'
        );
    }
    writeFileSync(`dist/${entry}`, rendered);
  });

const siteOrigin = "https://constera.az";
const dataContext = { window: {}, console };
vm.createContext(dataContext);
[
  "assets/js/catalog-data.js",
  "assets/js/taxonomy-expansion.js",
  "assets/js/azerbaijan-real-products.js"
].forEach((file) => vm.runInContext(readFileSync(file, "utf8"), dataContext, { filename: file }));

const marketplace = dataContext.window.CONSTERA_MARKETPLACE;
mkdirSync("dist/assets/data", { recursive: true });
writeFileSync(
  "dist/assets/data/marketplace.data",
  gzipSync(Buffer.from(JSON.stringify(marketplace)), { level: 9 })
);
writeFileSync(
  "dist/assets/data/supplier-marketplace.data",
  gzipSync(Buffer.from(JSON.stringify({
    categories: marketplace.categories || [],
    serviceCategories: [],
    packageCategories: [],
    rentalCategories: [],
    brands: [],
    suppliers: [],
    products: [],
    services: [],
    packages: [],
    rentals: []
  })), { level: 9 })
);
const marketplaceSource = readFileSync("assets/js/marketplace.js", "utf8");
const marketplaceOpening = "(async () => {\n";
const marketplaceClosing = "\n})();";
const marketplaceClosingIndex = marketplaceSource.lastIndexOf(marketplaceClosing);
if (!marketplaceSource.startsWith(marketplaceOpening) || marketplaceClosingIndex < 0) {
  throw new Error("marketplace.js build qabığı gözlənilən formatda deyil.");
}
const marketplaceBody = marketplaceSource.slice(marketplaceOpening.length, marketplaceClosingIndex);
const marketplaceInitializersIndex = marketplaceBody.indexOf("renderHomeSourcedShowcase();");
if (marketplaceInitializersIndex < 0) {
  throw new Error("marketplace.js başlanğıc çağırışları tapılmadı.");
}
const supplierPortalSource = `${marketplaceBody.slice(0, marketplaceInitializersIndex)}initSupplierPortal();\n`;
const customerCabinetSource = `${marketplaceBody.slice(0, marketplaceInitializersIndex)}initCustomerCabinet();\ninitCartDock();\n`;
const supplierPortalBuild = buildSync({
  stdin: {
    contents: supplierPortalSource,
    sourcefile: "supplier-portal-page.js",
    resolveDir: process.cwd()
  },
  bundle: true,
  format: "esm",
  legalComments: "none",
  minify: true,
  target: "es2022",
  treeShaking: true,
  write: false
});
writeFileSync(
  "dist/assets/js/supplier-portal-page.js",
  `;(async()=>{${supplierPortalBuild.outputFiles[0].text}})();\n`
);
const customerCabinetBuild = buildSync({
  stdin: {
    contents: customerCabinetSource,
    sourcefile: "customer-cabinet-page.js",
    resolveDir: process.cwd()
  },
  bundle: true,
  format: "esm",
  legalComments: "none",
  minify: true,
  target: "es2022",
  treeShaking: true,
  write: false
});
writeFileSync(
  "dist/assets/js/customer-cabinet-page.js",
  `;(async()=>{${customerCabinetBuild.outputFiles[0].text}})();\n`
);
[
  "dist/assets/js/catalog-data.js",
  "dist/assets/js/taxonomy-expansion.js",
  "dist/assets/js/azerbaijan-real-products.js"
].forEach((file) => rmSync(file, { force: true }));
const sitemapUrls = new Map();
const addSitemapUrl = (path, changefreq, priority, params = {}) => {
  const url = new URL(path, `${siteOrigin}/`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  sitemapUrls.set(url.toString(), { url: url.toString(), changefreq, priority });
};

[
  ["/", "weekly", "1.0"],
  ["catalog.html", "weekly", "0.9"],
  ["services.html", "weekly", "0.85"],
  ["packages.html", "weekly", "0.85"],
  ["project-planner.html", "monthly", "0.7"],
  ["rental.html", "weekly", "0.85"],
  ["brands.html", "weekly", "0.8"],
  ["suppliers.html", "weekly", "0.8"],
  ["contact.html", "monthly", "0.55"],
  ["privacy.html", "yearly", "0.3"],
  ["terms.html", "yearly", "0.3"],
  ["delivery-returns.html", "yearly", "0.35"],
  ["rfq.html", "monthly", "0.7"],
  ["tender.html", "monthly", "0.72"],
  ["ai-smeta.html", "monthly", "0.74"]
].forEach(([path, changefreq, priority]) => addSitemapUrl(path, changefreq, priority));

const addTaxonomyUrls = (type, categories) => {
  (categories || []).forEach((category) => {
    addSitemapUrl("category.html", "weekly", "0.78", { type, category: category.id });
    (category.subcategories || []).forEach((subcategory) => {
      addSitemapUrl("subcategory.html", "weekly", "0.7", { type, category: category.id, subcategory });
    });
  });
};

addTaxonomyUrls("material", marketplace.categories);
addTaxonomyUrls("service", marketplace.serviceCategories);
addTaxonomyUrls("package", marketplace.packageCategories);
addTaxonomyUrls("rental", marketplace.rentalCategories);

(marketplace.products || []).forEach((product) =>
  addSitemapUrl("product-detail.html", "weekly", "0.68", { product: product.id }));
(marketplace.services || []).forEach((service) =>
  addSitemapUrl("service-detail.html", "weekly", "0.66", { service: service.id }));
(marketplace.packages || []).forEach((pack) =>
  addSitemapUrl("package-detail.html", "weekly", "0.66", { package: pack.id }));
(marketplace.rentals || []).forEach((rental) =>
  addSitemapUrl("rental-detail.html", "weekly", "0.66", { rental: rental.id }));

const escapeXml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...sitemapUrls.values()].map((entry) => `  <url>
    <loc>${escapeXml(entry.url)}</loc>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;
writeFileSync("dist/sitemap.xml", sitemapXml);

const robots = readFileSync("robots.txt", "utf8")
  .replace(/^Sitemap:.*$/m, `Sitemap: ${siteOrigin}/sitemap.xml`);
writeFileSync("dist/robots.txt", robots);

const optimizeFile = (file) => {
  const extension = extname(file).toLowerCase();
  if (extension === ".js" || extension === ".css") {
    const result = transformSync(readFileSync(file, "utf8"), {
      loader: extension === ".js" ? "js" : "css",
      minify: true,
      legalComments: "none",
      target: extension === ".js" ? "es2020" : undefined,
      charset: "utf8"
    });
    writeFileSync(file, result.code);
    return;
  }
  if (extension === ".json" || extension === ".webmanifest") {
    writeFileSync(file, JSON.stringify(JSON.parse(readFileSync(file, "utf8"))));
  }
};

const optimizeTree = (entry) => {
  const stats = statSync(entry);
  if (stats.isDirectory()) {
    readdirSync(entry).forEach((name) => optimizeTree(join(entry, name)));
    return;
  }
  optimizeFile(entry);
};

optimizeTree("dist/assets");

const revisionFiles = [
  ...readdirSync("dist/assets/css").filter((name) => name.endsWith(".css")).sort()
    .map((name) => `dist/assets/css/${name}`),
  ...readdirSync("dist/assets/js").filter((name) => name.endsWith(".js")).sort()
    .map((name) => `dist/assets/js/${name}`),
  ...readdirSync("dist/assets/data").sort()
    .map((name) => `dist/assets/data/${name}`)
];
const assetRevision = createHash("sha256");
revisionFiles.forEach((file) => assetRevision.update(readFileSync(file)));
const revision = assetRevision.digest("hex").slice(0, 12);

staticEntries
  .filter((entry) => entry.endsWith(".html"))
  .forEach((entry) => {
    const output = `dist/${entry}`;
    const html = readFileSync(output, "utf8").replace(
      /((?:href|src)=["'])(assets\/(?:css|js)\/[^"'?#]+\.(?:css|js))(?:\?v=[^"']*)?(["'])/g,
      `$1$2?v=${revision}$3`
    );
    writeFileSync(output, html);
  });

const serviceWorker = readFileSync("dist/service-worker.js", "utf8")
  .replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "constera-shell-${revision}";`)
  .replace(
    /"\/assets\/(css|js)\/([^"?]+)(?:\?v=[^"]*)?"/g,
    `"/assets/$1/$2?v=${revision}"`
  )
  .replace(
    "const APP_SHELL = [",
    `const APP_SHELL = [
  "/assets/js/catalog-loader.js?v=${revision}",
  "/assets/data/marketplace.data?v=${revision}",`
  );
writeFileSync("dist/service-worker.js", serviceWorker);
optimizeFile("dist/service-worker.js");

console.log(
  `ConstEra optimallaşdırılmış statik ixracı yaradıldı: ${sitemapUrls.size} sitemap URL-i, asset ${revision}.`
);
