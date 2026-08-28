import { cn } from "@/lib/utils";
import type { Status } from "@/lib/xrpl/types";

const statusColor: Record<Status, string> = {
  go: "bg-go",
  hold: "bg-hold",
  "no-go": "bg-no-go",
};

export function StatusDot({
  status,
  size = 8,
  pulse = false,
  className,
}: {
  status: Status;
  size?: number;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-40",
            statusColor[status]
          )}
        />
      )}
      <span
        className={cn("relative inline-flex rounded-full", statusColor[status])}
        style={{ width: size, height: size }}
      />
    </span>
  );
}
