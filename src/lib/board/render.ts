"use client";

import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { cursorBelow, layoutStep, type Bounds, type Cursor, type PreparedEquation, type RegisteredItem } from "./layout";
import { hashString, renderEquation, svgToDataURL } from "./math-svg";
import type { BoardAction } from "./schema";

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
  const current = api.getSceneElements();
  const kept = result.clear ? current.map((el) => lib.newElementWith(el, { isDeleted: true })) : current;
  api.updateScene({ elements: [...kept, ...created], captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY });

  const focusEls = result.focus
    ? api.getSceneElements().filter((e) => {
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
  return { cursor: result.cursor, registered: result.registered, warnings: result.warnings, cleared: result.clear };
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
