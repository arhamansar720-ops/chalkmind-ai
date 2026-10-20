"use client";

import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Button */

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:opacity-90 shadow-sm",
  accent: "bg-accent text-accent-ink hover:bg-accent-hover shadow-sm",
  secondary: "bg-surface text-ink border border-border hover:border-border-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-medium transition-[background,opacity,border-color,color] duration-150 disabled:pointer-events-none disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, size = "md", className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "size-8" : "size-10",
        active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ Fields */

const fieldBase =
  "w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)] disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24 resize-y py-3 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(fieldBase, "h-11 appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
});

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------- Containers */

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface shadow-sm", className)} {...rest}>
      {children}
    </div>
  );
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-border",
  accent: "bg-accent-soft text-accent border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 className={cn("size-4 animate-spin text-muted", className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-dotgrid flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-ink-2 shadow-sm">{icon}</div>}
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "danger", title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", TONE[tone])}>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn("leading-relaxed", title && "mt-0.5 opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------- Segmented */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full border border-border bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full font-medium transition-colors",
            size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3.5 text-[13px]",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- Confirm dialog */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => e.target === ref.current && onCancel()}
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-2xl border border-border bg-surface p-0 text-ink shadow-lg backdrop:bg-black/30 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {body && <div className="mt-2 text-sm leading-relaxed text-muted">{body}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
