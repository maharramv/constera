import { runProductionMonitor } from "../api/_lib/production-monitor.js";

const result = await runProductionMonitor({
  origin: process.argv[2] || process.env.APP_ORIGIN || "https://constera.az"
});

for (const check of result.checks) {
  console.log(`OK ${check.path} HTTP ${check.status} · ${check.durationMs} ms`);
}
console.log(`ConstEra production monitorinqi uğurla tamamlandı: ${result.count} yoxlama.`);
