import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "./load-local-env.mjs";
import { loadLaunchCenter } from "../api/_admin/launch-center.js";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((item) => item.startsWith("--") && !item.includes("=")));
const optionValue = (name, fallback = null) => {
  const withEquals = argv.find((item) => item.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1);
  const idx = argv.indexOf(name);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("--")) {
    return argv[idx + 1];
  }
  return fallback;
};

const shouldWriteJson = flags.has("--json") || flags.has("--write") || flags.has("--artifact");
const isOfflineMode = flags.has("--offline") || flags.has("--skip-db") || flags.has("--no-db");
const writeEvidenceDir = flags.has("--artifact")
  ? optionValue(
      "--artifact-dir",
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "outputs")
    )
  : null;

const parsedMinScore = optionValue("--min-score", "85");
const minScore = Number.isFinite(Number(parsedMinScore))
  ? Math.max(0, Math.min(100, Number(parsedMinScore)))
  : 85;
const requireReady = flags.has("--require-ready") || flags.has("--go-live");

const print = (message, ...args) => console.log(message, ...args);

const statusBadge = {
  ready: "✅",
  attention: "⚠️",
  blocked: "⛔"
};

const flattenChecks = (readiness) => readiness.sections.flatMap((section) => section.items);

const formatSectionSummary = (section) => {
  const blockers = section.items.filter((item) => item.required && !item.ready).length;
  return `${section.label}: ${section.ready}/${section.total} hazır, bloklayıcı ${blockers}`;
};

const buildReport = (payload) => {
  const checklist = flattenChecks(payload.readiness);
  const blockers = checklist.filter((item) => item.required && !item.ready);
  const warnings = checklist.filter((item) => !item.required && !item.ready);

  const lines = [];
  lines.push("ConstEra launch readiness hesabatı");
  lines.push(`Yekun: ${statusBadge[payload.readiness.status]} ${payload.readiness.status.toUpperCase()} · Qorunma: ${payload.readiness.score}%`);
  lines.push(`Bloklayıcı: ${payload.readiness.blockerCount} · Xəbərdarlıq: ${payload.readiness.warningCount}`);
  lines.push(`Metriklər: real məhsul ${payload.metrics.realProducts || 0}, namizəd pilot ${payload.readiness.status === "ready" ? "var" : "yox"}`);
  lines.push("");
  lines.push("BÖLMƏLƏR");
  for (const section of payload.readiness.sections) {
    lines.push(`- ${formatSectionSummary(section)}`);
  }
  if (blockers.length) {
    lines.push("");
    lines.push("Bloklayıcılar:");
    for (const item of blockers) {
      lines.push(`- ${item.label}: ${item.detail}`);
      if (item.action) lines.push(`  → ${item.action}`);
    }
  }
  if (warnings.length) {
    lines.push("");
    lines.push("Xəbərdarlıqlar:");
    for (const item of warnings) {
      lines.push(`- ${item.label}: ${item.detail}`);
      if (item.action) lines.push(`  → ${item.action}`);
    }
  }

  lines.push("");
  lines.push("Pilot namizədi:");
  lines.push(payload.readiness.sections
    .flatMap((section) => section.items)
    .find((item) => item.key === "pilot_candidate")?.detail || "məlumat yoxdur");

  return {
    summaryText: lines.join("\n"),
    blockers,
    warnings,
    checks: checklist,
  };
};

const csvEscape = (value) => {
  const escaped = String(value ?? "");
  if (/[\";,\n\r]/.test(escaped)) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
};

const writeStepSummary = async (readinessOutput) => {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath || !readinessOutput) return;

  const blockerLines = readinessOutput.blockers.length
    ? readinessOutput.blockers.map((item) => `- **${item.label}**${item.action ? ` — ${item.action}` : ""}`)
    : ["- Yoxdur"];
  const warningLines = readinessOutput.warnings.length
    ? readinessOutput.warnings.map((item) => `- **${item.label}**${item.action ? ` — ${item.action}` : ""}`)
    : ["- Yoxdur"];

  const sectionSummary = [];
  const sectionMap = {};
  for (const item of readinessOutput.checks) {
    const section = item.section || "Bölmə";
    sectionMap[section] ||= { label: section, total: 0, ready: 0, blockers: 0 };
    sectionMap[section].total += 1;
    if (item.ready) sectionMap[section].ready += 1;
    if (item.required && !item.ready) sectionMap[section].blockers += 1;
  }
  for (const section of Object.values(sectionMap)) {
    sectionSummary.push(`- ${section.label}: ${section.ready}/${section.total} hazır, bloklayıcı ${section.blockers}`);
  }

  const lines = [];
  lines.push("## ConstEra launch readiness");
  lines.push("");
  lines.push(`- Vəziyyət: ${readinessOutput.status.toUpperCase()} (${readinessOutput.score}%)`);
  lines.push(`- Bloklayıcı: ${readinessOutput.blockerCount}`);
  lines.push(`- Xəbərdarlıq: ${readinessOutput.warningCount}`);
  lines.push("");
  lines.push("### Bölmələr");
  lines.push(...sectionSummary);
  lines.push("");
  lines.push("### Bloklayıcılar");
  lines.push(...blockerLines);
  lines.push("");
  lines.push("### Xəbərdarlıqlar");
  lines.push(...warningLines);
  lines.push("");

  await fs.appendFile(summaryPath, `${lines.join("\n")}\n`, "utf8");
};

const exportCsv = async (payload, filePath) => {
  const rows = [];
  rows.push(["section", "key", "label", "ready", "required", "target", "detail", "action"].join(","));
  for (const section of payload.readiness.sections) {
    for (const item of section.items) {
      rows.push([
        section.label,
        item.key,
        item.label,
        item.ready ? "YES" : "NO",
        item.required ? "YES" : "NO",
        item.target || "",
        item.detail || "",
        item.action || ""
      ].map(csvEscape).join(","));
    }
  }
  await fs.writeFile(filePath, `${rows.join("\n")}\n`, "utf8");
};

const buildDbFailurePayload = (details) => ({
  generatedAt: new Date().toISOString(),
  readiness: {
    status: "attention",
    score: 0,
    blockerCount: 1,
    warningCount: 0,
    sections: [
      {
        key: "connectivity",
        label: "Baza əlaqəsi",
        ready: 0,
        total: 1,
        blockers: 1,
        items: [
          {
            key: "database_connectivity",
            label: "Məlumat bazası bağlantısı",
            detail: `Verilənlər bazası cavab vermir: ${details}`,
            ready: false,
            required: true,
            target: "infra",
            action: "DATABASE_URL/POSTGRES_URL və şəbəkə konfiqurasiyasını yoxla"
          }
        ]
      }
    ]
  },
  metrics: { realProducts: 0 },
  providers: {},
  monitoring: {},
  backup: {}
});

let payload;
try {
  payload = await loadLaunchCenter();
} catch (error) {
  const details = String(error?.message || error);
  const dbCode = error?.cause?.code || error?.code || "";
  const host = error?.cause?.hostname || "";
  if (isOfflineMode) {
    if (dbCode === "ENOTFOUND" || host || details.includes("ENOTFOUND")) {
      console.warn(`Neon hostu DNS cavabı almır${host ? `: ${host}` : ""}.`);
    }
    if (dbCode === "ECONNREFUSED" || details.includes("fetch failed")) {
      console.warn("DB hostuna bağlantı rədd edildi və ya host əlçatmazdır.");
    }
    console.warn("Buraxılış auditində DB bağlantısı uğursuz oldu — offline rejimdə davam edilir.");
    payload = buildDbFailurePayload(details.slice(0, 220));
  } else {
  console.error("Buraxılış hazırki vəziyyəti yüklənmədi:");
  console.error(details);
  if (dbCode === "ENOTFOUND" || host || details.includes("ENOTFOUND")) {
    console.error(`Neon hostunda DNS problemi görünür${host ? `: ${host}` : ": DNS cavabı alınmır"}.`);
    console.error("Məsləhət: DATABASE_URL və ya POSTGRES_URL dəyərlərini lokalda yoxla və VPN/şəbəkə əlaqəsini təsdiqlə.");
  }
  if (dbCode === "ECONNREFUSED" || details.includes("fetch failed")) {
    console.error("Veritabanı hostuna əlaqə rədd edildi. Connection string və şəbəkə qaydalarını yoxla.");
    console.error("Əgər lokal testdirsə, VPN-in aktiv olub-olmadığını və DATABASE_URL/POSTGRES_URL formatını təsdiqlə.");
  }
  process.exitCode = 1;
  process.exit(1);
  }
}

const launchReport = buildReport(payload);

print(launchReport.summaryText);

if (shouldWriteJson) {
  const outputDir = writeEvidenceDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "outputs");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "_").slice(0, 19);
  const jsonPath = path.join(outputDir, `launch-readiness-${timestamp}.json`);
  const csvPath = path.join(outputDir, `launch-readiness-${timestamp}.csv`);

  const evidence = {
    generatedAt: payload.generatedAt || new Date().toISOString(),
    readiness: payload.readiness,
    metrics: payload.metrics,
    providers: payload.providers,
    monitoring: payload.monitoring,
    backup: payload.backup,
    blockers: launchReport.blockers,
    warnings: launchReport.warnings,
    checklist: launchReport.checks
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await exportCsv(payload, csvPath);

  print(`\nNəticələr saxlanıldı:\n- ${jsonPath}\n- ${csvPath}`);
}

const stepSummary = {
  status: payload.readiness.status,
  score: payload.readiness.score,
  blockerCount: payload.readiness.blockerCount,
  warningCount: payload.readiness.warningCount,
  checks: payload.readiness.sections.flatMap((section) => {
    return section.items.map((item) => ({ ...item, section: section.label }));
  }),
  blockers: launchReport.blockers,
  warnings: launchReport.warnings
};

await writeStepSummary(stepSummary);

if (requireReady && payload.readiness.status !== "ready") {
  console.error("Buraxılış üçün tələblər hazır deyil.");
  process.exitCode = 1;
}

if (!isOfflineMode && minScore !== null && payload.readiness.score < minScore) {
  console.error(`Buraxılış hazırlıq skoru minimum tələbi (${minScore}%) ödəməyir: ${payload.readiness.score}%`);
  process.exitCode = 1;
}
