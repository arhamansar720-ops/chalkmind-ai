import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAIConfig } from "@/lib/ai/config";
import { AIError, errorFromStatus, parseDurationSec, retryAfterFromHeaders } from "@/lib/ai/errors";
import { FallbackProvider, resetCooldowns } from "@/lib/ai/fallback";
import { createProvider } from "@/lib/ai";
import type { AIProvider, GenerateRequest, StreamChunk } from "@/lib/ai/types";

/** Fake provider: models listed in `limited` answer 429 with the given wait. */
function fakeProvider(limited: Record<string, number>, calls: string[]): AIProvider {
  return {
    id: "groq",
    model: "big",
    visionModel: "eyes",
    async *stream(req: GenerateRequest): AsyncGenerator<StreamChunk> {
      const model = req.model ?? "big";
      calls.push(model);
      if (model in limited) throw new AIError("rate_limited", "limit", undefined, limited[model]);
      yield { type: "text", text: `from ${model}` };
      yield { type: "done", finishReason: "stop" };
    },
  };
}

async function collect(p: AIProvider, req: Partial<GenerateRequest> = {}) {
  const out: StreamChunk[] = [];
  for await (const c of p.stream({ system: "s", messages: [{ role: "user", content: "hi" }], ...req })) out.push(c);
  return out;
}

beforeEach(() => resetCooldowns());
afterEach(() => vi.unstubAllGlobals());

describe("rate-limit fallback", () => {
  it("uses the main model when it is available", async () => {
    const calls: string[] = [];
    const out = await collect(new FallbackProvider(fakeProvider({}, calls), ["small"]));
    expect(calls).toEqual(["big"]);
    expect(out.some((c) => c.type === "fallback")).toBe(false);
  });

  it("switches to the next model on 429 and skips the main one until it resets", async () => {
    let now = 1_000_000;
    const calls: string[] = [];
    const limited: Record<string, number> = { big: 40 };
    const p = new FallbackProvider(fakeProvider(limited, calls), ["small"], () => now);

    const first = await collect(p);
    expect(calls).toEqual(["big", "small"]);
    expect(first[0]).toEqual({ type: "fallback", from: "big", to: "small", retryAfterSec: 40 });
    expect(first.find((c) => c.type === "text")).toEqual({ type: "text", text: "from small" });

    // Still cooling down: go straight to the fallback.
    now += 10_000;
    calls.length = 0;
    const second = await collect(p);
    expect(calls).toEqual(["small"]);
    expect(second[0]).toMatchObject({ type: "fallback", retryAfterSec: 30 });

    // After the reset the main model is used again.
    now += 31_000;
    delete limited.big;
    calls.length = 0;
    await collect(p);
    expect(calls).toEqual(["big"]);
  });

  it("reports how long to wait when every model is limited", async () => {
    const calls: string[] = [];
    const p = new FallbackProvider(fakeProvider({ big: 50, small: 20 }, calls), ["small"], () => 0);
    await expect(collect(p)).rejects.toMatchObject({ code: "rate_limited", retryAfterSec: 20 });
  });

  it("skips a fallback model that doesn't exist", async () => {
    const calls: string[] = [];
    const inner = fakeProvider({ big: 30 }, calls);
    const stream = inner.stream.bind(inner);
    inner.stream = async function* (req) {
      if (req.model === "gone") {
        calls.push("gone");
        throw new AIError("model_not_found", "missing");
      }
      yield* stream(req);
    };
    const out = await collect(new FallbackProvider(inner, ["gone", "small"]));
    expect(calls).toEqual(["big", "gone", "small"]);
    expect(out[0]).toMatchObject({ type: "fallback", to: "small" });
  });

  it("doesn't fall back for image requests or other errors", async () => {
    const calls: string[] = [];
    const p = new FallbackProvider(fakeProvider({ big: 30 }, calls), ["small"]);
    await expect(collect(p, { vision: true })).rejects.toMatchObject({ code: "rate_limited" });
    expect(calls).toEqual(["big"]);

    const inner = fakeProvider({}, []);
    inner.stream = async function* () {
      throw new AIError("auth", "bad key");
    };
    await expect(collect(new FallbackProvider(inner, ["small"]))).rejects.toMatchObject({ code: "auth" });
  });

  it("retries a real 429 from Groq on the fallback model", async () => {
    const cfg = readAIConfig({ AI_PROVIDER: "groq", AI_API_KEY: "k" });
    if (!cfg.ok) throw new Error();
    const models: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        const { model } = JSON.parse(String(init.body));
        models.push(model);
        if (model === cfg.config.model) return new Response("rate limited", { status: 429, headers: { "retry-after": "12" } });
        const enc = new TextEncoder();
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
              c.close();
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }),
    );
    const out = await collect(createProvider(cfg.config));
    expect(models).toEqual([cfg.config.model, cfg.config.fallbackModels[0]]);
    expect(out[0]).toMatchObject({ type: "fallback", from: cfg.config.model, retryAfterSec: 12 });
  });
});

describe("fallback config", () => {
  it("has preset fallbacks for Groq and honours AI_FALLBACK_MODELS", () => {
    const groq = readAIConfig({ AI_PROVIDER: "groq", AI_API_KEY: "k" });
    expect(groq.ok && groq.config.fallbackModels.length).toBeGreaterThan(0);
    const custom = readAIConfig({ AI_PROVIDER: "groq", AI_API_KEY: "k", AI_FALLBACK_MODELS: "a, b ,a" });
    expect(custom.ok && custom.config.fallbackModels).toEqual(["a", "b"]);
    const off = readAIConfig({ AI_PROVIDER: "groq", AI_API_KEY: "k", AI_FALLBACK_MODELS: "none" });
    expect(off.ok && off.config.fallbackModels).toEqual([]);
    // A custom main model doesn't inherit the preset's fallbacks.
    const own = readAIConfig({ AI_PROVIDER: "groq", AI_API_KEY: "k", AI_MODEL: "my-model" });
    expect(own.ok && own.config.fallbackModels).toEqual([]);
  });
});

describe("retry-after parsing", () => {
  it("parses provider reset durations", () => {
    expect(parseDurationSec("12")).toBe(12);
    expect(parseDurationSec("7.66s")).toBe(8);
    expect(parseDurationSec("2m59.56s")).toBe(180);
    expect(parseDurationSec("450ms")).toBe(1);
    expect(parseDurationSec("soon")).toBeUndefined();
    expect(parseDurationSec("")).toBeUndefined();
  });

  it("reads Retry-After or Groq's reset headers", () => {
    expect(retryAfterFromHeaders(new Headers({ "retry-after": "30" }))).toBe(30);
    expect(retryAfterFromHeaders(new Headers({ "x-ratelimit-reset-tokens": "7.2s", "x-ratelimit-reset-requests": "1m2s" }))).toBe(62);
    expect(retryAfterFromHeaders(new Headers())).toBeUndefined();
    expect(errorFromStatus("Groq", 429, "", new Headers({ "retry-after": "9" })).retryAfterSec).toBe(9);
  });
});
