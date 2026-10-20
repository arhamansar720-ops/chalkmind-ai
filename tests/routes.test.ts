import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["AI_PROVIDER", "AI_API_KEY", "GROQ_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "REQUIRE_AUTH", "DATABASE_URL", "SIGNUP_CODE", "AI_MODEL", "AI_VISION_MODEL"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/tutor", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const valid = { messages: [{ role: "user", content: "Explain fractions" }] };

async function readEvents(res: Response) {
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
}

describe("POST /api/tutor", () => {
  it("returns a setup error (not a fake answer) when no provider is configured", async () => {
    const { POST } = await import("@/app/api/tutor/route");
    const res = await POST(post(valid));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe("not_configured");
  });

  it("rejects malformed and oversized requests", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.AI_API_KEY = "k";
    const { POST } = await import("@/app/api/tutor/route");
    expect((await POST(post("{nope"))).status).toBe(400);
    expect((await POST(post({ messages: "hi" }))).status).toBe(400);
    const huge = { messages: [{ role: "user", content: "x".repeat(11_000) }], board: [], excerpts: [], image: "data:image/png;base64," + "A".repeat(7_400_000) };
    expect((await POST(post(huge))).status).toBe(413);
  });

  it("streams validated events and drops unsafe board actions", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.AI_API_KEY = "test";
    const modelText = [
      '{"t":"title","text":"Fractions","subject":"Mathematics"}',
      '{"t":"say","text":"A fraction is a part of a whole."}',
      '{"t":"board","actions":[{"type":"add_equation","latex":"\\\\frac{1}{2}"},{"type":"run_js","code":"alert(document.cookie)"}]}',
      '{"t":"followups","items":["What about 3/4?"]}',
    ].join("\n");
    const chunks = modelText.match(/[\s\S]{1,25}/g)!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const enc = new TextEncoder();
        return new Response(
          new ReadableStream({
            start(c) {
              for (const ch of chunks) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`));
              c.enqueue(enc.encode("data: [DONE]\n\n"));
              c.close();
            },
          }),
          { status: 200 },
        );
      }),
    );
    const { POST } = await import("@/app/api/tutor/route");
    const res = await POST(post(valid));
    expect(res.headers.get("content-type")).toContain("ndjson");
    const events = await readEvents(res);
    expect(events.map((e) => e.type)).toEqual(["meta", "title", "say", "board", "followups", "done"]);
    const board = events.find((e) => e.type === "board");
    expect(board.actions).toEqual([{ type: "add_equation", latex: "\\frac{1}{2}" }]);
    expect(board.rejected).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("document.cookie");
  });

  it("reads images with the vision model first, then teaches with the main model", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.AI_API_KEY = "test";
    const sse = (text: string) => {
      const enc = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
            c.enqueue(enc.encode("data: [DONE]\n\n"));
            c.close();
          },
        }),
        { status: 200 },
      );
    };
    const bodies: { model: string; messages: { content: unknown }[]; max_completion_tokens: number; reasoning_effort?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        bodies.push(body);
        return bodies.length === 1 ? sse("Image 1: Solve $3x + 4 = 19$") : sse('{"t":"say","text":"Subtract 4 first."}');
      }),
    );
    const { POST } = await import("@/app/api/tutor/route");
    const img = "data:image/png;base64,iVBORw0KGgo=";
    const events = await readEvents(await POST(post({ messages: [{ role: "user", content: "Help with this" }], images: [img] })));
    expect(events.find((e) => e.type === "say")).toMatchObject({ text: "Subtract 4 first." });
    expect(bodies).toHaveLength(2);
    // 1) the vision model sees the image, with a short output budget and no thinking
    expect(bodies[0].model).toBe("qwen/qwen3.8-27b");
    expect(JSON.stringify(bodies[0].messages)).toContain("image_url");
    expect(bodies[0].reasoning_effort).toBe("none");
    expect(bodies[0].max_completion_tokens).toBeLessThanOrEqual(1000);
    // 2) the main model gets the transcription as text, never the image
    expect(bodies[1].model).toBe("openai/gpt-oss-120b");
    const mainUser = JSON.stringify(bodies[1].messages.at(-1));
    expect(mainUser).not.toContain("image_url");
    expect(mainUser).toContain("Solve $3x + 4 = 19$");
    expect(mainUser).toContain("Help with this");
  });

  it("reports provider failures as an error event", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.AI_API_KEY = "bad";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
    const { POST } = await import("@/app/api/tutor/route");
    const events = await readEvents(await POST(post(valid)));
    expect(events.find((e) => e.type === "error")).toMatchObject({ code: "auth" });
  });

  it("refuses to run open when REQUIRE_AUTH is on but no database is configured", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.AI_API_KEY = "k";
    process.env.REQUIRE_AUTH = "true";
    const fetchMock = vi.fn(async () => {
      throw new Error("AI provider must not be called");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/tutor/route");
    expect((await POST(post(valid))).status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("rate limiter", () => {
  it("limits per key within a window", async () => {
    const { createRateLimiter } = await import("@/lib/server/rate-limit");
    const rl = createRateLimiter(2, 1000);
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("a", 10).ok).toBe(true);
    const third = rl.check("a", 20);
    expect(third.ok).toBe(false);
    expect(third.retryAfterSec).toBe(1);
    expect(rl.check("b", 20).ok).toBe(true);
    expect(rl.check("a", 1001).ok).toBe(true);
  });
});

describe("POST /api/documents/extract", () => {
  const upload = (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return new Request("http://localhost/api/documents/extract", { method: "POST", body: form, headers: { "x-forwarded-for": `10.1.0.${Math.floor(Math.random() * 250)}` } });
  };
  it("extracts text files and rejects empty or unsupported uploads", async () => {
    const { POST } = await import("@/app/api/documents/extract/route");
    const ok = await POST(upload(new File(["Photosynthesis happens in chloroplasts."], "notes.txt", { type: "text/plain" })));
    expect(ok.status).toBe(200);
    expect((await ok.json()).pages[0].text).toContain("chloroplasts");
    expect((await POST(upload(new File([""], "empty.txt", { type: "text/plain" })))).status).toBe(422);
    expect((await POST(upload(new File(["MZ\u0000\u0000"], "virus.exe", { type: "application/octet-stream" })))).status).toBe(415);
  });
  it("extracts PowerPoint slides and rejects legacy Office files", async () => {
    const { strToU8, zipSync } = await import("fflate");
    const { POST } = await import("@/app/api/documents/extract/route");
    const deck = zipSync({
      "ppt/presentation.xml": strToU8("<p:presentation/>"),
      "ppt/slides/slide1.xml": strToU8('<p:sld xmlns:a="a"><a:p><a:r><a:t>Cell membranes</a:t></a:r></a:p></p:sld>'),
    });
    const res = await POST(upload(new File([deck], "bio.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mime).toContain("presentationml");
    expect(json.pages).toEqual([{ page: 1, text: "Cell membranes" }]);
    expect((await POST(upload(new File(["\u00d0\u00cf\u0011\u00e0 legacy"], "old.ppt", { type: "application/vnd.ms-powerpoint" })))).status).toBe(415);
  });
  it("reports corrupted PDFs", async () => {
    const { POST } = await import("@/app/api/documents/extract/route");
    const res = await POST(upload(new File(["%PDF-1.7 this is not really a pdf"], "broken.pdf", { type: "application/pdf" })));
    expect(res.status).toBe(422);
  });
});
