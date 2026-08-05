import { runProductionMonitor } from "../api/_lib/production-monitor.js";

const configuredOrigin = process.argv[2] || process.env.APP_ORIGIN || "https://constera.az";
try {
  const result = await runProductionMonitor({
    origin: configuredOrigin
  });
  for (const check of result.checks) {
    console.log(`OK ${check.path} HTTP ${check.status} · ${check.durationMs} ms`);
  }
  console.log(`ConstEra production monitorinqi uğurla tamamlandı: ${result.count} yoxlama.`);
} catch (error) {
  const details = String(error?.message || error);
  const code = error?.cause?.code || "";
  const host = error?.cause?.hostname || "";
  console.error("Production monitorinqi uğursuz oldu:");
  console.error(details);
  if (code === "ENOTFOUND" || host || details.includes("ENOTFOUND")) {
    console.error(`Yoxlama domen problemi: ${host || "doman tapılmadı"} DNS cavabı alınmadı.`);
    console.error("Qısa düzəliş: APP_ORIGIN=https://constera.az və ya sizin deployment URL-i ilə yoxla.");
    console.error("Məsləhət: əvvəlcə lokal yoxlama üçün APP_ORIGIN və PRD_SKIP_WWW_REDIRECT=1 istifadə edə bilərsən.");
  }
  process.exitCode = 1;
}
