// Applies db/migrations/*.sql in order, once each, inside a transaction.
// Usage: DATABASE_URL=postgres://… npm run db:migrate
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const sql = postgres(url, { ssl: local ? false : "require", max: 1, onnotice: () => {} });
const dir = join(dirname(fileURLToPath(import.meta.url)), "../db/migrations");

try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, file), "utf8"));
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log("database is up to date");
} catch (err) {
  console.error(`migration failed: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
