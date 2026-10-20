import type { BoardColor, HighlightColor } from "./schema";

/*
 * Board colours are chosen for a white canvas. Excalidraw's dark theme applies
 * an inverting filter to the whole canvas, so these stay legible in both.
 */
export const STROKE: Record<BoardColor, string> = {
  ink: "#1e1e24",
  blue: "#2f5bd8",
  red: "#d13b3b",
  green: "#1e8a52",
  orange: "#d9730d",
  purple: "#7c4dce",
  gray: "#6b6b74",
};

export const FILL: Record<BoardColor, string> = {
  ink: "#f4f4f2",
  blue: "#e7edff",
  red: "#ffe4e4",
  green: "#e2f5ea",
  orange: "#ffefdc",
  purple: "#efe7fd",
  gray: "#f0f0ee",
};

export const HIGHLIGHT: Record<HighlightColor, string> = {
  yellow: "#ffe066",
  blue: "#a5c0ff",
  green: "#a7e8bf",
  pink: "#ffb3c7",
};

/** Rotation used when a graph or diagram doesn't specify colours. */
export const SERIES: BoardColor[] = ["blue", "red", "green", "purple", "orange"];

/** Excalidraw font family ids (see FONT_FAMILY in @excalidraw/excalidraw). */
export const FONT = {
  hand: 5, // Excalifont
  sans: 6, // Nunito
  mono: 3, // Cascadia
} as const;
