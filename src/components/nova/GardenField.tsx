import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { mountGardenField } from "@/lib/garden/field";

/**
 * The ASCII pond (src/lib/garden/field.ts) as a React layer. Fills its
 * positioned parent; ripples spread from the centre of `originRef` (the
 * flower) and from the pointer. Ink is the theme's --brand, re-read when
 * the .dark class flips, so it follows the light/dark toggle.
 */
export function GardenField({
  originRef,
  className,
}: {
  originRef?: RefObject<HTMLElement>;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const field = mountGardenField(el, {
      color: () => `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--brand").trim()})`,
      origin: () => {
        const flower = originRef?.current;
        if (!flower) return null;
        const box = el.getBoundingClientRect();
        const f = flower.getBoundingClientRect();
        if (!f.width || !box.width) return null;
        // The artwork's lit core sits at (49.7%, 46.4%) of the image.
        return {
          x: (f.left + f.width * 0.497 - box.left) / box.width,
          y: (f.top + f.height * 0.464 - box.top) / box.height,
        };
      },
      fontSize: 11,
      pulse: 6,
    });
    return () => field.destroy();
  }, [originRef]);

  return (
    <div
      ref={host}
      aria-hidden
      className={cn("garden-field-host pointer-events-none absolute inset-0 overflow-hidden", className)}
    />
  );
}

/**
 * The owner's flower artwork, animated: it opens once, then breathes on
 * the same 6s period as the pond's rings and turns very slowly. Stilled
 * under prefers-reduced-motion (index.css).
 */
export function GardenFlower({
  size,
  className,
  flowerRef,
}: {
  size: number;
  className?: string;
  flowerRef?: RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={flowerRef}
      aria-hidden
      className={cn("garden-flower pointer-events-none", className)}
      style={{ width: size, aspectRatio: "1263 / 1245" }}
    >
      <div className="open">
        <div className="turn">
          <img src="/brand/flower.webp" alt="" draggable={false} decoding="async" />
        </div>
      </div>
    </div>
  );
}
