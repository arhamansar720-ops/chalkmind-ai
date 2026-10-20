import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { assertZipBudget, decodeXml, extractDocx, extractPptx, officeKind, OfficeError } from "@/lib/docs/office";

const slide = (...paras: string[]) =>
  `<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${paras.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:spTree></p:cSld></p:sld>`;

function pptx() {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "ppt/presentation.xml": strToU8("<p:presentation/>"),
    "ppt/slides/slide1.xml": strToU8(slide("Photosynthesis", "Light &amp; water → sugar")),
    "ppt/slides/slide2.xml": strToU8(slide("Chlorophyll absorbs red &#x26; blue light")),
    "ppt/slides/slide10.xml": strToU8(slide("Summary")),
    "ppt/notesSlides/notesSlide2.xml": strToU8(slide("Mention the green reflection", "2")),
  });
}

function docx(body: string) {
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
  });
}

describe("office extraction", () => {
  it("detects the format from the archive contents", () => {
    expect(officeKind(pptx())).toBe("pptx");
    expect(officeKind(docx("<w:p/>"))).toBe("docx");
    expect(officeKind(strToU8("%PDF-1.7"))).toBeNull();
  });

  it("reads slides in numeric order with speaker notes", () => {
    const pages = extractPptx(pptx());
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(pages[0].text).toBe("Photosynthesis\nLight & water → sugar");
    expect(pages[1].text).toContain("Chlorophyll absorbs red & blue light");
    expect(pages[1].text).toContain("Speaker notes: Mention the green reflection");
    expect(pages[1].text).not.toMatch(/\n2$/);
    expect(pages[2].text).toBe("Summary");
  });

  it("reads Word documents", async () => {
    const pages = await extractDocx(docx('<w:p><w:r><w:t>Newton\'s first law</w:t></w:r></w:p><w:p><w:r><w:t>Objects keep moving.</w:t></w:r></w:p>'));
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toContain("Newton's first law");
    expect(pages[0].text).toContain("Objects keep moving.");
  });

  it("refuses archives that would decompress past the budget", () => {
    const bomb = zipSync({ "ppt/presentation.xml": new Uint8Array(2 * 1024 * 1024) }, { level: 9 });
    expect(bomb.length).toBeLessThan(64 * 1024);
    expect(() => assertZipBudget(bomb, 1024 * 1024)).toThrow(OfficeError);
    expect(() => assertZipBudget(bomb, 4 * 1024 * 1024)).not.toThrow();
  });

  it("decodes XML entities safely", () => {
    expect(decodeXml("a &lt;b&gt; &amp; &#233; &#x1F600; &bogus;")).toBe("a <b> & é 😀 &bogus;");
  });
});
