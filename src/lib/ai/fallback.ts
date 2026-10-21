import { AIError } from "./errors";
import { hasImages, type AIProvider, type GenerateRequest, type StreamChunk } from "./types";

/**
 * Keeps the tutor usable when the main model hits its per-minute limit.
 *
 * Free tiers (Groq especially) rate-limit each model separately, so when the
 * main model answers 429 the request is retried on the next fallback model
 * and the main model is skipped until its limit resets. Only when every model
 * is cooling down does the request fail — with the time until the soonest one
 * is free again, so the UI can show a countdown.
 *
 * Cooldowns live in memory, per server instance: a best-effort optimisation,
 * not a guarantee.
 */

const DEFAULT_COOLDOWN_SEC = 60;
const MISSING_MODEL_COOLDOWN_SEC = 15 * 60;
const cooldowns = new Map<string, number>();

export function resetCooldowns() {
  cooldowns.clear();
}

export class FallbackProvider implements AIProvider {
  constructor(
    private readonly inner: AIProvider,
    private readonly fallbacks: string[],
    private readonly now: () => number = Date.now,
  ) {}

  get id() {
    return this.inner.id;
  }
  get model() {
    return this.inner.model;
  }
  get visionModel() {
    return this.inner.visionModel;
  }

  private key(model: string) {
    return `${this.inner.id}:${model}`;
  }
  private waitSec(model: string, now: number) {
    return Math.max(0, Math.ceil(((cooldowns.get(this.key(model)) ?? 0) - now) / 1000));
  }

  async *stream(req: GenerateRequest): AsyncGenerator<StreamChunk> {
    // Image requests need the vision model; there's nothing equivalent to fall back to.
    if (req.model || req.vision || hasImages(req.messages) || this.fallbacks.length === 0) {
      yield* this.inner.stream(req);
      return;
    }
    const primary = this.inner.model;
    const candidates = [primary, ...this.fallbacks.filter((m) => m !== primary)];

    for (const model of candidates) {
      const now = this.now();
      if (this.waitSec(model, now) > 0) continue;
      let started = false;
      try {
        for await (const chunk of this.inner.stream({ ...req, model })) {
          if (!started && model !== primary) {
            yield { type: "fallback", from: primary, to: model, retryAfterSec: this.waitSec(primary, this.now()) };
          }
          started = true;
          yield chunk;
        }
        return;
      } catch (err) {
        // Once a model has started answering, a failure is that answer's failure.
        if (started || !(err instanceof AIError)) throw err;
        if (err.code === "rate_limited") {
          cooldowns.set(this.key(model), now + (err.retryAfterSec ?? DEFAULT_COOLDOWN_SEC) * 1000);
        } else if (err.code === "model_not_found" && model !== primary) {
          cooldowns.set(this.key(model), now + MISSING_MODEL_COOLDOWN_SEC * 1000);
        } else {
          throw err;
        }
      }
    }

    const now = this.now();
    const waits = candidates.map((m) => this.waitSec(m, now)).filter((s) => s > 0);
    const retryAfterSec = waits.length ? Math.min(...waits) : DEFAULT_COOLDOWN_SEC;
    throw new AIError(
      "rate_limited",
      `Every available model is at its usage limit right now. You can ask again in ${formatWait(retryAfterSec)}.`,
      "Free tiers allow a limited number of tokens per minute.",
      retryAfterSec,
    );
  }
}

export function formatWait(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
