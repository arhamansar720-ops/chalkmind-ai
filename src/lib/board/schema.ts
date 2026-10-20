import { z } from "zod";

/**
 * The contract between the tutor model and the whiteboard.
 *
 * The model never sends coordinates or code — only *what* to draw. The layout
 * engine (./layout.ts) decides where it goes and turns it into Excalidraw
 * element skeletons. Anything that fails this schema is dropped, never
 * executed or "best-effort" rendered.
 */

export const BOARD_COLORS = ["ink", "blue", "red", "green", "orange", "purple", "gray"] as const;
export const HIGHLIGHT_COLORS = ["yellow", "blue", "green", "pink"] as const;

/** Over-long labels are clipped rather than rejected: verbosity isn't malformed input. */
const clip = (max: number, min = 0) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().slice(0, max) : v), z.string().min(min).max(max));
/** Accept numbers sent as numeric strings ("3"). */
const num = (schema: z.ZodNumber) => z.preprocess((v) => (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : v), schema);

/** Colours: unknown names fall back to the default instead of failing the action. */
const color = z.preprocess((v) => (typeof v === "string" && (BOARD_COLORS as readonly string[]).includes(v.toLowerCase()) ? v.toLowerCase() : undefined), z.enum(BOARD_COLORS).optional());
/** Ids let later actions (arrows, highlights, follow-up turns) point at earlier content. */
const id = z.preprocess(
  (v) => (typeof v === "number" ? String(v) : typeof v === "string" ? v.trim().replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) : v),
  z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "ids are 1-40 chars of letters, digits, _ or -"),
);
const label = clip(80, 1);
const place = z.enum(["below", "right"]);

export const addTextSchema = z.object({
  type: z.literal("add_text"),
  id: id.optional(),
  text: clip(600, 1),
  style: z.preprocess((v) => (typeof v === "string" ? v.toLowerCase() : v), z.enum(["title", "heading", "body", "note", "label"]).catch("body")).default("body"),
  color,
  place: place.optional(),
});

export const addEquationSchema = z.object({
  type: z.literal("add_equation"),
  id: id.optional(),
  /** TeX, rendered with MathJax on the client. Never evaluated. */
  latex: z.preprocess((v) => (typeof v === "string" ? v.trim().replace(/^\$+|\$+$/g, "").trim() : v), z.string().min(1).max(400)),
  /** Short annotation shown to the right, e.g. "subtract 4 from both sides". */
  note: clip(120).optional(),
  color,
  place: place.optional(),
});

const coord = num(z.number().min(-100).max(100));
const point2 = z.preprocess(
  (v) => (v && typeof v === "object" && !Array.isArray(v) && "x" in v && "y" in v ? [(v as { x: unknown }).x, (v as { y: unknown }).y] : v),
  z.tuple([coord, coord]),
);

export const addShapeSchema = z
  .object({
    type: z.literal("add_shape"),
    id: id.optional(),
    shape: z.enum(["rectangle", "ellipse", "diamond", "polygon"]),
    /** Text inside the shape (rectangle / ellipse / diamond). */
    text: clip(120).optional(),
    /** Polygon vertices in abstract units (y up). The layout scales them to fit. */
    points: z.array(point2).min(3).max(8).optional(),
    vertexLabels: z.array(clip(24)).max(8).optional(),
    sideLabels: z.array(clip(32)).max(8).optional(),
    /** Index of the vertex that gets a right-angle marker. */
    rightAngleAt: num(z.number().int().min(0).max(7)).optional(),
    color,
    place: place.optional(),
  })
  .refine((s) => s.shape !== "polygon" || (s.points && s.points.length >= 3), {
    message: "polygon shapes need at least 3 points",
    path: ["points"],
  });

export const addArrowSchema = z.object({
  type: z.literal("add_arrow"),
  from: id,
  to: id,
  label: clip(60).optional(),
  color,
});

const diagramNode = z.object({ id, label, color });
const diagramEdge = z.object({ from: id, to: id, label: clip(40).optional() });

export const addDiagramSchema = z
  .object({
    type: z.literal("add_diagram"),
    id: id.optional(),
    title: clip(80).optional(),
    layout: z.enum(["flow", "cycle", "tree", "hub"]).catch("flow").default("flow"),
    nodes: z.array(diagramNode).min(2).max(12),
    edges: z.array(diagramEdge).max(20).default([]),
    place: place.optional(),
  })
  .refine(
    (d) => {
      const ids = new Set(d.nodes.map((n) => n.id));
      return ids.size === d.nodes.length && d.edges.every((e) => ids.has(e.from) && ids.has(e.to));
    },
    { message: "node ids must be unique and every edge must connect existing nodes", path: ["edges"] },
  );

/** Restricted expression grammar for plotted functions (no identifiers beyond x and known functions). */
export const EXPRESSION_PATTERN =
  /^(?:[\d\s.+\-*/^(),x]|pi|e|sqrt|abs|sin|cos|tan|asin|acos|atan|log|ln|exp|floor|ceil)+$/;

const graphFunction = z.object({
  expr: z.preprocess(
    // "y = x^2" / "f(x) = x^2" → "x^2"
    (v) => (typeof v === "string" ? v.trim().replace(/^(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, "") : v),
    z
      .string()
      .min(1)
      .max(80)
      .regex(EXPRESSION_PATTERN, "functions may only use x, numbers, + - * / ^ ( ) and common math functions"),
  ),
  label: clip(40).optional(),
  color,
});

const bound = num(z.number().min(-1e4).max(1e4));
const range = z
  .tuple([bound, bound])
  .refine(([a, b]) => b > a, { message: "range max must be greater than min" });

export const addGraphSchema = z.object({
  type: z.literal("add_graph"),
  id: id.optional(),
  title: clip(80).optional(),
  functions: z.array(graphFunction).max(4).default([]),
  points: z
    .array(z.object({ x: num(z.number()), y: num(z.number()), label: clip(24).optional() }))
    .max(12)
    .default([]),
  xRange: range.default([-10, 10]),
  yRange: range.optional(),
  xLabel: clip(20).optional(),
  yLabel: clip(20).optional(),
  place: place.optional(),
});

export const addTableSchema = z
  .object({
    type: z.literal("add_table"),
    id: id.optional(),
    title: clip(80).optional(),
    headers: z.array(clip(40)).min(1).max(6),
    rows: z.array(z.array(z.preprocess((v) => (typeof v === "number" ? String(v) : v), clip(60))).max(6)).min(1).max(10),
    place: place.optional(),
  })
  .refine((t) => t.rows.every((r) => r.length === t.headers.length), {
    message: "every row needs one cell per header",
    path: ["rows"],
  });

export const highlightSchema = z.object({
  type: z.literal("highlight"),
  target: id,
  color: z.enum(HIGHLIGHT_COLORS).catch("yellow").default("yellow"),
  note: clip(80).optional(),
});

export const clearBoardSchema = z.object({ type: z.literal("clear_board") });

export const boardActionSchema = z.discriminatedUnion("type", [
  addTextSchema,
  addEquationSchema,
  addShapeSchema,
  addArrowSchema,
  addDiagramSchema,
  addGraphSchema,
  addTableSchema,
  highlightSchema,
  clearBoardSchema,
]);

export type BoardAction = z.infer<typeof boardActionSchema>;
export type BoardActionType = BoardAction["type"];
export type BoardColor = (typeof BOARD_COLORS)[number];
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
export type AddTextAction = z.infer<typeof addTextSchema>;
export type AddEquationAction = z.infer<typeof addEquationSchema>;
export type AddShapeAction = z.infer<typeof addShapeSchema>;
export type AddArrowAction = z.infer<typeof addArrowSchema>;
export type AddDiagramAction = z.infer<typeof addDiagramSchema>;
export type AddGraphAction = z.infer<typeof addGraphSchema>;
export type AddTableAction = z.infer<typeof addTableSchema>;
export type HighlightAction = z.infer<typeof highlightSchema>;

export const MAX_ACTIONS_PER_STEP = 12;

export interface ValidatedActions {
  actions: BoardAction[];
  rejected: { index: number; type: string; reason: string }[];
}

/**
 * Validate a list of untrusted actions one by one. Valid actions are kept in
 * order; invalid ones are reported (so the UI can say so) and dropped.
 */
export function validateBoardActions(input: unknown): ValidatedActions {
  const out: ValidatedActions = { actions: [], rejected: [] };
  if (!Array.isArray(input)) {
    out.rejected.push({ index: -1, type: "unknown", reason: "board actions must be an array" });
    return out;
  }
  input.slice(0, MAX_ACTIONS_PER_STEP).forEach((raw, index) => {
    const parsed = boardActionSchema.safeParse(raw);
    if (parsed.success) {
      out.actions.push(parsed.data);
    } else {
      const type =
        raw && typeof raw === "object" && "type" in raw && typeof raw.type === "string"
          ? raw.type.slice(0, 40)
          : "unknown";
      const issue = parsed.error.issues[0];
      out.rejected.push({
        index,
        type,
        reason: issue ? `${issue.path.join(".") || "action"}: ${issue.message}` : "invalid action",
      });
    }
  });
  if (input.length > MAX_ACTIONS_PER_STEP) {
    out.rejected.push({
      index: MAX_ACTIONS_PER_STEP,
      type: "overflow",
      reason: `only ${MAX_ACTIONS_PER_STEP} actions are allowed per step`,
    });
  }
  return out;
}
