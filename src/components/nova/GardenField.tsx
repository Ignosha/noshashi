import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { mountGardenField } from "@/lib/garden/field";

/**
 * The ASCII pond (src/lib/garden/field.ts) as a React layer, with the XRP
 * mark in the water and rings spreading from it and from the pointer.
 * Fills its positioned parent. `mark` places the logo, host-relative, with
 * its half-size in host heights. Ink is the theme's --brand, re-read when
 * the .dark class flips, so it follows the light/dark toggle.
 */
export function GardenField({
  mark = { x: 0.83, y: 0.44, size: 0.3 },
  className,
}: {
  mark?: { x: number; y: number; size: number };
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { x, y, size } = mark;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const field = mountGardenField(el, {
      color: () => `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--brand").trim()})`,
      mark: () => ({ x, y, size }),
      fontSize: 11,
      pulse: 6,
    });
    return () => field.destroy();
  }, [x, y, size]);

  return (
    <div
      ref={host}
      aria-hidden
      className={cn("garden-field-host pointer-events-none absolute inset-0 overflow-hidden", className)}
    />
  );
}
