import type { Point, StrokeKind } from "./stroke";

/**
 * The pen's timeline and the camera that follows it, for drawing a board
 * action in one continuous motion: the pen writes each stroke at a steady
 * speed, glides to the start of the next one, and the view eases along
 * with it. Pure (no Excalidraw), so it is unit-tested directly; ./render.ts
 * plays it back frame by frame at the display's refresh rate.
 */

export interface PenStroke {
  /** Index of the element this stroke draws. */
  el: number;
  kind: StrokeKind;
  /** Path length in scene px (0 for fades). */
  length: number;
  from: Point;
  to: Point;
}

export interface TimedStroke extends PenStroke {
  start: number;
  end: number;
}

/** Pen speed by stroke kind, in scene px per ms at normal pace. */
export const PEN_RATE: Record<StrokeKind, number> = {
  write: 0.3,
  trace: 0.55,
  outline: 0.65,
  wipe: 0.3,
  fade: 0,
};
const FADE_MS = 240;
const MIN_STROKE_MS = 110;
/** Gliding between strokes: px per ms, and bounds in ms. */
const TRAVEL_RATE = 1.6;
const TRAVEL_MS: [number, number] = [70, 260];
/** Upper bound for one board action, so big tables and graphs don't drag on. */
export const MAX_PEN_MS = 9000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Lay strokes out on a timeline (ms from 0). `speed` scales it (1 = normal,
 * higher = slower); the whole action is squeezed into the budget if needed.
 * `from` is where the pen was left by the previous drawing: it glides over
 * from there before the first stroke.
 */
export function planPen(strokes: PenStroke[], speed = 1, budget = MAX_PEN_MS, from?: Point): { strokes: TimedStroke[]; total: number } {
  const draw = strokes.map((s) => (s.kind === "fade" ? FADE_MS : Math.max(MIN_STROKE_MS, s.length / PEN_RATE[s.kind])) * speed);
  const travel = strokes.map((s, i) => {
    if (i === 0 && !from) return 0;
    const prev = i === 0 ? from! : strokes[i - 1].to;
    return clamp(Math.hypot(s.from[0] - prev[0], s.from[1] - prev[1]) / TRAVEL_RATE, TRAVEL_MS[0], TRAVEL_MS[1]) * speed;
  });
  const sum = draw.reduce((a, b) => a + b, 0) + travel.reduce((a, b) => a + b, 0);
  const k = sum > budget * speed ? (budget * speed) / sum : 1;
  let t = 0;
  const timed = strokes.map((s, i) => {
    t += travel[i] * k;
    const start = t;
    t += draw[i] * k;
    return { ...s, start, end: t };
  });
  return { strokes: timed, total: t };
}

/** Mostly constant speed, softened at the very start and end of a stroke. */
export function penEase(t: number): number {
  const x = clamp(t, 0, 1);
  const smooth = x * x * (3 - 2 * x);
  return 0.7 * x + 0.3 * smooth;
}

/** Smooth start and stop for gliding between strokes. */
export function glideEase(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Where the playback is at time `t`: the active stroke and its progress, or a glide between two. */
export type PenAt =
  | { state: "draw"; index: number; p: number }
  | { state: "glide"; index: number; p: number }
  | { state: "done" };

export function penAt(strokes: TimedStroke[], t: number): PenAt {
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    if (t < s.start) {
      const prevEnd = i === 0 ? 0 : strokes[i - 1].end;
      const span = s.start - prevEnd;
      return { state: "glide", index: i, p: span > 0 ? (t - prevEnd) / span : 1 };
    }
    if (t < s.end) return { state: "draw", index: i, p: (t - s.start) / (s.end - s.start) };
  }
  return { state: "done" };
}

/* ------------------------------------------------------------------ camera */

export interface Camera {
  /** Scene point at the centre of the view. */
  cx: number;
  cy: number;
  zoom: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CameraLimits {
  minZoom: number;
  maxZoom: number;
}

export const CAMERA_LIMITS: CameraLimits = { minZoom: 0.3, maxZoom: 1.15 };

/** Zoom at which `region` fills a comfortable part of a view of `w`×`h` px. */
export function fitZoom(region: Region, w: number, h: number): number {
  const pad = 48;
  return Math.min((w * 0.86) / (region.width + pad * 2), (h * 0.78) / (region.height + pad * 2));
}

/**
 * Where the camera wants to be: the whole region being drawn in view,
 * zoomed out when it doesn't fit and back in when it's small, but without
 * changing zoom for small differences. When even the smallest zoom can't
 * fit the region, it follows the pen instead.
 */
export function cameraTarget(current: Camera, region: Region, pen: Point | null, w: number, h: number, limits: CameraLimits = CAMERA_LIMITS): Camera {
  const fit = fitZoom(region, w, h);
  const ideal = clamp(fit, limits.minZoom, limits.maxZoom);
  // Hysteresis: zoom out whenever the region doesn't fit; zoom in only when it's much too small.
  const zoom = current.zoom > fit || current.zoom < ideal * 0.72 ? ideal : clamp(current.zoom, limits.minZoom, limits.maxZoom);
  const viewW = w / zoom;
  const viewH = h / zoom;
  const centre = (lo: number, size: number, view: number, at: number | undefined, cur: number) => {
    if (size <= view * 0.9 || at === undefined) return lo + size / 2;
    // Too big to show whole: keep the pen in view, but don't scroll past the region's edges.
    const margin = view * 0.3;
    const want = clamp(cur, at - view / 2 + margin, at + view / 2 - margin);
    return clamp(want, lo + view / 2 - 40, lo + size - view / 2 + 40);
  };
  return {
    cx: centre(region.x, region.width, viewW, pen?.[0], current.cx),
    cy: centre(region.y, region.height, viewH, pen?.[1], current.cy),
    zoom,
  };
}

/**
 * Ease the camera toward its target, frame-rate independent (`dt` in ms).
 * Zoom is eased in log space so zooming in and out feel the same.
 */
export function easeCamera(current: Camera, target: Camera, dt: number, tau = { move: 260, zoom: 380 }): Camera {
  const a = 1 - Math.exp(-dt / tau.move);
  const b = 1 - Math.exp(-dt / tau.zoom);
  return {
    cx: current.cx + (target.cx - current.cx) * a,
    cy: current.cy + (target.cy - current.cy) * a,
    zoom: Math.exp(Math.log(current.zoom) + (Math.log(target.zoom) - Math.log(current.zoom)) * b),
  };
}

/** Excalidraw scroll for a camera on a view of `w`×`h` px. */
export function cameraToScroll(cam: Camera, w: number, h: number): { scrollX: number; scrollY: number; zoom: number } {
  return { scrollX: w / (2 * cam.zoom) - cam.cx, scrollY: h / (2 * cam.zoom) - cam.cy, zoom: cam.zoom };
}

export function scrollToCamera(s: { scrollX: number; scrollY: number; zoom: number }, w: number, h: number): Camera {
  return { cx: w / (2 * s.zoom) - s.scrollX, cy: h / (2 * s.zoom) - s.scrollY, zoom: s.zoom };
}
