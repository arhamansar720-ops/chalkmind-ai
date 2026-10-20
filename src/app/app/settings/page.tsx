import type { Metadata } from "next";
import { Suspense } from "react";
import { Settings } from "@/components/settings/Settings";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <Settings />
    </Suspense>
  );
}
