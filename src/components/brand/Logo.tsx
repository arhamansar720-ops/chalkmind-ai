import { cn } from "@/lib/utils";

/** Chalkmind mark: a chalk stroke arcing around a spark of insight. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-ink" />
      <path
        d="M21.6 10.4a8 8 0 1 0 0 11.2"
        fill="none"
        className="stroke-bg"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="21.4" cy="16" r="2.3" className="fill-accent" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {!compact && <span className="text-[16px] font-semibold tracking-[-0.03em]">Chalkmind</span>}
    </span>
  );
}
