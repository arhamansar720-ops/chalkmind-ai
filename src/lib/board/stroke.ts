/**
 * Geometry for drawing board items stroke by stroke, the way a tutor would
 * with a marker, instead of popping them onto the board whole. Pure (no
 * Excalidraw import) so it is unit-tested directly; ./pen.ts times the
 * strokes and ./render.ts plays them back.
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
      // Filled marks with no border (highlights) are swept in like a highlighter.
      return el.strokeColor && el.strokeColor !== "transparent" ? "outline" : "wipe";
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
