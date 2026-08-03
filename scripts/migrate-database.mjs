import "./load-local-env.mjs";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL tapılmadı. Neon inteqrasiyasını qoş və .env.local faylını yenilə.");
  process.exit(1);
}

const args = process.argv.slice(2);
const option = (name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || "") : "";
};
const only = option("--only");
const baselineThrough = option("--baseline-through");
const confirmExistingSchema = args.includes("--confirm-existing-schema");
const dryRun = args.includes("--dry-run");

const directory = resolve("db/migrations");
const files = readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
const migrations = files.map((file) => {
  const source = readFileSync(resolve(directory, file), "utf8");
  return {
    file,
    checksum: createHash("sha256").update(source).digest("hex"),
    statements: source
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter((statement) => statement && !/^(?:BEGIN|COMMIT)$/i.test(statement))
  };
});

const findMigration = (file, label) => {
  const migration = migrations.find((item) => item.file === file);
  if (!migration) {
    console.error(`${label} tapılmadı: ${file || "boş dəyər"}.`);
    process.exit(1);
  }
  return migration;
};

if (only) findMigration(only, "Seçilmiş miqrasiya");
if (baselineThrough) findMigration(baselineThrough, "Baseline miqrasiyası");

const sql = neon(databaseUrl);
const [databaseState] = await sql.query(`
  SELECT to_regclass('public.users') IS NOT NULL AS has_existing_schema,
         to_regclass('public.constera_schema_migrations') IS NOT NULL AS has_migration_ledger
`);

const ledgerTableSql = `
  CREATE TABLE IF NOT EXISTS constera_schema_migrations (
    filename text PRIMARY KEY,
    checksum_sha256 text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

if (databaseState.has_existing_schema && !databaseState.has_migration_ledger && !baselineThrough) {
  console.error([
    "Mövcud production sxemində miqrasiya reyestri yoxdur; köhnə SQL faylları avtomatik təkrar işlədilmədi.",
    "Sxemi yoxladıqdan sonra --baseline-through=<son_tətbiq_edilmiş_fayl> və --confirm-existing-schema istifadə et."
  ].join("\n"));
  process.exit(1);
}

let simulatedBaseline = [];
if (baselineThrough) {
  if (!databaseState.has_existing_schema) {
    console.error("Boş bazada baseline yaratmaq olmaz; miqrasiyaları normal qaydada tətbiq et.");
    process.exit(1);
  }
  if (!confirmExistingSchema) {
    console.error("Mövcud sxemi baseline etmək üçün --confirm-existing-schema açıq təsdiqi tələb olunur.");
    process.exit(1);
  }
  const baselineIndex = files.indexOf(baselineThrough);
  const baselineMigrations = migrations.slice(0, baselineIndex + 1);
  if (dryRun) {
    simulatedBaseline = baselineMigrations;
    console.log(`Dry-run: ${baselineMigrations.length} fayl ${baselineThrough} daxil olmaqla baseline ediləcək.`);
  } else {
    await sql.transaction((txn) => [
      txn.query(ledgerTableSql),
      ...baselineMigrations.map((migration) => txn.query(
        `INSERT INTO constera_schema_migrations (filename, checksum_sha256)
         VALUES ($1, $2)
         ON CONFLICT (filename) DO NOTHING`,
        [migration.file, migration.checksum]
      ))
    ]);
    console.log(`${baselineMigrations.length} mövcud miqrasiya icra edilmədən reyestrə baseline edildi.`);
  }
}

let appliedRows = [];
if (databaseState.has_migration_ledger || (!dryRun && baselineThrough)) {
  appliedRows = await sql.query(
    "SELECT filename, checksum_sha256 FROM constera_schema_migrations ORDER BY filename"
  );
}
if (dryRun && simulatedBaseline.length) {
  const simulated = new Map(appliedRows.map((row) => [row.filename, row]));
  for (const migration of simulatedBaseline) {
    simulated.set(migration.file, {
      filename: migration.file,
      checksum_sha256: migration.checksum
    });
  }
  appliedRows = [...simulated.values()];
}
const applied = new Map(appliedRows.map((row) => [row.filename, row.checksum_sha256]));

for (const migration of migrations) {
  const recordedChecksum = applied.get(migration.file);
  if (recordedChecksum && recordedChecksum !== migration.checksum) {
    console.error(`${migration.file}: tətbiq edilmiş miqrasiyanın checksum-u dəyişib. Faylı redaktə etmə, yeni miqrasiya yarat.`);
    process.exit(1);
  }
}

const highestAppliedIndex = files.reduce(
  (highest, file, index) => applied.has(file) ? Math.max(highest, index) : highest,
  -1
);
const ledgerGap = files.slice(0, highestAppliedIndex + 1).find((file) => !applied.has(file));
if (ledgerGap) {
  console.error(`Miqrasiya reyestrində ardıcıllıq boşluğu var: ${ledgerGap}. Əməliyyat dayandırıldı.`);
  process.exit(1);
}

let pending = migrations.filter((migration) => !applied.has(migration.file));
if (only) {
  const selected = findMigration(only, "Seçilmiş miqrasiya");
  const selectedIndex = files.indexOf(selected.file);
  const missingDependency = files.slice(0, selectedIndex).find((file) => !applied.has(file));
  if (missingDependency) {
    console.error(`${selected.file} tətbiq edilə bilməz: əvvəlki ${missingDependency} reyestrdə yoxdur.`);
    process.exit(1);
  }
  pending = applied.has(selected.file) ? [] : [selected];
}

if (dryRun) {
  console.log(`Dry-run: ${pending.length} miqrasiya tətbiq ediləcək${pending.length ? `: ${pending.map((item) => item.file).join(", ")}` : "."}`);
  process.exit(0);
}

for (const migration of pending) {
  await sql.transaction((txn) => [
    txn.query(ledgerTableSql),
    ...migration.statements.map((statement) => txn.query(statement)),
    txn.query(
      `INSERT INTO constera_schema_migrations (filename, checksum_sha256)
       VALUES ($1, $2)`,
      [migration.file, migration.checksum]
    )
  ], { isolationLevel: "Serializable" });
  console.log(`${migration.file}: ${migration.statements.length} SQL əmri atomik tətbiq edildi.`);
}

console.log(pending.length
  ? "ConstEra PostgreSQL miqrasiyaları tamamlandı."
  : "Yeni miqrasiya yoxdur; sxem aktualdır.");
