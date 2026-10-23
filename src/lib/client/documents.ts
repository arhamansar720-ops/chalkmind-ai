"use client";

import { chunkPages, type PageText } from "../docs/chunk";
import { searchChunks } from "../docs/search";
import { newId, store } from "../store";
import type { DocumentRecord } from "../store/types";
import { ApiError, postForm, postJSON } from "./api";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
/** What a document's numbered parts are called in citations. */
export function unitFor(mime: string): "slide" | "section" | undefined {
  return mime === PPTX_MIME ? "slide" : mime === DOCX_MIME ? "section" : undefined;
}

const DOC_TYPES = ["application/pdf", "text/plain", "text/markdown", DOCX_MIME, PPTX_MIME];
export const ACCEPTED_DOCS = [".pdf", ".docx", ".pptx", ".txt", ".md", ...DOC_TYPES].join(",");
export const ACCEPTED_IMAGES = "image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif";

/** Documents become searchable sources; images go to the vision model. */
export function attachmentKind(file: File): "document" | "image" | null {
  if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(file.name)) return "image";
  if (DOC_TYPES.includes(file.type) || /\.(pdf|docx|pptx|txt|md)$/i.test(file.name)) return "document";
  return null;
}
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
  if (/\.(doc|ppt)$/.test(lower)) throw new ApiError("unsupported_type", "Old .doc/.ppt files aren't supported. Save it as .docx or .pptx (or PDF).");
  if (attachmentKind(file) !== "document") throw new ApiError("unsupported_type", "Upload a PDF, Word (.docx), PowerPoint (.pptx), .txt or .md file.");
  opts.onProgress?.({ stage: "uploading" });
  const form = new FormData();
  form.append("file", file);
  const extracted = await postForm<{ name: string; mime: string; size: number; pageCount: number; pages: PageText[] }>("/api/documents/extract", form);

  opts.onProgress?.({ stage: "chunking" });
  const id = newId("doc");
  const chunks: DocumentRecord["chunks"] = chunkPages(extracted.pages, id).map((c) => ({ ...c, page: extracted.mime === "application/pdf" || extracted.mime === PPTX_MIME || extracted.mime === DOCX_MIME ? c.page : undefined }));
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
    title: extracted.name.replace(/\.(pdf|docx|pptx|txt|md)$/i, ""),
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
  /** Slides for presentations, sections for Word documents, pages otherwise. */
  unit?: "slide" | "section";
  text: string;
}

/** Find the passages most relevant to `query` across the given documents. */
export async function retrieveExcerpts(docIds: string[], query: string, k = 4): Promise<{ excerpts: Excerpt[]; method: "keyword" | "hybrid" | null }> {
  const docs = (await Promise.all(docIds.map((id) => store.get("documents", id)))).filter((d): d is DocumentRecord => Boolean(d));
  if (docs.length === 0) return { excerpts: [], method: null };
  const all = docs.flatMap((d) => d.chunks.map((c) => ({ ...c, docName: d.title, unit: unitFor(d.mime) })));
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
    excerpts: hits.map((h) => ({ source: h.chunk.docName, page: h.chunk.page, ...(h.chunk.unit ? { unit: h.chunk.unit } : {}), text: h.chunk.text.slice(0, 1800) })),
    method: hits[0]?.method ?? "keyword",
  };
}

/**
 * Documents attached to this very question ("teach me these slides") are
 * sent whole, in order, up to a character budget — not just a few search
 * hits. Chunks of the same slide/section are merged, and if the budget runs
 * out the tutor is told which parts were left out.
 */
export async function attachedExcerpts(docIds: string[], budget = 12_000, maxExcerpts = 12): Promise<Excerpt[]> {
  const docs = (await Promise.all(docIds.map((id) => store.get("documents", id)))).filter((d): d is DocumentRecord => Boolean(d));
  if (docs.length === 0) return [];
  const perDoc = Math.floor(budget / docs.length);
  const out: Excerpt[] = [];
  for (const d of docs) {
    const unit = unitFor(d.mime);
    // Merge chunks by page, dropping the overlap the chunker adds between neighbours.
    const parts: { page?: number; text: string }[] = [];
    for (const c of d.chunks) {
      const last = parts[parts.length - 1];
      if (last && last.page === c.page) {
        const overlap = longestOverlap(last.text, c.text);
        last.text += " " + c.text.slice(overlap);
      } else parts.push({ page: c.page, text: c.text });
    }
    let used = 0;
    let i = 0;
    const slots = Math.max(1, Math.floor(maxExcerpts / docs.length));
    // Pack several short slides/sections into one excerpt so long decks fit the excerpt limit.
    while (i < parts.length && used < perDoc && out.length < maxExcerpts) {
      const firstPage = parts[i].page;
      let text = "";
      const target = Math.min(1900, Math.max(400, Math.ceil((perDoc - used) / Math.max(1, slots))));
      while (i < parts.length && text.length < target) {
        const p = parts[i];
        const label = p.page && unit ? `[${unit === "slide" ? "Slide" : "Section"} ${p.page}] ` : "";
        text += (text ? "\n" : "") + label + p.text;
        i++;
      }
      text = text.slice(0, 1950);
      used += text.length;
      out.push({ source: d.title, page: firstPage, ...(unit ? { unit } : {}), text });
    }
    if (i < parts.length) {
      const from = parts[i].page;
      const to = parts[parts.length - 1].page;
      const range = from && to ? ` (${unit ?? "page"}s ${from}–${to})` : "";
      out.push({ source: d.title, text: `[The rest of this document${range} didn't fit. Teach what's above, and say the student can ask about the later part.]` });
    }
  }
  return out.slice(0, maxExcerpts + docs.length);
}

function longestOverlap(a: string, b: string): number {
  for (let n = Math.min(200, a.length, b.length); n > 20; n--) {
    if (a.endsWith(b.slice(0, n))) return n;
  }
  return 0;
}

/** Plain text of a document, trimmed to fit a prompt. */
export function documentText(doc: DocumentRecord, maxChars = 30_000): string {
  let out = "";
  let page: number | undefined;
  for (const c of doc.chunks) {
    if (c.page !== page && c.page) out += `\n\n[${doc.mime === PPTX_MIME ? "Slide" : doc.mime === DOCX_MIME ? "Section" : "Page"} ${c.page}]\n`;
    page = c.page;
    out += c.text + " ";
    if (out.length > maxChars) break;
  }
  return out.slice(0, maxChars).trim();
}
