import { useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * NOSHREPAIR's accessible building blocks, in NOSHASHI's design.
 *
 * Built to WCAG 2.1 AA, the standard ADA compliance is measured against:
 *   · every field has a visible label, linked hints and errors
 *     (aria-describedby), and aria-invalid when it is wrong (1.3.1, 3.3.1)
 *   · errors are announced as they appear (role="alert", 4.1.3)
 *   · each screen moves focus to its heading, so a screen reader announces
 *     where the person is (2.4.3)
 *   · focus is always visible (2.4.7); nothing relies on colour alone
 *     (1.4.1): every status also has words
 *   · sizes are in rem, so 200% zoom reflows instead of clipping (1.4.4)
 */

export function PageTitle({ children, eyebrow }: { children: ReactNode; eyebrow?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  // On arrival, and whenever the title changes in place (sign in → reset
  // password), so keyboard and screen reader users are never left on <body>.
  const key = typeof children === "string" ? children : null;
  useEffect(() => {
    ref.current?.focus();
  }, [key]);
  return (
    <div className="mb-5">
      {eyebrow && <p className="stencil text-xs tracking-[0.14em] text-muted-foreground">{eyebrow}</p>}
      <h1 ref={ref} tabIndex={-1} className="mt-1 text-2xl font-[600] tracking-tight text-foreground outline-none">
        {children}
      </h1>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  className,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-[600] text-foreground">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          "w-full border bg-transparent px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/70",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          error ? "border-no-go" : "border-input"
        )}
        {...input}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-no-go">
          {error}
        </p>
      )}
    </div>
  );
}

/** An error the person must act on; read out as soon as it appears. */
export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" }) {
  if (!children) return null;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("border p-3 text-sm", tone === "error" ? "border-no-go/60 bg-no-go/10 text-foreground" : "border-border bg-card text-foreground")}
    >
      {children}
    </div>
  );
}

/** Polite announcements for loading and saved states. */
export function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border border-border bg-card/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="stencil text-xs tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Status in words and colour, never colour alone. */
export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "go" | "hold" | "no-go" | "muted" }) {
  const tones = {
    go: "border-go/60 text-go",
    hold: "border-hold/60 text-hold",
    "no-go": "border-no-go/60 text-no-go",
    muted: "border-border text-muted-foreground",
  };
  return <span className={cn("stencil inline-flex items-center border px-2 py-0.5 text-[0.7rem] tracking-[0.12em]", tones[tone])}>{children}</span>;
}
