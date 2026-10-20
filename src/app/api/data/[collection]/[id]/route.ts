import { requireUser } from "@/lib/server/auth";
import { errorResponse, HttpError } from "@/lib/server/http";
import { readJson } from "@/lib/server/json";
import { collectionName, deleteRecord, getRecord, MAX_RECORD_BYTES, putRecord, recordSchema } from "@/lib/server/records";

type Ctx = { params: Promise<{ collection: string; id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    const { collection, id } = await params;
    const record = await getRecord(user.id, collectionName(collection), id);
    if (!record) throw new HttpError(404, "not_found", "Not found.");
    return Response.json({ record }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/data/:collection/:id — save a record (last write wins). */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    const { collection, id } = await params;
    const name = collectionName(collection);
    const record = await readJson(req, recordSchema, MAX_RECORD_BYTES);
    if (record.id !== id) throw new HttpError(400, "bad_request", "Record id doesn't match the URL.");
    const saved = await putRecord(user.id, name, record);
    return Response.json({ saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    const { collection, id } = await params;
    await deleteRecord(user.id, collectionName(collection), id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
