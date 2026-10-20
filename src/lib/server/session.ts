import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

// Opaque session tokens in an HttpOnly cookie. The database keeps only a
// SHA-256 of each token, so a leaked database can't be replayed as sessions.

export const SESSION_COOKIE = "cm_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Extend a session at most this often (saves a write per request). */
const SLIDE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest();

export function readSessionToken(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) {
      const token = v.join("=");
      return /^[A-Za-z0-9_-]{32,64}$/.test(token) ? token : null;
    }
  }
  return null;
}

export function sessionCookie(token: string, req: Request): string {
  const secure = new URL(req.url).protocol === "https:" || process.env.NODE_ENV === "production";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(req: Request): string {
  const secure = new URL(req.url).protocol === "https:" || process.env.NODE_ENV === "production";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db()`insert into auth_sessions (token_hash, user_id, expires_at) values (${hashToken(token)}, ${userId}, ${new Date(Date.now() + TTL_MS)})`;
  // Housekeeping: drop this user's expired sessions.
  await db()`delete from auth_sessions where user_id = ${userId} and expires_at < now()`;
  return token;
}

export async function sessionUser(req: Request): Promise<SessionUser | null> {
  const token = readSessionToken(req);
  if (!token) return null;
  const sql = db();
  const rows = await sql<{ id: string; email: string; name: string | null; last_seen_at: Date }[]>`
    select u.id, u.email, u.name, s.last_seen_at
    from auth_sessions s join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now()`;
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - row.last_seen_at.getTime() > SLIDE_AFTER_MS) {
    await sql`update auth_sessions set last_seen_at = now(), expires_at = ${new Date(Date.now() + TTL_MS)} where token_hash = ${hashToken(token)}`;
  }
  return { id: row.id, email: row.email, name: row.name };
}

export async function endSession(req: Request): Promise<void> {
  const token = readSessionToken(req);
  if (token) await db()`delete from auth_sessions where token_hash = ${hashToken(token)}`;
}
