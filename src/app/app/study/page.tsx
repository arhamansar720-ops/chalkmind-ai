import type { Metadata } from "next";
import { Suspense } from "react";
import { StudyMaterials } from "@/components/study/StudyMaterials";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Study Materials" };

export default function StudyPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <StudyMaterials />
    </Suspense>
  );
}
