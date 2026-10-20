"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { ApiError } from "@/lib/client/api";
import { ACCEPTED_DOCS, ingestDocument, type IngestProgress } from "@/lib/client/documents";
import { useHealth } from "@/lib/client/health";
import type { DocumentRecord } from "@/lib/store/types";
import { Button } from "@/components/ui";

const STAGE: Record<IngestProgress["stage"], string> = {
  uploading: "Reading file…",
  chunking: "Splitting into sections…",
  embedding: "Indexing for search…",
  saving: "Saving…",
};

export function DocumentUpload({
  onUploaded,
  variant = "secondary",
  label = "Upload document",
  size = "md",
}: {
  onUploaded?: (doc: DocumentRecord) => void;
  variant?: "secondary" | "primary" | "ghost";
  label?: string;
  size?: "sm" | "md";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: health } = useHealth();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const doc = await ingestDocument(file, { embeddings: Boolean(health?.embeddings.configured), onProgress: setProgress });
      onUploaded?.(doc);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That file couldn't be processed.");
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <input ref={input} type="file" accept={ACCEPTED_DOCS} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <Button variant={variant} size={size} loading={Boolean(progress)} icon={<FileUp className="size-4" />} onClick={() => input.current?.click()}>
        {progress ? STAGE[progress.stage] : label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
