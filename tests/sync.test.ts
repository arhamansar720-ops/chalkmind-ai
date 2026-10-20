import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalRepository } from "@/lib/store/local";
import { createSyncedRepository } from "@/lib/store/synced";

// A tiny in-memory stand-in for /api/data, plus the browser globals the sync engine uses.
function fakeServer() {
  const rows = new Map<string, { collection: string; id: string; deleted: boolean; updatedAt: number; data: unknown; seq: number }>();
  let seq = 0;
  const calls: string[] = [];
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    const url = new URL(path, "http://x");
    const [, , , collection, id] = url.pathname.split("/");
    if (url.pathname === "/api/data/sync") {
      const since = Number(url.searchParams.get("since") ?? 0);
      const changes = [...rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
      return Response.json({
        changes: changes.map(({ collection, id, deleted, updatedAt, data }) => ({ collection, id, deleted, updatedAt, data: deleted ? null : data })),
        cursor: String(changes.at(-1)?.seq ?? since),
        more: false,
      });
    }
    if (method === "PUT") {
      const rec = JSON.parse(String(init!.body));
      rows.set(`${collection}/${id}`, { collection, id: decodeURIComponent(id), deleted: false, updatedAt: rec.updatedAt, data: rec, seq: ++seq });
      return Response.json({ saved: true });
    }
    if (method === "DELETE" && id) {
      rows.set(`${collection}/${id}`, { collection, id, deleted: true, updatedAt: Date.now(), data: null, seq: ++seq });
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 204 });
  });
  return { rows, calls, fetch, remoteWrite: (collection: string, data: { id: string; updatedAt: number }) => rows.set(`${collection}/${data.id}`, { collection, id: data.id, deleted: false, updatedAt: data.updatedAt, data, seq: ++seq }) };
}

const rec = (id: string, updatedAt: number, title = id) => ({ id, title, createdAt: 1, updatedAt, mode: "explain", messages: [], docIds: [], boardIndex: [] }) as never;

describe("synced repository", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] });
    vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("document", { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" });
    vi.stubGlobal("navigator", { onLine: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  const make = (uid: string, server: ReturnType<typeof fakeServer>) => {
    vi.stubGlobal("fetch", server.fetch);
    const changed: string[][] = [];
    const repo = createSyncedRepository(uid, { onStatus: () => {}, onChanged: (n) => changed.push(n), onSignedOut: () => {} });
    return { repo, changed };
  };

  it("pushes local writes and pulls other devices' changes", async () => {
    const server = fakeServer();
    const { repo, changed } = make(`u-${Math.random()}`, server);
    await repo.put("sessions", rec("s1", 10));
    await repo.syncNow();
    expect(server.calls).toContain("PUT /api/data/sessions/s1");
    expect((server.rows.get("sessions/s1")!.data as { title: string }).title).toBe("s1");

    server.remoteWrite("sessions", rec("s2", 20, "from laptop"));
    await repo.syncNow();
    expect((await repo.get("sessions", "s2"))?.title).toBe("from laptop");
    expect(changed.flat()).toContain("sessions");
    repo.dispose();
  });

  it("keeps a newer local edit over an older server copy, and syncs deletes", async () => {
    const server = fakeServer();
    const { repo } = make(`u-${Math.random()}`, server);
    await repo.put("sessions", rec("s1", 50, "mine, newer"));
    await repo.syncNow();
    server.remoteWrite("sessions", rec("s1", 40, "older elsewhere"));
    await repo.syncNow();
    expect((await repo.get("sessions", "s1"))?.title).toBe("mine, newer");

    await repo.delete("sessions", "s1");
    await repo.syncNow();
    expect(server.rows.get("sessions/s1")?.deleted).toBe(true);
    repo.dispose();
  });

  it("keeps unsent changes across a reload and retries when back online", async () => {
    const server = fakeServer();
    const uid = `u-${Math.random()}`;
    const failing = vi.fn(async () => {
      throw new TypeError("offline");
    });
    vi.stubGlobal("fetch", failing);
    const first = createSyncedRepository(uid, { onStatus: () => {}, onChanged: () => {}, onSignedOut: () => {} });
    await first.put("homework", { id: "h1", title: "Quadratics", createdAt: 1, updatedAt: 5 } as never);
    await first.syncNow();
    first.dispose();
    expect(server.rows.size).toBe(0);

    const { repo } = make(uid, server);
    await repo.syncNow();
    expect(server.rows.has("homework/h1")).toBe(true);
    repo.dispose();
  });

  it("imports this device's guest data into the account", async () => {
    const server = fakeServer();
    const guest = createLocalRepository(`guest-${Math.random()}`);
    await guest.put("sessions", rec("g1", 3, "before sign-in"));
    const { repo } = make(`u-${Math.random()}`, server);
    expect(await repo.importFrom(guest)).toBe(1);
    expect(server.rows.has("sessions/g1")).toBe(true);
    expect(await repo.importFrom(guest)).toBe(0);
    repo.dispose();
  });
});
