import { connection } from "next/server";
import { publicConfig } from "@/lib/ai/config";

/** GET /api/health — which features are configured. Never includes keys. */
export async function GET() {
  await connection(); // read env at request time, not build time
  return Response.json(publicConfig(), { headers: { "Cache-Control": "no-store" } });
}
