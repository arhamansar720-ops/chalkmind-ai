export interface SearchableChunk {
  id: string;
  page?: number;
  text: string;
  embedding?: number[];
}

export interface SearchHit<T extends SearchableChunk = SearchableChunk> {
  chunk: T;
  score: number;
  method: "keyword" | "hybrid";
}

const STOP = new Set(
  "a an the and or but if then of to in on at by for with from as is are was were be been being it its this that these those what which who whom how why when where do does did can could should would will shall may might must i you he she we they me my your our their not no yes so than too very just about into over under again more most some such only own same also there here".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

/** Tiny suffix stripper so "equations" matches "equation". */
function stem(t: string): string {
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && t.endsWith("es") && !t.endsWith("ses")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

/** Okapi BM25 over the chunks. */
export function bm25<T extends SearchableChunk>(query: string, chunks: T[], k1 = 1.4, b = 0.75): { chunk: T; score: number }[] {
  const q = [...new Set(tokenize(query))];
  if (q.length === 0 || chunks.length === 0) return [];
  const docs = chunks.map((c) => tokenize(c.text));
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  return chunks
    .map((chunk, i) => {
      const d = docs[i];
      const tf = new Map<string, number>();
      for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const n = df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgLen)));
      }
      return { chunk, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Retrieve the most relevant chunks. Uses keyword BM25, blended with vector
 * similarity when both the chunks and the query have embeddings.
 */
export function searchChunks<T extends SearchableChunk>(query: string, chunks: T[], k = 4, queryEmbedding?: number[] | null): SearchHit<T>[] {
  const keyword = bm25(query, chunks);
  const useVectors = Boolean(queryEmbedding && chunks.some((c) => c.embedding?.length));
  if (!useVectors) return keyword.slice(0, k).map((r) => ({ ...r, method: "keyword" as const }));

  const maxKw = keyword[0]?.score || 1;
  const kw = new Map(keyword.map((r) => [r.chunk.id, r.score / maxKw]));
  return chunks
    .map((chunk) => {
      const vec = chunk.embedding ? Math.max(0, cosine(queryEmbedding!, chunk.embedding)) : 0;
      return { chunk, score: 0.4 * (kw.get(chunk.id) ?? 0) + 0.6 * vec, method: "hybrid" as const };
    })
    .filter((r) => r.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
