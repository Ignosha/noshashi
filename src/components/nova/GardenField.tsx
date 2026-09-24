import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ledgerRingStrength, mountGardenField, type GardenField as Field } from "@/lib/garden/field";

/**
 * The ASCII pond (src/lib/garden/field.ts) as a React layer, with the XRP
 * mark in the water and rings spreading from it and from the pointer.
 * Fills its positioned parent. `mark` places the logo, host-relative, with
 * its half-size in host heights. Ink is the theme's --brand, re-read when
 * the .dark class flips, so it follows the light/dark toggle.
 *
 * With `live`, the pond is driven by the ledger: each validated ledger that
 * closes sends one ring from the mark, its strength from the ledger's
 * transaction count, and with no ledger arriving the water stays still.
 */
export function GardenField({
  mark = { x: 0.83, y: 0.44, size: 0.3 },
  className,
  live = false,
  ledger = null,
}: {
  mark?: { x: number; y: number; size: number };
  className?: string;
  live?: boolean;
  /** The last validated ledger seen: a new index sends one ring. */
  ledger?: { index: number; txnCount: number } | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<Field | null>(null);
  const { x, y, size } = mark;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const mounted = mountGardenField(el, {
      color: () => `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--brand").trim()})`,
      mark: () => ({ x, y, size }),
      fontSize: 11,
      pulse: 6,
      live,
    });
    field.current = mounted;
    return () => {
      field.current = null;
      mounted.destroy();
    };
  }, [x, y, size, live]);

  const index = ledger?.index;
  useEffect(() => {
    if (live && index && ledger) field.current?.ripple(ledgerRingStrength(ledger.txnCount));
  }, [live, index]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={host}
      aria-hidden
      className={cn("garden-field-host pointer-events-none absolute inset-0 overflow-hidden", className)}
    />
  );
}
