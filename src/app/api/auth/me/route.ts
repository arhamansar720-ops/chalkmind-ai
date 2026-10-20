import { connection } from "next/server";
import { accountsEnabled, authRequired } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";
import { sessionUser } from "@/lib/server/session";

/** GET /api/auth/me — who is signed in, and whether accounts are on/required here. */
export async function GET(req: Request) {
  try {
    // Per request: settings come from runtime env, never baked in at build time.
    await connection();
    const enabled = accountsEnabled();
    const user = enabled ? await sessionUser(req) : null;
    return Response.json(
      { user, accounts: enabled, required: authRequired(), inviteRequired: Boolean(process.env.SIGNUP_CODE?.trim()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
