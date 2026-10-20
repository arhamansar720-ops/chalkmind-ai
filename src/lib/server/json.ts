import "server-only";
import type { z } from "zod";
import { HttpError } from "./http-error";

/** Read and validate a small JSON body. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes = 16 * 1024): Promise<z.infer<S>> {
  const raw = await req.text();
  if (raw.length > maxBytes) throw new HttpError(413, "too_large", "Request is too large.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "bad_request", "Request body must be JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new HttpError(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid request.");
  return parsed.data;
}
