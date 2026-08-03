import "./load-local-env.mjs";
import { verifyCloudBackup } from "../api/_lib/cloud-backup.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const result = await verifyCloudBackup();
console.log("ConstEra backup bütövlüyü yoxlanıldı:");
console.log(`- status: ${result.status}`);
console.log(`- versiya: ${result.version}`);
console.log(`- migration: ${result.schemaMigrations}`);
console.log(`- kolleksiya: ${result.tableCount}`);
console.log(`- qeyd: ${result.recordCount}`);
console.log(`- SHA-256: ${result.checksum}`);

if (result.status !== "verified") process.exit(1);
