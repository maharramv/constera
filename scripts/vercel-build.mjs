import { accessSync, constants, cpSync, mkdirSync, rmSync } from "node:fs";

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
  "rfq.html",
  "rfq-dashboard.html",
  "admin.html",
  "assets/css/styles.css",
  "assets/js/script.js",
  "assets/js/catalog-data.js",
  "assets/js/taxonomy-expansion.js",
  "assets/js/azerbaijan-real-products.js",
  "assets/js/marketplace.js"
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
  "rfq.html",
  "rfq-dashboard.html",
  "admin.html",
  "assets",
  "docs",
  "robots.txt",
  "sitemap.xml"
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
    // Könüllü fayllar statik exportu dayandırmadan buraxıla bilər.
  }
});

console.log("ConstEra statik exportu dist qovluğunda yaradıldı.");
