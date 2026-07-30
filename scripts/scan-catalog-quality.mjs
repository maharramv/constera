import "./load-local-env.mjs";
import { runCatalogQualityScan } from "../api/_lib/catalog-quality.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const result = await runCatalogQualityScan({
  probeLinks: process.argv.includes("--probe-links"),
  linkLimit: 20
});

console.log("Kataloq keyfiyyət skanı tamamlandı:");
Object.entries(result).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
