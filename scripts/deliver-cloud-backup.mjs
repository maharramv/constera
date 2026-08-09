import "./load-local-env.mjs";
import { deliverScheduledBackup } from "../api/_lib/cloud-backup.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const result = await deliverScheduledBackup();
console.log("ConstEra özəl backup göndərişi tamamlandı:");
console.log(`- status: ${result.status}`);
if (result.backupId) console.log(`- backup: ${result.backupId}`);
if (result.channel) console.log(`- kanal: ${result.channel}`);
if (result.pathname) console.log(`- yol: ${result.pathname}`);
if (result.compressedBytes) console.log(`- gzip: ${result.compressedBytes} bayt`);
if (result.reason) console.log(`- səbəb: ${result.reason}`);

if (result.status !== "sent") process.exit(1);
