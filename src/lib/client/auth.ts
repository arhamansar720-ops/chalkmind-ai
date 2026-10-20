"use client";

import { ApiError } from "./api";

export interface AccountUser {
  id: string;
  email: string;
  name: string | null;
}
export interface AuthInfo {
  user: AccountUser | null;
  /** This deployment has accounts (a database). */
  accounts: boolean;
  /** Sign-in is required to use the app. */
  required: boolean;
  inviteRequired: boolean;
}

async function send<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network", "Can't reach Chalkmind. Check your connection.");
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as (T & { error?: { code: string; message: string; hint?: string } }) | null;
  if (!res.ok) throw new ApiError(json?.error?.code ?? "http_error", json?.error?.message ?? `Request failed (HTTP ${res.status}).`, json?.error?.hint, res.status);
  return json as T;
}

export const authApi = {
  me: () => send<AuthInfo>("/api/auth/me"),
  signIn: (email: string, password: string) => send<{ user: AccountUser }>("/api/auth/signin", { email, password }),
  signUp: (input: { email: string; password: string; name?: string; code?: string }) => send<{ user: AccountUser }>("/api/auth/signup", input),
  signOut: () => send<void>("/api/auth/signout", {}),
};
