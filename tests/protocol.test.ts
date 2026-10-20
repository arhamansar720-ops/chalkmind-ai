import { describe, expect, it } from "vitest";
import { extractJsonObject, JsonObjectStream } from "@/lib/ai/json-stream";
import { modelObjectToEvents, parseTutorEvent, tutorRequestSchema } from "@/lib/tutor/protocol";

describe("JsonObjectStream", () => {
  it("extracts NDJSON objects split across arbitrary chunks", () => {
    const text = '{"t":"say","text":"Hi {there}"}\n{"t":"board","actions":[{"type":"add_text","text":"a \\"quote\\" }"}]}\n';
    const s = new JsonObjectStream();
    const out: unknown[] = [];
    for (let i = 0; i < text.length; i += 7) out.push(...s.push(text.slice(i, i + 7)));
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ t: "say", text: "Hi {there}" });
    expect(s.unterminated).toBe(false);
  });

  it("handles pretty-printed JSON, code fences and stray prose", () => {
    const s = new JsonObjectStream();
    const out = s.push('Sure!\n```json\n{\n  "t": "say",\n  "text": "x"\n}\n```');
    expect(out).toEqual([{ t: "say", text: "x" }]);
    expect(s.stray).toBe("Sure!");
  });

  it("reports unterminated objects (truncated output)", () => {
    const s = new JsonObjectStream();
    s.push('{"t":"say","text":"cut off');
    expect(s.unterminated).toBe(true);
  });

  it("extractJsonObject returns the first object or null", () => {
    expect(extractJsonObject('noise {"a":1} {"b":2}')).toEqual({ a: 1 });
    expect(extractJsonObject("no json here")).toBeNull();
  });
});

describe("modelObjectToEvents", () => {
  it("converts protocol lines", () => {
    expect(modelObjectToEvents({ t: "say", text: "Hello" })).toEqual([{ type: "say", text: "Hello" }]);
    expect(modelObjectToEvents({ t: "followups", items: ["Why?"] })).toEqual([{ type: "followups", items: ["Why?"] }]);
    expect(modelObjectToEvents({ t: "title", text: "Fractions", subject: "Mathematics" })).toEqual([{ type: "title", title: "Fractions", subject: "Mathematics" }]);
    expect(modelObjectToEvents({ t: "check", question: "Does that step make sense?" })).toEqual([{ type: "check", question: "Does that step make sense?" }]);
    expect(modelObjectToEvents({ t: "check", question: "" })).toEqual([{ type: "notice", message: expect.any(String) }]);
    expect(parseTutorEvent(JSON.stringify({ type: "check", question: "Following so far?" }))).toEqual({ type: "check", question: "Following so far?" });
  });

  it("validates board actions and reports rejects", () => {
    const [ev] = modelObjectToEvents({ t: "board", actions: [{ type: "add_text", text: "ok" }, { type: "eval", code: "fetch('x')" }] });
    expect(ev.type).toBe("board");
    if (ev.type !== "board") return;
    expect(ev.actions).toHaveLength(1);
    expect(ev.rejected).toHaveLength(1);
  });

  it("tolerates common deviations", () => {
    expect(modelObjectToEvents({ type: "say", text: "uses type" })).toEqual([{ type: "say", text: "uses type" }]);
    const steps = modelObjectToEvents({ steps: [{ say: "one", board: [{ type: "add_text", text: "x" }] }], followups: ["next?"] });
    expect(steps.map((e) => e.type)).toEqual(["say", "board", "followups"]);
    const bare = modelObjectToEvents({ type: "add_equation", latex: "x=1" });
    expect(bare[0].type).toBe("board");
  });

  it("turns unknown shapes into a notice instead of passing them through", () => {
    expect(modelObjectToEvents({ t: "exec", js: "alert(1)" })).toEqual([{ type: "notice", message: expect.any(String) }]);
    expect(modelObjectToEvents(null)).toEqual([]);
  });
});

describe("parseTutorEvent (browser side)", () => {
  it("re-validates board actions from the server", () => {
    const ev = parseTutorEvent(JSON.stringify({ type: "board", actions: [{ type: "add_text", text: "fine" }, { type: "nope" }], rejected: [] }));
    expect(ev?.type).toBe("board");
    if (ev?.type !== "board") return;
    expect(ev.actions).toHaveLength(1);
    expect(ev.rejected).toHaveLength(1);
  });
  it("ignores malformed lines", () => {
    expect(parseTutorEvent("{not json")).toBeNull();
    expect(parseTutorEvent(JSON.stringify({ type: "unknown" }))).toBeNull();
  });
});

describe("tutor request schema", () => {
  it("applies defaults and limits", () => {
    const r = tutorRequestSchema.parse({ messages: [{ role: "user", content: "hi" }] });
    expect(r.mode).toBe("explain");
    expect(r.board).toEqual([]);
    expect(tutorRequestSchema.safeParse({ messages: [] }).success).toBe(false);
    expect(tutorRequestSchema.safeParse({ messages: [{ role: "system", content: "x" }] }).success).toBe(false);
  });
  it("only accepts image data URLs", () => {
    const base = { messages: [{ role: "user", content: "hi" }] };
    expect(tutorRequestSchema.safeParse({ ...base, image: "data:image/png;base64,AAAA" }).success).toBe(true);
    expect(tutorRequestSchema.safeParse({ ...base, image: "https://evil.example/x.png" }).success).toBe(false);
    expect(tutorRequestSchema.safeParse({ ...base, image: "data:text/html;base64,AAAA" }).success).toBe(false);
  });
});
