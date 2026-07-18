import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const filename of [".env.local", ".env"]) {
  const path = resolve(filename);
  if (!existsSync(path)) continue;
  process.loadEnvFile(path);
  break;
}
