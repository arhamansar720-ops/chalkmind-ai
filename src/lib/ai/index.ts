import "server-only";
import { readAIConfig, type AIConfig } from "./config";
import { AIError } from "./errors";
import { FallbackProvider } from "./fallback";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAICompatibleProvider } from "./providers/openai-compatible";
import type { AIProvider, GenerateRequest } from "./types";

export function createProvider(cfg: AIConfig): AIProvider {
  const base = cfg.provider === "anthropic" ? new AnthropicProvider(cfg) : new OpenAICompatibleProvider(cfg);
  return cfg.fallbackModels.length ? new FallbackProvider(base, cfg.fallbackModels) : base;
}

/** The configured provider, or an AIError("not_configured") the UI turns into a setup screen. */
export function getProvider(): AIProvider {
  const res = readAIConfig();
  if (!res.ok) {
    throw new AIError("not_configured", res.reason, `Set ${res.missing.join(", ")} in .env.local and restart the server.`);
  }
  return createProvider(res.config);
}

/** Collect a full (non-streamed) completion. */
export async function complete(provider: AIProvider, req: GenerateRequest): Promise<{ text: string; truncated: boolean }> {
  let text = "";
  let truncated = false;
  for await (const chunk of provider.stream(req)) {
    if (chunk.type === "text") text += chunk.text;
    else if (chunk.type === "done") truncated = chunk.finishReason === "length";
  }
  return { text, truncated };
}

export { AIError } from "./errors";
export type { AIProvider, ChatMessage, GenerateRequest } from "./types";
