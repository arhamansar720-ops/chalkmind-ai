import { describe, expect, it } from "vitest";
import {
  CAMERA_LIMITS,
  cameraTarget,
  cameraToScroll,
  easeCamera,
  fitZoom,
  glideEase,
  MAX_PEN_MS,
  penAt,
  penEase,
  planPen,
  scrollToCamera,
  type PenStroke,
} from "@/lib/board/pen";

const line = (el: number, x: number, y: number, length: number): PenStroke => ({ el, kind: "write", length, from: [x, y], to: [x + length, y] });

describe("pen timeline", () => {
  it("writes at a steady speed and glides between strokes", () => {
    const { strokes, total } = planPen([line(0, 0, 0, 300), line(1, 0, 60, 150)]);
    expect(strokes[0].start).toBe(0);
    // Twice as long a line takes twice as long to write.
    expect(strokes[0].end - strokes[0].start).toBeCloseTo(2 * (strokes[1].end - strokes[1].start));
    // The pen glides to the next line instead of jumping.
    expect(strokes[1].start).toBeGreaterThan(strokes[0].end);
    expect(total).toBe(strokes[1].end);
  });

  it("slows down with pace and stays within the budget", () => {
    const one = [line(0, 0, 0, 200)];
    expect(planPen(one, 1.5).total).toBeGreaterThan(planPen(one, 1).total);
    const many = Array.from({ length: 80 }, (_, i) => line(i, 0, i * 40, 400));
    expect(planPen(many, 1).total).toBeLessThanOrEqual(MAX_PEN_MS + 1);
  });

  it("knows what the pen is doing at any moment", () => {
    const { strokes } = planPen([line(0, 0, 0, 300), line(1, 0, 60, 150)]);
    expect(penAt(strokes, strokes[0].end / 2)).toMatchObject({ state: "draw", index: 0 });
    expect(penAt(strokes, (strokes[0].end + strokes[1].start) / 2)).toMatchObject({ state: "glide", index: 1 });
    expect(penAt(strokes, strokes[1].end + 1)).toEqual({ state: "done" });
  });

  it("eases smoothly from 0 to 1 without stalling", () => {
    for (const ease of [penEase, glideEase]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      let prev = 0;
      for (let t = 0.05; t <= 1; t += 0.05) {
        expect(ease(t)).toBeGreaterThan(prev);
        prev = ease(t);
      }
    }
    // Mostly constant speed: halfway through the stroke is halfway along it.
    expect(penEase(0.5)).toBeCloseTo(0.5);
  });
});

describe("camera", () => {
  const W = 1000;
  const H = 700;

  it("round-trips between Excalidraw scroll and a camera", () => {
    const cam = { cx: 300, cy: 420, zoom: 0.8 };
    const back = scrollToCamera(cameraToScroll(cam, W, H), W, H);
    expect(back.cx).toBeCloseTo(300);
    expect(back.cy).toBeCloseTo(420);
  });

  it("zooms out when the drawing doesn't fit, and in when it's small", () => {
    const big = { x: 0, y: 0, width: 2400, height: 600 };
    const out = cameraTarget({ cx: 0, cy: 0, zoom: 1 }, big, null, W, H);
    expect(out.zoom).toBeLessThan(0.5);
    expect(out.cx).toBe(1200);
    const small = { x: 100, y: 100, width: 120, height: 40 };
    expect(cameraTarget({ cx: 0, cy: 0, zoom: 0.4 }, small, null, W, H).zoom).toBe(CAMERA_LIMITS.maxZoom);
  });

  it("doesn't change zoom for small differences", () => {
    const region = { x: 0, y: 0, width: 500, height: 200 };
    const fit = fitZoom(region, W, H);
    const zoom = Math.min(fit, CAMERA_LIMITS.maxZoom) * 0.9;
    expect(cameraTarget({ cx: 0, cy: 0, zoom }, region, null, W, H).zoom).toBe(zoom);
  });

  it("follows the pen across a drawing too big to show whole", () => {
    const huge = { x: 0, y: 0, width: 400, height: 20000 };
    const t1 = cameraTarget({ cx: 200, cy: 300, zoom: 0.3 }, huge, [200, 6000], W, H);
    const viewH = H / t1.zoom;
    expect(Math.abs(t1.cy - 6000)).toBeLessThan(viewH / 2);
  });

  it("eases toward the target the same way at 60 Hz and 120 Hz", () => {
    const from = { cx: 0, cy: 0, zoom: 1 };
    const to = { cx: 100, cy: 50, zoom: 0.5 };
    let a = from;
    for (let i = 0; i < 6; i++) a = easeCamera(a, to, 1000 / 60);
    let b = from;
    for (let i = 0; i < 12; i++) b = easeCamera(b, to, 1000 / 120);
    expect(a.cx).toBeCloseTo(b.cx, 6);
    expect(a.zoom).toBeCloseTo(b.zoom, 6);
  });
});

describe("pen continuity", () => {
  it("glides over from where the previous drawing left the pen", () => {
    const s = [{ el: 0, kind: "write" as const, length: 100, from: [0, 400] as const, to: [100, 400] as const }];
    expect(planPen(s).strokes[0].start).toBe(0);
    const resumed = planPen(s, 1, undefined, [0, 0]).strokes[0];
    expect(resumed.start).toBeGreaterThan(0);
    expect(penAt([resumed], resumed.start / 2)).toMatchObject({ state: "glide", index: 0 });
  });
});
