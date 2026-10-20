"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Alert, Button, Field, Input, Segmented } from "@/components/ui";
import { authApi, type AuthInfo } from "@/lib/client/auth";

/** Only same-site paths, so ?next= can't bounce people to another site. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/app/tutor";
}

export function SignInForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);

  useEffect(() => {
    authApi
      .me()
      .then((me) => {
        if (me.user) location.replace(next);
        else setInfo(me);
      })
      .catch(() => setInfo({ user: null, accounts: false, required: false, inviteRequired: false }));
  }, [next]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") await authApi.signIn(email.trim(), password);
      else await authApi.signUp({ email: email.trim(), password, name: name.trim() || undefined, code: code.trim() || undefined });
      location.replace(next);
    } catch (err) {
      const e2 = err as { message?: string; hint?: string };
      setError({ message: e2.message ?? "Something went wrong.", hint: e2.hint });
      setBusy(false);
    }
  };

  return (
    <div className="bg-dotgrid flex min-h-dvh flex-col bg-bg text-ink">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Chalkmind home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-16">
        <div className="w-full max-w-[400px] rounded-[24px] border border-border bg-surface p-6 shadow-md sm:p-8">
          <h1 className="text-[26px] font-semibold tracking-[-0.03em]">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            {mode === "signin" ? "Sign in to pick up your lessons on any device." : "Your chats, whiteboards and what the tutor learns about you stay in your account."}
          </p>

          {info && !info.accounts ? (
            <div className="mt-6">
              <Alert tone="warning" title="Accounts aren't set up here">
                This deployment has no database configured, so there&apos;s nothing to sign in to.
              </Alert>
              <Link href="/app/tutor" className="mt-4 inline-block text-[14px] font-medium text-accent hover:underline">
                Continue without an account →
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6">
                <Segmented
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setError(null);
                  }}
                  options={[
                    { value: "signin", label: "Sign in" },
                    { value: "signup", label: "Create account" },
                  ]}
                  label="Account"
                />
              </div>
              <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate={false}>
                {mode === "signup" && (
                  <Field label="Name (optional)" htmlFor="au-name">
                    <Input id="au-name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="What should the tutor call you?" />
                  </Field>
                )}
                <Field label="Email" htmlFor="au-email">
                  <Input id="au-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
                </Field>
                <Field label="Password" htmlFor="au-pw" hint={mode === "signup" ? "At least 8 characters." : undefined}>
                  <Input
                    id="au-pw"
                    type="password"
                    required
                    minLength={mode === "signup" ? 8 : 1}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                {mode === "signup" && info?.inviteRequired && (
                  <Field label="Invite code" htmlFor="au-code" hint="Chalkmind is invite-only for now.">
                    <Input id="au-code" required autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
                  </Field>
                )}
                {error && (
                  <Alert tone="danger">
                    {error.message}
                    {error.hint ? ` ${error.hint}` : ""}
                  </Alert>
                )}
                <Button type="submit" variant="primary" disabled={busy || !info} className="h-11">
                  {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
                </Button>
              </form>
              {mode === "signin" && (
                <p className="mt-4 text-[12.5px] text-muted">Forgot your password? Ask whoever runs this Chalkmind to reset it.</p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
