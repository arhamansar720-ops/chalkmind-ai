import type { LearningSignal, QuizAttempt } from "../store/types";

export interface ReviewTopic {
  topic: string;
  subject?: string;
  score: number;
  reasons: string[];
  lastSeen: number;
}

const WEIGHT: Record<LearningSignal["kind"], number> = {
  misconception: 3,
  quiz_miss: 2,
  struggle: 2,
  review_flag: 2.5,
  mastered: -4,
};

const DAY = 86_400_000;

const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Rank topics to review from saved signals only. Recent evidence counts more
 * (half-life of two weeks); a later "mastered" signal cancels earlier
 * struggles. No signal → no recommendation; nothing is inferred.
 */
export function reviewTopics(signals: LearningSignal[], now = Date.now(), limit = 6): ReviewTopic[] {
  const byTopic = new Map<string, ReviewTopic>();
  const sorted = [...signals].sort((a, b) => a.createdAt - b.createdAt);
  for (const s of sorted) {
    const key = norm(s.topic);
    if (!key) continue;
    const entry = byTopic.get(key) ?? { topic: s.topic.trim(), subject: s.subject, score: 0, reasons: [], lastSeen: 0 };
    const age = Math.max(0, now - s.createdAt) / DAY;
    const decay = 0.5 ** (age / 14);
    entry.score = Math.max(0, entry.score + WEIGHT[s.kind] * decay);
    entry.lastSeen = Math.max(entry.lastSeen, s.createdAt);
    entry.subject ??= s.subject;
    if (s.kind === "mastered") entry.reasons = ["Marked as understood"];
    else entry.reasons.push(describe(s));
    byTopic.set(key, entry);
  }
  return [...byTopic.values()]
    .filter((t) => t.score > 0.5)
    .map((t) => ({ ...t, reasons: summarizeReasons(t.reasons) }))
    .sort((a, b) => b.score - a.score || b.lastSeen - a.lastSeen)
    .slice(0, limit);
}

function describe(s: LearningSignal): string {
  switch (s.kind) {
    case "quiz_miss":
      return "Missed a quiz question";
    case "misconception":
      return s.note ? `Tutor noted: ${s.note}` : "Tutor noted a misconception";
    case "struggle":
      return s.note ? `Found it tricky: ${s.note}` : "Found it tricky in a session";
    case "review_flag":
      return "You flagged it for review";
    default:
      return "";
  }
}

function summarizeReasons(reasons: string[]): string[] {
  const counts = new Map<string, number>();
  for (const r of reasons) if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].slice(-3).map(([r, n]) => (n > 1 ? `${r} (×${n})` : r));
}

export interface SubjectStat {
  subject: string;
  attempts: number;
  average: number;
  best: number;
}

/** Quiz performance by subject, from saved attempts. */
export function quizStats(attempts: QuizAttempt[]): SubjectStat[] {
  const by = new Map<string, number[]>();
  for (const a of attempts) {
    if (!a.total) continue;
    const pct = (a.score / a.total) * 100;
    by.set(a.subject || "General", [...(by.get(a.subject || "General") ?? []), pct]);
  }
  return [...by.entries()]
    .map(([subject, pcts]) => ({
      subject,
      attempts: pcts.length,
      average: Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length),
      best: Math.round(Math.max(...pcts)),
    }))
    .sort((a, b) => b.attempts - a.attempts);
}

/** Distinct calendar days (local time) with saved activity, most recent first. */
export function activeDays(timestamps: number[]): string[] {
  const days = new Set(
    timestamps.map((t) => {
      const d = new Date(t);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }),
  );
  return [...days].sort().reverse();
}
