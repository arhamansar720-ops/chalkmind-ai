import { describe, expect, it } from "vitest";
import { cleanFact, findDuplicate, isSensitive, needsSummary, overflow, selectFacts, selectLessons } from "@/lib/learning/memory";
import type { MemoryFact, TutorSession } from "@/lib/store/types";

const fact = (id: string, text: string, kind: MemoryFact["kind"] = "about", updatedAt = 1): MemoryFact => ({ id, title: text, fact: text, kind, source: "tutor", createdAt: 1, updatedAt });
const DAY = 86_400_000;

describe("memory", () => {
  it("never keeps contact details, credentials or health information", () => {
    for (const s of ["My email is ada@school.edu", "call me on +1 (415) 555-0134", "my password is hunter2", "I live at 12 Oak Street", "I was diagnosed with ADHD", "see https://x.y"]) {
      expect(isSensitive(s)).toBe(true);
      expect(cleanFact(s)).toBeNull();
    }
    expect(cleanFact("  - Is in 9th grade  ")).toBe("Is in 9th grade.");
    expect(cleanFact("hi")).toBeNull();
  });

  it("spots near-duplicate facts and trims the oldest beyond the cap", () => {
    const facts = [fact("1", "Is preparing for the AP Chemistry exam in May.")];
    expect(findDuplicate(facts, "Preparing for the AP Chemistry exam in May")).toBeDefined();
    expect(findDuplicate(facts, "Likes visual explanations with diagrams")).toBeUndefined();
    const many = Array.from({ length: 63 }, (_, i) => fact(String(i), `fact number ${i}`, "about", i));
    expect(overflow(many).map((f) => f.id)).toEqual(["0", "1", "2"]);
  });

  it("sends the most relevant and basic facts first", () => {
    const now = 100 * DAY;
    const facts = [
      fact("grade", "Is in 9th grade.", "about", now),
      fact("chem", "Finds balancing chemical equations confusing.", "struggle", now - 60 * DAY),
      fact("guitar", "Plays guitar on weekends.", "goal", now - 60 * DAY),
    ];
    const picked = selectFacts(facts, "How do I balance this chemical equation?", 2, now).map((f) => f.id);
    expect(picked).toEqual(["chem", "grade"]);
  });

  it("recalls relevant earlier lessons, never the current one", () => {
    const now = 30 * DAY;
    const session = (id: string, title: string, text: string, updatedAt: number) =>
      ({ id, title, createdAt: 0, updatedAt, mode: "explain", messages: [], board: null, boardIndex: [], docIds: [], autoId: 0, summary: { text, messageCount: 4, at: updatedAt } }) as TutorSession;
    const sessions = [
      session("cur", "Linear equations", "Solved 2x+3=11.", now),
      session("a", "Photosynthesis", "Learned light reactions; confused about ATP.", now - 2 * DAY),
      session("b", "Linear equations II", "Struggled with moving terms across the equals sign.", now - 9 * DAY),
    ];
    const recall = selectLessons(sessions, "cur", "Help me solve this linear equation", 1, now);
    expect(recall).toEqual([{ title: "Linear equations II", summary: expect.stringContaining("equals sign"), when: "last week" }]);
  });

  it("summarises only real lessons that changed since the last summary", () => {
    const msg = (role: "user" | "assistant", content: string) => ({ id: content, role, content, createdAt: 0 });
    const base = { id: "s", title: "t", createdAt: 0, updatedAt: 0, mode: "explain" as const, board: null, boardIndex: [], docIds: [], autoId: 0 };
    const two = [msg("user", "q"), msg("assistant", "a"), msg("user", "q2"), msg("assistant", "a2")];
    expect(needsSummary({ ...base, messages: two.slice(0, 2) } as TutorSession)).toBe(false);
    expect(needsSummary({ ...base, messages: two } as TutorSession)).toBe(true);
    expect(needsSummary({ ...base, messages: two, summary: { text: "x", messageCount: 4, at: 0 } } as TutorSession)).toBe(false);
  });
});
