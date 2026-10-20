import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";
import { clearCollection, collectionName, listRecords } from "@/lib/server/records";

type Ctx = { params: Promise<{ collection: string }> };

/** GET /api/data/:collection — the signed-in user's records. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    const records = await listRecords(user.id, collectionName((await params).collection));
    return Response.json({ records }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/data/:collection — clear the collection. */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    await clearCollection(user.id, collectionName((await params).collection));
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
