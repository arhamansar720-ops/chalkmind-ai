// How fast a tutor reply unfolds. Hosted models stream a whole lesson in about
// a second, so the client holds each step back long enough to read (or hear)
// it, draws each item stroke by stroke, and leaves a beat between steps.

export type LessonPace = "relaxed" | "normal" | "quick";

export const LESSON_PACES: { value: LessonPace; label: string }[] = [
  { value: "relaxed", label: "Relaxed" },
  { value: "normal", label: "Normal" },
  { value: "quick", label: "Quick" },
];

const FACTOR: Record<LessonPace, number> = { relaxed: 1.5, normal: 1, quick: 0.45 };

/** Unhurried reading speed for explanations with math in them. */
const MS_PER_WORD = 60_000 / 180;

/** Time to leave a step on screen before the next one appears (voice off). */
export function readingDelay(text: string, pace: LessonPace = "normal"): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  const ms = Math.min(8000, Math.max(1500, 700 + words * MS_PER_WORD));
  return Math.round(ms * FACTOR[pace]);
}

/** Gap between consecutive drawings on the board. */
export function boardDelay(pace: LessonPace = "normal"): number {
  return Math.round(1000 * FACTOR[pace]);
}

/** A breath between steps, after the previous one has been read or spoken. */
export function stepPause(pace: LessonPace = "normal"): number {
  return Math.round(600 * FACTOR[pace]);
}

/** Multiplier for how long the board takes to draw each stroke (1 = normal). */
export function drawSpeed(pace: LessonPace = "normal"): number {
  return FACTOR[pace];
}

export interface RevealPoint {
  /** Characters of the text visible after this point. */
  chars: number;
  /** Time to wait before revealing the next point. */
  delay: number;
}

/**
 * Word-by-word schedule for writing an explanation into the chat at an
 * unhurried reading pace. Inline/display math ($…$), **bold** and `code` runs
 * are revealed whole, so half-written markup never renders.
 */
export function revealPoints(text: string, pace: LessonPace = "normal"): RevealPoint[] {
  const f = FACTOR[pace];
  const out: RevealPoint[] = [];
  const re = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\*\*[^*]+?\*\*|`[^`]+`|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const token = m[0];
    let delay = token.startsWith("$") ? 420 : 185 + Math.min(150, token.length * 9);
    if (/[.!?:]$/.test(token)) delay += 280;
    else if (/[,;]$/.test(token)) delay += 120;
    out.push({ chars: m.index + token.length, delay: Math.round(delay * f) });
  }
  if (out.length) out[out.length - 1].chars = text.length;
  return out;
}
