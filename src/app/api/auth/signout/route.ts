import { assertSameOrigin, accountsEnabled } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";
import { clearSessionCookie, endSession } from "@/lib/server/session";

/** POST /api/auth/signout — end this device's session. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (accountsEnabled()) await endSession(req);
    return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookie(req) } });
  } catch (err) {
    return errorResponse(err);
  }
}
