"use client";

import "@excalidraw/excalidraw/index.css";
import { useEffect, useRef, useState } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Eraser, Maximize, PencilLine, Redo2, Undo2 } from "lucide-react";
import type { BoardHandle } from "@/lib/board/render";
import type { BoardSnapshot } from "@/lib/store/types";
import { useTheme } from "@/components/ThemeToggle";
import { IconButton, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

type ExcalidrawLib = typeof import("@excalidraw/excalidraw");

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

let libPromise: Promise<ExcalidrawLib> | null = null;
function loadLib() {
  if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = "/excalidraw/";
  libPromise ??= import("@excalidraw/excalidraw");
  return libPromise;
}

/**
 * Trigger Excalidraw's own undo/redo. Its history isn't exposed on the
 * imperative API, so we press its (always-rendered) footer buttons.
 */
function pressHistoryButton(container: HTMLElement | null, redo: boolean) {
  const label = redo ? "Redo" : "Undo";
  const btn = container?.querySelector<HTMLButtonElement>(`.excalidraw button[aria-label="${label}"]`);
  btn?.click();
}

export interface BoardProps {
  initial: BoardSnapshot | null;
  onReady: (handle: BoardHandle | null) => void;
  /** Called (debounced by the parent) whenever the scene changes. */
  onSceneChange: () => void;
  /** Called on every scene update with whether the board has any elements. */
  onEmptyChange: (empty: boolean) => void;
  onClear: () => void;
  busy?: boolean;
  isEmpty: boolean;
  className?: string;
}

export function Board({ initial, onReady, onSceneChange, onEmptyChange, onClear, busy, isEmpty, className }: BoardProps) {
  const [lib, setLib] = useState<ExcalidrawLib | null>(null);
  const [compact, setCompact] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const handleRef = useRef<BoardHandle | null>(null);
  const versionRef = useRef<number>(-1);
  const theme = useTheme();

  useEffect(() => {
    let alive = true;
    loadLib()
      .then((m) => alive && setLib(() => m))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      onReady(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApi = (api: ExcalidrawImperativeAPI) => {
    if (!lib || handleRef.current?.api === api) return;
    handleRef.current = { api, lib };
    onReady(handleRef.current);
    // On narrow screens, show a restored lesson whole rather than its middle.
    if ((initial?.elements?.length ?? 0) > 0 && (containerRef.current?.clientWidth ?? 1000) < 730) {
      setTimeout(() => {
        const els = api.getSceneElements();
        if (els.length) api.scrollToContent(els, { fitToViewport: true, viewportZoomFactor: 0.92 });
      }, 60);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Excalidraw switches to its phone layout on narrow containers; our
    // toolbar then floats over the canvas instead of joining its top bar.
    const ro = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 730));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleChange = (elements: readonly ExcalidrawElement[]) => {
    if (!lib) return;
    onEmptyChange(elements.every((e) => e.isDeleted));
    const v = lib.getSceneVersion(elements);
    if (versionRef.current === -1) {
      versionRef.current = v;
      return;
    }
    if (v !== versionRef.current) {
      versionRef.current = v;
      onSceneChange();
    }
  };

  const fit = () => {
    const h = handleRef.current;
    if (!h) return;
    const els = h.api.getSceneElements();
    if (els.length) h.api.scrollToContent(els, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true, duration: 300 });
  };

  if (failed) {
    return (
      <div className={cn("flex items-center justify-center p-8 text-center text-sm text-muted", className)}>
        The whiteboard couldn&apos;t load in this browser. The tutor still works in the chat panel.
      </div>
    );
  }

  const toolbar = (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-sm" role="toolbar" aria-label="Board controls">
      <IconButton label="Undo (board)" size="sm" onClick={() => pressHistoryButton(containerRef.current, false)} disabled={!lib}>
        <Undo2 className="size-4" />
      </IconButton>
      <IconButton label="Redo (board)" size="sm" onClick={() => pressHistoryButton(containerRef.current, true)} disabled={!lib}>
        <Redo2 className="size-4" />
      </IconButton>
      <IconButton label="Zoom to fit" size="sm" onClick={fit} disabled={!lib || isEmpty}>
        <Maximize className="size-4" />
      </IconButton>
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <IconButton label="Clear board" size="sm" onClick={onClear} disabled={!lib || isEmpty}>
        <Eraser className="size-4" />
      </IconButton>
    </div>
  );

  const Excalidraw = lib?.Excalidraw;
  const MainMenu = lib?.MainMenu;

  return (
    <div ref={containerRef} className={cn("cm-board relative flex min-h-0 flex-col", className)}>
      <div className="relative min-h-0 flex-1">
        {Excalidraw && MainMenu ? (
          <Excalidraw
            excalidrawAPI={handleApi}
            initialData={{
              elements: (initial?.elements ?? []) as ExcalidrawElement[],
              files: (initial?.files ?? {}) as BinaryFiles,
              appState: {
                viewBackgroundColor: "#ffffff",
                currentItemFontFamily: 5,
                currentItemStrokeColor: "#1e1e24",
                currentItemRoughness: 1,
              },
              scrollToContent: true,
            }}
            theme={theme}
            onChange={handleChange}
            name="Chalkmind board"
            renderTopRightUI={compact ? undefined : () => toolbar}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                toggleTheme: false,
                changeViewBackgroundColor: false,
                clearCanvas: false,
                export: false,
                saveAsImage: true,
              },
            }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
          </Excalidraw>
        ) : (
          <div className="flex h-full items-center justify-center bg-white dark:bg-[#121214]">
            <Spinner label="Loading whiteboard" />
          </div>
        )}

        {lib && compact && <div className="absolute bottom-[76px] right-3 z-[4]">{toolbar}</div>}
        {lib && isEmpty && !busy && (
          <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center p-6">
            <div className="max-w-xs text-center text-[#8b8b94]">
              <PencilLine className="mx-auto mb-3 size-6" aria-hidden />
              <p className="text-sm font-medium text-[#45454d] dark:text-[#b9b9c1]">Your whiteboard</p>
              <p className="mt-1 text-[13px] leading-relaxed">Ask a question and the tutor will draw here, step by step. You can draw, write and annotate too.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
