import type { RegisteredItem } from "../board/layout";
import type { BoardItem, StoredMessage, TutorSession } from "../store/types";
import type { TutorMode } from "./protocol";

export function createSession(id: string, now = Date.now()): TutorSession {
  return {
    id,
    title: "New session",
    createdAt: now,
    updatedAt: now,
    mode: "explain",
    messages: [],
    board: null,
    boardIndex: [],
    docIds: [],
    autoId: 0,
  };
}

/**
 * The text the model sees for an earlier assistant turn: what it said, plus
 * a compact note of what it drew, so follow-ups like "why did you subtract 4
 * here?" have the context without resending the whole board.
 */
export function assistantContextText(msg: Pick<StoredMessage, "steps" | "content">, drawn: RegisteredItem[] | BoardItem[] = []): string {
  const said = (msg.steps ?? []).map((s) => s.say || s.check?.question || "").filter(Boolean).join("\n\n") || msg.content;
  if (drawn.length === 0) return said;
  const list = drawn
    .slice(0, 16)
    .map((d) => `${d.id}: ${d.summary.slice(0, 60)}`)
    .join("; ");
  return `${said}\n\n[Drawn on the board: ${list}]`;
}

/** Conversation history for the API (text only; errored turns are skipped). */
export function historyForRequest(messages: StoredMessage[], limit = 24): { role: "user" | "assistant"; content: string }[] {
  const usable = messages.filter((m) => !m.error && m.content.trim());
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of usable.slice(-limit)) {
    const last = out[out.length - 1];
    // Providers expect alternating roles; merge consecutive same-role turns.
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ role: m.role, content: m.content.slice(0, 12_000) });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export function mergeBoardIndex(index: BoardItem[], added: RegisteredItem[], cleared: boolean): BoardItem[] {
  const base = cleared ? [] : index;
  const map = new Map(base.map((b) => [b.id, b]));
  for (const r of added) map.set(r.id, { id: r.id, kind: r.kind, summary: r.summary.slice(0, 100) });
  return [...map.values()].slice(-120);
}

export const MODE_LABEL: Record<TutorMode, string> = {
  explain: "Explain",
  hint: "Hints only",
  simpler: "Simpler",
  socratic: "Ask me questions",
};

export const STARTER_PROMPTS = [
  "Explain the Pythagorean theorem.",
  "Teach me how to solve 3x − 7 = 11.",
  "Draw a diagram explaining photosynthesis.",
  "Graph y = x² − 4 and show where it crosses the x-axis.",
  "What caused World War I? Show me a timeline.",
  "Don't tell me the answer yet — help me factor x² + 5x + 6.",
];
