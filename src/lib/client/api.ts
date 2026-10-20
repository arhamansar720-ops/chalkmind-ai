"use client";

import { parseTutorEvent, type TutorEvent, type TutorRequest } from "../tutor/protocol";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

let authToken: string | null = null;
/** Set by the cloud-sync auth provider so AI routes can verify the user when REQUIRE_AUTH is on. */
export function setAuthToken(token: string | null) {
  authToken = token;
}

function headers(json = true): HeadersInit {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; hint?: string } } | null;
  return new ApiError(
    body?.error?.code ?? "http_error",
    body?.error?.message ?? `Request failed (HTTP ${res.status}).`,
    body?.error?.hint,
    res.status,
  );
}

function networkError(err: unknown): ApiError {
  if (err instanceof DOMException && err.name === "AbortError") return new ApiError("aborted", "Stopped.");
  return new ApiError("network", "Couldn't reach Chalkmind's server. Check your connection and try again.");
}

export async function postJSON<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: headers(), body: JSON.stringify(body), signal });
  } catch (err) {
    throw networkError(err);
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export async function postForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: headers(false), body: form, signal });
  } catch (err) {
    throw networkError(err);
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

/** Stream the tutor's NDJSON events. Resolves when the stream ends. */
export async function streamTutor(req: TutorRequest, onEvent: (ev: TutorEvent) => void, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/tutor", { method: "POST", headers: headers(), body: JSON.stringify(req), signal });
  } catch (err) {
    throw networkError(err);
  }
  if (!res.ok || !res.body) throw await toApiError(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = parseTutorEvent(line);
        if (ev) onEvent(ev);
      }
    }
    const tail = buf.trim();
    if (tail) {
      const ev = parseTutorEvent(tail);
      if (ev) onEvent(ev);
    }
  } catch (err) {
    throw networkError(err);
  }
}
