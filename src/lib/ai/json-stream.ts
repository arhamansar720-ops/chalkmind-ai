/**
 * Incrementally pulls complete top-level JSON objects out of a model's text
 * stream. Tolerates NDJSON, pretty-printed objects spanning lines, markdown
 * code fences and stray prose between objects (collected as `stray`).
 */
export class JsonObjectStream {
  private buf = "";
  private depth = 0;
  private inString = false;
  private escape = false;
  private start = -1;
  private scanned = 0;
  private strayText = "";

  push(chunk: string): unknown[] {
    this.buf += chunk;
    const out: unknown[] = [];
    for (let i = this.scanned; i < this.buf.length; i++) {
      const ch = this.buf[i];
      if (this.depth === 0) {
        if (ch === "{") {
          this.start = i;
          this.depth = 1;
          this.inString = false;
          this.escape = false;
        } else {
          this.strayText += ch;
        }
        continue;
      }
      if (this.inString) {
        if (this.escape) this.escape = false;
        else if (ch === "\\") this.escape = true;
        else if (ch === '"') this.inString = false;
        continue;
      }
      if (ch === '"') this.inString = true;
      else if (ch === "{") this.depth++;
      else if (ch === "}") {
        this.depth--;
        if (this.depth === 0) {
          const text = this.buf.slice(this.start, i + 1);
          try {
            out.push(JSON.parse(text));
          } catch {
            this.strayText += text;
          }
          this.start = -1;
        }
      }
    }
    // Drop consumed text to keep the buffer small.
    if (this.depth === 0) {
      this.buf = "";
      this.scanned = 0;
    } else {
      this.buf = this.buf.slice(this.start);
      this.start = 0;
      this.scanned = this.buf.length;
    }
    return out;
  }

  /** Text outside any JSON object, minus code-fence markers and whitespace. */
  get stray(): string {
    return this.strayText.replace(/```[a-z]*\s*/gi, "").trim();
  }

  /** An object that never closed (e.g. the model hit its token limit). */
  get unterminated(): boolean {
    return this.depth > 0;
  }
}

/** Parse the first JSON object in a complete model response. */
export function extractJsonObject(text: string): unknown | null {
  const stream = new JsonObjectStream();
  const objects = stream.push(text);
  return objects[0] ?? null;
}
