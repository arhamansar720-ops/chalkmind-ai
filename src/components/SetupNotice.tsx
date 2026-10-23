"use client";

import { KeyRound, RefreshCw } from "lucide-react";
import type { PublicConfig } from "@/lib/ai/config";
import { formatCountdown, useCountdown } from "@/lib/client/countdown";
import { Alert, Button, Card } from "./ui";

/** Shown in place of AI features when no provider is configured. No fake answers. */
export function SetupNotice({ health, compact }: { health: PublicConfig | null; compact?: boolean }) {
  const reason = health && !health.ai.configured ? health.ai.reason : "The AI provider isn't configured.";
  const missing = health && !health.ai.configured ? health.ai.missing : [];
  if (compact) {
    return (
      <Alert tone="warning" title="AI isn't set up yet">
        {reason} Add {missing.join(", ") || "an API key"} to <code>.env.local</code> and restart. See Settings → AI for details.
      </Alert>
    );
  }
  return (
    <Card className="mx-auto max-w-xl p-6 sm:p-8">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-warning-soft text-warning">
        <KeyRound className="size-5" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">Connect an AI model to start tutoring</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {reason} Chalkmind never shows made-up answers, so the tutor, homework solver and study generator stay off until a model is connected.
      </p>
      <ol className="mt-5 space-y-3 text-sm leading-relaxed">
        <li>
          <span className="font-medium">Option A — hosted (fast):</span> create a free key at{" "}
          <a className="text-accent underline underline-offset-2" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
            console.groq.com
          </a>{" "}
          and add to <code className="rounded bg-surface-2 px-1">.env.local</code>:
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[12.5px]">{`AI_PROVIDER=groq
AI_API_KEY=gsk_...`}</pre>
          <span className="text-xs text-muted">Groq has a free tier with rate limits; usage beyond it is billed per token.</span>
        </li>
        <li>
          <span className="font-medium">Option B — fully local and free:</span> install{" "}
          <a className="text-accent underline underline-offset-2" href="https://ollama.com" target="_blank" rel="noreferrer">
            Ollama
          </a>
          , run <code className="rounded bg-surface-2 px-1">ollama pull qwen3</code>, then:
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[12.5px]">{`AI_PROVIDER=ollama
AI_MODEL=qwen3`}</pre>
        </li>
        <li>Restart the dev server. OpenAI, Anthropic and OpenRouter work too — see the README.</li>
      </ol>
      <div className="mt-6">
        <Button icon={<RefreshCw className="size-4" />} onClick={() => location.reload()}>
          I&apos;ve set it up — reload
        </Button>
      </div>
    </Card>
  );
}

export function ErrorNotice({ error, onRetry }: { error: { code?: string; message: string; hint?: string; retryAt?: number }; onRetry?: () => void }) {
  const wait = useCountdown(error.retryAt);
  return (
    <Alert
      tone={error.code === "rate_limited" ? "warning" : "danger"}
      title={error.code === "not_configured" ? "AI isn't set up yet" : undefined}
      action={
        onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry} disabled={wait > 0}>
            {wait > 0 ? `Try again in ${formatCountdown(wait)}` : "Try again"}
          </Button>
        )
      }
    >
      {error.retryAt ? (wait > 0 ? `Usage limit reached. You can ask again in ${formatCountdown(wait)}.` : "The usage limit has reset — you can ask again now.") : error.message}
      {error.hint && <span className="mt-1 block text-xs opacity-80">{error.hint}</span>}
    </Alert>
  );
}
