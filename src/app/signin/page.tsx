import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
