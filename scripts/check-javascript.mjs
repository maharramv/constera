import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["assets/js", "api", "scripts"];
const files = [];

const visit = (path) => {
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) visit(fullPath);
    else if (/\.(?:js|mjs)$/.test(entry)) files.push(fullPath);
  }
};

roots.forEach(visit);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`${files.length} JavaScript faylının sintaksisi yoxlanıldı.`);
