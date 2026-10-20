import type { MemoryFact, MemoryKind, TutorSession } from "../store/types";

// What the tutor remembers about a student: short facts it was told, and
// summaries of earlier lessons. Pure helpers (selection, de-duplication,
// privacy filter) so they're easy to test and reason about.

export const MEMORY_CAP = 60;
export const FACTS_PER_REQUEST = 20;
export const LESSONS_PER_REQUEST = 4;

const STOP = new Set(
  "a an and are as at be but by can do for from has have how i i'm in is it its me my of on or so that the their them they this to was we what when which who why will with you your about into than then there these those".split(" "),
);

export const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

/**
 * Things the tutor must never store, even if the student mentions them:
 * contact details, credentials, addresses, IDs and health information.
 */
export function isSensitive(fact: string): boolean {
  const f = fact.toLowerCase();
  return (
    /[\w.+-]+@[\w-]+\.[\w.]+/.test(f) || // email
    /(\+?\d[\d\s().-]{7,}\d)/.test(f) || // phone-like number runs
    /https?:\/\/|www\./.test(f) ||
    /\b(password|passcode|pin code|social security|ssn|credit card|bank account|home address|lives? at|street|apartment)\b/.test(f) ||
    /\b(diagnos|medication|therapy|depress|anxiety|adhd|autis|disorder|illness|pregnan)\w*/.test(f)
  );
}

export function cleanFact(raw: string): string | null {
  const fact = raw.replace(/\s+/g, " ").trim().replace(/^[-•*]\s*/, "").slice(0, 200);
  if (fact.length < 6 || isSensitive(fact)) return null;
  return fact.endsWith(".") ? fact : `${fact}.`;
}

function similarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const t of A) if (B.has(t)) both++;
  return both / Math.min(A.size, B.size);
}

/** An existing fact that says (nearly) the same thing, if any. */
export function findDuplicate(facts: MemoryFact[], fact: string): MemoryFact | undefined {
  return facts.find((f) => similarity(f.fact, fact) >= 0.8);
}

/** Oldest-first facts beyond the cap, to delete. */
export function overflow(facts: MemoryFact[], cap = MEMORY_CAP): MemoryFact[] {
  if (facts.length <= cap) return [];
  return [...facts].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, facts.length - cap);
}

const KIND_WEIGHT: Record<MemoryKind, number> = { about: 1.5, preference: 1.5, goal: 1, struggle: 1 };

/** The facts most worth sending with this question: always the basics, then the most relevant and recent. */
export function selectFacts(facts: MemoryFact[], question: string, limit = FACTS_PER_REQUEST, now = Date.now()): MemoryFact[] {
  const q = new Set(tokens(question));
  const scored = facts.map((f) => {
    const overlap = tokens(f.fact).filter((t) => q.has(t)).length;
    const ageDays = Math.max(0, now - f.updatedAt) / 86_400_000;
    return { f, score: KIND_WEIGHT[f.kind] + overlap * 2 + 0.5 ** (ageDays / 30) };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.f);
}

/** A session that has enough of a lesson to be worth summarising, and changed since its last summary. */
export function needsSummary(s: TutorSession): boolean {
  const replies = s.messages.filter((m) => m.role === "assistant" && m.content.trim()).length;
  return replies >= 2 && (!s.summary || s.summary.messageCount < s.messages.length);
}

export interface LessonRecall {
  title: string;
  summary: string;
  when: string;
}

/** Earlier lessons to mention: the most relevant summaries, else the most recent. */
export function selectLessons(sessions: TutorSession[], currentId: string | null, question: string, limit = LESSONS_PER_REQUEST, now = Date.now()): LessonRecall[] {
  const q = new Set(tokens(question));
  return sessions
    .filter((s) => s.id !== currentId && s.summary?.text)
    .map((s) => {
      const overlap = tokens(`${s.title} ${s.summary!.text}`).filter((t) => q.has(t)).length;
      const ageDays = Math.max(0, now - s.updatedAt) / 86_400_000;
      return { s, score: overlap * 2 + 0.5 ** (ageDays / 14) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ s }) => ({ title: s.title.slice(0, 80), summary: s.summary!.text.slice(0, 400), when: ago(now - s.updatedAt) }));
}

function ago(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  if (d <= 0) return "earlier today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "last week";
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
}
