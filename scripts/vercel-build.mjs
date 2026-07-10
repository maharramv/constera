import { accessSync, constants } from "node:fs";

const requiredFiles = [
  "index.html",
  "catalog.html",
  "brands.html",
  "suppliers.html",
  "rfq.html",
  "admin.html",
  "assets/css/styles.css",
  "assets/js/script.js",
  "assets/js/catalog-data.js",
  "assets/js/marketplace.js"
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
  console.error("ConstEra static build check failed. Missing files:");
  missingFiles.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log("ConstEra static build check passed. No build output step is required.");
