import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";
import { changesSince } from "@/lib/server/records";

/** GET /api/data/sync?since=<cursor> — every record change after the cursor (all collections). */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const since = new URL(req.url).searchParams.get("since");
    const valid = since && !Number.isNaN(Date.parse(since)) ? since : null;
    return Response.json(await changesSince(user.id, valid), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
