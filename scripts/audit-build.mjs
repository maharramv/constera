import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

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
  if (file.endsWith(".html")) {
    const html = readFileSync(file, "utf8");
    const referencedBytes = (pattern) => {
      const paths = [...html.matchAll(pattern)].map((match) => match[1].split("?")[0].replace(/^\//, ""));
      return [...new Set(paths)].reduce((total, path) => total + Number(assetBytes.get(path) || 0), 0);
    };
    pageUsage.push({
      page: relative(root, file),
      javascript: referencedBytes(/src=["'](assets\/js\/[^"'?#]+\.js(?:\?[^"']*)?)["']/gi),
      css: referencedBytes(/href=["'](assets\/css\/[^"'?#]+\.css(?:\?[^"']*)?)["']/gi)
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
if (totalBytes > 3_000_000) errors.push(`Build ölçüsü limitdən böyükdür: ${totalBytes} bayt.`);
if (javascriptBytes > 500_000) errors.push(`Ümumi JavaScript ölçüsü limitdən böyükdür: ${javascriptBytes} bayt.`);
if (cssBytes > 80_000) errors.push(`Ümumi CSS ölçüsü limitdən böyükdür: ${cssBytes} bayt.`);
if (heaviestJavascriptPage?.javascript > 455_000) {
  errors.push(`${heaviestJavascriptPage.page} JavaScript büdcəsini keçib: ${heaviestJavascriptPage.javascript} bayt.`);
}
if (heaviestCssPage?.css > 72_000) {
  errors.push(`${heaviestCssPage.page} CSS büdcəsini keçib: ${heaviestCssPage.css} bayt.`);
}

console.log(
  `Build auditi: ${(totalBytes / 1024).toFixed(1)} KiB ümumi, ` +
  `${(javascriptBytes / 1024).toFixed(1)} KiB JS, ${(cssBytes / 1024).toFixed(1)} KiB CSS.`
);
console.log(
  `Ən ağır səhifə resursu: ${heaviestJavascriptPage?.page || "-"} ` +
  `${((heaviestJavascriptPage?.javascript || 0) / 1024).toFixed(1)} KiB JS; ` +
  `${heaviestCssPage?.page || "-"} ${((heaviestCssPage?.css || 0) / 1024).toFixed(1)} KiB CSS.`
);
errors.forEach((error) => console.error(`XƏTA ${error}`));
if (errors.length) process.exit(1);
console.log("Build ölçü və resurs auditi uğurla tamamlandı.");
