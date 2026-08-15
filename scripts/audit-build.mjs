import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const root = "dist";
if (!existsSync(root)) {
  console.error("XƏTA dist qovluğu tapılmadı. Əvvəl npm run build:static işlə.");
  process.exit(1);
}

const files = [];
const walk = (entry) => {
  const stats = statSync(entry);
  if (stats.isDirectory()) {
    readdirSync(entry).forEach((name) => walk(join(entry, name)));
    return;
  }
  files.push({ file: entry, bytes: stats.size, extension: extname(entry).toLowerCase() });
};
walk(root);

const sum = (items) => items.reduce((total, item) => total + item.bytes, 0);
const totalBytes = sum(files);
const javascriptBytes = sum(files.filter((item) => item.extension === ".js"));
const cssBytes = sum(files.filter((item) => item.extension === ".css"));
const errors = [];
const assetBytes = new Map(files.map((item) => [relative(root, item.file), item.bytes]));
const assetGzipBytes = new Map(files
  .filter((item) => [".js", ".css"].includes(item.extension))
  .map((item) => [relative(root, item.file), gzipSync(readFileSync(item.file), { level: 9 }).byteLength]));
const pageUsage = [];
const forbiddenAssets = new Set([
  "AdvancedManufacturing.png",
  "Energysystems.png",
  "industrialInfrastructure.png",
  "map.png",
  "project1.png",
  "project2.png",
  "project3.png"
]);

files.forEach(({ file }) => {
  const name = file.split("/").pop();
  if (forbiddenAssets.has(name)) errors.push(`${relative(root, file)}: istifadəsiz iri PNG build-ə düşüb.`);
  if (file.endsWith(".js")) {
    const source = readFileSync(file, "utf8");
    if (/<[^>]*\sstyle\s*=/i.test(source) || /\.style\.|setAttribute\(\s*["']style["']/i.test(source)) {
      errors.push(`${relative(root, file)}: CSP-ni pozan dinamik inline stil tapıldı.`);
    }
  }
  if (file.endsWith(".html")) {
    const html = readFileSync(file, "utf8");
    const referencedBytes = (pattern, sizes = assetBytes) => {
      const paths = [...html.matchAll(pattern)].map((match) => match[1].split("?")[0].replace(/^\//, ""));
      return [...new Set(paths)].reduce((total, path) => total + Number(sizes.get(path) || 0), 0);
    };
    pageUsage.push({
      page: relative(root, file),
      javascript: referencedBytes(/src=["'](assets\/js\/[^"'?#]+\.js(?:\?[^"']*)?)["']/gi),
      css: referencedBytes(/href=["'](assets\/css\/[^"'?#]+\.css(?:\?[^"']*)?)["']/gi),
      javascriptGzip: referencedBytes(/src=["'](assets\/js\/[^"'?#]+\.js(?:\?[^"']*)?)["']/gi, assetGzipBytes),
      cssGzip: referencedBytes(/href=["'](assets\/css\/[^"'?#]+\.css(?:\?[^"']*)?)["']/gi, assetGzipBytes)
    });
    if (/fonts\.(?:googleapis|gstatic)\.com/i.test(html)) {
      errors.push(`${relative(root, file)}: xarici font bağlantısı qalıb.`);
    }
    if (/(?:href|src)=(["'])assets\/(?:css|js)\/[^"'?#]+\.(?:css|js)\1/i.test(html)) {
      errors.push(`${relative(root, file)}: JS/CSS asset versiyası yoxdur.`);
    }
  }
});

const serviceWorker = readFileSync(join(root, "service-worker.js"), "utf8");
if (!/constera-shell-[a-f0-9]{12}/i.test(serviceWorker)) {
  errors.push("service-worker.js: cache adı build hash-i daşımır.");
}
if (/["']\/assets\/(?:css|js)\/[^"'?]+\.(?:css|js)["']/i.test(serviceWorker)) {
  errors.push("service-worker.js: app shell asset versiyası yoxdur.");
}

const heaviestJavascriptPage = [...pageUsage].sort((left, right) => right.javascript - left.javascript)[0];
const heaviestCssPage = [...pageUsage].sort((left, right) => right.css - left.css)[0];
const supplierPortalUsage = pageUsage.find((item) => item.page === "supplier-portal.html");
const customerCabinetUsage = pageUsage.find((item) => item.page === "customer-cabinet.html");
// Route-spesifik kabinetlər və həyat dövrü mərkəzi ümumi paketi artırır; aşağıdakı səhifə və gzip limitləri sərt qalır.
if (totalBytes > 3_100_000) errors.push(`Build ölçüsü limitdən böyükdür: ${totalBytes} bayt.`);
if (javascriptBytes > 625_000) errors.push(`Ümumi JavaScript ölçüsü limitdən böyükdür: ${javascriptBytes} bayt.`);
if (cssBytes > 91_000) errors.push(`Ümumi CSS ölçüsü limitdən böyükdür: ${cssBytes} bayt.`);
if (heaviestJavascriptPage?.javascript > 475_000) {
  errors.push(`${heaviestJavascriptPage.page} JavaScript büdcəsini keçib: ${heaviestJavascriptPage.javascript} bayt.`);
}
if (heaviestCssPage?.css > 75_500) {
  errors.push(`${heaviestCssPage.page} CSS büdcəsini keçib: ${heaviestCssPage.css} bayt.`);
}
if (heaviestJavascriptPage?.javascriptGzip > 140_000) {
  errors.push(`${heaviestJavascriptPage.page} sıxılmış JavaScript büdcəsini keçib: ${heaviestJavascriptPage.javascriptGzip} bayt.`);
}
if (heaviestCssPage?.cssGzip > 20_000) {
  errors.push(`${heaviestCssPage.page} sıxılmış CSS büdcəsini keçib: ${heaviestCssPage.cssGzip} bayt.`);
}
if (!assetBytes.has("assets/js/supplier-portal-page.js")) {
  errors.push("supplier-portal-page.js: təchizatçı kabinetinin ayrılmış bundle faylı yaradılmayıb.");
}
if (!assetBytes.has("assets/data/supplier-marketplace.data")) {
  errors.push("supplier-marketplace.data: təchizatçı kabinetinin yüngül məlumat profili yaradılmayıb.");
}
if (!assetBytes.has("assets/js/customer-cabinet-page.js")) {
  errors.push("customer-cabinet-page.js: müştəri kabinetinin ayrılmış bundle faylı yaradılmayıb.");
}
if (supplierPortalUsage?.javascript > 125_000) {
  errors.push(`supplier-portal.html JavaScript büdcəsini keçib: ${supplierPortalUsage.javascript} bayt.`);
}
if (supplierPortalUsage?.javascriptGzip > 40_000) {
  errors.push(`supplier-portal.html sıxılmış JavaScript büdcəsini keçib: ${supplierPortalUsage.javascriptGzip} bayt.`);
}
if (Number(assetBytes.get("assets/data/supplier-marketplace.data") || 0) > 20_000) {
  errors.push("supplier-marketplace.data yüngül məlumat büdcəsini keçib.");
}
if (customerCabinetUsage?.javascript > 150_000) {
  errors.push(`customer-cabinet.html JavaScript büdcəsini keçib: ${customerCabinetUsage.javascript} bayt.`);
}
if (customerCabinetUsage?.javascriptGzip > 50_000) {
  errors.push(`customer-cabinet.html sıxılmış JavaScript büdcəsini keçib: ${customerCabinetUsage.javascriptGzip} bayt.`);
}

console.log(
  `Build auditi: ${(totalBytes / 1024).toFixed(1)} KiB ümumi, ` +
  `${(javascriptBytes / 1024).toFixed(1)} KiB JS, ${(cssBytes / 1024).toFixed(1)} KiB CSS.`
);
console.log(
  `Ən ağır səhifə resursu: ${heaviestJavascriptPage?.page || "-"} ` +
  `${((heaviestJavascriptPage?.javascript || 0) / 1024).toFixed(1)} KiB JS ` +
  `(${((heaviestJavascriptPage?.javascriptGzip || 0) / 1024).toFixed(1)} KiB gzip); ` +
  `${heaviestCssPage?.page || "-"} ${((heaviestCssPage?.css || 0) / 1024).toFixed(1)} KiB CSS ` +
  `(${((heaviestCssPage?.cssGzip || 0) / 1024).toFixed(1)} KiB gzip).`
);
errors.forEach((error) => console.error(`XƏTA ${error}`));
if (errors.length) process.exit(1);
console.log("Build ölçü və resurs auditi uğurla tamamlandı.");
