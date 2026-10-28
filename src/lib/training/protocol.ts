/**
 * Messages between NOSHASHI Academy and the lab workstation it embeds.
 *
 * The workstation is NOSHASHI's training copy in a frame on the Academy's
 * own origin. Both sides post to and accept from that origin only, and only
 * messages carrying their partner's `source`.
 */

export const FROM_ACADEMY = "noshashi-academy";
export const FROM_WORKSTATION = "noshashi-workstation";

/** Academy → workstation: open a screen, optionally with a lab value handed to it. */
export type OpenScreen = {
  source: typeof FROM_ACADEMY;
  type: "open";
  scene: string;
  value?: string;
  /** What the value is, shown by the screen ("Bitstamp's USD issuer"). */
  as?: string;
  /** Which tab of the screen reads the value. */
  view?: string;
};

/** Workstation → Academy. */
export type WorkstationEvent =
  | { source: typeof FROM_WORKSTATION; type: "ready" }
  /** The screen now showing. */
  | { source: typeof FROM_WORKSTATION; type: "scene"; scene: string }
  /** A read went to the ledger, naming these addresses or hashes. */
  | { source: typeof FROM_WORKSTATION; type: "read"; command: string; values: string[]; paid: boolean }
  /** A paid screen was asked for something outside the labs. */
  | { source: typeof FROM_WORKSTATION; type: "blocked"; command: string; value: string };

export function isOpenScreen(data: unknown): data is OpenScreen {
  const d = data as Partial<OpenScreen> | null;
  return !!d && d.source === FROM_ACADEMY && d.type === "open" && typeof d.scene === "string";
}

export function isWorkstationEvent(data: unknown): data is WorkstationEvent {
  const d = data as { source?: unknown; type?: unknown } | null;
  return !!d && d.source === FROM_WORKSTATION && typeof d.type === "string";
}
