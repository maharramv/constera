import "./load-local-env.mjs";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { query } from "../api/_lib/db.js";
import { normalizeScraperCatalog, scraperItemId, scraperRunId } from "./lib/scraper-catalog.mjs";

const args = process.argv.slice(2);
const fileFlag = args.findIndex((arg) => arg === "--file");
const filename = resolve(
  fileFlag >= 0 && args[fileFlag + 1]
    ? args[fileFlag + 1]
    : "tools/catalog-scraper/data/output/constera-master-catalog.json"
);

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon inteqrasiyasını qoş və .env.local faylını yenilə.");
  process.exit(1);
}
if (!existsSync(filename)) {
  console.error(`Scraper çıxışı tapılmadı: ${filename}`);
  process.exit(1);
}

const source = readFileSync(filename);
const sourceHash = createHash("sha256").update(source).digest("hex");
const payload = JSON.parse(source.toString("utf8"));
const normalized = normalizeScraperCatalog(payload);
const runId = scraperRunId(sourceHash);
const sourceFile = basename(filename);
const errorReport = [
  ...normalized.rejected,
  ...normalized.records
    .filter((record) => record.validationErrors.length)
    .map((record) => ({ id: record.item.id, errors: record.validationErrors }))
].slice(0, 1_000);

await query(
  `INSERT INTO catalog_import_runs (
     id, source_file, source_hash, schema_version, status, total_items,
     valid_items, rejected_items, duplicate_items, counts, error_report, updated_at
   ) VALUES ($1, $2, $3, $4, 'staging', $5, $6, $7, $8, $9::jsonb, $10::jsonb, now())
   ON CONFLICT (id) DO UPDATE SET
     source_file = EXCLUDED.source_file, source_hash = EXCLUDED.source_hash,
     schema_version = EXCLUDED.schema_version,
     status = CASE
       WHEN catalog_import_runs.status = 'reviewed' THEN 'reviewed'
       ELSE 'staging'
     END,
     total_items = EXCLUDED.total_items, valid_items = EXCLUDED.valid_items,
     rejected_items = EXCLUDED.rejected_items, duplicate_items = EXCLUDED.duplicate_items,
     counts = EXCLUDED.counts, error_report = EXCLUDED.error_report,
     updated_at = now(),
     completed_at = CASE
       WHEN catalog_import_runs.status = 'reviewed' THEN catalog_import_runs.completed_at
       ELSE NULL
     END`,
  [
    runId,
    sourceFile,
    sourceHash,
    String(payload.schema_version),
    payload.items.length,
    normalized.records.length,
    normalized.rejected.length,
    normalized.duplicates.length,
    JSON.stringify(normalized.counts),
    JSON.stringify(errorReport)
  ]
);

if (normalized.records.length) {
  const rows = normalized.records.map((record) => ({
    id: scraperItemId(runId, record),
    runId,
    itemKind: record.item.kind,
    sourceId: record.item.source_id,
    sourceItemId: record.item.id,
    sourceUrl: record.sourceUrl,
    dedupeKey: record.dedupeKey,
    contentHash: record.contentHash,
    payload: record.item,
    validationErrors: record.validationErrors,
    verifiedAt: record.item.verified_at
  }));
  await query(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
         id text, "runId" text, "itemKind" text, "sourceId" text,
         "sourceItemId" text, "sourceUrl" text, "dedupeKey" text,
         "contentHash" text, payload jsonb, "validationErrors" jsonb,
         "verifiedAt" timestamptz
       )
     )
     INSERT INTO catalog_import_items (
       id, run_id, item_kind, source_id, source_item_id, source_url,
       dedupe_key, content_hash, payload, review_status,
       validation_errors, verified_at, updated_at
     )
     SELECT id, "runId", "itemKind", "sourceId", "sourceItemId", "sourceUrl",
            "dedupeKey", "contentHash", payload, 'pending',
            "validationErrors", "verifiedAt", now()
       FROM incoming
     ON CONFLICT (id) DO UPDATE SET
       item_kind = EXCLUDED.item_kind,
       source_id = EXCLUDED.source_id,
       source_item_id = EXCLUDED.source_item_id,
       source_url = EXCLUDED.source_url,
       dedupe_key = EXCLUDED.dedupe_key,
       content_hash = EXCLUDED.content_hash,
       payload = EXCLUDED.payload,
       validation_errors = EXCLUDED.validation_errors,
       verified_at = EXCLUDED.verified_at,
       updated_at = now()
     WHERE catalog_import_items.review_status = 'pending'`,
    [JSON.stringify(rows)]
  );
}

await query(
  `UPDATE catalog_import_runs r
      SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM catalog_import_items i
           WHERE i.run_id = r.id AND i.review_status = 'pending'
        ) THEN 'staged'
        ELSE 'reviewed'
      END,
      completed_at = now(),
      updated_at = now()
    WHERE id = $1`,
  [runId]
);

console.log("Toplanmış kataloq yoxlama bazasına yazıldı:");
console.log(`- run: ${runId}`);
console.log(`- giriş: ${payload.items.length}`);
console.log(`- staging: ${normalized.records.length}`);
console.log(`- təkrar: ${normalized.duplicates.length}`);
console.log(`- rədd: ${normalized.rejected.length}`);
Object.entries(normalized.counts).forEach(([kind, count]) => console.log(`- ${kind}: ${count}`));
