"use client";

import { createLocalRepository } from "./local";
import { COLLECTIONS, type CollectionMap, type CollectionName, type Repository } from "./types";

/**
 * Signed-in storage: an IndexedDB cache per account (so two people on one
 * browser never mix data), kept in step with the server. Reads are always
 * local and instant. Writes land locally first and are queued in an outbox
 * that's pushed to /api/data; changes from other devices are pulled from
 * /api/data/sync. Conflicts resolve by the record's updatedAt (last write wins).
 */

export type SyncStatus =
  /** `localOnly`: records the server refused (e.g. too large), kept on this device. */
  | { state: "idle"; lastSync: number | null; pending: number; localOnly: number }
  | { state: "syncing"; pending: number }
  | { state: "offline"; pending: number }
  | { state: "error"; message: string; pending: number };

export interface SyncedRepository extends Repository {
  syncNow(): Promise<void>;
  /** Copy records from another repository (e.g. this device's guest data) into the account. */
  importFrom(source: Repository): Promise<number>;
  dispose(): void;
}

type Op = { kind: "put" | "del"; name: CollectionName; id: string } | { kind: "clear"; name: CollectionName };
const opKey = (op: Op) => (op.kind === "clear" ? `clear:${op.name}` : `${op.kind}:${op.name}:${op.id}`);

interface Change {
  collection: CollectionName;
  id: string;
  deleted: boolean;
  updatedAt: number;
  data: (CollectionMap[CollectionName] & { updatedAt: number }) | null;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the outbox still works for this tab */
  }
}

class HttpFail extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new HttpFail(res.status);
  return res;
}

export function createSyncedRepository(
  userId: string,
  hooks: { onStatus: (s: SyncStatus) => void; onChanged: (names: CollectionName[]) => void; onSignedOut: () => void },
): SyncedRepository {
  const local = createLocalRepository(`chalkmind-u-${userId}`);
  const outboxKey = `cm-outbox-${userId}`;
  const cursorKey = `cm-sync-cursor-${userId}`;
  const outbox = new Map<string, Op>(load<Op[]>(outboxKey, []).map((op) => [opKey(op), op]));
  let cursor: string | null = load<string | null>(cursorKey, null);
  let running: Promise<void> | null = null;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSync: number | null = null;
  let disposed = false;
  const skipped: string[] = [];

  const persistOutbox = () => save(outboxKey, [...outbox.values()]);
  const enqueue = (op: Op) => {
    if (op.kind === "clear") {
      for (const [k, o] of outbox) if (o.name === op.name) outbox.delete(k);
    } else {
      // A delete cancels a pending save of the same record, and vice versa.
      outbox.delete(opKey({ ...op, kind: op.kind === "put" ? "del" : "put" }));
    }
    outbox.set(opKey(op), op);
    persistOutbox();
    schedule(1200);
  };
  const schedule = (ms: number) => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), ms);
  };

  async function push() {
    for (const [key, op] of [...outbox]) {
      try {
        if (op.kind === "put") {
          const record = await local.get(op.name, op.id);
          if (record) await call("PUT", `/api/data/${op.name}/${encodeURIComponent(op.id)}`, record);
        } else if (op.kind === "del") {
          await call("DELETE", `/api/data/${op.name}/${encodeURIComponent(op.id)}`);
        } else {
          await call("DELETE", `/api/data/${op.name}`);
        }
        outbox.delete(key);
      } catch (err) {
        // Too large / rejected records stay on this device only; anything else retries later.
        if (err instanceof HttpFail && (err.status === 413 || err.status === 400 || err.status === 404)) {
          outbox.delete(key);
          skipped.push(op.kind === "clear" ? op.name : op.id);
        } else {
          persistOutbox();
          throw err;
        }
      }
    }
    persistOutbox();
  }

  async function pull() {
    const changed = new Set<CollectionName>();
    for (let page = 0; page < 40; page++) {
      const res = await call("GET", `/api/data/sync${cursor ? `?since=${encodeURIComponent(cursor)}` : ""}`);
      const body = (await res.json()) as { changes: Change[]; cursor: string | null; more: boolean };
      for (const c of body.changes) {
        if (!(COLLECTIONS as string[]).includes(c.collection)) continue;
        // A local edit that hasn't been pushed yet wins over what the server has.
        if (outbox.has(`put:${c.collection}:${c.id}`) || outbox.has(`del:${c.collection}:${c.id}`)) continue;
        const mine = await local.get(c.collection, c.id);
        if (c.deleted) {
          if (mine) {
            await local.delete(c.collection, c.id);
            changed.add(c.collection);
          }
        } else if (c.data && (!mine || (mine.updatedAt ?? 0) <= c.updatedAt)) {
          await local.put(c.collection, c.data as never);
          changed.add(c.collection);
        }
      }
      cursor = body.cursor;
      save(cursorKey, cursor);
      if (!body.more) break;
    }
    if (changed.size) hooks.onChanged([...changed]);
  }

  async function run() {
    hooks.onStatus({ state: "syncing", pending: outbox.size });
    try {
      await push();
      await pull();
      lastSync = Date.now();
      hooks.onStatus({ state: "idle", lastSync, pending: outbox.size, localOnly: skipped.length });
    } catch (err) {
      if (err instanceof HttpFail && err.status === 401) {
        hooks.onSignedOut();
        return;
      }
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      hooks.onStatus(offline ? { state: "offline", pending: outbox.size } : { state: "error", message: "Couldn't sync. Will retry.", pending: outbox.size });
      schedule(15_000);
    }
  }

  function syncNow(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = run().finally(() => {
      running = null;
      if (again) {
        again = false;
        void syncNow();
      }
    });
    return running;
  }

  const onWake = () => void syncNow();
  const onVisible = () => document.visibilityState === "visible" && void syncNow();
  window.addEventListener("online", onWake);
  window.addEventListener("focus", onWake);
  document.addEventListener("visibilitychange", onVisible);
  const interval = setInterval(onWake, 60_000);

  return {
    kind: "cloud",
    list: (name) => local.list(name),
    get: (name, id) => local.get(name, id),
    async put(name, record) {
      await local.put(name, record);
      enqueue({ kind: "put", name, id: record.id });
    },
    async delete(name, id) {
      await local.delete(name, id);
      enqueue({ kind: "del", name, id });
    },
    async clear(name) {
      await local.clear(name);
      enqueue({ kind: "clear", name });
    },
    syncNow,
    async importFrom(source) {
      let n = 0;
      for (const name of COLLECTIONS) {
        for (const record of await source.list(name)) {
          const mine = await local.get(name, record.id);
          if (mine && mine.updatedAt >= record.updatedAt) continue;
          await local.put(name, record);
          enqueue({ kind: "put", name, id: record.id });
          n++;
        }
      }
      if (n) hooks.onChanged([...COLLECTIONS]);
      await syncNow();
      return n;
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onVisible);
    },
  };
}
