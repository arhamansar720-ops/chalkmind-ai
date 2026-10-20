import { assertSameOrigin, accountsEnabled } from "@/lib/server/auth";
import { createUser, signUpSchema } from "@/lib/server/accounts";
import { errorResponse, jsonError } from "@/lib/server/http";
import { readJson } from "@/lib/server/json";
import { createSession, sessionCookie } from "@/lib/server/session";

/** POST /api/auth/signup — create an account (invite code if SIGNUP_CODE is set) and sign in. */
export async function POST(req: Request) {
  try {
    if (!accountsEnabled()) return jsonError(503, "not_configured", "Accounts aren't set up on this deployment.");
    assertSameOrigin(req);
    const input = await readJson(req, signUpSchema);
    const user = await createUser(input);
    const token = await createSession(user.id);
    return Response.json({ user }, { status: 201, headers: { "Set-Cookie": sessionCookie(token, req), "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
