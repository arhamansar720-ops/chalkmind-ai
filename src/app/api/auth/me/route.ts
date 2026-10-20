import { accountsEnabled, authRequired } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";
import { sessionUser } from "@/lib/server/session";

/** GET /api/auth/me — who is signed in, and whether accounts are on/required here. */
export async function GET(req: Request) {
  try {
    // Reading the request makes this route per-request, so runtime env (not build-time) decides.
    const hasCookie = Boolean(req.headers.get("cookie"));
    const enabled = accountsEnabled();
    const user = enabled && hasCookie ? await sessionUser(req) : null;
    return Response.json(
      { user, accounts: enabled, required: authRequired(), inviteRequired: Boolean(process.env.SIGNUP_CODE?.trim()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
