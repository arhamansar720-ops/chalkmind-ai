import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createLocalRepository } from "@/lib/store/local";
import { createCloudRepository, tableFor } from "@/lib/store/cloud";
import type { TutorSession } from "@/lib/store/types";
import { createSession, historyForRequest, mergeBoardIndex, assistantContextText } from "@/lib/tutor/session";
import { chunkPages } from "@/lib/docs/chunk";
import { bm25, cosine, searchChunks } from "@/lib/docs/search";

function session(id: string, updatedAt: number, extra: Partial<TutorSession> = {}): TutorSession {
  return { ...createSession(id, updatedAt), ...extra };
}

describe("local repository (IndexedDB)", () => {
  it("persists sessions with board state and returns newest first", async () => {
    const repo = createLocalRepository(`test-${Math.random()}`);
    const board = { elements: [{ id: "e1", type: "text", text: "x = 3", customData: { cm: "e1" } }], files: { "eq-1": { id: "eq-1", dataURL: "data:image/svg+xml;base64,AA" } } };
    await repo.put("sessions", session("a", 1, { title: "Old" }));
    await repo.put("sessions", session("b", 5, { title: "New", board, boardIndex: [{ id: "e1", kind: "add_equation", summary: "x = 3" }] }));
    const list = await repo.list("sessions");
    expect(list.map((s) => s.id)).toEqual(["b", "a"]);
    const b = await repo.get("sessions", "b");
    expect(b?.board).toEqual(board);
    expect(b?.boardIndex[0].id).toBe("e1");
  });

  it("updates, deletes and clears", async () => {
    const repo = createLocalRepository(`test-${Math.random()}`);
    await repo.put("sessions", session("a", 1));
    await repo.put("sessions", session("a", 2, { title: "Renamed" }));
    expect((await repo.get("sessions", "a"))?.title).toBe("Renamed");
    await repo.delete("sessions", "a");
    expect(await repo.get("sessions", "a")).toBeUndefined();
    await repo.put("tasks", { id: "t", title: "Read", done: false, kind: "task", createdAt: 1, updatedAt: 1 });
    await repo.clear("tasks");
    expect(await repo.list("tasks")).toEqual([]);
  });

  it("stores a copy, not a live reference", async () => {
    const repo = createLocalRepository(`test-${Math.random()}`);
    const s = session("a", 1);
    await repo.put("sessions", s);
    s.title = "mutated after save";
    expect((await repo.get("sessions", "a"))?.title).toBe("New session");
  });
});

/** Minimal fake of the Supabase query builder that records filters. */
function fakeSupabase() {
  const calls: { table: string; op: string; filters: [string, unknown][]; payload?: unknown }[] = [];
  const client = {
    from(table: string) {
      const call = { table, op: "", filters: [] as [string, unknown][], payload: undefined as unknown };
      calls.push(call);
      const builder = {
        select() { call.op = call.op || "select"; return builder; },
        delete() { call.op = "delete"; return builder; },
        upsert(p: unknown) { call.op = "upsert"; call.payload = p; return Promise.resolve({ error: null }); },
        eq(col: string, v: unknown) { call.filters.push([col, v]); return builder; },
        order() { return Promise.resolve({ data: [], error: null }); },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(resolve: (v: { error: null }) => void) { resolve({ error: null }); },
      };
      return builder;
    },
  };
  return { client, calls };
}

describe("cloud repository (authorization)", () => {
  it("scopes every read and write to the signed-in user", async () => {
    const { client, calls } = fakeSupabase();
    const repo = createCloudRepository(client as never, "user-123");
    await repo.list("sessions");
    await repo.get("homework", "h1");
    await repo.put("materials", { id: "m1", title: "Deck", createdAt: 1, updatedAt: 2 } as never);
    await repo.delete("documents", "d1");
    await repo.clear("signals");
    for (const c of calls) {
      if (c.op === "upsert") expect((c.payload as { user_id: string }).user_id).toBe("user-123");
      else expect(c.filters).toContainEqual(["user_id", "user-123"]);
      expect(c.table).toMatch(/^cm_/);
    }
    expect(calls).toHaveLength(5);
    expect(tableFor("sessions")).toBe("cm_sessions");
  });
});

describe("session helpers", () => {
  it("builds alternating history, skipping errored turns", () => {
    const h = historyForRequest([
      { id: "1", role: "assistant", content: "orphan", createdAt: 0 },
      { id: "2", role: "user", content: "a", createdAt: 1 },
      { id: "3", role: "user", content: "b", createdAt: 2 },
      { id: "4", role: "assistant", content: "", error: { code: "x", message: "y" }, createdAt: 3 },
      { id: "5", role: "assistant", content: "answer", createdAt: 4 },
    ]);
    expect(h).toEqual([
      { role: "user", content: "a\n\nb" },
      { role: "assistant", content: "answer" },
    ]);
  });
  it("summarizes what was drawn for follow-up context", () => {
    const text = assistantContextText({ content: "", steps: [{ say: "Subtract 4.", actions: [] }] }, [{ id: "e2", kind: "add_equation", summary: "2x = 6", bounds: { x: 0, y: 0, width: 1, height: 1 } }]);
    expect(text).toContain("Subtract 4.");
    expect(text).toContain("e2: 2x = 6");
  });
  it("merges and resets the board index", () => {
    const idx = mergeBoardIndex([{ id: "a", kind: "add_text", summary: "old" }], [{ id: "a", kind: "add_text", summary: "new", bounds: { x: 0, y: 0, width: 0, height: 0 } }], false);
    expect(idx).toEqual([{ id: "a", kind: "add_text", summary: "new" }]);
    expect(mergeBoardIndex(idx, [], true)).toEqual([]);
  });
});

describe("document retrieval", () => {
  const pages = [
    { page: 1, text: "Photosynthesis converts light energy into chemical energy. It happens in the chloroplasts of plant cells." },
    { page: 2, text: "The French Revolution began in 1789. It ended the monarchy in France." },
    { page: 3, text: "Cellular respiration releases energy from glucose in the mitochondria." },
  ];
  it("chunks per page so citations stay accurate", () => {
    const chunks = chunkPages(pages, "d");
    expect(chunks.map((c) => c.page)).toEqual([1, 2, 3]);
    const long = chunkPages([{ page: 7, text: "Sentence number one is here. ".repeat(120) }], "d");
    expect(long.length).toBeGreaterThan(2);
    expect(long.every((c) => c.page === 7 && c.text.length <= 1400)).toBe(true);
  });
  it("finds the relevant passage with keyword search", () => {
    const chunks = chunkPages(pages, "d");
    const hits = searchChunks("where does photosynthesis happen?", chunks, 2);
    expect(hits[0].chunk.page).toBe(1);
    expect(hits[0].method).toBe("keyword");
    expect(bm25("quantum chromodynamics", chunks)).toEqual([]);
  });
  it("blends in vector similarity when embeddings exist", () => {
    const chunks = chunkPages(pages, "d").map((c, i) => ({ ...c, embedding: [i === 2 ? 1 : 0, i === 2 ? 0 : 1] }));
    const hits = searchChunks("energy", chunks, 1, [1, 0]);
    expect(hits[0].method).toBe("hybrid");
    expect(hits[0].chunk.page).toBe(3);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });
});
