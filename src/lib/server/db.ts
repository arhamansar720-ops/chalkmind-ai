import "server-only";
import postgres from "postgres";
import { HttpError } from "./http-error";

// One small pool per serverless instance. Render Postgres requires TLS from
// outside Render; a local database (dev/tests) doesn't use it.

let client: postgres.Sql | null = null;

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function db(): postgres.Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new HttpError(503, "not_configured", "Accounts aren't set up on this deployment (DATABASE_URL is missing).");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  client = postgres(url, {
    ssl: local ? false : "require",
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return client;
}

/** Test helper: drop the pool so the next call reconnects with current env. */
export async function resetDb() {
  const c = client;
  client = null;
  await c?.end({ timeout: 1 });
}
