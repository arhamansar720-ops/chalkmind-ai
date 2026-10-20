import { jsonError } from "@/lib/server/http";
import { aiLimiter } from "@/lib/server/rate-limit";
import { verifyRequestUser } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http-error";
import { extractDocx, extractPptx, officeKind, OfficeError } from "@/lib/docs/office";

export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 400;
const MAX_CHARS = 1_500_000;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/x-markdown"]);

/**
 * POST /api/documents/extract — multipart upload (field "file") → per-page
 * text. Supports PDF, Word (.docx), PowerPoint (.pptx), .txt and .md. The file is processed in memory and not
 * stored on the server; the browser keeps the extracted text.
 */
export async function POST(req: Request) {
  try {
    await verifyRequestUser(req);
    const rl = aiLimiter.check(`extract:${req.headers.get("x-forwarded-for") ?? "local"}`);
    if (!rl.ok) return jsonError(429, "rate_limited", `Too many uploads. Try again in ${rl.retryAfterSec}s.`);

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES + 64 * 1024) return jsonError(413, "too_large", "Files must be 15 MB or smaller.");

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonError(400, "bad_request", "Upload a file using the form field \"file\".");
    }
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "bad_request", "No file was uploaded.");
    if (file.size === 0) return jsonError(422, "empty_file", "That file is empty.");
    if (file.size > MAX_BYTES) return jsonError(413, "too_large", "Files must be 15 MB or smaller.");

    const name = file.name.slice(0, 120) || "document";
    const lower = name.toLowerCase();
    const buf = new Uint8Array(await file.arrayBuffer());
    const isPdf = buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
    const isText = TEXT_TYPES.has(file.type) || lower.endsWith(".txt") || lower.endsWith(".md");

    if (isPdf) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      let pages: string[];
      let totalPages: number;
      try {
        const pdf = await getDocumentProxy(buf);
        if (pdf.numPages > MAX_PAGES) return jsonError(413, "too_large", `PDFs are limited to ${MAX_PAGES} pages.`);
        const res = await extractText(pdf, { mergePages: false });
        pages = res.text as unknown as string[];
        totalPages = res.totalPages;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (/password/i.test(msg)) return jsonError(422, "encrypted", "This PDF is password-protected. Remove the password and try again.");
        return jsonError(422, "corrupt", "This PDF couldn't be read. It may be damaged.");
      }
      const out = pages.map((text, i) => ({ page: i + 1, text: text.slice(0, MAX_CHARS) }));
      const chars = out.reduce((s, p) => s + p.text.trim().length, 0);
      if (chars < 20) {
        return jsonError(
          422,
          "no_text",
          "No selectable text found — this looks like a scanned PDF. Try a text-based PDF, or photograph a page and use the Homework Solver's image upload.",
        );
      }
      return Response.json({ name, mime: "application/pdf", size: file.size, pageCount: totalPages, pages: out });
    }

    const office = officeKind(buf);
    if (office) {
      try {
        const pages = office === "pptx" ? extractPptx(buf) : await extractDocx(buf);
        const out = pages.map((p) => ({ page: p.page, text: p.text.slice(0, MAX_CHARS) }));
        const mime = office === "pptx" ? PPTX_MIME : DOCX_MIME;
        return Response.json({ name, mime, size: file.size, pageCount: out.length, pages: out });
      } catch (err) {
        if (err instanceof OfficeError) return jsonError(err.code === "too_large" ? 413 : 422, err.code, err.message);
        throw err;
      }
    }
    if (lower.endsWith(".doc") || lower.endsWith(".ppt")) {
      return jsonError(415, "unsupported_type", "Old .doc/.ppt files aren't supported. Save it as .docx or .pptx (or PDF) and try again.");
    }

    if (isText) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buf).slice(0, MAX_CHARS);
      if (!text.trim()) return jsonError(422, "empty_file", "That file has no text.");
      if (/\u0000/.test(text.slice(0, 2000))) return jsonError(415, "unsupported_type", "That doesn't look like a text file.");
      return Response.json({ name, mime: "text/plain", size: file.size, pageCount: 1, pages: [{ page: 1, text }] });
    }

    return jsonError(415, "unsupported_type", "Unsupported file type. Upload a PDF, Word (.docx), PowerPoint (.pptx), .txt or .md file.");
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.code, err.message);
    console.warn("[chalkmind] document extraction failed");
    return jsonError(500, "unknown", "Something went wrong reading that file.");
  }
}
