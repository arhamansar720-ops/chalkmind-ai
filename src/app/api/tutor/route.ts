import { getProvider } from "@/lib/ai";
import { toAIError } from "@/lib/ai/errors";
import { JsonObjectStream } from "@/lib/ai/json-stream";
import type { ChatMessage } from "@/lib/ai/types";
import { errorResponse, guardAIRequest } from "@/lib/server/http";
import { modelObjectToEvents, requestImages, tutorRequestSchema, type TutorEvent } from "@/lib/tutor/protocol";
import { tutorSystemPrompt } from "@/lib/tutor/prompt";
import { inlineTranscript, needsTranscription, transcribeImages } from "@/lib/ai/vision";

export const maxDuration = 60;

const MAX_BODY = 7 * 1024 * 1024;
// Kept modest so a long session doesn't burn through a free tier's per-minute token limit.
const HISTORY = 16;

/**
 * POST /api/tutor — streams the tutor's reply as NDJSON events
 * (see TutorEvent). The model's output is parsed and validated here, so the
 * browser only ever receives schema-checked board actions.
 */
export async function POST(req: Request) {
  let provider;
  let input;
  try {
    ({ input } = await guardAIRequest(req, tutorRequestSchema, { maxBytes: MAX_BODY }));
    provider = getProvider();
  } catch (err) {
    return errorResponse(err);
  }

  const history = input.messages.slice(-HISTORY);
  const isFirstTurn = history.filter((m) => m.role === "assistant").length === 0;
  const images = requestImages(input);
  let messages: ChatMessage[] = history.map((m, i) => {
    const isLast = i === history.length - 1;
    if (isLast && m.role === "user" && images.length) {
      return { role: "user", content: [...images.map((dataUrl) => ({ type: "image" as const, dataUrl })), { type: "text", text: m.content }] };
    }
    return { role: m.role, content: m.content };
  });
  if (messages[messages.length - 1]?.role !== "user") {
    return Response.json({ error: { code: "bad_request", message: "The last message must be from the student." } }, { status: 400 });
  }

  const system = tutorSystemPrompt(input, isFirstTurn);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: TutorEvent) => controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      const twoStep = images.length > 0 && needsTranscription(provider);
      send({ type: "meta", provider: provider.id, model: images.length && !twoStep ? provider.visionModel ?? provider.model : provider.model });
      const parser = new JsonObjectStream();
      let said = false;
      let truncated = false;
      let lastThinking = 0;
      try {
        if (twoStep) {
          send({ type: "thinking" });
          messages = inlineTranscript(messages, images.length, await transcribeImages(provider, images, req.signal));
        }
        for await (const chunk of provider.stream({
          system,
          messages,
          temperature: 0.4,
          maxTokens: 3500,
          effort: "low",
          signal: req.signal,
        })) {
          if (chunk.type === "thinking") {
            const now = Date.now();
            if (now - lastThinking > 1500) {
              lastThinking = now;
              send({ type: "thinking" });
            }
          } else if (chunk.type === "text") {
            for (const obj of parser.push(chunk.text)) {
              for (const ev of modelObjectToEvents(obj)) {
                if (ev.type === "say") said = true;
                send(ev);
              }
            }
          } else if (chunk.type === "fallback") {
            send({ type: "fallback", from: chunk.from, to: chunk.to, retryAfterSec: chunk.retryAfterSec });
            send({ type: "meta", provider: provider.id, model: chunk.to });
          } else if (chunk.type === "done") {
            truncated = chunk.finishReason === "length";
          }
        }
        if (!said && parser.stray) {
          // The model answered in plain prose instead of the board protocol.
          // Show its real words rather than nothing; there's just no drawing.
          send({ type: "say", text: parser.stray.slice(0, 4000) });
          send({ type: "notice", message: "The tutor answered without drawing on the board this time." });
        }
        if (parser.unterminated || truncated) {
          send({ type: "notice", message: "The reply was cut off by the model's length limit. Ask it to continue." });
        }
        send({ type: "done", truncated: truncated || parser.unterminated });
      } catch (err) {
        if (!req.signal.aborted) {
          const ai = toAIError(err, provider.id);
          console.warn(`[chalkmind] tutor stream failed: ${ai.code}`);
          send({ type: "error", code: ai.code, message: ai.message, hint: ai.hint, retryAfterSec: ai.retryAfterSec });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* client went away */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
