"use client";

import { FileText, X } from "lucide-react";
import { useCollection } from "@/lib/store";
import { useHealth } from "@/lib/client/health";
import { DocumentUpload } from "@/components/docs/DocumentUpload";
import { IconButton } from "@/components/ui";

/** Choose which uploaded documents the tutor should ground its answers in. */
export function SourcesPanel({ selected, onChange, onClose }: { selected: string[]; onChange: (ids: string[]) => void; onClose: () => void }) {
  const { items: docs, loading } = useCollection("documents");
  const { data: health } = useHealth();
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((d) => d !== id) : [...selected, id]);

  return (
    <div className="border-t border-border bg-surface px-4 py-3" role="region" aria-label="Document sources">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold">Sources</p>
          <p className="text-[11.5px] text-muted">
            The tutor answers from these first and cites pages.{" "}
            {health?.embeddings.configured ? "Search: keyword + embeddings." : "Search: keyword (no embedding model configured)."}
          </p>
        </div>
        <IconButton label="Close sources" size="sm" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="max-h-44 overflow-y-auto">
        {loading ? null : docs.length === 0 ? (
          <p className="py-2 text-[12.5px] text-muted">No documents yet. Upload a PDF, .txt or .md file (up to 15 MB).</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {docs.map((d) => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} className="size-4 accent-[var(--accent)]" />
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{d.title}</span>
                  <span className="shrink-0 text-[11px] text-muted">{d.mime === "application/pdf" ? `${d.pageCount} pp` : "text"}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-2">
        <DocumentUpload size="sm" label="Upload a document" onUploaded={(doc) => onChange([...selected, doc.id])} />
      </div>
    </div>
  );
}
