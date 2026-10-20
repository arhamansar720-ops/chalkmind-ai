import { afterEach, describe, expect, it, vi } from "vitest";
import { publicConfig, readAIConfig, readEmbeddingsConfig } from "@/lib/ai/config";
import { AIError, errorFromStatus, toAIError } from "@/lib/ai/errors";
import { createProvider, complete } from "@/lib/ai";
import { readSSE, ThinkFilter } from "@/lib/ai/sse";

function sseResponse(events: string[], status = 200) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const e of events) c.enqueue(enc.encode(e));
      c.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("readAIConfig", () => {
  it("reports missing configuration instead of inventing defaults", () => {
    const r = readAIConfig({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("AI_PROVIDER");
  });
  it("auto-detects a provider from its key", () => {
    const r = readAIConfig({ GROQ_API_KEY: "gsk_test" });
    expect(r.ok && r.config.provider).toBe("groq");
    expect(r.ok && r.config.model).toBe("openai/gpt-oss-120b");
  });
  it("requires a key for hosted providers", () => {
    const r = readAIConfig({ AI_PROVIDER: "anthropic" });
    expect(r.ok).toBe(false);
  });
  it("allows keyless local Ollama", () => {
    const r = readAIConfig({ AI_PROVIDER: "ollama", AI_MODEL: "llama3.2" });
    expect(r.ok && r.config.baseUrl).toBe("http://localhost:11434/v1");
    expect(r.ok && r.config.apiKey).toBeNull();
  });
  it("rejects unknown providers and incomplete custom servers", () => {
    expect(readAIConfig({ AI_PROVIDER: "skynet", AI_API_KEY: "x" }).ok).toBe(false);
    expect(readAIConfig({ AI_PROVIDER: "openai-compatible" }).ok).toBe(false);
    expect(readAIConfig({ AI_PROVIDER: "openai-compatible", AI_BASE_URL: "http://localhost:1234/v1/", AI_MODEL: "m" }).ok).toBe(true);
  });
  it("can disable vision explicitly", () => {
    const r = readAIConfig({ GROQ_API_KEY: "k", AI_VISION_MODEL: "none" });
    expect(r.ok && r.config.visionModel).toBeNull();
  });
  it("never exposes secrets in the public summary", () => {
    const env = { AI_PROVIDER: "groq", AI_API_KEY: "gsk_SECRET_123", EMBEDDINGS_PROVIDER: "openai", OPENAI_API_KEY: "sk-SECRET" };
    const json = JSON.stringify(publicConfig(env));
    expect(json).not.toContain("SECRET");
    expect(publicConfig(env).ai.configured).toBe(true);
  });
  it("reads optional embeddings config", () => {
    expect(readEmbeddingsConfig({})).toBeNull();
    expect(readEmbeddingsConfig({ EMBEDDINGS_PROVIDER: "ollama" })?.model).toBe("nomic-embed-text");
    expect(readEmbeddingsConfig({ EMBEDDINGS_PROVIDER: "openai" })).toBeNull();
  });
});

describe("provider errors", () => {
  it("maps HTTP statuses to stable codes", () => {
    expect(errorFromStatus("Groq", 401, "").code).toBe("auth");
    expect(errorFromStatus("Groq", 404, "").code).toBe("model_not_found");
    expect(errorFromStatus("Groq", 429, "").code).toBe("rate_limited");
    expect(errorFromStatus("Groq", 400, "this model does not support image input").code).toBe("unsupported_input");
    expect(errorFromStatus("Groq", 503, "").code).toBe("provider_unavailable");
  });
  it("maps network failures", () => {
    const e = new TypeError("fetch failed");
    expect(toAIError(e, "Ollama").code).toBe("provider_unavailable");
    const t = new Error("x");
    t.name = "TimeoutError";
    expect(toAIError(t).code).toBe("timeout");
  });
});

describe("OpenAI-compatible adapter", () => {
  const cfg = readAIConfig({ AI_PROVIDER: "groq", AI_API_KEY: "test-key" });
  if (!cfg.ok) throw new Error("bad test config");

  it("streams content, signals thinking and sends the key only as a header", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
      const body = JSON.parse(String(init.body));
      expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
      expect(body.stream).toBe(true);
      return sseResponse([
        'data: {"choices":[{"delta":{"reasoning":"hmm"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const p = createProvider(cfg.config);
    const chunks = [];
    for await (const c of p.stream({ system: "sys", messages: [{ role: "user", content: "hi" }] })) chunks.push(c);
    expect(chunks.filter((c) => c.type === "thinking")).toHaveLength(1);
    expect(chunks.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("")).toBe("Hello");
    expect(chunks.at(-1)).toEqual({ type: "done", finishReason: "stop" });
  });

  it("routes images to the vision model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        expect(body.model).toBe(cfg.config.visionModel);
        expect(body.messages[1].content[0]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AA" } });
        return sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', "data: [DONE]\n\n"]);
      }),
    );
    const out = await complete(createProvider(cfg.config), { system: "s", messages: [{ role: "user", content: [{ type: "image", dataUrl: "data:image/png;base64,AA" }, { type: "text", text: "what is this" }] }] });
    expect(out.text).toBe("ok");
  });

  it("refuses images when no vision model is configured", async () => {
    const noVision = readAIConfig({ AI_PROVIDER: "groq", AI_API_KEY: "k", AI_VISION_MODEL: "none" });
    if (!noVision.ok) throw new Error();
    const p = createProvider(noVision.config);
    await expect(complete(p, { system: "s", messages: [{ role: "user", content: [{ type: "image", dataUrl: "data:image/png;base64,AA" }] }] })).rejects.toMatchObject({ code: "unsupported_input" });
  });

  it("surfaces auth failures as AIError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"invalid key"}', { status: 401 })));
    await expect(complete(createProvider(cfg.config), { system: "s", messages: [{ role: "user", content: "x" }] })).rejects.toBeInstanceOf(AIError);
  });

  it("reports truncation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(['data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\n'])));
    const out = await complete(createProvider(cfg.config), { system: "s", messages: [{ role: "user", content: "x" }] });
    expect(out.truncated).toBe(true);
  });
});

describe("Anthropic adapter", () => {
  it("parses message stream events", async () => {
    const cfg = readAIConfig({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-test" });
    if (!cfg.ok) throw new Error();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://api.anthropic.com/v1/messages");
        expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-test");
        return sseResponse([
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi "}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there"}}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
        ]);
      }),
    );
    const out = await complete(createProvider(cfg.config), { system: "s", messages: [{ role: "user", content: "x" }] });
    expect(out).toEqual({ text: "Hi there", truncated: false });
  });
});

describe("stream helpers", () => {
  it("strips inline <think> blocks across chunk boundaries", () => {
    const f = new ThinkFilter();
    const parts = ["Hello <thi", "nk>secret reasoning</th", "ink>world"].map((c) => f.push(c).text);
    expect(parts.join("")).toBe("Hello world");
  });
  it("reads SSE events with names", async () => {
    const res = sseResponse(["event: ping\ndata: 1\n\n", "data: 2\n", "\n"]);
    const out = [];
    for await (const e of readSSE(res.body!)) out.push(e);
    expect(out).toEqual([
      { event: "ping", data: "1" },
      { event: null, data: "2" },
    ]);
  });
});
