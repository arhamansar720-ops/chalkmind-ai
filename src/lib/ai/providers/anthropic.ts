import type { AIConfig } from "../config";
import { AIError, errorFromStatus, toAIError } from "../errors";
import { readSSE } from "../sse";
import { hasImages, type AIProvider, type ChatMessage, type GenerateRequest, type StreamChunk } from "../types";
import { withTimeout } from "./openai-compatible";

/** Native Anthropic Messages API adapter (streaming). */
export class AnthropicProvider implements AIProvider {
  constructor(private readonly cfg: AIConfig) {}

  get id() {
    return this.cfg.provider;
  }
  get model() {
    return this.cfg.model;
  }
  get visionModel() {
    return this.cfg.visionModel;
  }

  async *stream(req: GenerateRequest): AsyncGenerator<StreamChunk> {
    const needsVision = req.vision || hasImages(req.messages);
    const model = needsVision ? this.cfg.visionModel : this.cfg.model;
    if (!model) throw new AIError("unsupported_input", "No vision model is configured.", "Set AI_VISION_MODEL.");

    const system = req.json
      ? `${req.system}\n\nRespond with a single JSON object and nothing else.`
      : req.system;
    const body: Record<string, unknown> = {
      model,
      system,
      stream: true,
      max_tokens: Math.min(req.maxTokens ?? this.cfg.maxOutputTokens, this.cfg.maxOutputTokens),
      messages: req.messages.map(toWire),
    };
    if (req.temperature !== undefined) body.temperature = req.temperature;

    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.cfg.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: withTimeout(req.signal, 90_000),
      });
    } catch (err) {
      throw toAIError(err, this.cfg.label);
    }
    if (!res.ok || !res.body) {
      const detail = (await res.text().catch(() => "")).slice(0, 400);
      throw errorFromStatus(this.cfg.label, res.status, detail);
    }

    let finish: "stop" | "length" | "other" = "stop";
    try {
      for await (const { data } of readSSE(res.body)) {
        let ev: {
          type?: string;
          delta?: { type?: string; text?: string; stop_reason?: string };
          error?: { message?: string; type?: string };
        };
        try {
          ev = JSON.parse(data);
        } catch {
          continue;
        }
        if (ev.type === "error") {
          if (ev.error?.type === "overloaded_error") throw new AIError("provider_unavailable", "Anthropic is overloaded right now. Try again shortly.");
          throw new AIError("provider_unavailable", `Anthropic: ${String(ev.error?.message ?? "stream error").slice(0, 200)}`);
        }
        if (ev.type === "content_block_delta") {
          if (ev.delta?.type === "text_delta" && ev.delta.text) yield { type: "text", text: ev.delta.text };
          else if (ev.delta?.type === "thinking_delta") yield { type: "thinking" };
        } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
          finish = ev.delta.stop_reason === "max_tokens" ? "length" : ev.delta.stop_reason === "end_turn" ? "stop" : "other";
        }
      }
    } catch (err) {
      throw toAIError(err, this.cfg.label);
    }
    yield { type: "done", finishReason: finish };
  }
}

function toWire(m: ChatMessage) {
  if (typeof m.content === "string") return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: m.content.map((p) => {
      if (p.type === "text") return { type: "text", text: p.text };
      const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(p.dataUrl);
      if (!match) throw new AIError("unsupported_input", "Images must be base64 data URLs.");
      return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
    }),
  };
}
