/** Minimal server-sent-events reader: yields each `data:` payload (and the event name, if any). */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string | null; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | null = null;
  let data: string[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line === "") {
          if (data.length) yield { event, data: data.join("\n") };
          event = null;
          data = [];
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        } else if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        }
      }
    }
    if (data.length) yield { event, data: data.join("\n") };
  } finally {
    reader.releaseLock();
  }
}

/**
 * Strips <think>…</think> spans that some local reasoning models (Qwen3,
 * DeepSeek-R1) put inline in their content. Works across chunk boundaries.
 */
export class ThinkFilter {
  private inThink = false;
  private pending = "";

  push(chunk: string): { text: string; thinking: boolean } {
    let s = this.pending + chunk;
    this.pending = "";
    let out = "";
    let thinking = false;
    while (s.length) {
      if (this.inThink) {
        const end = s.indexOf("</think>");
        thinking = true;
        if (end < 0) {
          this.pending = s.slice(-7);
          return { text: out, thinking };
        }
        s = s.slice(end + 8);
        this.inThink = false;
      } else {
        const start = s.indexOf("<think>");
        if (start < 0) {
          // keep a possible partial "<think" tag for the next chunk
          const lt = s.lastIndexOf("<");
          if (lt >= 0 && s.length - lt < 7 && "<think>".startsWith(s.slice(lt))) {
            out += s.slice(0, lt);
            this.pending = s.slice(lt);
          } else {
            out += s;
          }
          return { text: out, thinking };
        }
        out += s.slice(0, start);
        s = s.slice(start + 7);
        this.inThink = true;
      }
    }
    return { text: out, thinking };
  }
}
