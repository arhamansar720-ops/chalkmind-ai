"use client";

import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { cursorBelow, layoutStep, type Bounds, type Cursor, type PreparedEquation, type RegisteredItem } from "./layout";
import { hashString, renderEquation, svgToDataURL } from "./math-svg";
import type { BoardAction } from "./schema";
import { easeStroke, outlinePoints, partialPath, partialText, planDurations, strokeKind, type Point } from "./stroke";

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
  const els = api.getSceneElements();
  const b = boundsOf(lib, els);
  if (!b) return cursorBelow([]);
  return cursorBelow([b], Math.min(0, b.x));
}

/** Bounds of content the tutor drew earlier, found by its id in element customData. */
export function lookupOnScene({ api, lib }: BoardHandle, id: string): Bounds | null {
  const els = api.getSceneElements();
  const node = els.filter((e) => e.customData?.cmNode === id);
  if (node.length) return boundsOf(lib, node);
  const block = els.filter((e) => e.customData?.cm === id);
  return boundsOf(lib, block);
}

async function prepareEquations(handle: BoardHandle, actions: BoardAction[]): Promise<Map<string, PreparedEquation>> {
  const out = new Map<string, PreparedEquation>();
  const existing = handle.api.getFiles();
  const toAdd: BinaryFileData[] = [];
  for (const a of actions) {
    if (a.type !== "add_equation" || out.has(a.latex)) continue;
    try {
      const eq = await renderEquation(a.latex);
      const fileId = `eq-${hashString(a.latex)}` as FileId;
      if (!existing[fileId]) {
        toAdd.push({ id: fileId, mimeType: "image/svg+xml", dataURL: svgToDataURL(eq.svg) as BinaryFileData["dataURL"], created: Date.now() });
      }
      out.set(a.latex, { fileId, width: eq.width, height: eq.height });
    } catch {
      /* falls back to monospace text; layout reports a warning */
    }
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
  draw?: { speed: number; skip: () => boolean };
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
  const equations = await prepareEquations(handle, actions);
  const result = layoutStep(actions, {
    cursor: opts.cursor,
    lookup: (id) => lookupOnScene(handle, id),
    equation: (latex) => equations.get(latex),
    newId: newElementId,
    autoId: opts.autoId,
    step: opts.step,
  });

  const created = lib.convertToExcalidrawElements(result.skeletons as unknown as ExcalidrawElementSkeleton[], { regenerateIds: false });
  const before = result.clear ? [] : api.getSceneElements();

  // Bring the spot being drawn on into view first, so the student watches it appear.
  const focusEls = result.focus
    ? [...before, ...created].filter((e) => {
        const f = result.focus!;
        return e.x < f.x + f.width && e.x + e.width > f.x && e.y < f.y + f.height && e.y + e.height > f.y;
      })
    : created;
  if (focusEls.length) {
    // On a narrow board, zoom out just enough when new content is wider than the view.
    const state = api.getAppState();
    const viewW = state.width / state.zoom.value;
    const [minX, , maxX] = lib.getCommonBounds(focusEls);
    const tooWide = state.width < 730 && maxX - minX > viewW * 0.92;
    api.scrollToContent(focusEls, { animate: opts.animate, duration: 380, ...(tooWide ? { fitToViewport: true, viewportZoomFactor: 0.92 } : {}) });
  }

  if (opts.animate && opts.draw && created.length) {
    await drawIn(handle, created, result.clear, opts.draw);
  } else {
    const current = api.getSceneElements();
    const kept = result.clear ? current.map((el) => lib.newElementWith(el, { isDeleted: true })) : current;
    api.updateScene({ elements: [...kept, ...created], captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY });
  }
  return { cursor: result.cursor, registered: result.registered, warnings: result.warnings, cleared: result.clear };
}

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

const naturalSizes = new Map<string, Promise<{ w: number; h: number } | null>>();
function naturalSize(dataURL: string): Promise<{ w: number; h: number } | null> {
  let p = naturalSizes.get(dataURL);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? { w: img.naturalWidth, h: img.naturalHeight } : null);
      img.onerror = () => resolve(null);
      img.src = dataURL;
    });
    naturalSizes.set(dataURL, p);
  }
  return p;
}

/**
 * Add `created` to the scene one element at a time, each drawn in over a few
 * frames: text is written character by character, lines and arrows are traced
 * from their start, shape borders are traced around, and equations are wiped
 * in left to right. The intermediate frames are folded into one undo step.
 */
async function drawIn(handle: BoardHandle, created: ExcalidrawElement[], clear: boolean, draw: { speed: number; skip: () => boolean }) {
  const { api, lib } = handle;
  const ours = new Set(created.map((e) => e.id));
  const temp = new Set<string>();
  const shown: ExcalidrawElement[] = [];
  /** Board content as committed before we started, by id (for clear_board). */
  const original = new Map(api.getSceneElementsIncludingDeleted().map((e) => [e.id, e]));
  // Equations not drawn yet sit on the board invisibly so their images load before the wipe reaches them.
  const preload = (from: number) => created.slice(from).filter((e) => e.type === "image").map((e) => lib.newElementWith(e, { opacity: 0 }));

  const base = () => api.getSceneElementsIncludingDeleted().filter((e) => !ours.has(e.id) && !temp.has(e.id));
  const cleared = (els: readonly ExcalidrawElement[]) => (clear ? els.map((el) => (el.isDeleted ? el : lib.newElementWith(el, { isDeleted: true }))) : els);

  const push = (extra: ExcalidrawElement[], from: number) =>
    api.updateScene({ elements: [...cleared(base()), ...shown, ...extra, ...preload(from)], captureUpdate: lib.CaptureUpdateAction.EVENTUALLY });

  // Excalidraw leaves elements it has never committed out of an undo step (it takes
  // them for in-progress local drawing), so put the board back the way it was
  // committed, then add the finished drawing as a single undoable change.
  const commit = () => {
    const rest = base().map((e) => (clear && original.has(e.id) ? original.get(e.id)! : e));
    api.updateScene({ elements: rest, captureUpdate: lib.CaptureUpdateAction.EVENTUALLY });
    api.updateScene({ elements: [...cleared(rest), ...created], captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY });
  };

  const durations = planDurations(created as unknown as Parameters<typeof planDurations>[0], draw.speed);
  try {
    for (let i = 0; i < created.length; i++) {
      if (draw.skip()) break;
      const el = created[i];
      const frame = await framer(handle, el, temp);
      const start = performance.now();
      while (!draw.skip()) {
        const t = (performance.now() - start) / durations[i];
        if (t >= 1) break;
        push(frame(easeStroke(t)), i + 1);
        await nextFrame();
      }
      shown.push(el);
    }
  } finally {
    commit();
  }
}

type Frame = (t: number) => ExcalidrawElement[];

/** Build the function that renders `el` part-way (0..1) through being drawn. */
async function framer({ api, lib }: BoardHandle, el: ExcalidrawElement, temp: Set<string>): Promise<Frame> {
  const kind = strokeKind(el as unknown as Parameters<typeof strokeKind>[0]);
  const fade: Frame = (t) => [lib.newElementWith(el, { opacity: Math.round(el.opacity * t) })];

  if (kind === "write" && el.type === "text") {
    return (t) => {
      const text = partialText(el.text, t);
      return text ? [lib.newElementWith(el, { text, originalText: text })] : [];
    };
  }
  if (kind === "trace" && "points" in el) {
    const points = el.points as unknown as Point[];
    return (t) => [lib.newElementWith(el as never, { points: partialPath(points, t) } as never)];
  }
  if (kind === "outline") {
    // Trace the border with a stand-in line, then swap in the real shape (and its fill).
    const outline = outlinePoints(el.type, el.width, el.height);
    const [pen] = lib.convertToExcalidrawElements(
      [
        {
          type: "line",
          x: el.x,
          y: el.y,
          points: outline as [number, number][],
          strokeColor: el.strokeColor,
          strokeWidth: el.strokeWidth,
          strokeStyle: el.strokeStyle,
          roughness: el.roughness,
          opacity: el.opacity,
          angle: el.angle,
        } as unknown as ExcalidrawElementSkeleton,
      ],
      { regenerateIds: true },
    );
    if (!pen) return fade;
    temp.add(pen.id);
    return (t) => [lib.newElementWith(pen as never, { points: partialPath(outline, t) } as never)];
  }
  if (kind === "wipe" && el.type === "image" && el.fileId) {
    const file = api.getFiles()[el.fileId];
    const size = file ? await naturalSize(file.dataURL) : null;
    if (!size) return fade;
    return (t) =>
      t <= 0
        ? []
        : [
            lib.newElementWith(el, {
              width: el.width * t,
              crop: { x: 0, y: 0, width: size.w * t, height: size.h, naturalWidth: size.w, naturalHeight: size.h },
            }),
          ];
  }
  return fade;
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
