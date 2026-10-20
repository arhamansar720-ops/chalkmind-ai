import type { Metadata } from "next";
import { Suspense } from "react";
import { Progress } from "@/components/progress/Progress";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <Progress />
    </Suspense>
  );
}
