import "./load-local-env.mjs";
import {
  previewCatalogRemediation,
  remediateCatalogIssues
} from "../api/_lib/catalog-quality.js";
import { query } from "../api/_lib/db.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const safeIssueTypes = new Set([
  "invalid_image_url",
  "broken_image_url",
  "invalid_image_content",
  "invalid_source_url",
  "broken_source_url",
  "stale_price",
  "expired_price",
  "invalid_offer_price",
  "offer_stale_price"
]);
const issueArguments = process.argv
  .filter((argument) => argument.startsWith("--issue="))
  .map((argument) => argument.slice("--issue=".length).trim())
  .filter(Boolean);
const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
const onlyTypes = String(onlyArgument?.slice("--only=".length) || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (onlyTypes.some((type) => !safeIssueTypes.has(type))) {
  console.error("--only yalnız təhlükəsiz sahə düzəlişi tiplərini qəbul edir.");
  process.exit(1);
}
const filteredRows = onlyTypes.length
  ? await query(
    `SELECT id FROM catalog_quality_issues
      WHERE status = 'open' AND issue_type = ANY($1::text[])
      ORDER BY first_seen_at
      LIMIT 500`,
    [onlyTypes]
  )
  : [];
const issueIds = [...new Set([...issueArguments, ...filteredRows.map((row) => row.id)])];
const allRequested = process.argv.includes("--all");
const commit = process.argv.includes("--commit");
const hasExplicitSelection = issueArguments.length > 0 || onlyTypes.length > 0;
const emptyPreview = {
  selectedIssues: 0,
  quarantineProducts: 0,
  duplicateProducts: 0,
  safeFieldFixes: 0,
  manualIssues: 0
};
const preview = !allRequested && hasExplicitSelection && issueIds.length === 0
  ? emptyPreview
  : await previewCatalogRemediation(allRequested ? [] : issueIds);
console.log("Kataloq düzəlişi ön baxışı:");
Object.entries(preview).forEach(([key, value]) => console.log(`- ${key}: ${value}`));

if (!commit) {
  console.log("Dəyişiklik edilmədi. Təsdiqli icra üçün --commit əlavə et.");
  process.exit(0);
}
if (!allRequested && !issueIds.length) {
  console.error("Filtrsiz düzəliş bloklandı. --issue, təhlükəsiz --only və ya açıq --all seçimi tələb olunur.");
  process.exit(1);
}

const result = await remediateCatalogIssues({ issueIds: allRequested ? [] : issueIds });
console.log("Kataloq düzəlişi tamamlandı:");
Object.entries(result)
  .filter(([key]) => key !== "scan")
  .forEach(([key, value]) => console.log(`- ${key}: ${value}`));
