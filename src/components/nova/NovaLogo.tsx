import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/lib/motion";
import { NoshashiMark, type MarkTone } from "./brand/NoshashiMark";

/**
 * NOSHASHI brand mark.
 *
 * The artwork is the lotus, drawn by NoshashiMark from the generated
 * brand geometry; this component is kept as the app-wide entry point so the eleven
 * existing call sites keep their `size` / `animated` / `className`
 * contract and the swap is one edit rather than eleven.
 *
 * The animation is deliberately small: a faint lift, like a bloom
 * resting on water. A logo that performs is a logo you stop trusting.
 */
export function NovaLogo({
  size = 40,
  className,
  animated = true,
  tone = "mono",
}: {
  size?: number;
  className?: string;
  /** Adds the lift. Suppressed under reduced motion. */
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
