import { useEffect, useRef } from "react";
import { isTauri } from "./env";
import type { Status } from "./xrpl/types";

/**
 * The menu bar ticker.
 *
 * macOS shows a short string beside the tray icon, so the one thing an
 * operator needs — can this wallet settle, and is the ledger moving —
 * is readable without opening anything.
 *
 * Updates are throttled and change-gated: the menu bar is shared real
 * estate and every write is an IPC round trip, so we only spend one when
 * the text actually differs.
 */

const MIN_INTERVAL_MS = 4000;

const VERDICT_GLYPH: Record<Status, string> = {
  go: "●",
  hold: "◐",
  "no-go": "○",
};

/** 106_421_178 → "106.42M" — a full ledger index will not fit. */
function compactLedger(index: number): string {
  if (index >= 1_000_000) return `${(index / 1_000_000).toFixed(2)}M`;
  if (index >= 1_000) return `${(index / 1_000).toFixed(1)}K`;
  return String(index);
}

export function useTrayTicker({
  verdict,
  ledgerIndex,
  connected,
}: {
  verdict: Status;
  ledgerIndex?: number;
  connected: boolean;
}) {
  const lastText = useRef<string>("");
  const lastSent = useRef<number>(0);
  const pending = useRef<number>(0);

  useEffect(() => {
    if (!isTauri) return;

    const text = !connected
      ? "○ OFFLINE"
      : `${VERDICT_GLYPH[verdict]} ${ledgerIndex ? compactLedger(ledgerIndex) : "SYNC"}`;

    if (text === lastText.current) return;

    const send = () => {
      lastText.current = text;
      lastSent.current = Date.now();
      void import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke("set_tray_title", { title: text }))
        .catch(() => {
          // A missing tray is not worth surfacing to the operator.
        });
    };

    const elapsed = Date.now() - lastSent.current;
    if (elapsed >= MIN_INTERVAL_MS) {
      send();
      return;
    }

    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(send, MIN_INTERVAL_MS - elapsed);
    return () => window.clearTimeout(pending.current);
  }, [verdict, ledgerIndex, connected]);
}
