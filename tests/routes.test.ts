import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["AI_PROVIDER", "AI_API_KEY", "GROQ_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "REQUIRE_AUTH", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "AI_MODEL", "AI_VISION_MODEL"];
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

  it("reports provider failures as an error event", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.AI_API_KEY = "bad";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
    const { POST } = await import("@/app/api/tutor/route");
    const events = await readEvents(await POST(post(valid)));
    expect(events.find((e) => e.type === "error")).toMatchObject({ code: "auth" });
  });

  it("requires a valid session token when REQUIRE_AUTH is on", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.AI_API_KEY = "k";
    process.env.REQUIRE_AUTH = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/v1/user")) return new Response("{}", { status: 401 });
      throw new Error("AI provider must not be called for unauthenticated requests");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/tutor/route");
    expect((await POST(post(valid))).status).toBe(401);
    expect((await POST(post(valid, { authorization: "Bearer expired" }))).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
  it("reports corrupted PDFs", async () => {
    const { POST } = await import("@/app/api/documents/extract/route");
    const res = await POST(upload(new File(["%PDF-1.7 this is not really a pdf"], "broken.pdf", { type: "application/pdf" })));
    expect(res.status).toBe(422);
  });
});
