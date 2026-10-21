import { describe, expect, it } from "vitest";
import { easeStroke, outlinePoints, partialPath, partialText, pathLength, planDurations, strokeKind, MAX_ACTION_DRAW_MS } from "@/lib/board/stroke";

describe("stroke-by-stroke drawing", () => {
  it("picks how each element is drawn", () => {
    expect(strokeKind({ type: "text", width: 10, height: 10, text: "hi" })).toBe("write");
    expect(strokeKind({ type: "arrow", width: 10, height: 0, points: [[0, 0], [10, 0]] })).toBe("trace");
    expect(strokeKind({ type: "rectangle", width: 10, height: 10, strokeColor: "#000" })).toBe("outline");
    expect(strokeKind({ type: "rectangle", width: 10, height: 10, strokeColor: "transparent", backgroundColor: "#ff0" })).toBe("fade");
    expect(strokeKind({ type: "image", width: 10, height: 10 })).toBe("wipe");
  });

  it("traces a polyline by length", () => {
    const pts = [[0, 0], [10, 0], [10, 10]] as const;
    expect(pathLength(pts)).toBe(20);
    expect(partialPath(pts, 0.25)).toEqual([[0, 0], [5, 0]]);
    expect(partialPath(pts, 0.75)).toEqual([[0, 0], [10, 0], [10, 5]]);
    expect(partialPath(pts, 1)).toEqual([[0, 0], [10, 0], [10, 10]]);
  });

  it("outlines shapes as closed paths inside their box", () => {
    for (const type of ["rectangle", "ellipse", "diamond"]) {
      const pts = outlinePoints(type, 100, 50);
      expect(pts[0][0]).toBeCloseTo(pts.at(-1)![0]);
      expect(pts[0][1]).toBeCloseTo(pts.at(-1)![1]);
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(-1e-9);
        expect(x).toBeLessThanOrEqual(100 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(-1e-9);
        expect(y).toBeLessThanOrEqual(50 + 1e-9);
      }
    }
  });

  it("writes text character by character", () => {
    expect(partialText("x² + 1", 0)).toBe("");
    expect(partialText("abcd", 0.5)).toBe("ab");
    expect(partialText("abcd", 1)).toBe("abcd");
  });

  it("keeps a whole action within the drawing budget and slows down with pace", () => {
    const many = Array.from({ length: 40 }, () => ({ type: "text", width: 50, height: 20, text: "a fairly long table cell" }));
    const normal = planDurations(many, 1);
    expect(normal.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(MAX_ACTION_DRAW_MS + many.length);
    const one = [{ type: "text", width: 50, height: 20, text: "Solve for x" }];
    expect(planDurations(one, 1.5)[0]).toBeGreaterThan(planDurations(one, 1)[0]);
    expect(easeStroke(0)).toBe(0);
    expect(easeStroke(1)).toBe(1);
  });
});
