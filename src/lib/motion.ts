import { useEffect, useState } from "react";
import type { Transition, Variants } from "framer-motion";

/** True when the OS asks for reduced motion. Ambient loops respect this. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return reduced;
}

/** Shared spring — the single "feel" every interactive element uses. */
export const SPRING: Transition = {
  type: "spring",
  stiffness: 340,
  damping: 28,
  mass: 0.7,
};

/**
 * Scene transition: opacity and a short y-drift only.
 *
 * An earlier version animated `filter: blur()`. It looked marginally
 * softer and cost a full-screen offscreen composite on every frame,
 * which is the difference between a transition that glides on a laptop
 * and one that stutters. Transform and opacity stay on the compositor.
 */
export const sceneVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
  },
};

/** Reveal orchestration for panel grids. */
export const staggerParent = (stagger = 0.05): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: 0.04 } },
});

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: SPRING },
};
