import type { ProviderId } from "./types";

/**
 * Model/provider configuration, read from server-side environment variables
 * only. Nothing here is ever sent to the browser except the public summary
 * from `publicConfig()` (provider name, model ids, feature flags — no keys).
 */

export interface ProviderPreset {
  label: string;
  baseUrl: string | null;
  keyEnv: string | null;
  defaultModel: string | null;
  defaultVisionModel: string | null;
  supportsJsonMode: boolean;
  pricing: string;
}

export const PRESETS: Record<ProviderId, ProviderPreset> = {
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    defaultModel: "openai/gpt-oss-120b",
    defaultVisionModel: "meta-llama/llama-4-scout-17b-16e-instruct",
    supportsJsonMode: true,
    pricing: "Free tier with rate limits; paid per token beyond it.",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-5-mini",
    defaultVisionModel: "gpt-5-mini",
    supportsJsonMode: true,
    pricing: "Paid per token.",
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    defaultModel: "openai/gpt-oss-120b",
    defaultVisionModel: null,
    supportsJsonMode: true,
    pricing: "Paid per token (some models have free variants).",
  },
  anthropic: {
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    keyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-haiku-5-5",
    defaultVisionModel: "claude-haiku-5-5",
    supportsJsonMode: false,
    pricing: "Paid per token.",
  },
  ollama: {
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    keyEnv: null,
    defaultModel: "qwen3",
    defaultVisionModel: null,
    supportsJsonMode: true,
    pricing: "Free — runs on your own computer.",
  },
  "openai-compatible": {
    label: "OpenAI-compatible server",
    baseUrl: null,
    keyEnv: null,
    defaultModel: null,
    defaultVisionModel: null,
    supportsJsonMode: true,
    pricing: "Depends on your server.",
  },
};

export interface AIConfig {
  provider: ProviderId;
  label: string;
  baseUrl: string;
  apiKey: string | null;
  model: string;
  visionModel: string | null;
  supportsJsonMode: boolean;
  maxOutputTokens: number;
  pricing: string;
}

export type ConfigResult = { ok: true; config: AIConfig } | { ok: false; reason: string; missing: string[] };

type Env = Record<string, string | undefined>;

const AUTO_DETECT: [string, ProviderId][] = [
  ["GROQ_API_KEY", "groq"],
  ["ANTHROPIC_API_KEY", "anthropic"],
  ["OPENAI_API_KEY", "openai"],
  ["OPENROUTER_API_KEY", "openrouter"],
];

export function readAIConfig(env: Env = process.env): ConfigResult {
  let provider = env.AI_PROVIDER?.trim().toLowerCase() as ProviderId | undefined;
  if (!provider) {
    provider = AUTO_DETECT.find(([key]) => env[key]?.trim())?.[1];
    if (!provider && env.AI_API_KEY?.trim()) provider = "groq";
  }
  if (!provider) {
    return {
      ok: false,
      reason: "No AI provider is configured.",
      missing: ["AI_PROVIDER", "AI_API_KEY"],
    };
  }
  const preset = PRESETS[provider];
  if (!preset) {
    return {
      ok: false,
      reason: `Unknown AI_PROVIDER "${provider}". Use one of: ${Object.keys(PRESETS).join(", ")}.`,
      missing: ["AI_PROVIDER"],
    };
  }

  const baseUrl = (env.AI_BASE_URL?.trim() || preset.baseUrl || "").replace(/\/+$/, "");
  const apiKey = env.AI_API_KEY?.trim() || (preset.keyEnv ? env[preset.keyEnv]?.trim() : undefined) || null;
  const model = env.AI_MODEL?.trim() || preset.defaultModel;
  const missing: string[] = [];
  if (!baseUrl) missing.push("AI_BASE_URL");
  if (!model) missing.push("AI_MODEL");
  if (preset.keyEnv && !apiKey) missing.push(`AI_API_KEY (or ${preset.keyEnv})`);
  if (missing.length) {
    return { ok: false, reason: `${preset.label} is selected but not fully configured.`, missing };
  }

  const visionEnv = env.AI_VISION_MODEL?.trim();
  const visionModel = visionEnv === "none" ? null : visionEnv || preset.defaultVisionModel;
  const maxOut = Number(env.AI_MAX_OUTPUT_TOKENS);

  return {
    ok: true,
    config: {
      provider,
      label: preset.label,
      baseUrl,
      apiKey,
      model: model!,
      visionModel,
      supportsJsonMode: preset.supportsJsonMode,
      maxOutputTokens: Number.isFinite(maxOut) && maxOut > 256 ? Math.min(maxOut, 32000) : 4096,
      pricing: preset.pricing,
    },
  };
}

export interface EmbeddingsConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  label: string;
}

/** Optional: an OpenAI-compatible /embeddings endpoint (OpenAI, Ollama, ...). */
export function readEmbeddingsConfig(env: Env = process.env): EmbeddingsConfig | null {
  const provider = env.EMBEDDINGS_PROVIDER?.trim().toLowerCase();
  if (!provider || provider === "none") return null;
  if (provider === "ollama") {
    return {
      baseUrl: (env.EMBEDDINGS_BASE_URL?.trim() || "http://localhost:11434/v1").replace(/\/+$/, ""),
      apiKey: null,
      model: env.EMBEDDINGS_MODEL?.trim() || "nomic-embed-text",
      label: "Ollama",
    };
  }
  if (provider === "openai") {
    const apiKey = env.EMBEDDINGS_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      baseUrl: (env.EMBEDDINGS_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
      apiKey,
      model: env.EMBEDDINGS_MODEL?.trim() || "text-embedding-3-small",
      label: "OpenAI",
    };
  }
  const baseUrl = env.EMBEDDINGS_BASE_URL?.trim();
  const model = env.EMBEDDINGS_MODEL?.trim();
  if (!baseUrl || !model) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey: env.EMBEDDINGS_API_KEY?.trim() || null, model, label: provider };
}

/** Safe-to-expose summary for the Settings / setup screens. */
export function publicConfig(env: Env = process.env) {
  const ai = readAIConfig(env);
  const emb = readEmbeddingsConfig(env);
  return {
    ai: ai.ok
      ? {
          configured: true as const,
          provider: ai.config.provider,
          label: ai.config.label,
          model: ai.config.model,
          visionModel: ai.config.visionModel,
          pricing: ai.config.pricing,
          local: ai.config.provider === "ollama",
        }
      : { configured: false as const, reason: ai.reason, missing: ai.missing },
    embeddings: emb ? { configured: true as const, label: emb.label, model: emb.model } : { configured: false as const },
    cloudSync: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

export type PublicConfig = ReturnType<typeof publicConfig>;
