import { describe, expect, it } from "vitest";
import { outlinePoints, partialPath, pathLength, strokeKind } from "@/lib/board/stroke";

describe("stroke-by-stroke drawing", () => {
  it("picks how each element is drawn", () => {
    expect(strokeKind({ type: "text", width: 10, height: 10, text: "hi" })).toBe("write");
    expect(strokeKind({ type: "arrow", width: 10, height: 0, points: [[0, 0], [10, 0]] })).toBe("trace");
    expect(strokeKind({ type: "rectangle", width: 10, height: 10, strokeColor: "#000" })).toBe("outline");
    expect(strokeKind({ type: "rectangle", width: 10, height: 10, strokeColor: "transparent", backgroundColor: "#ff0" })).toBe("wipe");
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
});

describe("handwriting", () => {
  it("writes simple equations by hand and keeps hard ones typeset", async () => {
    const { handwrittenMath } = await import("@/lib/board/text");
    expect(handwrittenMath("3x - 7 = 11")).toBe("3x - 7 = 11");
    expect(handwrittenMath("x^2 + 5x + 6 = 0")).toBe("x² + 5x + 6 = 0");
    expect(handwrittenMath("a^2 + b^2 = c^2")).toBe("a² + b² = c²");
    expect(handwrittenMath("x = \\frac{18}{3}")).toBe("x = 18/3");
    expect(handwrittenMath("\\int_0^1 x\\,dx")).toBeNull();
    expect(handwrittenMath("\\frac{\\frac{1}{2}}{3}")).toBeNull();
    expect(handwrittenMath("x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}")).toBeNull();
  });
});
