import type { AIConfig } from "../config";
import { AIError, errorFromStatus, toAIError } from "../errors";
import { readSSE, ThinkFilter } from "../sse";
import { hasImages, type AIProvider, type ChatMessage, type GenerateRequest, type StreamChunk } from "../types";

/**
 * Adapter for every provider that speaks the OpenAI Chat Completions wire
 * format: Groq, OpenAI, OpenRouter, Ollama (/v1) and self-hosted servers.
 */
export class OpenAICompatibleProvider implements AIProvider {
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
    const model = req.model ?? (needsVision ? this.cfg.visionModel : this.cfg.model);
    if (!model) {
      throw new AIError(
        "unsupported_input",
        `${this.cfg.label} has no vision model configured, so images can't be read.`,
        "Set AI_VISION_MODEL to a vision-capable model, or type the problem as text.",
      );
    }

    const body: Record<string, unknown> = {
      model,
      stream: true,
      messages: [{ role: "system", content: req.system }, ...req.messages.map(toWire)],
    };
    const maxTokens = Math.min(req.maxTokens ?? this.cfg.maxOutputTokens, this.cfg.maxOutputTokens);
    const isReasoning = /gpt-oss|gpt-5|^o\d|qwen3|deepseek-r1/i.test(model);
    if (this.cfg.provider === "openai" || this.cfg.provider === "groq") {
      // Reasoning models spend part of the budget thinking; give them headroom.
      body.max_completion_tokens = isReasoning && req.effort !== "none" ? maxTokens + 2048 : maxTokens;
    } else {
      body.max_tokens = maxTokens;
    }
    const fixedTemperature = this.cfg.provider === "openai" && isReasoning;
    if (req.temperature !== undefined && !fixedTemperature) body.temperature = req.temperature;
    if (req.json && this.cfg.supportsJsonMode && !needsVision) body.response_format = { type: "json_object" };
    if (/gpt-oss/i.test(model) && (this.cfg.provider === "groq" || this.cfg.provider === "openrouter")) {
      body.reasoning_effort = req.effort === "none" || !req.effort ? "low" : req.effort;
    } else if (/qwen3/i.test(model) && this.cfg.provider === "groq") {
      // Groq's Qwen 3 models take "none" (no thinking) or "default".
      body.reasoning_effort = req.effort === "none" ? "none" : "default";
    } else if (this.cfg.provider === "openai" && isReasoning) {
      body.reasoning_effort = req.effort === "high" ? "medium" : req.effort === "none" ? "minimal" : "low";
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.cfg.apiKey) headers.Authorization = `Bearer ${this.cfg.apiKey}`;
    if (this.cfg.provider === "openrouter") {
      headers["HTTP-Referer"] = "https://chalkmind.app";
      headers["X-Title"] = "Chalkmind";
    }

    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: withTimeout(req.signal, 90_000),
      });
    } catch (err) {
      throw toAIError(err, this.cfg.label);
    }
    if (!res.ok || !res.body) {
      const detail = (await res.text().catch(() => "")).slice(0, 400);
      throw errorFromStatus(this.cfg.label, res.status, detail, res.headers);
    }

    const think = new ThinkFilter();
    let finish: "stop" | "length" | "other" = "stop";
    try {
      for await (const { data } of readSSE(res.body)) {
        if (data === "[DONE]") break;
        let json: {
          choices?: { delta?: { content?: string | null; reasoning?: string; reasoning_content?: string }; finish_reason?: string | null }[];
          error?: { message?: string };
        };
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        if (json.error) throw new AIError("provider_unavailable", `${this.cfg.label}: ${String(json.error.message ?? "stream error").slice(0, 200)}`);
        const choice = json.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (delta.reasoning || delta.reasoning_content) yield { type: "thinking" };
        if (delta.content) {
          const { text, thinking } = think.push(delta.content);
          if (thinking) yield { type: "thinking" };
          if (text) yield { type: "text", text };
        }
        if (choice.finish_reason) finish = choice.finish_reason === "length" ? "length" : choice.finish_reason === "stop" ? "stop" : "other";
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
    content: m.content.map((p) =>
      p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: p.dataUrl } },
    ),
  };
}

export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}
