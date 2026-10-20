export interface PageText {
  page: number;
  text: string;
}

export interface Chunk {
  id: string;
  page?: number;
  text: string;
}

const TARGET = 900;
const OVERLAP = 150;

/** Normalise extracted PDF text: join hyphenated line breaks, collapse whitespace. */
export function cleanText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split each page into ~900-character chunks on paragraph/sentence
 * boundaries, with a little overlap so an idea split across chunks is still
 * findable. Chunks never cross pages, so citations stay accurate.
 */
export function chunkPages(pages: PageText[], docId = "doc"): Chunk[] {
  const out: Chunk[] = [];
  for (const { page, text } of pages) {
    const clean = cleanText(text);
    if (!clean) continue;
    const pieces = clean.split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z0-9])/).map((p) => p.trim()).filter(Boolean);
    let current = "";
    const flush = () => {
      if (current.trim()) out.push({ id: `${docId}:${out.length}`, page, text: current.trim() });
    };
    for (const piece of pieces) {
      if (piece.length > TARGET * 1.5) {
        // A very long run without sentence breaks: hard-split it.
        flush();
        current = "";
        for (let i = 0; i < piece.length; i += TARGET - OVERLAP) {
          out.push({ id: `${docId}:${out.length}`, page, text: piece.slice(i, i + TARGET) });
        }
        continue;
      }
      if (current && current.length + piece.length + 1 > TARGET) {
        flush();
        current = current.slice(-OVERLAP).replace(/^\S*\s/, "") + " " + piece;
      } else {
        current = current ? `${current} ${piece}` : piece;
      }
    }
    flush();
  }
  return out;
}
