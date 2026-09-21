import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Kbd } from "./Kbd";
import { cn } from "@/lib/utils";

export type Command = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  run: () => void;
};

/**
 * Subsequence match — "mcl" finds "Mission Control". Returns a score so
 * tighter, earlier matches float to the top of the list.
 */
function score(query: string, target: string): number | null {
  if (!query) return 0;
  const haystack = target.toLowerCase();
  const needle = query.toLowerCase();

  const direct = haystack.indexOf(needle);
  if (direct >= 0) return 1000 - direct;

  let cursor = 0;
  let hits = 0;
  let firstHit = -1;
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return null;
    if (firstHit === -1) firstHit = found;
    hits += 1;
    cursor = found + 1;
  }
  return hits * 10 - firstHit - (cursor - firstHit);
}

/**
 * CommandPalette — ⌘K. Every scene and every action in the console is
 * reachable from here without leaving the keyboard, which is the
 * difference between a dashboard and an operator's instrument.
 */
export function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const scored = commands
      .map((command) => ({
        command,
        rank: score(query, `${command.label} ${command.group} ${command.hint ?? ""}`),
      }))
      .filter((entry): entry is { command: Command; rank: number } => entry.rank !== null)
      .sort((a, b) => b.rank - a.rank)
      .map((entry) => entry.command);
    return query ? scored : commands;
  }, [commands, query]);

  const groups = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const command of results) {
      const bucket = map.get(command.group) ?? [];
      bucket.push(command);
      map.set(command.group, bucket);
    }
    return Array.from(map.entries());
  }, [results]);

  // Flat order matches the rendered order, so arrow keys track the eye.
  const flat = useMemo(() => groups.flatMap(([, items]) => items), [groups]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((prev) => (flat.length === 0 ? 0 : (prev + 1) % flat.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((prev) => (flat.length === 0 ? 0 : (prev - 1 + flat.length) % flat.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = flat[active];
      if (command) {
        onOpenChange(false);
        command.run();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
    }
  };

  let renderIndex = -1;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[14vh]">
          <motion.div
            className="absolute inset-0 bg-background/80 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative w-[min(540px,calc(100vw-48px))] rounded-lg border border-border bg-popover shadow-[0_32px_90px_-30px_hsl(0_0%_0%/0.95)]"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={handleKeyDown}
          >
            <span className="pointer-events-none absolute left-0 top-0 h-2.5 w-2.5 border-l border-t border-foreground/60" />
            <span className="pointer-events-none absolute right-0 top-0 h-2.5 w-2.5 border-r border-t border-foreground/60" />
            <span className="pointer-events-none absolute bottom-0 left-0 h-2.5 w-2.5 border-b border-l border-foreground/60" />
            <span className="pointer-events-none absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r border-foreground/60" />

            <div className="flex items-center gap-3 border-b border-border px-4">
              <span className="stencil shrink-0 text-[9px] tracking-[0.28em] text-muted-foreground">
                CMD
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Jump to a scene or run an action…"
                aria-label="Search commands"
                className="h-12 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />
              <Kbd keys="esc" />
            </div>

            <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
              {flat.length === 0 && (
                <p className="px-4 py-8 text-center text-[11px] text-muted-foreground">
                  No command matches “{query}”.
                </p>
              )}

              {groups.map(([group, items]) => (
                <div key={group} className="mb-1 last:mb-0">
                  <p className="stencil px-4 pb-1 pt-2 text-[8px] tracking-[0.26em] text-muted-foreground/70">
                    {group}
                  </p>
                  {items.map((command) => {
                    renderIndex += 1;
                    const index = renderIndex;
                    const selected = index === active;
                    return (
                      <button
                        key={command.id}
                        data-index={index}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => {
                          onOpenChange(false);
                          command.run();
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                          selected ? "bg-foreground text-background" : "text-foreground"
                        )}
                      >
                        {command.icon && (
                          <span className="shrink-0 opacity-80">{command.icon}</span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs">{command.label}</span>
                          {command.hint && (
                            <span
                              className={cn(
                                "mt-0.5 block truncate text-[10px]",
                                selected ? "text-background/70" : "text-muted-foreground"
                              )}
                            >
                              {command.hint}
                            </span>
                          )}
                        </span>
                        {command.shortcut && !selected && (
                          <Kbd keys={command.shortcut} className="shrink-0" />
                        )}
                        {selected && (
                          <span className="stencil shrink-0 text-[8px] tracking-[0.2em] text-background/70">
                            ↵ RUN
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-2">
              <span className="flex items-center gap-2 text-[9px] text-muted-foreground">
                <Kbd keys="up" />
                <Kbd keys="down" />
                navigate
              </span>
              <span className="stencil text-[8px] tracking-[0.24em] text-muted-foreground/70">
                NOSHASHI COMMAND BUS
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
