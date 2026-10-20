import { unzipSync } from "fflate";
import type { PageText } from "./chunk";

// Text extraction for Office files (DOCX, PPTX). Both are ZIP archives of XML.
// Nothing is executed: we only read text nodes, and the archive is checked
// against a decompressed-size budget first so a zip bomb can't exhaust memory.

export const MAX_UNZIPPED_BYTES = 120 * 1024 * 1024;
const MAX_ENTRIES = 4000;

export class OfficeError extends Error {
  constructor(
    readonly code: "corrupt" | "too_large" | "no_text",
    message: string,
  ) {
    super(message);
  }
}

export function isZip(buf: Uint8Array): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04; // PK\x03\x04
}

/** Which Office format a ZIP is, judged by the parts inside it (not the file name). */
export function officeKind(buf: Uint8Array): "docx" | "pptx" | null {
  if (!isZip(buf)) return null;
  let kind: "docx" | "pptx" | null = null;
  try {
    unzipSync(buf, {
      filter(f) {
        if (f.name === "word/document.xml") kind = "docx";
        else if (f.name === "ppt/presentation.xml") kind = "pptx";
        return false;
      },
    });
  } catch {
    return null;
  }
  return kind;
}

/** Throws if the archive would decompress past the budget. */
export function assertZipBudget(buf: Uint8Array, maxBytes = MAX_UNZIPPED_BYTES): void {
  let total = 0;
  let entries = 0;
  try {
    unzipSync(buf, {
      filter(f) {
        total += f.originalSize;
        entries++;
        return false;
      },
    });
  } catch {
    throw new OfficeError("corrupt", "This file couldn't be read. It may be damaged.");
  }
  if (entries > MAX_ENTRIES || total > maxBytes) throw new OfficeError("too_large", "This file is too large to read.");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? _;
    const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  });
}

/** Paragraph text from DrawingML (<a:p> containing <a:t> runs). */
export function drawingText(xml: string): string {
  const paras = xml.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) ?? [];
  return paras
    .map((p) => (p.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) ?? []).map((t) => decodeXml(t.replace(/<[^>]+>/g, ""))).join(""))
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n");
}

/** One page per slide: slide text, then speaker notes. */
export function extractPptx(buf: Uint8Array): PageText[] {
  assertZipBudget(buf);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf, { filter: (f) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(f.name) });
  } catch {
    throw new OfficeError("corrupt", "This presentation couldn't be read. It may be damaged.");
  }
  const dec = new TextDecoder();
  const slideNums = Object.keys(files)
    .map((n) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(n)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number)
    .sort((a, b) => a - b);
  // Notes are linked by number in the common case (notesSlideN ↔ slideN).
  const pages = slideNums.map((n, i) => {
    const body = drawingText(dec.decode(files[`ppt/slides/slide${n}.xml`]));
    const notesXml = files[`ppt/notesSlides/notesSlide${n}.xml`];
    // Notes slides repeat the slide number placeholder; drop bare numbers.
    const notes = notesXml
      ? drawingText(dec.decode(notesXml))
          .split("\n")
          .filter((l) => !/^\d+$/.test(l.trim()))
          .join("\n")
      : "";
    return { page: i + 1, text: [body, notes && `Speaker notes: ${notes}`].filter(Boolean).join("\n\n") };
  });
  if (!pages.some((p) => p.text.trim())) throw new OfficeError("no_text", "No text was found on these slides.");
  return pages;
}

/** DOCX → text (via mammoth), split into ~section-sized pages for search. */
export async function extractDocx(buf: Uint8Array): Promise<PageText[]> {
  assertZipBudget(buf);
  const mammoth = await import("mammoth");
  let text: string;
  try {
    ({ value: text } = await mammoth.extractRawText({ buffer: Buffer.from(buf) }));
  } catch {
    throw new OfficeError("corrupt", "This document couldn't be read. It may be damaged.");
  }
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 2) throw new OfficeError("no_text", "No text was found in this document.");
  return [{ page: 1, text }];
}
