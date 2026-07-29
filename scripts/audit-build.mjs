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

if (totalBytes > 3_000_000) errors.push(`Build ölçüsü limitdən böyükdür: ${totalBytes} bayt.`);
if (javascriptBytes > 450_000) errors.push(`JavaScript ölçüsü limitdən böyükdür: ${javascriptBytes} bayt.`);
if (cssBytes > 70_000) errors.push(`CSS ölçüsü limitdən böyükdür: ${cssBytes} bayt.`);

console.log(
  `Build auditi: ${(totalBytes / 1024).toFixed(1)} KiB ümumi, ` +
  `${(javascriptBytes / 1024).toFixed(1)} KiB JS, ${(cssBytes / 1024).toFixed(1)} KiB CSS.`
);
errors.forEach((error) => console.error(`XƏTA ${error}`));
if (errors.length) process.exit(1);
console.log("Build ölçü və resurs auditi uğurla tamamlandı.");
