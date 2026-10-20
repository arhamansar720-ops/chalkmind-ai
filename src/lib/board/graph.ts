import { safeCompile } from "../math/safe";
import { EXPRESSION_PATTERN } from "./schema";

/**
 * Deterministic function plotting for `add_graph`. Expressions are validated
 * against a whitelist grammar, then compiled by a locked-down mathjs instance
 * (which evaluates math, never JavaScript) with `x` as the only variable.
 */

export type Sample = { x: number; y: number };

/** School notation → mathjs: `log` is base 10, `ln` is natural. */
export function normalizeExpression(expr: string): string {
  return expr
    .replace(/\s+/g, "")
    .replace(/\blog\(/g, "log10(")
    .replace(/\bln\(/g, "log(");
}

export function compileFunction(expr: string): ((x: number) => number) | null {
  if (!EXPRESSION_PATTERN.test(expr)) return null;
  try {
    const code = safeCompile(normalizeExpression(expr));
    return (x: number) => {
      const v = code.evaluate({ x });
      return typeof v === "number" ? v : Number.NaN;
    };
  } catch {
    return null;
  }
}

/**
 * Sample f over [min, max], splitting into separate segments wherever the
 * function is undefined or jumps (e.g. tan(x), 1/x) so we never draw a
 * vertical line through an asymptote.
 */
export function sampleFunction(
  f: (x: number) => number,
  [min, max]: [number, number],
  n = 200,
  jumpLimit = Infinity,
): Sample[][] {
  const segments: Sample[][] = [];
  let current: Sample[] = [];
  const step = (max - min) / n;
  for (let i = 0; i <= n; i++) {
    const x = min + i * step;
    let y: number;
    try {
      y = f(x);
    } catch {
      y = Number.NaN;
    }
    const prev = current[current.length - 1];
    if (!Number.isFinite(y) || (prev && Math.abs(y - prev.y) > jumpLimit)) {
      if (current.length > 1) segments.push(current);
      current = Number.isFinite(y) ? [{ x, y }] : [];
      continue;
    }
    current.push({ x, y });
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

/** Pick a y-range from the samples, ignoring extreme outliers (asymptotes). */
export function autoYRange(segments: Sample[][], points: Sample[] = []): [number, number] {
  const ys = segments.flat().map((s) => s.y).concat(points.map((p) => p.y));
  if (ys.length === 0) return [-10, 10];
  ys.sort((a, b) => a - b);
  const lo = ys[Math.floor(ys.length * 0.02)];
  const hi = ys[Math.ceil(ys.length * 0.98) - 1];
  let min = Math.min(lo, 0);
  let max = Math.max(hi, 0);
  if (max - min < 1e-6) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.1;
  return [min - pad, max + pad];
}

/** "Nice" tick spacing (1, 2, 5 × 10^k) giving roughly `target` ticks. */
export function niceStep(span: number, target = 6): number {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return nice * mag;
}

export function ticks([min, max]: [number, number], target = 6): number[] {
  const step = niceStep(max - min, target);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  }
  return out;
}

export function formatTick(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return Number(v.toPrecision(3)).toString();
}
