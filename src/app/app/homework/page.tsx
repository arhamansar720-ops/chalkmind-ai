import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeworkSolver } from "@/components/homework/HomeworkSolver";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Homework Solver" };

export default function HomeworkPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <HomeworkSolver />
    </Suspense>
  );
}
