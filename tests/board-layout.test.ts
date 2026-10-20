import { describe, expect, it } from "vitest";
import { boardIndexFromElements, cursorBelow, edgePoint, emptyCursor, layoutStep, wrapText, type Bounds, type LayoutContext } from "@/lib/board/layout";
import { boardActionSchema, type BoardAction } from "@/lib/board/schema";
import { autoYRange, compileFunction, normalizeExpression, sampleFunction, ticks } from "@/lib/board/graph";
import { texToUnicode } from "@/lib/board/text";

const parse = (a: unknown) => boardActionSchema.parse(a) as BoardAction;

function ctx(overrides: Partial<LayoutContext> = {}): LayoutContext {
  let n = 0;
  let auto = 0;
  return {
    cursor: emptyCursor(),
    lookup: () => null,
    equation: () => undefined,
    newId: () => `el${n++}`,
    autoId: () => `item${++auto}`,
    step: 1,
    ...overrides,
  };
}

describe("layoutStep", () => {
  it("stacks blocks top to bottom and registers ids", () => {
    const r = layoutStep([parse({ type: "add_text", id: "t1", text: "Title", style: "title" }), parse({ type: "add_text", id: "t2", text: "Body" })], ctx());
    const texts = r.skeletons.filter((s) => s.type === "text");
    expect(texts).toHaveLength(2);
    expect(texts[0].y).toBe(0);
    expect(texts[1].y).toBeGreaterThan(texts[0].y);
    expect(r.registered.map((x) => x.id)).toEqual(["t1", "t2"]);
    // every element is tagged with its tutor id and step
    expect(texts[0].customData).toMatchObject({ cm: "t1", cmStep: 1 });
  });

  it("assigns automatic ids to unnamed blocks", () => {
    const r = layoutStep([parse({ type: "add_text", text: "x" })], ctx());
    expect(r.registered[0].id).toBe("item1");
  });

  it("places a block to the right when asked", () => {
    const r = layoutStep(
      [parse({ type: "add_shape", id: "a", shape: "rectangle", text: "A" }), parse({ type: "add_shape", id: "b", shape: "rectangle", text: "B", place: "right" })],
      ctx(),
    );
    const [a, b] = r.registered;
    expect(b.bounds.y).toBe(a.bounds.y);
    expect(b.bounds.x).toBeGreaterThan(a.bounds.x + a.bounds.width);
  });

  it("starts below existing content", () => {
    const existing: Bounds = { x: 0, y: 0, width: 100, height: 400 };
    const r = layoutStep([parse({ type: "add_text", text: "next" })], ctx({ cursor: cursorBelow([existing]) }));
    expect(r.skeletons[0].y).toBeGreaterThan(400);
  });

  it("draws arrows between known items and warns on unknown ones", () => {
    const r = layoutStep(
      [
        parse({ type: "add_shape", id: "a", shape: "rectangle", text: "A" }),
        parse({ type: "add_shape", id: "b", shape: "rectangle", text: "B" }),
        parse({ type: "add_arrow", from: "a", to: "b", label: "leads to" }),
        parse({ type: "add_arrow", from: "a", to: "ghost" }),
      ],
      ctx(),
    );
    const arrows = r.skeletons.filter((s) => s.type === "arrow");
    expect(arrows).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes("ghost"))).toBe(true);
  });

  it("highlights content from earlier steps via lookup", () => {
    const target = { x: 10, y: 20, width: 100, height: 40 };
    const r = layoutStep([parse({ type: "highlight", target: "e1", note: "key step" })], ctx({ lookup: (id) => (id === "e1" ? target : null) }));
    const rect = r.skeletons.find((s) => s.type === "rectangle")!;
    expect(rect.x).toBeLessThan(target.x);
    expect(rect.width).toBeGreaterThan(target.width);
    expect(r.focus).toEqual(target);
  });

  it("renders prepared equations as images, and falls back to text with a warning", () => {
    const withEq = layoutStep([parse({ type: "add_equation", latex: "x=1" })], ctx({ equation: () => ({ fileId: "eq-1", width: 80, height: 30 }) }));
    expect(withEq.skeletons[0]).toMatchObject({ type: "image", fileId: "eq-1", width: 80, height: 30 });
    const without = layoutStep([parse({ type: "add_equation", latex: "x=1" })], ctx());
    expect(without.skeletons[0].type).toBe("text");
    expect(without.warnings).toHaveLength(1);
  });

  it("clear_board resets the layout", () => {
    const r = layoutStep([parse({ type: "add_text", text: "old" }), parse({ type: "clear_board" }), parse({ type: "add_text", id: "fresh", text: "new" })], ctx({ cursor: cursorBelow([{ x: 0, y: 0, width: 10, height: 900 }]) }));
    expect(r.clear).toBe(true);
    expect(r.registered.map((x) => x.id)).toEqual(["fresh"]);
    expect(r.skeletons).toHaveLength(1);
    expect(r.skeletons[0].y).toBe(0);
  });

  it("lays out diagrams and registers each node", () => {
    const r = layoutStep(
      [parse({ type: "add_diagram", id: "d", layout: "flow", nodes: [{ id: "n1", label: "Light" }, { id: "n2", label: "Glucose" }], edges: [{ from: "n1", to: "n2" }] })],
      ctx(),
    );
    expect(r.registered.map((x) => x.id)).toEqual(["d", "n1", "n2"]);
    const arrow = r.skeletons.find((s) => s.type === "arrow")!;
    expect(arrow.start).toBeDefined();
    expect(arrow.end).toBeDefined();
  });

  it("plots graphs from validated functions", () => {
    const r = layoutStep([parse({ type: "add_graph", functions: [{ expr: "x^2 - 4" }], points: [{ x: 2, y: 0, label: "root" }], xRange: [-5, 5] })], ctx());
    const curve = r.skeletons.filter((s) => s.type === "line" && (s.strokeWidth as number) > 2);
    expect(curve.length).toBeGreaterThan(0);
    expect(r.skeletons.some((s) => s.type === "ellipse")).toBe(true);
  });

  it("converts stray TeX in plain labels", () => {
    const r = layoutStep([parse({ type: "add_shape", shape: "rectangle", text: "$b^2$" })], ctx());
    expect((r.skeletons[0].label as { text: string }).text).toBe("b²");
  });
});

describe("boardIndexFromElements", () => {
  it("derives what's still on the board from element customData", () => {
    const r = layoutStep(
      [
        parse({ type: "add_equation", id: "e1", latex: "x+1=2", note: "start" }),
        parse({ type: "add_diagram", id: "d", nodes: [{ id: "n1", label: "Sun" }, { id: "n2", label: "Leaf" }], edges: [{ from: "n1", to: "n2" }] }),
        parse({ type: "highlight", target: "e1" }),
      ],
      ctx({ equation: () => ({ fileId: "f", width: 10, height: 10 }) }),
    );
    const els = r.skeletons as { customData?: Record<string, unknown>; isDeleted?: boolean }[];
    const idx = boardIndexFromElements(els);
    expect(idx.map((i) => i.id)).toEqual(["e1", "d", "n1", "n2"]);
    expect(idx[0].summary).toBe("x+1=2 — start");
    // deleted elements drop out
    const afterDelete = boardIndexFromElements(els.map((e) => (e.customData?.cm === "e1" ? { ...e, isDeleted: true } : e)));
    expect(afterDelete.map((i) => i.id)).not.toContain("e1");
  });
});

describe("layout helpers", () => {
  it("wraps long text", () => {
    const lines = wrapText("word ".repeat(200), 20, 400);
    expect(lines.length).toBeGreaterThan(5);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(Math.floor(400 / (20 * 0.53)));
  });
  it("computes edge points on a box boundary", () => {
    const p = edgePoint({ x: 0, y: 0, width: 100, height: 50 }, { x: 500, y: 25 }, 0);
    expect(p).toEqual({ x: 100, y: 25 });
  });
});

describe("graph sampling", () => {
  it("normalizes school notation", () => {
    expect(normalizeExpression("log(x) + ln(x)")).toBe("log10(x)+log(x)");
  });
  it("evaluates compiled functions", () => {
    expect(compileFunction("x^2 - 4")!(3)).toBe(5);
    expect(compileFunction("alert(1)")).toBeNull();
  });
  it("splits at discontinuities", () => {
    const segs = sampleFunction(compileFunction("1/x")!, [-2, 2], 100);
    expect(segs.length).toBeGreaterThanOrEqual(2);
  });
  it("chooses sensible ranges and ticks", () => {
    const [lo, hi] = autoYRange(sampleFunction(compileFunction("x^2")!, [-3, 3]));
    expect(lo).toBeLessThanOrEqual(0);
    expect(hi).toBeGreaterThanOrEqual(9);
    expect(ticks([-10, 10])).toContain(0);
  });
});

describe("texToUnicode", () => {
  it("handles common notation", () => {
    expect(texToUnicode("$a^2 + b^2 = c^2$")).toBe("a² + b² = c²");
    expect(texToUnicode("\\theta = 30^\\circ")).toBe("θ = 30°");
    expect(texToUnicode("\\sqrt{2} \\times \\pi")).toBe("√2 × π");
    expect(texToUnicode("H_2O")).toBe("H₂O");
    expect(texToUnicode("plain text")).toBe("plain text");
  });
});
