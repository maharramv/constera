import "./load-local-env.mjs";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { syncMarketplaceData } from "../api/sync.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Əvvəl Neon inteqrasiyasını qoş.");
  process.exit(1);
}

const context = { window: {}, console };
vm.createContext(context);
for (const file of [
  "assets/js/catalog-data.js",
  "assets/js/taxonomy-expansion.js",
  "assets/js/azerbaijan-real-products.js"
]) {
  vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
}

const result = await syncMarketplaceData(context.window.CONSTERA_MARKETPLACE);
console.log("ConstEra kataloqu PostgreSQL bazasına yazıldı:");
Object.entries(result).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
