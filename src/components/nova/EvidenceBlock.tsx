import { cn } from "@/lib/utils";

export function EvidenceBlock({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  tone?: "default" | "go" | "hold" | "no-go";
}) {
  return (
    <div className="border-b border-border/40 py-2 last:border-0">
      <p className="stencil text-[8px] tracking-[0.2em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "data-font mt-1 text-[12px] tabular-nums",
          tone === "go" && "text-go",
          tone === "hold" && "text-hold",
          tone === "no-go" && "text-no-go",
          tone === "default" && "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mono-font mt-0.5 text-[9px] leading-relaxed text-faint">{detail}</p>
    </div>
  );
}
