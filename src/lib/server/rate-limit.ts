/**
 * Fixed-window, in-memory rate limiter keyed by client. This protects a
 * single server instance from accidental floods and runaway loops; on a
 * multi-instance deployment put a shared limiter (e.g. Redis / Upstash) in
 * front of the AI routes — see README "Production checklist".
 */
export interface RateLimiter {
  check(key: string, now?: number): { ok: boolean; remaining: number; retryAfterSec: number };
}

export function createRateLimiter(limit: number, windowMs: number, maxKeys = 10_000): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key, now = Date.now()) {
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (hits.size >= maxKeys) {
          for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
          if (hits.size >= maxKeys) hits.delete(hits.keys().next().value as string);
        }
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count++;
      const ok = entry.count <= limit;
      return { ok, remaining: Math.max(0, limit - entry.count), retryAfterSec: ok ? 0 : Math.ceil((entry.resetAt - now) / 1000) };
    },
  };
}

const perMinute = Number(process.env.RATE_LIMIT_PER_MINUTE);
/** Shared limiter for all AI endpoints. */
export const aiLimiter = createRateLimiter(Number.isFinite(perMinute) && perMinute > 0 ? perMinute : 20, 60_000);
