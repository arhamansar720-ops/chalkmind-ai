import type {
  AddDiagramAction,
  AddEquationAction,
  AddGraphAction,
  AddShapeAction,
  AddTableAction,
  AddTextAction,
  BoardAction,
  BoardColor,
} from "./schema";
import { FILL, FONT, HIGHLIGHT, SERIES, STROKE } from "./palette";
import { autoYRange, compileFunction, formatTick, sampleFunction, ticks } from "./graph";
import { texToUnicode as tu } from "./text";

/**
 * Turns validated board actions into Excalidraw element *skeletons* (the input
 * format of `convertToExcalidrawElements`). This module is pure: no DOM, no
 * Excalidraw import, so it is unit-tested directly.
 *
 * Layout model: the board is a lesson column. Each block goes below everything
 * already drawn (or to the right of the previous block with place: "right"),
 * so students read top to bottom while a solution develops.
 */

export type Skeleton = { type: string; x: number; y: number; id?: string } & Record<string, unknown>;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreparedEquation {
  fileId: string;
  width: number;
  height: number;
}

export interface Cursor {
  /** Left edge of the lesson column. */
  x0: number;
  /** Lowest y of anything on the board — new blocks go below this. */
  bottom: number;
  /** The most recently placed block, for place: "right". */
  last: Bounds | null;
}

export interface RegisteredItem {
  id: string;
  kind: BoardAction["type"];
  summary: string;
  bounds: Bounds;
}

export interface LayoutContext {
  cursor: Cursor;
  /** Bounds of content drawn in earlier steps, by tutor id. */
  lookup: (id: string) => Bounds | null;
  /** Pre-rendered equation images, by LaTeX source. */
  equation: (latex: string) => PreparedEquation | undefined;
  /** Fresh unique Excalidraw element id. */
  newId: () => string;
  /** Fresh tutor-facing id for blocks the model didn't name. */
  autoId: () => string;
  step?: number;
}

export interface LayoutResult {
  skeletons: Skeleton[];
  cursor: Cursor;
  registered: RegisteredItem[];
  /** True when the step began with (or contained) clear_board. */
  clear: boolean;
  /** Region the viewport should scroll to after rendering. */
  focus: Bounds | null;
  warnings: string[];
}

export const COLUMN_WIDTH = 820;
const BLOCK_GAP = 34;
const SECTION_GAP = 64;
const CHAR_W = 0.53; // average glyph width as a fraction of font size
const LINE_H = 1.25;

const TEXT_STYLE: Record<AddTextAction["style"], { size: number; font: number; color: BoardColor }> = {
  title: { size: 38, font: FONT.hand, color: "ink" },
  heading: { size: 27, font: FONT.hand, color: "ink" },
  body: { size: 20, font: FONT.sans, color: "ink" },
  note: { size: 19, font: FONT.hand, color: "blue" },
  label: { size: 16, font: FONT.sans, color: "gray" },
};

export function emptyCursor(): Cursor {
  return { x0: 0, bottom: 0, last: null };
}

/** Cursor that places new content below existing elements. */
export function cursorBelow(elements: Bounds[], x0 = 0): Cursor {
  if (elements.length === 0) return emptyCursor();
  const bottom = Math.max(...elements.map((e) => e.y + e.height));
  return { x0, bottom: bottom + SECTION_GAP - BLOCK_GAP, last: null };
}

export function wrapText(text: string, fontSize: number, maxWidth = COLUMN_WIDTH): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * CHAR_W)));
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

export function measureText(lines: string[], fontSize: number): { width: number; height: number } {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { width: longest * fontSize * CHAR_W, height: lines.length * fontSize * LINE_H };
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (list.length === 0) return null;
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  const r = Math.max(...list.map((b) => b.x + b.width));
  const btm = Math.max(...list.map((b) => b.y + b.height));
  return { x, y, width: r - x, height: btm - y };
}

/** Point where the segment from the centre of `b` towards `toward` leaves the box (plus padding). */
export function edgePoint(b: Bounds, toward: { x: number; y: number }, pad = 8): { x: number; y: number } {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = b.width / 2 + pad;
  const hh = b.height / 2 + pad;
  const t = Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}

const center = (b: Bounds) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

export function layoutStep(actions: BoardAction[], ctx: LayoutContext): LayoutResult {
  let cursor: Cursor = { ...ctx.cursor };
  const skeletons: Skeleton[] = [];
  const registered: RegisteredItem[] = [];
  const warnings: string[] = [];
  const local = new Map<string, Bounds>();
  const focusList: Bounds[] = [];
  let clear = false;

  const find = (id: string) => local.get(id) ?? ctx.lookup(id);

  let summary = "";
  const base = (cmId: string, kind: string) => ({
    customData: { cm: cmId, cmKind: kind, cmSummary: summary, ...(ctx.step !== undefined ? { cmStep: ctx.step } : {}) },
  });

  /** Reserve space for a block of the given size and return its origin. */
  const place = (width: number, height: number, how: "below" | "right" | undefined, gapBefore = BLOCK_GAP) => {
    let x: number;
    let y: number;
    if (how === "right" && cursor.last) {
      x = cursor.last.x + cursor.last.width + 48;
      y = cursor.last.y;
    } else {
      x = cursor.x0;
      y = cursor.last === null && cursor.bottom === 0 && skeletons.length === 0 ? 0 : cursor.bottom + gapBefore;
    }
    const bounds = { x, y, width, height };
    cursor = { ...cursor, bottom: Math.max(cursor.bottom, y + height), last: bounds };
    return bounds;
  };

  const register = (id: string, kind: BoardAction["type"], summary: string, bounds: Bounds) => {
    local.set(id, bounds);
    registered.push({ id, kind, summary: summary.slice(0, 80), bounds });
    focusList.push(bounds);
  };

  for (const action of actions) {
    summary = summarizeAction(action);
    switch (action.type) {
      case "clear_board": {
        clear = true;
        cursor = { x0: cursor.x0, bottom: 0, last: null };
        skeletons.length = 0;
        registered.length = 0;
        focusList.length = 0;
        local.clear();
        break;
      }
      case "add_text": {
        const cmId = action.id ?? ctx.autoId();
        const out = textBlock(action);
        const b = place(out.width, out.height, action.place, action.style === "title" || action.style === "heading" ? SECTION_GAP - 16 : BLOCK_GAP);
        skeletons.push(...out.build(b.x, b.y, base(cmId, action.type), ctx.newId));
        register(cmId, action.type, summary, b);
        break;
      }
      case "add_equation": {
        const cmId = action.id ?? ctx.autoId();
        const eq = ctx.equation(action.latex);
        const out = equationBlock(action, eq);
        if (!eq) warnings.push(`Equation shown as plain text (could not render): ${action.latex.slice(0, 40)}`);
        const b = place(out.width, out.height, action.place);
        skeletons.push(...out.build(b.x, b.y, base(cmId, action.type), ctx.newId));
        register(cmId, action.type, summary, b);
        break;
      }
      case "add_shape": {
        const cmId = action.id ?? ctx.autoId();
        const out = action.shape === "polygon" ? polygonBlock(action) : shapeBlock(action);
        const b = place(out.width, out.height, action.place);
        skeletons.push(...out.build(b.x, b.y, base(cmId, action.type), ctx.newId));
        // Register the core shape, not label overhangs, so arrows meet its edge.
        register(cmId, action.type, summary, {
          x: b.x + out.inset.x,
          y: b.y + out.inset.y,
          width: out.core.width,
          height: out.core.height,
        });
        break;
      }
      case "add_arrow": {
        const from = find(action.from);
        const to = find(action.to);
        if (!from || !to) {
          warnings.push(`Arrow skipped: "${!from ? action.from : action.to}" is not on the board.`);
          break;
        }
        const color = STROKE[action.color ?? "ink"];
        const start = edgePoint(from, center(to));
        const end = edgePoint(to, center(from));
        skeletons.push({
          type: "arrow",
          id: ctx.newId(),
          x: start.x,
          y: start.y,
          points: [
            [0, 0],
            [end.x - start.x, end.y - start.y],
          ],
          strokeColor: color,
          strokeWidth: 2,
          endArrowhead: "arrow",
          ...(action.label ? { label: { text: tu(action.label), fontSize: 16, fontFamily: FONT.sans, strokeColor: color } } : {}),
          ...base(`${action.from}->${action.to}`, action.type),
        });
        break;
      }
      case "add_diagram": {
        const cmId = action.id ?? ctx.autoId();
        const out = diagramBlock(action, ctx.newId);
        const b = place(out.width, out.height, action.place, SECTION_GAP - 16);
        skeletons.push(...out.build(b.x, b.y, base(cmId, action.type)));
        register(cmId, action.type, summary, b);
        for (const node of out.nodes) {
          register(node.id, action.type, node.label, { ...node.bounds, x: node.bounds.x + b.x, y: node.bounds.y + b.y });
        }
        break;
      }
      case "add_graph": {
        const cmId = action.id ?? ctx.autoId();
        const out = graphBlock(action);
        warnings.push(...out.warnings);
        const b = place(out.width, out.height, action.place);
        skeletons.push(...out.build(b.x, b.y, base(cmId, action.type), ctx.newId));
        register(cmId, action.type, summary, b);
        break;
      }
      case "add_table": {
        const cmId = action.id ?? ctx.autoId();
        const out = tableBlock(action);
        const b = place(out.width, out.height, action.place);
        skeletons.push(...out.build(b.x, b.y, base(cmId, action.type), ctx.newId));
        register(cmId, action.type, summary, b);
        break;
      }
      case "highlight": {
        const target = find(action.target);
        if (!target) {
          warnings.push(`Highlight skipped: "${action.target}" is not on the board.`);
          break;
        }
        const pad = 10;
        skeletons.push({
          type: "rectangle",
          id: ctx.newId(),
          x: target.x - pad,
          y: target.y - pad,
          width: target.width + pad * 2,
          height: target.height + pad * 2,
          backgroundColor: HIGHLIGHT[action.color],
          fillStyle: "solid",
          strokeColor: "transparent",
          strokeWidth: 1,
          roughness: 0,
          opacity: 45,
          roundness: { type: 3 },
          ...base(`hl:${action.target}`, action.type),
        });
        if (action.note) {
          skeletons.push({
            type: "text",
            id: ctx.newId(),
            x: target.x + target.width + pad + 18,
            y: target.y + target.height / 2 - 12,
            text: `← ${tu(action.note)}`,
            fontSize: 19,
            fontFamily: FONT.hand,
            strokeColor: STROKE.red,
            ...base(`hl:${action.target}`, action.type),
          });
        }
        focusList.push(target);
        break;
      }
    }
  }

  return { skeletons, cursor, registered, clear, focus: unionBounds(focusList), warnings };
}

/** Short human-readable description of what an action drew (for the tutor's board context). */
export function summarizeAction(a: BoardAction): string {
  switch (a.type) {
    case "add_text":
      return a.text.slice(0, 80);
    case "add_equation":
      return (a.note ? `${a.latex} — ${a.note}` : a.latex).slice(0, 80);
    case "add_shape":
      return (a.text ?? `${a.shape}${a.vertexLabels ? " " + a.vertexLabels.join("") : ""}`).slice(0, 80);
    case "add_diagram":
      return (a.title ?? a.nodes.map((n) => n.label).join(", ")).slice(0, 80);
    case "add_graph":
      return (a.title ?? `graph of ${a.functions.map((f) => `y=${f.expr}`).join(", ") || "points"}`).slice(0, 80);
    case "add_table":
      return (a.title ?? `table: ${a.headers.join(" | ")}`).slice(0, 80);
    case "add_arrow":
      return `arrow ${a.from} → ${a.to}`;
    case "highlight":
      return `highlight on ${a.target}`;
    default:
      return "";
  }
}

/**
 * What the tutor has drawn that is *still on the board*, read from element
 * customData. Deriving it from the live scene keeps it correct after the
 * student deletes, undoes or redoes things.
 */
export function boardIndexFromElements(elements: readonly { isDeleted?: boolean; customData?: Record<string, unknown> }[]) {
  const seen = new Map<string, { id: string; kind: string; summary: string }>();
  for (const el of elements) {
    if (el.isDeleted || !el.customData) continue;
    const cd = el.customData;
    const id = typeof cd.cm === "string" ? cd.cm : null;
    if (id && !id.startsWith("hl:") && !id.includes("->") && !seen.has(id)) {
      seen.set(id, { id, kind: String(cd.cmKind ?? "item"), summary: String(cd.cmSummary ?? "").slice(0, 100) });
    }
    if (typeof cd.cmNode === "string" && !seen.has(cd.cmNode)) {
      seen.set(cd.cmNode, { id: cd.cmNode, kind: "diagram node", summary: String(cd.cmNodeLabel ?? "").slice(0, 100) });
    }
  }
  return [...seen.values()].slice(-120);
}

/* ------------------------------------------------------------------ blocks */

type Base = { customData: Record<string, unknown> };
type BlockOut = {
  width: number;
  height: number;
  build: (x: number, y: number, base: Base, newId: () => string) => Skeleton[];
};

function textBlock(a: AddTextAction): BlockOut {
  const st = TEXT_STYLE[a.style];
  const lines = wrapText(tu(a.text), st.size);
  const m = measureText(lines, st.size);
  const underline = a.style === "title";
  return {
    width: m.width,
    height: m.height + (underline ? 14 : 0),
    build: (x, y, base, newId) => {
      const out: Skeleton[] = [
        {
          type: "text",
          id: newId(),
          x,
          y,
          text: lines.join("\n"),
          fontSize: st.size,
          fontFamily: st.font,
          strokeColor: STROKE[a.color ?? st.color],
          ...base,
        },
      ];
      if (underline) {
        out.push({
          type: "line",
          id: newId(),
          x,
          y: y + m.height + 8,
          points: [
            [0, 0],
            [Math.min(m.width, 360), 0],
          ],
          strokeColor: STROKE.blue,
          strokeWidth: 3,
          roughness: 1,
          ...base,
        });
      }
      return out;
    },
  };
}

function equationBlock(a: AddEquationAction, eq: PreparedEquation | undefined): BlockOut {
  const noteLines = a.note ? wrapText(`← ${tu(a.note)}`, 18, 300) : [];
  const note = measureText(noteLines, 18);
  const body = eq
    ? { width: eq.width, height: eq.height }
    : measureText(wrapText(a.latex, 18), 18);
  const width = body.width + (a.note ? 36 + note.width : 0);
  const height = Math.max(body.height, a.note ? note.height : 0);
  return {
    width,
    height,
    build: (x, y, base, newId) => {
      const out: Skeleton[] = [];
      if (eq) {
        out.push({
          type: "image",
          id: newId(),
          x,
          y: y + (height - body.height) / 2,
          width: eq.width,
          height: eq.height,
          fileId: eq.fileId,
          status: "saved",
          ...base,
        });
      } else {
        out.push({
          type: "text",
          id: newId(),
          x,
          y,
          text: wrapText(a.latex, 18).join("\n"),
          fontSize: 18,
          fontFamily: FONT.mono,
          strokeColor: STROKE[a.color ?? "ink"],
          ...base,
        });
      }
      if (a.note) {
        out.push({
          type: "text",
          id: newId(),
          x: x + body.width + 36,
          y: y + (height - note.height) / 2,
          text: noteLines.join("\n"),
          fontSize: 18,
          fontFamily: FONT.hand,
          strokeColor: STROKE.blue,
          ...base,
        });
      }
      return out;
    },
  };
}

function shapeBlock(a: AddShapeAction): BlockOut & { core: { width: number; height: number }; inset: { x: number; y: number } } {
  const text = tu(a.text ?? "");
  const lines = wrapText(text, 18, 240);
  const m = measureText(lines, 18);
  const pad = a.shape === "diamond" ? 70 : a.shape === "ellipse" ? 56 : 36;
  const width = Math.max(a.shape === "diamond" ? 200 : 150, m.width + pad);
  const height = Math.max(a.shape === "diamond" ? 120 : 76, m.height + (a.shape === "rectangle" ? 30 : 50));
  const color = a.color ?? "blue";
  return {
    width,
    height,
    core: { width, height },
    inset: { x: 0, y: 0 },
    build: (x, y, base, newId) => [
      {
        type: a.shape,
        id: newId(),
        x,
        y,
        width,
        height,
        strokeColor: STROKE[color],
        backgroundColor: FILL[color],
        fillStyle: "solid",
        strokeWidth: 2,
        roughness: 1,
        ...(a.shape === "rectangle" ? { roundness: { type: 3 } } : {}),
        ...(text ? { label: { text: lines.join("\n"), fontSize: 18, fontFamily: FONT.sans, strokeColor: STROKE.ink } } : {}),
        ...base,
      },
    ],
  };
}

export function polygonBlock(a: AddShapeAction): BlockOut & { core: { width: number; height: number }; inset: { x: number; y: number } } {
  const pts = a.points ?? [];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min(340 / spanX, 240 / spanY);
  const coreW = spanX * scale;
  const coreH = spanY * scale;
  const margin = 44; // room for vertex and side labels
  // Screen coordinates relative to the core's top-left (y flipped: math y is up).
  const screen = pts.map(([px, py]) => ({ x: (px - minX) * scale, y: (maxY - py) * scale }));
  const centroid = {
    x: screen.reduce((s, p) => s + p.x, 0) / screen.length,
    y: screen.reduce((s, p) => s + p.y, 0) / screen.length,
  };
  const outward = (p: { x: number; y: number }, dist: number) => {
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * dist, y: p.y + (dy / len) * dist };
  };
  const color = a.color ?? "blue";
  return {
    width: coreW + margin * 2,
    height: coreH + margin * 2,
    core: { width: coreW, height: coreH },
    inset: { x: margin, y: margin },
    build: (x, y, base, newId) => {
      const ox = x + margin;
      const oy = y + margin;
      const first = screen[0];
      const out: Skeleton[] = [
        {
          type: "line",
          id: newId(),
          x: ox + first.x,
          y: oy + first.y,
          points: [...screen, first].map((p) => [p.x - first.x, p.y - first.y]),
          strokeColor: STROKE[color],
          backgroundColor: FILL[color],
          fillStyle: "solid",
          strokeWidth: 2,
          roughness: 1,
          polygon: true,
          ...base,
        },
      ];
      const label = (text: string, p: { x: number; y: number }, color: string, size = 18) => {
        const m = measureText([text], size);
        out.push({
          type: "text",
          id: newId(),
          x: ox + p.x - m.width / 2,
          y: oy + p.y - m.height / 2,
          text,
          fontSize: size,
          fontFamily: FONT.hand,
          strokeColor: color,
          ...base,
        });
      };
      a.vertexLabels?.forEach((t, i) => {
        if (t && screen[i]) label(tu(t), outward(screen[i], 22), STROKE.ink, 20);
      });
      a.sideLabels?.forEach((t, i) => {
        const p = screen[i];
        const q = screen[(i + 1) % screen.length];
        if (!t || !p || !q) return;
        label(tu(t), outward({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, 24), STROKE.blue);
      });
      if (a.rightAngleAt !== undefined && screen[a.rightAngleAt]) {
        const i = a.rightAngleAt;
        const v = screen[i];
        const prev = screen[(i - 1 + screen.length) % screen.length];
        const next = screen[(i + 1) % screen.length];
        const unit = (p: { x: number; y: number }) => {
          const dx = p.x - v.x;
          const dy = p.y - v.y;
          const len = Math.hypot(dx, dy) || 1;
          return { x: (dx / len) * 16, y: (dy / len) * 16 };
        };
        const u = unit(prev);
        const w = unit(next);
        out.push({
          type: "line",
          id: newId(),
          x: ox + v.x + u.x,
          y: oy + v.y + u.y,
          points: [
            [0, 0],
            [w.x, w.y],
            [w.x - u.x, w.y - u.y],
          ],
          strokeColor: STROKE.ink,
          strokeWidth: 1.5,
          roughness: 0,
          ...base,
        });
      }
      return out;
    },
  };
}

interface DiagramOut {
  width: number;
  height: number;
  nodes: { id: string; label: string; bounds: Bounds }[];
  build: (x: number, y: number, base: Base) => Skeleton[];
}

export function diagramNodePositions(d: AddDiagramAction): { id: string; x: number; y: number }[] {
  const n = d.nodes.length;
  const W = 180;
  const H = 72;
  const GX = 80;
  const GY = 70;
  switch (d.layout) {
    case "cycle":
    case "hub": {
      const ring = d.layout === "hub" ? d.nodes.slice(1) : d.nodes;
      const r = Math.max(170, ring.length * 46);
      const pos = ring.map((node, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / ring.length;
        return { id: node.id, x: r + r * Math.cos(ang), y: r * 0.78 + r * 0.78 * Math.sin(ang) };
      });
      if (d.layout === "hub") pos.unshift({ id: d.nodes[0].id, x: r, y: r * 0.78 });
      return pos;
    }
    case "tree": {
      const incoming = new Map<string, number>(d.nodes.map((nd) => [nd.id, 0]));
      d.edges.forEach((e) => incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1));
      const roots = d.nodes.filter((nd) => incoming.get(nd.id) === 0).map((nd) => nd.id);
      const level = new Map<string, number>();
      const queue = roots.length ? [...roots] : [d.nodes[0].id];
      queue.forEach((r) => level.set(r, 0));
      while (queue.length) {
        const cur = queue.shift()!;
        for (const e of d.edges) {
          if (e.from === cur && !level.has(e.to)) {
            level.set(e.to, (level.get(cur) ?? 0) + 1);
            queue.push(e.to);
          }
        }
      }
      const maxLevel = Math.max(0, ...level.values());
      d.nodes.forEach((nd) => {
        if (!level.has(nd.id)) level.set(nd.id, maxLevel + 1);
      });
      const rows = new Map<number, string[]>();
      d.nodes.forEach((nd) => {
        const l = level.get(nd.id)!;
        rows.set(l, [...(rows.get(l) ?? []), nd.id]);
      });
      const widest = Math.max(...[...rows.values()].map((r) => r.length));
      const totalW = widest * W + (widest - 1) * GX;
      const out: { id: string; x: number; y: number }[] = [];
      [...rows.entries()].forEach(([l, ids]) => {
        const rowW = ids.length * W + (ids.length - 1) * GX;
        ids.forEach((nid, i) => {
          out.push({ id: nid, x: (totalW - rowW) / 2 + i * (W + GX) + W / 2, y: l * (H + GY + 20) + H / 2 });
        });
      });
      return out;
    }
    case "flow":
    default: {
      const perRow = n <= 4 ? n : Math.ceil(n / Math.ceil(n / 4));
      return d.nodes.map((node, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        return { id: node.id, x: col * (W + GX) + W / 2, y: row * (H + GY) + H / 2 };
      });
    }
  }
}

function diagramBlock(d: AddDiagramAction, newId: () => string): DiagramOut {
  const W = 180;
  const H = 72;
  const centers = diagramNodePositions(d);
  const minX = Math.min(...centers.map((c) => c.x)) - W / 2;
  const minY = Math.min(...centers.map((c) => c.y)) - H / 2;
  const titleH = d.title ? 40 : 0;
  const nodes = d.nodes.map((node) => {
    const c = centers.find((p) => p.id === node.id)!;
    return { id: node.id, label: node.label, color: node.color, bounds: { x: c.x - W / 2 - minX, y: c.y - H / 2 - minY + titleH, width: W, height: H } };
  });
  const width = Math.max(...nodes.map((nd) => nd.bounds.x + nd.bounds.width));
  const height = Math.max(...nodes.map((nd) => nd.bounds.y + nd.bounds.height));
  const elIds = new Map(nodes.map((nd) => [nd.id, newId()]));
  return {
    width,
    height,
    nodes: nodes.map(({ id, label, bounds }) => ({ id, label, bounds })),
    build: (x, y, base) => {
      const out: Skeleton[] = [];
      if (d.title) {
        out.push({ type: "text", id: newId(), x, y, text: tu(d.title), fontSize: 24, fontFamily: FONT.hand, strokeColor: STROKE.ink, ...base });
      }
      nodes.forEach((nd, i) => {
        const color = nd.color ?? (d.layout === "hub" && i === 0 ? "purple" : "blue");
        const lines = wrapText(tu(nd.label), 17, W - 24);
        out.push({
          type: d.layout === "cycle" ? "ellipse" : "rectangle",
          id: elIds.get(nd.id),
          x: x + nd.bounds.x,
          y: y + nd.bounds.y,
          width: W,
          height: H,
          strokeColor: STROKE[color],
          backgroundColor: FILL[color],
          fillStyle: "solid",
          strokeWidth: 2,
          roughness: 1,
          ...(d.layout === "cycle" ? {} : { roundness: { type: 3 } }),
          label: { text: lines.join("\n"), fontSize: 17, fontFamily: FONT.sans, strokeColor: STROKE.ink },
          customData: { ...base.customData, cmNode: nd.id, cmNodeLabel: nd.label.slice(0, 80) },
        });
      });
      for (const e of d.edges) {
        const a = nodes.find((nd) => nd.id === e.from)!;
        const b = nodes.find((nd) => nd.id === e.to)!;
        const ab = { ...a.bounds, x: a.bounds.x + x, y: a.bounds.y + y };
        const bb = { ...b.bounds, x: b.bounds.x + x, y: b.bounds.y + y };
        const s = edgePoint(ab, center(bb), 4);
        const t = edgePoint(bb, center(ab), 4);
        out.push({
          type: "arrow",
          id: newId(),
          x: s.x,
          y: s.y,
          points: [
            [0, 0],
            [t.x - s.x, t.y - s.y],
          ],
          strokeColor: STROKE.ink,
          strokeWidth: 2,
          endArrowhead: "arrow",
          start: { id: elIds.get(e.from) },
          end: { id: elIds.get(e.to) },
          ...(e.label ? { label: { text: tu(e.label), fontSize: 15, fontFamily: FONT.sans, strokeColor: STROKE.gray } } : {}),
          ...base,
        });
      }
      return out;
    },
  };
}

function graphBlock(g: AddGraphAction): BlockOut & { warnings: string[] } {
  const PW = 460;
  const PH = 320;
  const ML = 44; // room for y tick labels
  const MB = 30; // room for x tick labels
  const titleH = g.title ? 38 : 0;
  const warnings: string[] = [];
  const xr = g.xRange as [number, number];
  const span = xr[1] - xr[0];

  const series = g.functions.flatMap((fn, i) => {
    const f = compileFunction(fn.expr);
    if (!f) {
      warnings.push(`Could not plot y = ${fn.expr}`);
      return [];
    }
    return [{ fn, color: fn.color ?? SERIES[i % SERIES.length], segments: sampleFunction(f, xr, 240) }];
  });
  const yr: [number, number] = g.yRange
    ? (g.yRange as [number, number])
    : autoYRange(series.flatMap((s) => s.segments), g.points);
  const ySpan = yr[1] - yr[0];
  // Drop jumps bigger than the visible window (asymptotes) and clip to the window.
  const clipped = series.map((s) => ({
    ...s,
    segments: s.segments
      .flatMap((seg) => splitOutside(seg, yr, ySpan))
      .filter((seg) => seg.length > 1),
  }));

  const sx = (x: number) => ML + ((x - xr[0]) / span) * PW;
  const sy = (y: number) => titleH + PH - ((y - yr[0]) / ySpan) * PH;

  return {
    width: ML + PW + 90,
    height: titleH + PH + MB + (g.xLabel ? 22 : 0),
    warnings,
    build: (x, y, base, newId) => {
      const out: Skeleton[] = [];
      const line = (pts: [number, number][], stroke: string, width = 1, opacity = 100) => {
        const [fx, fy] = pts[0];
        out.push({
          type: "line",
          id: newId(),
          x: x + fx,
          y: y + fy,
          points: pts.map(([px, py]) => [px - fx, py - fy]),
          strokeColor: stroke,
          strokeWidth: width,
          roughness: 0,
          opacity,
          ...base,
        });
      };
      const text = (t: string, tx: number, ty: number, size = 13, color = STROKE.gray, font: number = FONT.sans) =>
        out.push({ type: "text", id: newId(), x: x + tx, y: y + ty, text: t, fontSize: size, fontFamily: font, strokeColor: color, ...base });

      if (g.title) text(tu(g.title), 0, 0, 22, STROKE.ink, FONT.hand);
      out.push({
        type: "rectangle",
        id: newId(),
        x: x + ML,
        y: y + titleH,
        width: PW,
        height: PH,
        strokeColor: "#c9c9c4",
        backgroundColor: "#ffffff",
        fillStyle: "solid",
        strokeWidth: 1,
        roughness: 0,
        ...base,
      });
      for (const t of ticks(xr)) {
        line([[sx(t), titleH], [sx(t), titleH + PH]], "#e3e3de", 1);
        const lbl = formatTick(t);
        text(lbl, sx(t) - lbl.length * 3.5, titleH + PH + 6);
      }
      for (const t of ticks(yr)) {
        line([[ML, sy(t)], [ML + PW, sy(t)]], "#e3e3de", 1);
        const lbl = formatTick(t);
        text(lbl, ML - 8 - lbl.length * 7, sy(t) - 8);
      }
      if (xr[0] <= 0 && xr[1] >= 0) line([[sx(0), titleH], [sx(0), titleH + PH]], STROKE.ink, 1.5);
      if (yr[0] <= 0 && yr[1] >= 0) line([[ML, sy(0)], [ML + PW, sy(0)]], STROKE.ink, 1.5);
      if (g.xLabel) text(g.xLabel, ML + PW / 2 - g.xLabel.length * 3.5, titleH + PH + 26, 14, STROKE.ink);
      if (g.yLabel) text(g.yLabel, ML + 6, titleH + 4, 14, STROKE.ink);

      for (const s of clipped) {
        for (const seg of s.segments) {
          line(seg.map((p) => [sx(p.x), sy(p.y)] as [number, number]), STROKE[s.color], 2.5);
        }
        const lastSeg = s.segments[s.segments.length - 1];
        const lastPt = lastSeg?.[lastSeg.length - 1];
        if (lastPt) {
          text(tu(s.fn.label ?? `y = ${s.fn.expr}`), Math.min(sx(lastPt.x) + 6, ML + PW + 4), sy(lastPt.y) - 10, 15, STROKE[s.color], FONT.hand);
        }
      }
      for (const p of g.points) {
        if (p.x < xr[0] || p.x > xr[1] || p.y < yr[0] || p.y > yr[1]) continue;
        out.push({
          type: "ellipse",
          id: newId(),
          x: x + sx(p.x) - 5,
          y: y + sy(p.y) - 5,
          width: 10,
          height: 10,
          strokeColor: STROKE.red,
          backgroundColor: STROKE.red,
          fillStyle: "solid",
          roughness: 0,
          ...base,
        });
        if (p.label) text(tu(p.label), sx(p.x) + 9, sy(p.y) - 22, 15, STROKE.red, FONT.hand);
      }
      return out;
    },
  };
}

function splitOutside(seg: { x: number; y: number }[], [lo, hi]: [number, number], span: number) {
  const out: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  const margin = span * 0.02;
  for (let i = 0; i < seg.length; i++) {
    const p = seg[i];
    const inside = p.y >= lo - margin && p.y <= hi + margin;
    const prev = seg[i - 1];
    const jump = prev && Math.abs(p.y - prev.y) > span;
    if (!inside || jump) {
      if (cur.length > 1) out.push(cur);
      cur = inside ? [p] : [];
      continue;
    }
    cur.push(p);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

function tableBlock(t: AddTableAction): BlockOut {
  const colW = t.headers.map((h, c) => {
    const longest = Math.max(h.length, ...t.rows.map((r) => (r[c] ?? "").length));
    return Math.min(240, Math.max(90, longest * 9 + 28));
  });
  const ROW_H = 38;
  const titleH = t.title ? 36 : 0;
  const width = colW.reduce((a, b) => a + b, 0);
  const height = titleH + ROW_H * (t.rows.length + 1);
  return {
    width,
    height,
    build: (x, y, base, newId) => {
      const out: Skeleton[] = [];
      if (t.title) out.push({ type: "text", id: newId(), x, y, text: tu(t.title), fontSize: 22, fontFamily: FONT.hand, strokeColor: STROKE.ink, ...base });
      const all = [t.headers, ...t.rows];
      all.forEach((row, r) => {
        let cx = x;
        row.forEach((cell, c) => {
          const w = colW[c];
          const lines = wrapText(tu(cell), 15, w - 14);
          out.push({
            type: "rectangle",
            id: newId(),
            x: cx,
            y: y + titleH + r * ROW_H,
            width: w,
            height: ROW_H,
            strokeColor: "#c9c9c4",
            backgroundColor: r === 0 ? FILL.blue : "#ffffff",
            fillStyle: "solid",
            strokeWidth: 1,
            roughness: 0,
            ...(cell ? { label: { text: lines.slice(0, 2).join("\n"), fontSize: 15, fontFamily: FONT.sans, strokeColor: r === 0 ? STROKE.blue : STROKE.ink } } : {}),
            ...base,
          });
          cx += w;
        });
      });
      return out;
    },
  };
}
