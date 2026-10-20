// How fast a tutor reply unfolds. Hosted models stream a whole lesson in about
// a second, so the client holds each step back long enough to read it (when
// voice is off) and spaces out the board drawing.

export type LessonPace = "relaxed" | "normal" | "quick";

export const LESSON_PACES: { value: LessonPace; label: string }[] = [
  { value: "relaxed", label: "Relaxed" },
  { value: "normal", label: "Normal" },
  { value: "quick", label: "Quick" },
];

const FACTOR: Record<LessonPace, number> = { relaxed: 1.5, normal: 1, quick: 0.45 };

/** Comfortable reading speed for explanations with math in them. */
const MS_PER_WORD = 60_000 / 210;

/** Time to leave a step on screen before the next one appears (voice off). */
export function readingDelay(text: string, pace: LessonPace = "normal"): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  const ms = Math.min(7000, Math.max(1200, 600 + words * MS_PER_WORD));
  return Math.round(ms * FACTOR[pace]);
}

/** Gap between consecutive drawings on the board. */
export function boardDelay(pace: LessonPace = "normal"): number {
  return Math.round(850 * FACTOR[pace]);
}
