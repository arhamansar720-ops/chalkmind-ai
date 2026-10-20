/**
 * Static illustration of the tutor workspace for the landing page. It's a
 * drawing of the interface, not live model output.
 */
export function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-5xl" role="img" aria-label="Illustration of the Chalkmind workspace: a whiteboard solving 3x − 7 = 11 step by step next to the tutor conversation">
      <div className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-lg">
        <div className="flex h-10 items-center gap-2 border-b border-border bg-surface-2 px-4">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="mx-auto rounded-md border border-border bg-surface px-3 py-0.5 font-mono text-[11px] text-muted">chalkmind.app/app/tutor</span>
          <span className="w-12" />
        </div>
        <div className="grid min-h-[360px] md:grid-cols-[1.55fr_1fr]">
          {/* Board */}
          <div className="relative border-b border-border bg-white md:border-b-0 md:border-r dark:bg-[#141417]">
            <svg viewBox="0 0 560 360" className="h-full w-full" aria-hidden>
              <defs>
                <pattern id="pv-dots" width="22" height="22" patternUnits="userSpaceOnUse">
                  <circle cx="1.2" cy="1.2" r="1.1" className="fill-[#e6e6e1] dark:fill-[#26262c]" />
                </pattern>
              </defs>
              <rect width="560" height="360" fill="url(#pv-dots)" />
              <g fontFamily="var(--font-geist-sans)" className="fill-[#1e1e24] dark:fill-[#ececef]">
                <text x="40" y="58" fontSize="26" fontWeight="600" letterSpacing="-0.5">Solving 3x − 7 = 11</text>
                <path d="M40 70 q90 -6 190 0" strokeWidth="3" fill="none" strokeLinecap="round" className="stroke-accent" />
                <text x="40" y="122" fontSize="24" fontStyle="italic">3x − 7 = 11</text>
                <text x="40" y="172" fontSize="24" fontStyle="italic">3x = 18</text>
                <rect x="30" y="196" width="128" height="40" rx="10" className="fill-[#ffe066]/50 dark:fill-[#6b5a14]/60" />
                <text x="40" y="224" fontSize="24" fontStyle="italic">x = 6</text>
              </g>
              <g fontFamily="var(--font-geist-sans)" fontSize="15" className="fill-accent">
                <text x="230" y="168">← add 7 to both sides</text>
                <text x="230" y="222">← divide both sides by 3</text>
              </g>
              <g>
                <rect x="40" y="262" width="150" height="58" rx="12" strokeWidth="2" className="fill-[#e7edff] stroke-accent dark:fill-[#1d2440]" />
                <text x="115" y="296" textAnchor="middle" fontSize="15" fontFamily="var(--font-geist-sans)" className="fill-[#1e1e24] dark:fill-[#ececef]">Check: 3·6 − 7</text>
                <path d="M196 291 h52" strokeWidth="2" fill="none" className="stroke-[#1e1e24] dark:stroke-[#ececef]" markerEnd="url(#pv-arrow)" />
                <defs>
                  <marker id="pv-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                    <path d="M0 0 L10 5 L0 10 z" className="fill-[#1e1e24] dark:fill-[#ececef]" />
                  </marker>
                </defs>
                <rect x="256" y="262" width="110" height="58" rx="12" strokeWidth="2" className="fill-[#e2f5ea] stroke-success dark:fill-[#15301f]" />
                <text x="311" y="296" textAnchor="middle" fontSize="15" fontFamily="var(--font-geist-sans)" className="fill-[#1e1e24] dark:fill-[#ececef]">= 11 ✓</text>
              </g>
            </svg>
            <div className="absolute right-3 top-3 flex gap-1 rounded-full border border-border bg-surface/90 p-1 shadow-sm">
              {["↶", "↷", "⤢"].map((g) => (
                <span key={g} className="flex size-6 items-center justify-center rounded-full text-[12px] text-muted">
                  {g}
                </span>
              ))}
            </div>
          </div>
          {/* Chat */}
          <div className="flex flex-col gap-3 bg-bg p-4">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13px] text-bg">Why did you add 7 first?</div>
            <div className="flex gap-2.5">
              <span className="mt-0.5 size-6 shrink-0 rounded-full border border-border bg-surface" />
              <div className="space-y-2 text-[13px] leading-relaxed text-ink-2">
                <p>We want x by itself. The −7 is attached to 3x, so we undo it first — adding 7 to both sides keeps the equation balanced.</p>
                <span className="inline-flex rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted">highlight · show</span>
              </div>
            </div>
            <div className="mt-auto flex flex-wrap gap-1.5">
              {["Give me a similar problem", "Explain it more simply"].map((t) => (
                <span key={t} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] text-ink-2">
                  {t}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-[12px] text-muted">
              Ask a follow-up…
              <span className="flex items-center gap-1.5">
                <span className="flex h-3 items-end gap-0.5">
                  {[6, 10, 7, 12].map((h, i) => (
                    <span key={i} className="w-0.5 rounded-full bg-accent" style={{ height: h }} />
                  ))}
                </span>
                <span className="size-5 rounded-full bg-ink" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
