import { describe, expect, it } from "vitest";
import { COLUMN_MAX_HEIGHT, COLUMN_PITCH, nudgeRight, resolvePlacement } from "@/lib/board/layout";
import { revealPoints } from "@/lib/tutor/pace";
import { htmlToStructuredText, slideText, splitSections } from "@/lib/docs/office";

const cursor = { x0: 0, bottom: 0, last: null, top: 0 };

describe("resolvePlacement", () => {
  it("leaves a block alone when nothing is in the way", () => {
    expect(resolvePlacement({ x: 0, y: 100, width: 300, height: 40 }, [], cursor)).toEqual({ dx: 0, dy: 0, x0: 0 });
  });

  it("pushes a block below anything it would overlap (measured, not estimated)", () => {
    const obstacles = [
      { x: 0, y: 90, width: 500, height: 60 },
      { x: 400, y: 160, width: 200, height: 50 },
    ];
    const p = resolvePlacement({ x: 0, y: 100, width: 450, height: 40 }, obstacles, cursor);
    expect(p.dx).toBe(0);
    const top = 100 + p.dy;
    for (const o of obstacles) expect(top >= o.y + o.height || top + 40 <= o.y).toBe(true);
  });

  it("wraps to a new column at the top when the column is full", () => {
    const p = resolvePlacement({ x: 0, y: COLUMN_MAX_HEIGHT - 50, width: 400, height: 200 }, [], cursor);
    expect(p.x0).toBe(COLUMN_PITCH);
    expect(p.dx).toBe(COLUMN_PITCH);
    expect(COLUMN_MAX_HEIGHT - 50 + p.dy).toBe(0);
  });

  it("keeps right-placed blocks' offset when wrapping", () => {
    const p = resolvePlacement({ x: 600, y: COLUMN_MAX_HEIGHT - 10, width: 300, height: 100 }, [], cursor);
    expect(600 + p.dx).toBe(COLUMN_PITCH + 600);
  });

  it("doesn't wrap a block that already starts at the column top", () => {
    const p = resolvePlacement({ x: 0, y: 0, width: 400, height: COLUMN_MAX_HEIGHT + 300 }, [], cursor);
    expect(p).toEqual({ dx: 0, dy: 0, x0: 0 });
  });

  it("nudges side notes right past other notes", () => {
    const dx = nudgeRight({ x: 300, y: 10, width: 120, height: 20 }, [{ x: 280, y: 5, width: 200, height: 30 }]);
    expect(300 + dx).toBeGreaterThanOrEqual(480);
  });
});

describe("lesson pacing", () => {
  it("reveals word by word and keeps math whole", () => {
    const text = "Add $7$ to both sides. Then divide.";
    const pts = revealPoints(text);
    const shown = pts.map((p) => text.slice(0, p.chars));
    expect(shown).toContain("Add $7$");
    expect(shown.some((s) => s.endsWith("$7"))).toBe(false);
    expect(pts.at(-1)!.chars).toBe(text.length);
    // sentence ends pause longer than plain words
    const sides = pts.find((p) => text.slice(0, p.chars).endsWith("sides."))!;
    const to = pts.find((p) => text.slice(0, p.chars).endsWith(" to"))!;
    expect(sides.delay).toBeGreaterThan(to.delay);
  });
  it("relaxed is slower than quick", () => {
    expect(revealPoints("one two three", "relaxed")[0].delay).toBeGreaterThan(revealPoints("one two three", "quick")[0].delay);
  });
});

describe("office structure", () => {
  it("keeps headings, lists and tables from Word documents", () => {
    const html =
      "<h1>Chapter 3</h1><p>Intro &amp; overview.</p><ul><li>First</li><li>Second</li></ul><h2>Practice</h2><table><tr><td><p>Problem</p></td><td><p>Answer</p></td></tr><tr><td><p>2x+4=10</p></td><td><p>x=3</p></td></tr></table>";
    const text = htmlToStructuredText(html);
    expect(text).toContain("# Chapter 3");
    expect(text).toContain("Intro & overview.");
    expect(text).toContain("- First");
    expect(text).toContain("| 2x+4=10 | x=3 |");
    const sections = splitSections(text);
    expect(sections.map((s) => s.text.split("\n")[0])).toEqual(["# Chapter 3", "## Practice"]);
  });

  it("puts a slide's title first and keeps table rows together", () => {
    const xml = `<p:sld><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Point one</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Inputs &amp; outputs</a:t></a:r></a:p></p:txBody></p:sp>
      <p:graphicFrame><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>In</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Out</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></p:graphicFrame></p:sld>`;
    expect(slideText(xml)).toBe("# Inputs & outputs\nPoint one\n| In | Out |");
  });
});
