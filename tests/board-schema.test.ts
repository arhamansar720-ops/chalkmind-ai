import { describe, expect, it } from "vitest";
import { boardActionSchema, MAX_ACTIONS_PER_STEP, validateBoardActions } from "@/lib/board/schema";

describe("board action schema", () => {
  it("accepts each supported action type", () => {
    const actions = [
      { type: "add_text", text: "Hello", style: "heading" },
      { type: "add_equation", latex: "2x + 4 = 10", note: "subtract 4" },
      { type: "add_shape", shape: "rectangle", text: "Sun" },
      { type: "add_shape", shape: "polygon", points: [[0, 0], [4, 0], [0, 3]], rightAngleAt: 0 },
      { type: "add_arrow", from: "a", to: "b" },
      { type: "add_diagram", layout: "cycle", nodes: [{ id: "n1", label: "A" }, { id: "n2", label: "B" }], edges: [{ from: "n1", to: "n2" }] },
      { type: "add_graph", functions: [{ expr: "x^2 - 4" }], xRange: [-5, 5] },
      { type: "add_table", headers: ["A", "B"], rows: [["1", "2"]] },
      { type: "highlight", target: "e1" },
      { type: "clear_board" },
    ];
    const res = validateBoardActions(actions);
    expect(res.rejected).toEqual([]);
    expect(res.actions.map((a) => a.type)).toEqual(actions.map((a) => a.type));
  });

  it("applies defaults", () => {
    const a = boardActionSchema.parse({ type: "add_text", text: "x" });
    expect(a).toMatchObject({ type: "add_text", style: "body" });
    const h = boardActionSchema.parse({ type: "highlight", target: "t1" });
    expect(h).toMatchObject({ color: "yellow" });
  });

  it("keeps valid actions and reports invalid ones individually", () => {
    const res = validateBoardActions([
      { type: "add_text", text: "ok" },
      { type: "run_script", code: "alert(1)" },
      { type: "add_equation" },
      { type: "add_text", text: "also ok" },
    ]);
    expect(res.actions).toHaveLength(2);
    expect(res.rejected.map((r) => r.index)).toEqual([1, 2]);
    expect(res.rejected[0].type).toBe("run_script");
  });

  it("rejects non-array input", () => {
    expect(validateBoardActions({ type: "add_text" }).actions).toEqual([]);
    expect(validateBoardActions("nope").rejected).toHaveLength(1);
  });

  it("caps the number of actions per step", () => {
    const many = Array.from({ length: MAX_ACTIONS_PER_STEP + 5 }, (_, i) => ({ type: "add_text", text: `t${i}` }));
    const res = validateBoardActions(many);
    expect(res.actions).toHaveLength(MAX_ACTIONS_PER_STEP);
    expect(res.rejected.at(-1)?.type).toBe("overflow");
  });

  it("clips over-long labels instead of rejecting", () => {
    const a = boardActionSchema.parse({ type: "add_shape", shape: "ellipse", text: "x".repeat(500) });
    expect(a.type === "add_shape" && a.text?.length).toBe(120);
  });

  it("tolerates harmless deviations", () => {
    const shape = boardActionSchema.parse({ type: "add_shape", shape: "polygon", points: [{ x: 0, y: 0 }, { x: "4", y: 0 }, [0, 3]], color: "Teal" });
    expect(shape.type === "add_shape" && shape.points).toEqual([[0, 0], [4, 0], [0, 3]]);
    expect(shape.type === "add_shape" && shape.color).toBeUndefined();
    const g = boardActionSchema.parse({ type: "add_graph", functions: [{ expr: "y = x^2" }] });
    expect(g.type === "add_graph" && g.functions[0].expr).toBe("x^2");
    const t = boardActionSchema.parse({ type: "add_text", id: "step 1.a", text: "x" });
    expect(t.type === "add_text" && t.id).toBe("step_1_a");
    const eq = boardActionSchema.parse({ type: "add_equation", latex: "$x^2$" });
    expect(eq.type === "add_equation" && eq.latex).toBe("x^2");
  });

  it("requires points for polygons", () => {
    expect(boardActionSchema.safeParse({ type: "add_shape", shape: "polygon" }).success).toBe(false);
  });

  it("requires diagram edges to connect existing, unique nodes", () => {
    const bad = { type: "add_diagram", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "zzz" }] };
    expect(boardActionSchema.safeParse(bad).success).toBe(false);
    const dup = { type: "add_diagram", nodes: [{ id: "a", label: "A" }, { id: "a", label: "B" }] };
    expect(boardActionSchema.safeParse(dup).success).toBe(false);
  });

  it("only allows a safe expression grammar in graphs", () => {
    for (const expr of ["alert(1)", "x.constructor", "import('fs')", "process.exit()", "x; y", "`x`", "x[0]"]) {
      expect(boardActionSchema.safeParse({ type: "add_graph", functions: [{ expr }] }).success, expr).toBe(false);
    }
    for (const expr of ["sin(x)", "2*x^3 - x + 1", "sqrt(abs(x))", "ln(x)", "e^(-x^2)", "pi*x"]) {
      expect(boardActionSchema.safeParse({ type: "add_graph", functions: [{ expr }] }).success, expr).toBe(true);
    }
  });

  it("rejects inverted ranges", () => {
    expect(boardActionSchema.safeParse({ type: "add_graph", xRange: [5, -5] }).success).toBe(false);
  });

  it("requires tables to be rectangular", () => {
    expect(boardActionSchema.safeParse({ type: "add_table", headers: ["a", "b"], rows: [["1"]] }).success).toBe(false);
  });
});
