"use client";

import { chunkPages, type PageText } from "../docs/chunk";
import { searchChunks } from "../docs/search";
import { newId, store } from "../store";
import type { DocumentRecord } from "../store/types";
import { ApiError, postForm, postJSON } from "./api";

export const ACCEPTED_DOCS = ".pdf,.txt,.md,application/pdf,text/plain,text/markdown";
export const MAX_DOC_BYTES = 15 * 1024 * 1024;

export interface IngestProgress {
  stage: "uploading" | "chunking" | "embedding" | "saving";
  done?: number;
  total?: number;
}

/**
 * Upload → server extracts text (not stored there) → chunk in the browser →
 * embed if an embeddings provider is configured → save locally.
 */
export async function ingestDocument(file: File, opts: { embeddings: boolean; onProgress?: (p: IngestProgress) => void }): Promise<DocumentRecord> {
  if (file.size > MAX_DOC_BYTES) throw new ApiError("too_large", "Files must be 15 MB or smaller.");
  const lower = file.name.toLowerCase();
  if (!/\.(pdf|txt|md)$/.test(lower) && !["application/pdf", "text/plain", "text/markdown"].includes(file.type)) {
    throw new ApiError("unsupported_type", "Upload a PDF, .txt or .md file.");
  }
  opts.onProgress?.({ stage: "uploading" });
  const form = new FormData();
  form.append("file", file);
  const extracted = await postForm<{ name: string; mime: string; size: number; pageCount: number; pages: PageText[] }>("/api/documents/extract", form);

  opts.onProgress?.({ stage: "chunking" });
  const id = newId("doc");
  const chunks: DocumentRecord["chunks"] = chunkPages(extracted.pages, id).map((c) => ({ ...c, page: extracted.mime === "application/pdf" ? c.page : undefined }));
  if (chunks.length === 0) throw new ApiError("no_text", "No readable text was found in that file.");

  let embeddingModel: string | undefined;
  if (opts.embeddings) {
    try {
      const batch = 48;
      for (let i = 0; i < chunks.length; i += batch) {
        opts.onProgress?.({ stage: "embedding", done: i, total: chunks.length });
        const slice = chunks.slice(i, i + batch);
        const res = await postJSON<{ vectors: number[][]; model: string }>("/api/embed", { texts: slice.map((c) => c.text.slice(0, 2400)) });
        slice.forEach((c, j) => (c.embedding = res.vectors[j]));
        embeddingModel = res.model;
      }
    } catch {
      // Embeddings are an optional upgrade; keyword search still works.
      chunks.forEach((c) => delete c.embedding);
      embeddingModel = undefined;
    }
  }

  opts.onProgress?.({ stage: "saving" });
  const now = Date.now();
  const doc: DocumentRecord = {
    id,
    title: extracted.name.replace(/\.(pdf|txt|md)$/i, ""),
    name: extracted.name,
    size: extracted.size,
    mime: extracted.mime,
    pageCount: extracted.pageCount,
    charCount: chunks.reduce((s, c) => s + c.text.length, 0),
    chunks,
    embeddingModel,
    createdAt: now,
    updatedAt: now,
  };
  await store.put("documents", doc);
  return doc;
}

export interface Excerpt {
  source: string;
  page?: number;
  text: string;
}

/** Find the passages most relevant to `query` across the given documents. */
export async function retrieveExcerpts(docIds: string[], query: string, k = 4): Promise<{ excerpts: Excerpt[]; method: "keyword" | "hybrid" | null }> {
  const docs = (await Promise.all(docIds.map((id) => store.get("documents", id)))).filter((d): d is DocumentRecord => Boolean(d));
  if (docs.length === 0) return { excerpts: [], method: null };
  const all = docs.flatMap((d) => d.chunks.map((c) => ({ ...c, docName: d.title })));
  let queryEmbedding: number[] | null = null;
  if (all.some((c) => c.embedding?.length)) {
    try {
      queryEmbedding = (await postJSON<{ vectors: number[][] }>("/api/embed", { texts: [query.slice(0, 2400)] })).vectors[0] ?? null;
    } catch {
      queryEmbedding = null;
    }
  }
  const hits = searchChunks(query, all, k, queryEmbedding);
  return {
    excerpts: hits.map((h) => ({ source: h.chunk.docName, page: h.chunk.page, text: h.chunk.text.slice(0, 1800) })),
    method: hits[0]?.method ?? "keyword",
  };
}

/** Plain text of a document, trimmed to fit a prompt. */
export function documentText(doc: DocumentRecord, maxChars = 30_000): string {
  let out = "";
  let page: number | undefined;
  for (const c of doc.chunks) {
    if (c.page !== page && c.page) out += `\n\n[Page ${c.page}]\n`;
    page = c.page;
    out += c.text + " ";
    if (out.length > maxChars) break;
  }
  return out.slice(0, maxChars).trim();
}
