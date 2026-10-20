import type { Metadata } from "next";
import { Suspense } from "react";
import { TutorWorkspace } from "@/components/tutor/TutorWorkspace";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "AI Tutor" };

export default function TutorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner label="Loading tutor" />
        </div>
      }
    >
      <TutorWorkspace />
    </Suspense>
  );
}
