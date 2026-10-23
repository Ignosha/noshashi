/**
 * The plain-language guide to every screen, shared by the app's Guide and
 * tour (src/components/nova/Guide.tsx) and the website's /tutorial/
 * (scripts/build-tutorial.mjs), so the two always say the same thing.
 *
 * Steps carry two marks: **bold** for the words on a button or label, and
 * `key` for a keyboard key. parseMarks() splits a step into runs.
 */
import content from "./screens.json";

export type Plan = "Free" | "Pro" | "Institutional" | "Enterprise";

export interface ScreenGuide {
  scene: string;
  label: string;
  plan: Plan;
  answers: string;
  steps: string[];
  shot?: string;
  more?: string;
}

export interface GuideGroup {
  id: string;
  title: string;
  intro: string;
  screens: ScreenGuide[];
}

export const GROUPS = content.groups as GuideGroup[];

/** Every screen, in sidebar order. */
export const SCREENS: ScreenGuide[] = GROUPS.flatMap((group) => group.screens);

export function guideFor(scene: string): ScreenGuide | undefined {
  return SCREENS.find((screen) => screen.scene === scene);
}

export function groupOf(scene: string): GuideGroup | undefined {
  return GROUPS.find((group) => group.screens.some((screen) => screen.scene === scene));
}

/**
 * The tour's stops. Executive view tours the screens that view shows;
 * Analyst tours every screen. Account screens (pricing, sign-in, trust,
 * settings) are left to the end in both, as the last stop explains them.
 */
export function tourStops(visible: (scene: string) => boolean): ScreenGuide[] {
  return SCREENS.filter((screen) => visible(screen.scene));
}

export type Run = { text: string; mark?: "bold" | "key" };

export function parseMarks(step: string): Run[] {
  const runs: Run[] = [];
  const pattern = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  for (let match = pattern.exec(step); match; match = pattern.exec(step)) {
    if (match.index > last) runs.push({ text: step.slice(last, match.index) });
    runs.push(match[1] !== undefined ? { text: match[1], mark: "bold" } : { text: match[2], mark: "key" });
    last = match.index + match[0].length;
  }
  if (last < step.length) runs.push({ text: step.slice(last) });
  return runs;
}

export const TOUR_SEEN_KEY = "guide.tour.seen";
