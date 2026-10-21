/**
 * Geometry and timing for drawing board items stroke by stroke, the way a
 * tutor would with a marker, instead of popping them onto the board whole.
 * Pure functions (no Excalidraw import) so they are unit-tested directly;
 * ./render.ts applies them to real elements frame by frame.
 */

export type Point = readonly [number, number];

/** How an element is drawn in. */
export type StrokeKind = "write" | "trace" | "outline" | "wipe" | "fade";

export interface StrokeTarget {
  type: string;
  width: number;
  height: number;
  text?: string;
  points?: readonly Point[];
  strokeColor?: string;
  backgroundColor?: string;
}

export function strokeKind(el: StrokeTarget): StrokeKind {
  switch (el.type) {
    case "text":
      return "write";
    case "line":
    case "arrow":
    case "freedraw":
      return (el.points?.length ?? 0) >= 2 ? "trace" : "fade";
    case "rectangle":
    case "ellipse":
    case "diamond":
      return el.strokeColor && el.strokeColor !== "transparent" ? "outline" : "fade";
    case "image":
      return "wipe";
    default:
      return "fade";
  }
}

export function pathLength(points: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return len;
}

/** The first `t` (0..1) of a polyline by length, ending on an interpolated point. */
export function partialPath(points: readonly Point[], t: number): Point[] {
  if (points.length < 2 || t >= 1) return points.map((p) => [p[0], p[1]] as Point);
  const target = pathLength(points) * Math.max(0, t);
  const out: Point[] = [[points[0][0], points[0][1]]];
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (walked + seg >= target) {
      const f = seg === 0 ? 0 : (target - walked) / seg;
      out.push([ax + (bx - ax) * f, ay + (by - ay) * f]);
      return out;
    }
    walked += seg;
    out.push([bx, by]);
  }
  return out;
}

/** Closed outline of a shape's border, relative to its top-left corner. */
export function outlinePoints(type: string, width: number, height: number): Point[] {
  if (type === "ellipse") {
    const n = 48;
    const rx = width / 2;
    const ry = height / 2;
    // Start at the top and go clockwise, like a hand-drawn circle.
    return Array.from({ length: n + 1 }, (_, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return [rx + rx * Math.cos(a), ry + ry * Math.sin(a)] as Point;
    });
  }
  if (type === "diamond") {
    return [
      [width / 2, 0],
      [width, height / 2],
      [width / 2, height],
      [0, height / 2],
      [width / 2, 0],
    ];
  }
  return [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
    [0, 0],
  ];
}

/** The visible part of text after `t` of its writing time. */
export function partialText(text: string, t: number): string {
  if (t >= 1) return text;
  const chars = [...text];
  return chars.slice(0, Math.floor(chars.length * Math.max(0, t))).join("");
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Natural drawing time for one element, in ms at normal pace. */
export function strokeDuration(el: StrokeTarget, kind: StrokeKind = strokeKind(el)): number {
  switch (kind) {
    case "write":
      return clamp([...(el.text ?? "")].length * 30, 220, 1500);
    case "trace":
      return clamp(pathLength(el.points ?? []) * 1.1, 180, 950);
    case "outline":
      return clamp(pathLength(outlinePoints(el.type, el.width, el.height)) * 0.8, 240, 950);
    case "wipe":
      return clamp(el.width * 2.4, 350, 1500);
    case "fade":
      return 260;
  }
}

/** Upper bound for drawing one board action, so big tables and graphs don't drag on. */
export const MAX_ACTION_DRAW_MS = 3600;

/**
 * Per-element durations for drawing a set of elements in order, scaled by
 * pace (`speed` 1 = normal, higher = slower) and squeezed into the budget.
 */
export function planDurations(els: StrokeTarget[], speed = 1, budget = MAX_ACTION_DRAW_MS): number[] {
  const raw = els.map((el) => strokeDuration(el) * speed);
  const total = raw.reduce((a, b) => a + b, 0);
  const cap = budget * speed;
  const k = total > cap ? cap / total : 1;
  return raw.map((ms) => Math.max(16, Math.round(ms * k)));
}

/** Ease-out so strokes start quick and settle, like a pen. */
export function easeStroke(t: number): number {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 2);
}
