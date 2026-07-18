import { accessSync, constants, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { renderSitePage, siteShellTemplateFiles } from "./site-shell.mjs";

const requiredFiles = [
  "index.html",
  "catalog.html",
  "category.html",
  "subcategory.html",
  "product-detail.html",
  "services.html",
  "service-detail.html",
  "packages.html",
  "package-detail.html",
  "rental.html",
  "rental-detail.html",
  "brands.html",
  "suppliers.html",
  "supplier-portal.html",
  "price-import.html",
  "customer-cabinet.html",
  "checkout.html",
  "rfq.html",
  "rfq-dashboard.html",
  "tender.html",
  "ai-smeta.html",
  "admin.html",
  "login.html",
  "assets/css/styles.css",
  "assets/js/script.js",
  "assets/js/catalog-data.js",
  "assets/js/taxonomy-expansion.js",
  "assets/js/azerbaijan-real-products.js",
  "assets/js/production.js",
  "assets/js/admin-v2.js",
  "assets/js/marketplace.js",
  "service-worker.js",
  "scripts/site-shell.mjs",
  ...siteShellTemplateFiles
];

const staticEntries = [
  "index.html",
  "catalog.html",
  "category.html",
  "subcategory.html",
  "product-detail.html",
  "services.html",
  "service-detail.html",
  "packages.html",
  "package-detail.html",
  "rental.html",
  "rental-detail.html",
  "brands.html",
  "suppliers.html",
  "supplier-portal.html",
  "price-import.html",
  "customer-cabinet.html",
  "checkout.html",
  "rfq.html",
  "rfq-dashboard.html",
  "tender.html",
  "ai-smeta.html",
  "admin.html",
  "login.html",
  "assets",
  "docs",
  "robots.txt",
  "sitemap.xml",
  "service-worker.js"
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

staticEntries
  .filter((entry) => entry.endsWith(".html"))
  .forEach((entry) => {
    const rendered = renderSitePage(readFileSync(entry, "utf8"), { file: entry });
    writeFileSync(`dist/${entry}`, rendered);
  });

[
  "AdvancedManufacturing.png",
  "Energysystems.png",
  "industrialInfrastructure.png",
  "map.png",
  "project1.png",
  "project2.png",
  "project3.png"
].forEach((file) => rmSync(`dist/assets/images/${file}`, { force: true }));

const siteOrigin = "https://constera.az";
const dataContext = { window: {}, console };
vm.createContext(dataContext);
[
  "assets/js/catalog-data.js",
  "assets/js/taxonomy-expansion.js",
  "assets/js/azerbaijan-real-products.js"
].forEach((file) => vm.runInContext(readFileSync(file, "utf8"), dataContext, { filename: file }));

const marketplace = dataContext.window.CONSTERA_MARKETPLACE;
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
  ["rental.html", "weekly", "0.85"],
  ["brands.html", "weekly", "0.8"],
  ["suppliers.html", "weekly", "0.8"],
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

console.log(`ConstEra statik ixracı dist qovluğunda yaradıldı: ${sitemapUrls.size} sitemap URL-i.`);
