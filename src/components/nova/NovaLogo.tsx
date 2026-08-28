import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/lib/motion";
import { NoshashiMark, type MarkTone } from "./brand/NoshashiMark";

/**
 * NOSHASHI brand mark.
 *
 * The artwork now comes from the supplied brand pack via NoshashiMark;
 * this component is kept as the app-wide entry point so the eleven
 * existing call sites keep their `size` / `animated` / `className`
 * contract and the swap is one edit rather than eleven.
 *
 * The animation is deliberately small: a faint lift, and — only on the
 * full mark — a slow orbital drift. A logo that performs is a logo you
 * stop trusting. Below 24px NoshashiMark drops the orbital arcs on its
 * own, because they render sub-pixel there, so the drift is suppressed
 * to match.
 */
export function NovaLogo({
  size = 40,
  className,
  animated = true,
  tone = "mono",
}: {
  size?: number;
  className?: string;
  /** Adds the lift and orbital drift. Suppressed under reduced motion. */
  animated?: boolean;
  tone?: MarkTone;
}) {
  const reduced = usePrefersReducedMotion();
  const alive = animated && !reduced;

  return (
    <motion.span
      className={cn("inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      animate={alive ? { y: [0, -1.1, 0] } : undefined}
      transition={
        alive ? { duration: 3.6, repeat: Infinity, ease: "easeInOut" } : undefined
      }
    >
      <NoshashiMark size={size} tone={tone} title="NOSHASHI" />
    </motion.span>
  );
}
