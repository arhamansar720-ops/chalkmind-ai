import "server-only";
import { databaseConfigured } from "./db";
import { HttpError } from "./http-error";
import { sessionUser, type SessionUser } from "./session";

/** Accounts exist on this deployment (a database is configured). */
export function accountsEnabled(): boolean {
  return databaseConfigured();
}

/** Sign-in is required for the AI and data routes. */
export function authRequired(): boolean {
  return process.env.REQUIRE_AUTH === "true";
}

/**
 * Browsers send Origin on cross-site POSTs. The session cookie is
 * SameSite=Lax (so it isn't sent cross-site anyway); this is a second lock
 * on every route that acts on a signed-in user.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, "forbidden", "Cross-site request blocked.");
  }
  const expected = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  if (host !== expected) throw new HttpError(403, "forbidden", "Cross-site request blocked.");
}

/** The signed-in user, or a 401 when there is none. */
export async function requireUser(req: Request): Promise<SessionUser> {
  if (!accountsEnabled()) throw new HttpError(503, "not_configured", "Accounts aren't set up on this deployment.");
  assertSameOrigin(req);
  const user = await sessionUser(req);
  if (!user) throw new HttpError(401, "unauthorized", "Please sign in to continue.");
  return user;
}

/**
 * For AI routes. With REQUIRE_AUTH=true only signed-in users get through
 * (the model is never called otherwise). Without it, a signed-in user is
 * still identified so rate limits apply per account.
 */
export async function verifyRequestUser(req: Request): Promise<string | null> {
  if (authRequired()) {
    if (!accountsEnabled()) throw new HttpError(500, "misconfigured", "REQUIRE_AUTH is on but DATABASE_URL is not set.");
    return (await requireUser(req)).id;
  }
  if (!accountsEnabled() || !req.headers.get("cookie")) return null;
  return (await sessionUser(req).catch(() => null))?.id ?? null;
}
