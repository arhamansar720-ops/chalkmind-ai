export type AIErrorCode =
  | "not_configured"
  | "auth"
  | "rate_limited"
  | "model_not_found"
  | "unsupported_input"
  | "provider_unavailable"
  | "timeout"
  | "bad_response"
  | "too_large"
  | "unknown";

const HTTP_STATUS: Record<AIErrorCode, number> = {
  not_configured: 503,
  auth: 502,
  rate_limited: 429,
  model_not_found: 502,
  unsupported_input: 400,
  provider_unavailable: 502,
  timeout: 504,
  bad_response: 502,
  too_large: 413,
  unknown: 500,
};

/** Error with a stable code the UI maps to a helpful message. Messages never include secrets. */
export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly hint?: string;
  constructor(code: AIErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.hint = hint;
  }
  get status(): number {
    return HTTP_STATUS[this.code];
  }
  toJSON() {
    return { code: this.code, message: this.message, ...(this.hint ? { hint: this.hint } : {}) };
  }
}

/** Map a provider HTTP failure to an AIError. `detail` is the provider's body (already truncated). */
export function errorFromStatus(provider: string, status: number, detail: string): AIError {
  const d = detail.toLowerCase();
  if (status === 401 || status === 403)
    return new AIError("auth", `${provider} rejected the API key.`, "Check AI_API_KEY (or the provider-specific key) in .env.local.");
  if (status === 404 || d.includes("model_not_found") || d.includes("does not exist"))
    return new AIError("model_not_found", `${provider} could not find the configured model.`, "Check AI_MODEL — for Ollama, run `ollama pull <model>` first.");
  if (status === 413) return new AIError("too_large", "The request was too large for the model. Try a shorter input or smaller image.");
  if (status === 429)
    return new AIError("rate_limited", `${provider} rate limit reached. Wait a moment and try again.`, "Free tiers have per-minute token limits.");
  if (status === 400 && (d.includes("image") || d.includes("vision") || d.includes("multimodal")))
    return new AIError("unsupported_input", "The configured model can't read images.", "Set AI_VISION_MODEL to a vision-capable model.");
  if (status === 400 && (d.includes("context") || d.includes("too long") || d.includes("maximum")))
    return new AIError("too_large", "The conversation is too long for the model's context window.");
  if (status >= 500) return new AIError("provider_unavailable", `${provider} is having trouble right now (HTTP ${status}).`);
  return new AIError("unknown", `${provider} returned HTTP ${status}.`);
}

export function toAIError(err: unknown, provider = "The AI provider"): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof Error) {
    if (err.name === "TimeoutError") return new AIError("timeout", `${provider} took too long to respond.`);
    if (err.name === "AbortError") return new AIError("timeout", "The request was cancelled.");
    const cause = (err as Error & { cause?: { code?: string } }).cause;
    if (cause?.code === "ECONNREFUSED" || /fetch failed|ECONNREFUSED/i.test(err.message))
      return new AIError("provider_unavailable", `Could not reach ${provider}.`, "If you use Ollama, make sure `ollama serve` is running.");
  }
  return new AIError("unknown", "Something went wrong while contacting the AI provider.");
}
