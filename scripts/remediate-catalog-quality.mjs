import "./load-local-env.mjs";
import {
  previewCatalogRemediation,
  remediateCatalogIssues
} from "../api/_lib/catalog-quality.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const preview = await previewCatalogRemediation();
console.log("Kataloq düzəlişi ön baxışı:");
Object.entries(preview).forEach(([key, value]) => console.log(`- ${key}: ${value}`));

const result = await remediateCatalogIssues();
console.log("Kataloq düzəlişi tamamlandı:");
Object.entries(result)
  .filter(([key]) => key !== "scan")
  .forEach(([key, value]) => console.log(`- ${key}: ${value}`));
