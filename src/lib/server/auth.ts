import "server-only";
import { HttpError } from "./http-error";

/**
 * When REQUIRE_AUTH=true (and Supabase is configured), AI routes only serve
 * signed-in users: the browser sends its Supabase access token and we verify
 * it with Supabase's auth server. Without REQUIRE_AUTH the app runs in
 * local, single-user mode and this returns null.
 */
export async function verifyRequestUser(req: Request): Promise<string | null> {
  const required = process.env.REQUIRE_AUTH === "true";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!required) return null;
  if (!url || !anon) {
    throw new HttpError(500, "misconfigured", "REQUIRE_AUTH is on but Supabase is not configured.");
  }
  if (!token) throw new HttpError(401, "unauthorized", "Please sign in to use the tutor.");

  const res = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) throw new HttpError(401, "unauthorized", "Your session has expired. Please sign in again.");
  const user = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!user?.id) throw new HttpError(401, "unauthorized", "Please sign in again.");
  return user.id;
}
