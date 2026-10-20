"use client";

import { useEffect, useState } from "react";
import type { PublicConfig } from "../ai/config";

let cache: Promise<PublicConfig> | null = null;

function load(): Promise<PublicConfig> {
  cache ??= fetch("/api/health", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<PublicConfig>;
    })
    .catch((err) => {
      cache = null;
      throw err;
    });
  return cache;
}

/** Which server features are configured (AI provider, embeddings, cloud sync). */
export function useHealth() {
  const [state, setState] = useState<{ data: PublicConfig | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  useEffect(() => {
    let alive = true;
    load()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch(() => alive && setState({ data: null, error: "Couldn't reach the Chalkmind server.", loading: false }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
