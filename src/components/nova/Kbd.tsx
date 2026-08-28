import { cn } from "@/lib/utils";
import { isMac } from "@/lib/env";

/**
 * Kbd — a keycap rendered in the platform's own glyphs.
 * Write shortcuts as "mod+k"; the component resolves ⌘ vs Ctrl.
 */
export function Kbd({ keys, className }: { keys: string; className?: string }) {
  const glyphs = keys.split("+").map((key) => {
    const token = key.trim().toLowerCase();
    if (token === "mod") return isMac ? "⌘" : "Ctrl";
    if (token === "shift") return "⇧";
    if (token === "alt" || token === "option") return isMac ? "⌥" : "Alt";
    if (token === "enter" || token === "return") return "↵";
    if (token === "esc" || token === "escape") return "esc";
    if (token === "up") return "↑";
    if (token === "down") return "↓";
    return key.trim().toUpperCase();
  });

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {glyphs.map((glyph, index) => (
        <kbd
          key={`${glyph}-${index}`}
          className="mono-font grid h-[17px] min-w-[17px] place-items-center rounded-md border border-border bg-secondary px-1 text-[9px] leading-none text-muted-foreground"
        >
          {glyph}
        </kbd>
      ))}
    </span>
  );
}
