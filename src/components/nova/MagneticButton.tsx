import { motion, useMotionValue, useSpring, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/lib/motion";

/** Spring options — `useSpring` takes the option shape, not a Transition. */
const PULL = { stiffness: 520, damping: 34, mass: 0.5 } as const;

/**
 * MagneticButton — the control leans toward the cursor while it is
 * inside the hit area, then springs back. Reserved for the one primary
 * call to action on a screen; used everywhere it becomes noise.
 */
export function MagneticButton({
  className,
  children,
  strength = 0.22,
  ...props
}: HTMLMotionProps<"button"> & { strength?: number }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, PULL);
  const springY = useSpring(y, PULL);
  const reduced = usePrefersReducedMotion();

  return (
    <motion.button
      className={cn("magnetic relative", className)}
      style={reduced ? undefined : { x: springX, y: springY }}
      onMouseMove={(event) => {
        if (reduced) return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - rect.left - rect.width / 2) * strength);
        y.set((event.clientY - rect.top - rect.height / 2) * strength);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
