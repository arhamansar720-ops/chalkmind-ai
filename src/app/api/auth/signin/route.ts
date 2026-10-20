import { assertSameOrigin, accountsEnabled } from "@/lib/server/auth";
import { authenticate, clientIp, signInSchema } from "@/lib/server/accounts";
import { errorResponse, jsonError } from "@/lib/server/http";
import { readJson } from "@/lib/server/json";
import { createSession, sessionCookie } from "@/lib/server/session";

/** POST /api/auth/signin — email + password → session cookie. */
export async function POST(req: Request) {
  try {
    if (!accountsEnabled()) return jsonError(503, "not_configured", "Accounts aren't set up on this deployment.");
    assertSameOrigin(req);
    const { email, password } = await readJson(req, signInSchema);
    const user = await authenticate(email, password, clientIp(req));
    const token = await createSession(user.id);
    return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(token, req), "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
