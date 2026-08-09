import "./load-local-env.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeCatalogAttributes,
  previewCatalogAttributeNormalization
} from "../api/_lib/catalog-quality.js";
import { recordAudit } from "../api/_lib/db.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const numericArgument = (name, fallback) => {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  return Number(argument?.slice(name.length + 3)) || fallback;
};
const csvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const limit = Math.max(1, Math.min(numericArgument("limit", 200), 500));
const minTechnicalAttributes = Math.max(1, Math.min(numericArgument("min-technical", 2), 12));
const commit = process.argv.includes("--commit");
const outputDirectory = path.resolve(process.cwd(), "outputs");

const preview = await previewCatalogAttributeNormalization({ limit, minTechnicalAttributes, sampleLimit: 100 });
console.log("Kataloq atributları üçün ön baxış:");
Object.entries(preview)
  .filter(([key]) => key !== "sample")
  .forEach(([key, value]) => console.log(`- ${key}: ${value}`));

await mkdir(outputDirectory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const baseName = `catalog-attribute-preview-${stamp}`;
await writeFile(
  path.join(outputDirectory, `${baseName}.json`),
  `${JSON.stringify(preview, null, 2)}\n`,
  "utf8"
);
const csvRows = [
  ["product_id", "product_name", "current_count", "attribute_count", "technical_count", "attributes"],
  ...preview.sample.map((item) => [
    item.id,
    item.name,
    item.currentCount,
    item.attributeCount,
    item.technicalCount,
    item.attributes.map(({ label, value }) => `${label}: ${value}`).join(" | ")
  ])
].map((row) => row.map(csvValue).join(",")).join("\n");
await writeFile(path.join(outputDirectory, `${baseName}.csv`), `${csvRows}\n`, "utf8");
console.log(`Hesabat: outputs/${baseName}.json`);

if (!commit) {
  console.log("Dəyişiklik edilmədi. Təhlükəsiz tətbiq üçün --commit əlavə et.");
  process.exit(0);
}

const result = await normalizeCatalogAttributes({ limit, minTechnicalAttributes });
await recordAudit({
  action: "normalize_attributes_v2_cli",
  entityType: "catalog_quality",
  entityId: result.batchId || null,
  details: result
});
console.log("Kataloq atributlarının standartlaşdırılması tamamlandı:");
Object.entries(result).forEach(([key, value]) => console.log(`- ${key}: ${Array.isArray(value) ? value.join(", ") : value}`));
