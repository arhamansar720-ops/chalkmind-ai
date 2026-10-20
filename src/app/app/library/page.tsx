import type { Metadata } from "next";
import { Suspense } from "react";
import { Library } from "@/components/library/Library";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "My Library" };

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <Library />
    </Suspense>
  );
}
