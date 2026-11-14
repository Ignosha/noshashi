import * as React from "react";
import { cn } from "@/lib/utils";
import { sentenceCase } from "@/lib/format";

/**
 * EmptyState — what a panel says when the ledger genuinely has
 * nothing to report. Explains *why* it is empty and offers the one
 * action that would change that, rather than showing a blank grid.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "desk-empty flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className
      )}
    >
      {icon && (
        <span aria-hidden className="desk-empty-mark grid h-10 w-10 place-items-center text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="max-w-[300px]">
        <p className="desk-empty-title text-foreground">
          {sentenceCase(title)}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
      {action}
    </div>
  );
}
