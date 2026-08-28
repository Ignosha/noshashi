import { useEffect, useState } from "react";
import { NovaSearch } from "./NovaIcon";
import { isDemo } from "@/lib/edition";
import { StatusDot } from "./StatusDot";
import { isTauri, isMac } from "@/lib/env";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/xrpl/types";

/**
 * TitleBar — a frameless toolbar with a native drag region.
 *
 * The window has no decorations, so the traffic lights are drawn here
 * in monochrome and wired to the real window commands. Every non-button
 * area carries `data-tauri-drag-region` so the whole bar drags.
 */
export function TitleBar({
  title,
  status,
  statusLabel,
  onClose,
  onCommand,
  freshness,
}: {
  title: string;
  status: Status;
  statusLabel: string;
  onClose?: () => void;
  /** Opens the command palette from the board's search field. */
  onCommand?: () => void;
  /** How old the newest validated read is, in seconds. */
  freshness?: number;
}) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const isMaximized = await getCurrentWindow().isMaximized();
      if (!cancelled) setMaximized(isMaximized);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const withWindow = async (
    action: (win: Awaited<ReturnType<typeof getWindow>>) => Promise<void>
  ) => {
    if (!isTauri) return;
    const win = await getWindow();
    await action(win);
  };

  const getWindow = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  };

  const handleClose = async () => {
    if (isTauri) {
      // The console hides rather than quits — the app lives in the menu bar.
      await withWindow((win) => win.hide());
      return;
    }
    onClose?.();
  };

  return (
    <header
      data-tauri-drag-region
      className="relative z-30 flex h-11 shrink-0 items-center justify-between border-b border-border bg-background/90 px-3 backdrop-blur"
    >
      <div data-tauri-drag-region className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleClose()}
            aria-label="Close window"
            className="group grid h-3 w-3 place-items-center rounded-full border border-border bg-muted transition-colors hover:border-foreground hover:bg-foreground"
          >
            <svg
              viewBox="0 0 8 8"
              className="hidden h-1.5 w-1.5 text-background group-hover:block"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
            </svg>
          </button>
          <button
            onClick={() => void withWindow((win) => win.minimize())}
            aria-label="Minimize window"
            disabled={!isTauri}
            className="group grid h-3 w-3 place-items-center rounded-full border border-border bg-muted transition-colors hover:border-foreground hover:bg-foreground disabled:opacity-60"
          >
            <svg
              viewBox="0 0 8 8"
              className="hidden h-1.5 w-1.5 text-background group-hover:block"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path d="M1.5 4h5" />
            </svg>
          </button>
          <button
            onClick={() =>
              void withWindow(async (win) => {
                await win.toggleMaximize();
                setMaximized(await win.isMaximized());
              })
            }
            aria-label={maximized ? "Restore window" : "Maximize window"}
            disabled={!isTauri}
            className="group grid h-3 w-3 place-items-center rounded-full border border-border bg-muted transition-colors hover:border-foreground hover:bg-foreground disabled:opacity-60"
          >
            <svg
              viewBox="0 0 8 8"
              className="hidden h-1.5 w-1.5 text-background group-hover:block"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <rect x="1.6" y="1.6" width="4.8" height="4.8" />
            </svg>
          </button>
        </div>

        <span data-tauri-drag-region className="h-3.5 w-px bg-border" />

        <span data-tauri-drag-region className="stencil text-[9px] tracking-[0.26em] text-muted-foreground">
          {title}
        </span>
        {/* Unmissable in the demo build, absent in the full one, so a
            screenshot of the demo can never pass for the product. */}
        {isDemo && (
          <span className="rounded border border-hold/60 bg-hold/10 px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.2em] text-hold">
            EARLY RELEASE · DEMO
          </span>
        )}
      </div>

      {/*
        Command field, centred, as in the brand board's application shot.
        It is a real affordance rather than decoration: it opens the same
        palette that ⌘K opens, so the shortcut is discoverable to someone
        who has never pressed it.
      */}
      {onCommand && (
        <button
          onClick={onCommand}
          className="group absolute left-1/2 flex h-6 w-[min(340px,32vw)] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-3 text-left transition-colors hover:border-brand/40 hover:bg-popover"
          aria-label="Open command palette"
        >
          <NovaSearch size={11} className="shrink-0 text-faint" />
          <span className="min-w-0 flex-1 truncate text-[10px] tracking-[0.1em] text-faint">
            Search scenes, wallets, commands
          </span>
          <kbd className="shrink-0 font-mono text-[9px] text-faint">⌘K</kbd>
        </button>
      )}

      <div data-tauri-drag-region className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <StatusDot status={status} size={5} pulse={status === "go"} />
          <span
            className={cn(
              "stencil text-[8px] tracking-[0.2em]",
              status === "go" && "text-go",
              status === "hold" && "text-hold",
              status === "no-go" && "text-no-go"
            )}
          >
            {statusLabel}
          </span>
        </span>
        {/*
          Data provenance: where this came from and how old it is. The board
          asks the interface to answer "when was this updated?" without the
          operator having to go looking.
        */}
        {freshness !== undefined && (
          <>
            <span className="h-3.5 w-px bg-border" />
            <span
              className="mono-font text-[9px] tabular-nums text-faint"
              title="Age of the newest validated ledger read"
            >
              {freshness < 60 ? `${Math.max(0, Math.round(freshness))}s AGO` : "STALE"}
            </span>
          </>
        )}
        <span className="h-3.5 w-px bg-border" />
        <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
          XRPL · MAINNET{isMac ? "" : " · WIN"}
        </span>
      </div>
    </header>
  );
}
