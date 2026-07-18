import "./load-local-env.mjs";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL tapılmadı. Neon inteqrasiyasını qoş və .env.local faylını yenilə.");
  process.exit(1);
}

const sql = neon(databaseUrl);
const directory = resolve("db/migrations");
const files = readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  const source = readFileSync(resolve(directory, file), "utf8");
  const statements = source
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement && !/^(?:BEGIN|COMMIT)$/i.test(statement));
  for (const statement of statements) await sql.query(statement);
  console.log(`${file}: ${statements.length} SQL əmri tətbiq edildi.`);
}

console.log("ConstEra PostgreSQL miqrasiyaları tamamlandı.");
