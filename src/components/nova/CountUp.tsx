import { useEffect, useRef } from "react";
import { animate, useMotionValue } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * CountUp — numerals that travel to their new value instead of
 * snapping. Live telemetry reads as motion, which is the point of a
 * mission-control surface; the DOM node is written directly so React
 * never re-renders per frame.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 0.9,
  className,
  prefix = "",
  suffix = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(value);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const write = (current: number) => {
      node.textContent = `${prefix}${current.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`;
    };

    if (reduced) {
      motionValue.set(value);
      write(value);
      return;
    }

    const controls = animate(motionValue, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: write,
    });
    return () => controls.stop();
  }, [value, decimals, duration, prefix, suffix, reduced, motionValue]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {`${prefix}${value.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`}
    </span>
  );
}
