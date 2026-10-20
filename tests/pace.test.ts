import { describe, expect, it } from "vitest";
import { boardDelay, readingDelay } from "@/lib/tutor/pace";

describe("lesson pacing", () => {
  it("scales with length and stays within bounds", () => {
    expect(readingDelay("")).toBe(0);
    expect(readingDelay("Okay.")).toBe(1200);
    const mid = readingDelay("First subtract three from both sides so the variable term is alone on the left.");
    expect(mid).toBeGreaterThan(1200);
    expect(mid).toBeLessThan(7000);
    expect(readingDelay("word ".repeat(500))).toBe(7000);
  });

  it("orders paces relaxed > normal > quick", () => {
    const t = "Now divide both sides by two to solve for x.";
    expect(readingDelay(t, "relaxed")).toBeGreaterThan(readingDelay(t, "normal"));
    expect(readingDelay(t, "normal")).toBeGreaterThan(readingDelay(t, "quick"));
    expect(boardDelay("relaxed")).toBeGreaterThan(boardDelay("normal"));
    expect(boardDelay("normal")).toBeGreaterThan(boardDelay("quick"));
  });
});
