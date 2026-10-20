import "server-only";
import type { z } from "zod";
import { complete } from ".";
import { AIError } from "./errors";
import { extractJsonObject } from "./json-stream";
import type { AIProvider, GenerateRequest } from "./types";

/**
 * Ask for a JSON object matching `schema`. If the first reply doesn't
 * validate, send the validation error back once and ask for a corrected
 * object. Never fabricates a result: a second failure is an error.
 */
export async function generateStructured<S extends z.ZodType>(
  provider: AIProvider,
  schema: S,
  req: GenerateRequest,
): Promise<z.infer<S>> {
  const first = await complete(provider, { ...req, json: true });
  const attempt = (text: string) => {
    const obj = extractJsonObject(text);
    if (obj === null) return { ok: false as const, error: "Reply was not a JSON object." };
    const parsed = schema.safeParse(obj);
    if (parsed.success) return { ok: true as const, data: parsed.data };
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false as const, error: issues };
  };

  const a = attempt(first.text);
  if (a.ok) return a.data;
  if (process.env.CHALKMIND_DEBUG_AI === "1") console.warn("[chalkmind:debug] invalid structured reply:", a.error, first.text.slice(0, 1500));

  const retry = await complete(provider, {
    ...req,
    json: true,
    messages: [
      ...req.messages,
      { role: "assistant", content: first.text.slice(0, 6000) || "(empty)" },
      {
        role: "user",
        content: `That reply didn't match the required JSON format (${a.error}). ${first.truncated ? "It was also cut off — be more concise. " : ""}Reply again with ONLY the corrected JSON object.`,
      },
    ],
  });
  const b = attempt(retry.text);
  if (b.ok) return b.data;
  throw new AIError("bad_response", "The AI's reply wasn't in a format Chalkmind could use. Please try again.", b.error.slice(0, 200));
}
