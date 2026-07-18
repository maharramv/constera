import "./load-local-env.mjs";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../api/_lib/auth.js";
import { query } from "../api/_lib/db.js";

const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");
const name = String(process.env.ADMIN_NAME || "ConstEra administratoru").trim();
if (!email || !password || (!process.env.DATABASE_URL && !process.env.POSTGRES_URL)) {
  console.error("DATABASE_URL, ADMIN_EMAIL və ADMIN_PASSWORD mühit dəyişənləri tələb olunur.");
  process.exit(1);
}

const existing = await query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [email]);
if (existing[0]) {
  console.error("Bu e-poçtla istifadəçi artıq mövcuddur.");
  process.exit(1);
}

const companyId = `com-${randomUUID()}`;
const userId = `usr-${randomUUID()}`;
const passwordHash = await hashPassword(password);
await query(
  `WITH company AS (
     INSERT INTO companies (id, name, company_type) VALUES ($1, 'ConstEra', 'internal') RETURNING id
   )
   INSERT INTO users (id, company_id, email, name, password_hash, role)
   SELECT $2, company.id, $3, $4, $5, 'super_admin' FROM company`,
  [companyId, userId, email, name, passwordHash]
);
console.log(`Super administrator yaradıldı: ${email}`);
