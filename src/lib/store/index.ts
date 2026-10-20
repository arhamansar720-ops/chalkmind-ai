"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createLocalRepository } from "./local";
import type { CollectionMap, CollectionName, Repository } from "./types";

/**
 * The single data-access point for the UI. Components never talk to
 * IndexedDB or Supabase directly; they call `store.*` or the hooks below,
 * and re-render when a collection changes (in this tab or another).
 */

type Listener = (name: CollectionName | "*") => void;

let repo: Repository | null = null;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;
let repoVersion = 0;

function ensureRepo(): Repository {
  if (!repo) repo = createLocalRepository();
  if (!channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("chalkmind-store");
    channel.onmessage = (e) => listeners.forEach((l) => l(e.data as CollectionName));
  }
  return repo;
}

function emit(name: CollectionName | "*") {
  listeners.forEach((l) => l(name));
  try {
    channel?.postMessage(name);
  } catch {
    /* ignore */
  }
}

/** Swap storage backends (e.g. after signing in to cloud sync). */
export function setRepository(next: Repository) {
  repo = next;
  repoVersion++;
  emit("*");
}

export function repositoryKind(): Repository["kind"] {
  return ensureRepo().kind;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function newId(prefix = ""): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return prefix ? `${prefix}_${rand.replace(/-/g, "").slice(0, 16)}` : rand;
}

export const store = {
  list<K extends CollectionName>(name: K) {
    return ensureRepo().list(name);
  },
  get<K extends CollectionName>(name: K, id: string) {
    return ensureRepo().get(name, id);
  },
  async put<K extends CollectionName>(name: K, record: CollectionMap[K]) {
    await ensureRepo().put(name, record);
    emit(name);
  },
  async delete<K extends CollectionName>(name: K, id: string) {
    await ensureRepo().delete(name, id);
    emit(name);
  },
  async clear<K extends CollectionName>(name: K) {
    await ensureRepo().clear(name);
    emit(name);
  },
};

function useRepoVersion() {
  return useSyncExternalStore(
    (cb) => {
      const fn: Listener = (n) => n === "*" && cb();
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => repoVersion,
    () => 0,
  );
}

export interface CollectionState<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useCollection<K extends CollectionName>(name: K): CollectionState<CollectionMap[K]> {
  const version = useRepoVersion();
  const [state, setState] = useState<{ items: CollectionMap[K][]; loading: boolean; error: string | null }>({
    items: [],
    loading: true,
    error: null,
  });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    store
      .list(name)
      .then((items) => alive && setState({ items, loading: false, error: null }))
      .catch((err: unknown) =>
        alive && setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Could not load data." })),
      );
    return () => {
      alive = false;
    };
  }, [name, tick, version]);

  useEffect(
    () =>
      subscribe((changed) => {
        if (changed === name || changed === "*") setTick((t) => t + 1);
      }),
    [name],
  );

  return { ...state, reload };
}

export function useRecord<K extends CollectionName>(name: K, id: string | null | undefined) {
  const version = useRepoVersion();
  const [state, setState] = useState<{ record: CollectionMap[K] | undefined; loading: boolean }>({
    record: undefined,
    loading: Boolean(id),
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    store
      .get(name, id)
      .then((record) => alive && setState({ record, loading: false }))
      .catch(() => alive && setState({ record: undefined, loading: false }));
    return () => {
      alive = false;
    };
  }, [name, id, tick, version]);
  useEffect(
    () =>
      subscribe((changed) => {
        if (changed === name || changed === "*") setTick((t) => t + 1);
      }),
    [name],
  );
  return id ? state : { record: undefined, loading: false };
}
