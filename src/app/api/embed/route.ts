import { z } from "zod";
import { readEmbeddingsConfig } from "@/lib/ai/config";
import { errorFromStatus, toAIError } from "@/lib/ai/errors";
import { errorResponse, guardAIRequest, HttpError } from "@/lib/server/http";

export const maxDuration = 60;

const schema = z.object({ texts: z.array(z.string().min(1).max(2400)).min(1).max(64) });

/**
 * POST /api/embed — embeddings for document retrieval, only when an
 * embeddings provider is configured (EMBEDDINGS_PROVIDER). Otherwise 503 and
 * the app uses keyword search.
 */
export async function POST(req: Request) {
  try {
    const cfg = readEmbeddingsConfig();
    if (!cfg) throw new HttpError(503, "not_configured", "No embeddings provider is configured; keyword search is used instead.");
    const { input } = await guardAIRequest(req, schema, { maxBytes: 260 * 1024 });
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ model: cfg.model, input: input.texts }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      throw toAIError(err, cfg.label);
    }
    if (!res.ok) throw errorFromStatus(cfg.label, res.status, (await res.text().catch(() => "")).slice(0, 300));
    const json = (await res.json()) as { data?: { embedding: number[]; index: number }[] };
    const vectors = (json.data ?? []).sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (vectors.length !== input.texts.length) throw new HttpError(502, "bad_response", "The embeddings provider returned an unexpected result.");
    return Response.json({ vectors, model: cfg.model });
  } catch (err) {
    return errorResponse(err);
  }
}
