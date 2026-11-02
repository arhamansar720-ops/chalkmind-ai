"use client";

import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { BLOCK_GAP, COLUMN_PITCH, cursorBelow, layoutStep, nudgeRight, resolvePlacement, type Bounds, type Cursor, type PreparedEquation, type RegisteredItem } from "./layout";
import { hashString, renderEquation, svgToDataURL } from "./math-svg";
import { handwrittenMath } from "./text";
import type { BoardAction } from "./schema";
import { outlinePoints, partialPath, pathLength, strokeKind, type Point } from "./stroke";
import { cameraTarget, cameraToScroll, easeCamera, glideEase, penAt, penEase, planPen, scrollToCamera, type Camera, type PenStroke, type Region, type TimedStroke } from "./pen";

type ExcalidrawLib = typeof import("@excalidraw/excalidraw");

export interface BoardHandle {
  api: ExcalidrawImperativeAPI;
  lib: ExcalidrawLib;
}

function boundsOf(lib: ExcalidrawLib, els: readonly ExcalidrawElement[]): Bounds | null {
  if (els.length === 0) return null;
  const [minX, minY, maxX, maxY] = lib.getCommonBounds(els);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Cursor below everything currently on the board. */
export function cursorForScene({ api, lib }: BoardHandle): Cursor {
  // The latest column the tutor wrote in (customData.cmX0), below whatever is already in it.
  const els = api.getSceneElements();
  const all = boundsOf(lib, els);
  if (!all) return cursorBelow([]);
  const top = Math.min(0, all.y);
  const cols = els.map((e) => e.customData?.cmX0).filter((v): v is number => typeof v === "number");
  const x0 = cols.length ? Math.max(...cols) : Math.min(0, all.x);
  const col = boundsOf(lib, els.filter((e) => e.x < x0 + COLUMN_PITCH && e.x + e.width > x0));
  return { x0, top, bottom: col ? col.y + col.height + BLOCK_GAP : top, last: null };
}

/** Bounds of content the tutor drew earlier, found by its id in element customData. */
export function lookupOnScene({ api, lib }: BoardHandle, id: string): Bounds | null {
  const els = api.getSceneElements();
  const node = els.filter((e) => e.customData?.cmNode === id);
  if (node.length) return boundsOf(lib, node);
  const block = els.filter((e) => e.customData?.cm === id);
  return boundsOf(lib, block);
}

/** Typeset equations by LaTeX source, shared across steps so each one is rendered once. */
const typeset = new Map<string, Promise<Awaited<ReturnType<typeof renderEquation>> | null>>();
const typesetOnce = (latex: string) => {
  let p = typeset.get(latex);
  if (!p) {
    p = renderEquation(latex).catch(() => null);
    typeset.set(latex, p);
  }
  return p;
};

/** Start typesetting a step's equations ahead of drawing it (fire and forget). */
export function warmEquations(_handle: BoardHandle, actions: BoardAction[], handwriting: boolean) {
  for (const a of actions) if (a.type === "add_equation" && !(handwriting && handwrittenMath(a.latex))) void typesetOnce(a.latex);
}

async function prepareEquations(handle: BoardHandle, actions: BoardAction[], handwriting: boolean): Promise<Map<string, PreparedEquation>> {
  const out = new Map<string, PreparedEquation>();
  const existing = handle.api.getFiles();
  const toAdd: BinaryFileData[] = [];
  for (const a of actions) {
    if (a.type !== "add_equation" || out.has(a.latex) || (handwriting && handwrittenMath(a.latex))) continue;
    const eq = await typesetOnce(a.latex);
    // On failure it falls back to monospace text; layout reports a warning.
    if (!eq) continue;
    const fileId = `eq-${hashString(a.latex)}` as FileId;
    if (!existing[fileId]) {
      toAdd.push({ id: fileId, mimeType: "image/svg+xml", dataURL: svgToDataURL(eq.svg) as BinaryFileData["dataURL"], created: Date.now() });
    }
    out.set(a.latex, { fileId, width: eq.width, height: eq.height });
  }
  if (toAdd.length) handle.api.addFiles(toAdd);
  return out;
}

export interface RenderOptions {
  cursor: Cursor;
  autoId: () => string;
  step: number;
  animate: boolean;
  /**
   * Draw the new content stroke by stroke instead of adding it whole.
   * `speed` scales the drawing time (1 = normal, higher = slower); `skip`
   * finishes the drawing at once (e.g. when the student presses Stop).
   */
  draw?: { speed: number; skip: () => boolean; camera?: CameraControl };
  /** Write simple equations by hand instead of as typeset images. */
  handwriting?: boolean;
}

export interface RenderResult {
  cursor: Cursor;
  registered: RegisteredItem[];
  warnings: string[];
  cleared: boolean;
}

let elementCounter = 0;
const newElementId = () => `cm${Date.now().toString(36)}${(elementCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Render one tutor step: lay out the actions, convert them to Excalidraw
 * elements and append them to the scene as an undoable change.
 */
export async function renderActions(handle: BoardHandle, actions: BoardAction[], opts: RenderOptions): Promise<RenderResult> {
  const { api, lib } = handle;
  await fontsReady();
  const handwriting = Boolean(opts.handwriting);
  const equations = await prepareEquations(handle, actions, handwriting);
  const result = layoutStep(actions, {
    cursor: opts.cursor,
    lookup: (id) => lookupOnScene(handle, id),
    equation: (latex) => equations.get(latex),
    handwriting,
    newId: newElementId,
    autoId: opts.autoId,
    step: opts.step,
  });

  const converted = lib.convertToExcalidrawElements(result.skeletons as unknown as ExcalidrawElementSkeleton[], { regenerateIds: false });
  const before = result.clear ? [] : api.getSceneElements();
  const placed = place(handle, converted, before, actions[actions.length - 1]?.type, result.clear ? { ...cursorBelow([]), top: 0 } : opts.cursor);
  const created = placed.created;
  const cursor = placed.cursor ?? result.cursor;
  const registered = result.registered.map((r) => ({ ...r, bounds: { ...r.bounds, x: r.bounds.x + placed.dx, y: r.bounds.y + placed.dy } }));

  // Bring the spot being drawn on into view first, so the student watches it appear
  // (when drawing, the camera follows the pen instead).
  const focusEls = result.focus
    ? [...before, ...created].filter((e) => {
        const f = result.focus!;
        return e.x < f.x + f.width && e.x + e.width > f.x && e.y < f.y + f.height && e.y + e.height > f.y;
      })
    : created;
  if (focusEls.length && !opts.draw) {
    // On a narrow board, zoom out just enough when new content is wider than the view.
    const state = api.getAppState();
    const viewW = state.width / state.zoom.value;
    const [minX, , maxX] = lib.getCommonBounds(focusEls);
    const tooWide = state.width < 730 && maxX - minX > viewW * 0.92;
    api.scrollToContent(focusEls, { animate: opts.animate, duration: 380, ...(tooWide ? { fitToViewport: true, viewportZoomFactor: 0.92 } : {}) });
  }

  if (opts.draw && created.length) {
    await drawIn(handle, created, result.clear, opts.draw, result.focus);
  } else {
    const current = api.getSceneElements();
    const kept = result.clear ? current.map((el) => lib.newElementWith(el, { isDeleted: true })) : current;
    api.updateScene({ elements: [...kept, ...created], captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY });
  }
  return { cursor, registered, warnings: result.warnings, cleared: result.clear };
}

const FLOW_KINDS = new Set(["add_text", "add_equation", "add_shape", "add_diagram", "add_graph", "add_table"]);

/**
 * Measured placement. Layout positions blocks from estimated sizes; after
 * conversion Excalidraw has measured the text for real, so push the block
 * clear of anything it would overlap and wrap to a new column when the
 * current one is full. Highlight notes are only nudged sideways.
 */
function place(
  { lib }: BoardHandle,
  converted: ExcalidrawElement[],
  existing: readonly ExcalidrawElement[],
  kind: string | undefined,
  start: Cursor,
): { created: ExcalidrawElement[]; dx: number; dy: number; cursor: Cursor | null } {
  const obstacles = existing.map((e) => boundsOf(lib, [e])).filter((b): b is Bounds => Boolean(b && b.width + b.height > 0));
  if (converted.length && kind && FLOW_KINDS.has(kind)) {
    const real = boundsOf(lib, converted)!;
    const p = resolvePlacement(real, obstacles, start);
    const created = converted.map((e) => lib.newElementWith(e, { x: e.x + p.dx, y: e.y + p.dy, customData: { ...e.customData, cmX0: p.x0 } }));
    const moved = { ...real, x: real.x + p.dx, y: real.y + p.dy };
    const sameColumn = p.x0 === start.x0;
    return {
      created,
      dx: p.dx,
      dy: p.dy,
      cursor: { x0: p.x0, top: start.top ?? 0, bottom: sameColumn ? Math.max(moved.y + moved.height, start.bottom) : moved.y + moved.height, last: moved },
    };
  }
  if (converted.length && kind === "highlight") {
    const notes = converted.filter((e) => e.type === "text");
    const created = converted.map((e) => {
      if (e.type !== "text") return e;
      const others = notes.filter((n) => n.id !== e.id).map((n) => boundsOf(lib, [n])!);
      const dx = nudgeRight(boundsOf(lib, [e])!, [...obstacles, ...others]);
      return dx ? lib.newElementWith(e, { x: e.x + dx }) : e;
    });
    return { created, dx: 0, dy: 0, cursor: null };
  }
  return { created: converted, dx: 0, dy: 0, cursor: null };
}

let fontsLoading: Promise<unknown> | null = null;
/**
 * Text is measured when it's added, so the board's fonts must be loaded first —
 * otherwise a fallback font is measured and the hand-drawn text gets clipped.
 */
function fontsReady(): Promise<unknown> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  fontsLoading ??= Promise.race([
    Promise.all(["Excalifont", "Nunito"].map((f) => document.fonts.load(`20px ${f}`, "Solve 3x − 7 = 11").catch(() => null))),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  return fontsLoading;
}

/* A pencil drawn diagonally, tip at the bottom-left. */
const PENCIL_SIZE = 44;
const PENCIL_TIP: [number, number] = [3, 41];
const PENCIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${PENCIL_SIZE}" height="${PENCIL_SIZE}" viewBox="0 0 44 44"><g stroke="#1e1e24" stroke-width="1.6" stroke-linejoin="round"><path d="M3 41 L8 29 L33 4 L40 11 L15 36 Z" fill="#f6c443"/><path d="M8 29 L15 36" fill="none"/><path d="M33 4 L40 11 L36 15 L29 8 Z" fill="#f08a8a"/><path d="M3 41 L8 29 L15 36 Z" fill="#f1dcb5"/><path d="M3 41 L5 35.5 L8.5 39 Z" fill="#1e1e24"/></g></svg>`;
const PENCIL_FILE = "cm-pencil" as FileId;

function pencilElement({ api, lib }: BoardHandle): ExcalidrawElement | null {
  if (!api.getFiles()[PENCIL_FILE]) {
    api.addFiles([{ id: PENCIL_FILE, mimeType: "image/svg+xml", dataURL: svgToDataURL(PENCIL_SVG) as BinaryFileData["dataURL"], created: Date.now() }]);
  }
  const [el] = lib.convertToExcalidrawElements(
    [{ type: "image", x: 0, y: 0, width: PENCIL_SIZE, height: PENCIL_SIZE, fileId: PENCIL_FILE, status: "saved", locked: true } as unknown as ExcalidrawElementSkeleton],
    { regenerateIds: true },
  );
  return el ?? null;
}

/**
 * Next animation frame, raced against a timer: browsers pause or throttle
 * requestAnimationFrame for hidden/occluded pages, which would stall the
 * lesson mid-drawing. Stroke progress is time-based either way.
 */
const nextFrame = () =>
  new Promise<number>((r) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      r(performance.now());
    };
    if (typeof document === "undefined" || !document.hidden) requestAnimationFrame(finish);
    setTimeout(finish, 100);
  });

type Skeleton = ExcalidrawElementSkeleton;
const skeleton = (s: Record<string, unknown>) => s as unknown as Skeleton;

/** How one element is played back: its pen strokes, and what it looks like part-way through. */
interface Piece {
  final: ExcalidrawElement;
  strokes: PenStroke[];
  /** Elements to show while stroke `local` is `p` (0..1) of the way done; earlier strokes are complete. */
  draw: (local: number, p: number) => ExcalidrawElement[];
  /** Pen tip during stroke `local` at progress `p`, in scene coordinates. */
  tip: (local: number, p: number) => Point | null;
  /** After the last stroke: a short settle (e.g. a shape's fill fading in), `q` 0..1. */
  settle?: (q: number) => ExcalidrawElement[];
}

const SETTLE_MS = 200;
/** Where the pencil was last seen, so the next drawing can glide on from there. */
let lastPen: { pos: Point; at: number } | null = null;

/** A hidden frame used only to clip an element while it is revealed. */
function clipFrame(lib: ExcalidrawLib, x: number, y: number, height: number): ExcalidrawElement {
  return lib.convertToExcalidrawElements([skeleton({ type: "frame", children: [], x, y, width: 1, height, name: "" })], { regenerateIds: true })[0];
}

function pieceFor(lib: ExcalidrawLib, el: ExcalidrawElement, temp: Set<string>): Piece {
  const kind = strokeKind(el as unknown as Parameters<typeof strokeKind>[0]);
  const centre: Point = [el.x + el.width / 2, el.y + el.height / 2];

  if (kind === "write" && el.type === "text") {
    // One stand-in text per line, each revealed by its own frame as the pen moves along it.
    const lineH = el.fontSize * el.lineHeight;
    const lines = el.text.split("\n").flatMap((line, i) => {
      if (!line.trim()) return [];
      const [measured] = lib.convertToExcalidrawElements(
        [skeleton({ type: "text", x: 0, y: 0, text: line, fontSize: el.fontSize, fontFamily: el.fontFamily, strokeColor: el.strokeColor, opacity: el.opacity, lineHeight: el.lineHeight })],
        { regenerateIds: true },
      );
      if (!measured) return [];
      const w = measured.width;
      const x = el.textAlign === "center" ? el.x + (el.width - w) / 2 : el.textAlign === "right" ? el.x + el.width - w : el.x;
      const y = el.y + i * lineH;
      const frame = clipFrame(lib, x - 3, y - 6, lineH + 12);
      temp.add(measured.id).add(frame.id);
      const text = lib.newElementWith(measured, { x, y, frameId: frame.id, groupIds: [] });
      const baseline = y + lineH * 0.66;
      return [{ text, frame, w, x, baseline }];
    });
    return {
      final: el,
      strokes: lines.map((l) => ({ el: 0, kind, length: l.w, from: [l.x, l.baseline], to: [l.x + l.w, l.baseline] })),
      draw: (local, p) =>
        lines.slice(0, local + 1).flatMap((l, i) => {
          const done = i < local ? 1 : p;
          if (done <= 0.002) return [];
          return [lib.newElementWith(l.frame, { width: Math.max(1, (l.w + 6) * done) }), l.text];
        }),
      // Bob up and down a little, letter by letter, like a hand writing.
      tip: (local, p) => {
        const l = lines[local];
        return l ? [l.x + l.w * p, l.baseline - 2 - Math.abs(Math.sin((p * l.w) / 9)) * 5] : null;
      },
    };
  }

  if (kind === "trace" && "points" in el) {
    const points = el.points as unknown as Point[];
    const first = points[0];
    const last = points[points.length - 1];
    return {
      final: el,
      strokes: [{ el: 0, kind, length: pathLength(points), from: [el.x + first[0], el.y + first[1]], to: [el.x + last[0], el.y + last[1]] }],
      draw: (_l, p) => (p <= 0.002 ? [] : [lib.newElementWith(el as never, { points: partialPath(points, p) } as never)]),
      tip: (_l, p) => {
        const end = partialPath(points, p).at(-1)!;
        return [el.x + end[0], el.y + end[1]];
      },
    };
  }

  if (kind === "outline") {
    // Trace the border with a stand-in line, then fade the real shape (and its fill) in over it.
    const outline = outlinePoints(el.type, el.width, el.height);
    const [line] = lib.convertToExcalidrawElements(
      [
        skeleton({
          type: "line",
          x: el.x,
          y: el.y,
          points: outline,
          strokeColor: el.strokeColor,
          strokeWidth: el.strokeWidth,
          strokeStyle: el.strokeStyle,
          roughness: el.roughness,
          opacity: el.opacity,
          angle: el.angle,
          seed: el.seed,
        }),
      ],
      { regenerateIds: true },
    );
    if (line) {
      temp.add(line.id);
      return {
        final: el,
        strokes: [{ el: 0, kind, length: pathLength(outline), from: [el.x + outline[0][0], el.y + outline[0][1]], to: [el.x + outline[0][0], el.y + outline[0][1]] }],
        draw: (_l, p) => (p <= 0.002 ? [] : [lib.newElementWith(line as never, { points: partialPath(outline, p) } as never)]),
        tip: (_l, p) => {
          const end = partialPath(outline, p).at(-1)!;
          return [el.x + end[0], el.y + end[1]];
        },
        settle: (q) => [line, lib.newElementWith(el, { opacity: Math.round(el.opacity * q) })],
      };
    }
  }

  if (kind === "wipe") {
    // Equations and highlighter marks: revealed left to right behind the pen.
    const frame = clipFrame(lib, el.x - 2, el.y - 4, el.height + 8);
    temp.add(frame.id);
    const shown = lib.newElementWith(el, { frameId: frame.id });
    const writing = el.type === "image";
    const y = el.y + el.height * (writing ? 0.6 : 0.5);
    return {
      final: el,
      strokes: [{ el: 0, kind, length: el.width, from: [el.x, y], to: [el.x + el.width, y] }],
      draw: (_l, p) => (p <= 0.002 ? [] : [lib.newElementWith(frame, { width: Math.max(1, (el.width + 4) * p) }), shown]),
      tip: (_l, p) => [el.x + el.width * p, writing ? y - Math.abs(Math.sin((p * el.width) / 10)) * 6 : y],
    };
  }

  return {
    final: el,
    strokes: [{ el: 0, kind: "fade", length: 0, from: centre, to: centre }],
    draw: (_l, p) => [lib.newElementWith(el, { opacity: Math.round(el.opacity * p) })],
    tip: () => null,
  };
}

/** What the student set for the camera during this turn; `follow` turns off once they move the board themselves. */
export interface CameraControl {
  follow: boolean;
}

/**
 * Draw `created` in one continuous motion: a pencil writes each line, traces
 * each stroke and wipes in each equation at a steady speed, gliding from one
 * stroke to the next, while the view follows it — zooming out when the new
 * content doesn't fit and back in when it's small. Frames are rendered at the
 * display's refresh rate, and progress is time-based, so it stays smooth on a
 * 120 Hz screen and doesn't slow down on a busy one. The intermediate frames
 * are folded into one undo step.
 */
async function drawIn(
  handle: BoardHandle,
  created: ExcalidrawElement[],
  clear: boolean,
  draw: { speed: number; skip: () => boolean; camera?: CameraControl },
  focus: Bounds | null,
) {
  const { api, lib } = handle;
  const ours = new Set(created.map((e) => e.id));
  const temp = new Set<string>();
  /** Board content as committed before we started, by id (for clear_board). */
  const original = new Map(api.getSceneElementsIncludingDeleted().map((e) => [e.id, e]));
  const base = () => api.getSceneElementsIncludingDeleted().filter((e) => !ours.has(e.id) && !temp.has(e.id));
  const cleared = (els: readonly ExcalidrawElement[]) => (clear ? els.map((el) => (el.isDeleted ? el : lib.newElementWith(el, { isDeleted: true }))) : els);

  const pieces = created.map((el) => pieceFor(lib, el, temp));
  const strokes = pieces.flatMap((piece, el) => piece.strokes.map((s, local) => ({ ...s, el, local })));
  // Carry on from where the pen stopped on the previous item, if that was just now.
  const resume = lastPen && performance.now() - lastPen.at < 2500 ? lastPen.pos : undefined;
  const plan = planPen(strokes, draw.speed, undefined, resume);
  const timed = plan.strokes as (TimedStroke & { local: number })[];
  const span = pieces.map((_, i) => {
    const mine = timed.filter((s) => s.el === i);
    return { start: mine[0]?.start ?? 0, end: mine.at(-1)?.end ?? 0 };
  });

  const pencil = pencilElement(handle);
  if (pencil) temp.add(pencil.id);
  const pencilAt = (tip: Point, zoom: number, lifted: boolean) => {
    // Keep the pencil the same size on screen whatever the zoom.
    const k = 1 / Math.max(0.35, zoom);
    return lib.newElementWith(pencil!, {
      x: tip[0] - PENCIL_TIP[0] * k,
      y: tip[1] - PENCIL_TIP[1] * k - (lifted ? 7 * k : 0),
      width: PENCIL_SIZE * k,
      height: PENCIL_SIZE * k,
      opacity: lifted ? 80 : 100,
    });
  };

  // The region the view keeps in frame: everything this action draws (and what a highlight points at).
  const [minX, minY, maxX, maxY] = lib.getCommonBounds(created);
  let region: Region = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  if (focus) {
    const x = Math.min(region.x, focus.x);
    const y = Math.min(region.y, focus.y);
    region = { x, y, width: Math.max(region.x + region.width, focus.x + focus.width) - x, height: Math.max(region.y + region.height, focus.y + focus.height) - y };
  }

  const initial = api.getAppState();
  const frameRendering = initial.frameRendering;
  let cam: Camera = scrollToCamera({ scrollX: initial.scrollX, scrollY: initial.scrollY, zoom: initial.zoom.value }, initial.width, initial.height);
  let expected: { scrollX: number; scrollY: number; zoom: number } | null = null;
  const camera = draw.camera ?? { follow: true };

  const commit = () => {
    // Excalidraw leaves elements it has never committed out of an undo step (it takes
    // them for in-progress local drawing), so put the board back the way it was
    // committed, then add the finished drawing as a single undoable change.
    const rest = base().map((e) => (clear && original.has(e.id) ? original.get(e.id)! : e));
    api.updateScene({ elements: rest, captureUpdate: lib.CaptureUpdateAction.EVENTUALLY });
    api.updateScene({ elements: [...cleared(rest), ...created], appState: { frameRendering }, captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY });
  };

  const t0 = performance.now();
  let last = t0;
  let penPos: Point | null = resume ?? null;
  try {
    while (!draw.skip()) {
      const now = performance.now();
      const t = now - t0;
      const dt = Math.min(64, now - last);
      last = now;

      const shown: ExcalidrawElement[] = [];
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        const { start, end } = span[i];
        if (t >= end + (piece.settle ? SETTLE_MS : 0)) shown.push(piece.final);
        else if (t >= end && piece.settle) shown.push(...piece.settle((t - end) / SETTLE_MS));
        else if (t >= start) {
          const active = timed.find((s) => s.el === i && t < s.end)!;
          const p = t < active.start ? 0 : penEase((t - active.start) / (active.end - active.start));
          shown.push(...piece.draw(active.local, p));
        } else if (piece.final.type === "image") {
          // Not reached yet: on the board invisibly, so its image is loaded by the time the pen gets there.
          shown.push(lib.newElementWith(piece.final, { opacity: 0 }));
        }
      }

      const at = penAt(timed, t);
      let lifted = false;
      if (at.state === "draw") {
        const s = timed[at.index];
        penPos = pieces[s.el].tip(s.local, penEase(at.p)) ?? penPos;
      } else if (at.state === "glide") {
        const next = timed[at.index];
        const from: Point = at.index > 0 ? (pieces[timed[at.index - 1].el].tip(timed[at.index - 1].local, 1) ?? timed[at.index - 1].to) : (resume ?? next.from);
        const g = glideEase(at.p);
        penPos = [from[0] + (next.from[0] - from[0]) * g, from[1] + (next.from[1] - from[1]) * g];
        lifted = true;
      } else penPos = null;
      if (penPos) lastPen = { pos: penPos, at: now };

      // Follow the pen, unless the student has taken over the view.
      const state = api.getAppState();
      if (expected && camera.follow && (Math.abs(state.scrollX - expected.scrollX) > 1 || Math.abs(state.scrollY - expected.scrollY) > 1 || Math.abs(state.zoom.value - expected.zoom) > 0.002)) {
        camera.follow = false;
      }
      let appState: Record<string, unknown> | undefined = t === 0 || !expected ? { frameRendering: { enabled: true, clip: true, name: false, outline: false } } : undefined;
      if (camera.follow) {
        cam = easeCamera(cam, cameraTarget(cam, region, penPos, state.width, state.height), dt);
        expected = cameraToScroll(cam, state.width, state.height);
        appState = { ...appState, scrollX: expected.scrollX, scrollY: expected.scrollY, zoom: { value: expected.zoom } };
      } else expected = expected ?? { scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom.value };

      const pen = pencil && penPos ? [pencilAt(penPos, cam.zoom, lifted)] : pencil ? [lib.newElementWith(pencil, { opacity: 0 })] : [];
      api.updateScene({ elements: [...cleared(base()), ...shown, ...pen], ...(appState ? { appState: appState as never } : {}), captureUpdate: lib.CaptureUpdateAction.EVENTUALLY });

      if (t >= plan.total + SETTLE_MS) break;
      await nextFrame();
    }
  } finally {
    commit();
  }
}

/** Clear the board as one undoable change. */
export function clearScene({ api, lib }: BoardHandle) {
  const els = api.getSceneElements().map((el) => lib.newElementWith(el, { isDeleted: true }));
  api.updateScene({ elements: els, captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY });
}

/** Serializable snapshot of the board (only files that are still referenced). */
export function snapshotScene({ api }: BoardHandle): { elements: unknown[]; files: Record<string, unknown> } {
  const elements = api.getSceneElements();
  const used = new Set(elements.filter((e) => e.type === "image").map((e) => (e as { fileId?: string }).fileId));
  const files = Object.fromEntries(Object.entries(api.getFiles()).filter(([id]) => used.has(id)));
  return { elements: JSON.parse(JSON.stringify(elements)), files: JSON.parse(JSON.stringify(files)) };
}
