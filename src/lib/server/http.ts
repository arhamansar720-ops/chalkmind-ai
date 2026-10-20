import "server-only";
import type { z } from "zod";
import { AIError, toAIError } from "../ai/errors";
import { aiLimiter } from "./rate-limit";
import { verifyRequestUser } from "./auth";

import { HttpError } from "./http-error";

export { HttpError };

export function jsonError(status: number, code: string, message: string, hint?: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message, ...(hint ? { hint } : {}) } }, { status, headers });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return jsonError(err.status, err.code, err.message, err.hint);
  const ai = err instanceof AIError ? err : toAIError(err);
  // Log the code only — never request bodies, which contain student data.
  console.warn(`[chalkmind] AI request failed: ${ai.code}`);
  return jsonError(ai.status, ai.code, ai.message, ai.hint);
}

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

/**
 * Common guard for AI routes: optional auth, rate limit, size limit, schema
 * validation. Returns parsed input or throws HttpError.
 */
export async function guardAIRequest<S extends z.ZodType>(
  req: Request,
  schema: S,
  { maxBytes }: { maxBytes: number },
): Promise<{ input: z.infer<S>; userId: string | null }> {
  const userId = await verifyRequestUser(req);

  const rl = aiLimiter.check(userId ?? clientKey(req));
  if (!rl.ok) {
    throw new HttpError(429, "rate_limited", `Too many requests. Try again in ${rl.retryAfterSec}s.`);
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new HttpError(413, "too_large", `Request is too large (limit ${Math.round(maxBytes / 1024)} KB).`);
  const raw = await req.text();
  if (raw.length > maxBytes) throw new HttpError(413, "too_large", `Request is too large (limit ${Math.round(maxBytes / 1024)} KB).`);

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "bad_request", "Request body must be JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(400, "bad_request", `Invalid request: ${issue?.path.join(".") || "body"} — ${issue?.message ?? "invalid"}`);
  }
  return { input: parsed.data, userId };
}
