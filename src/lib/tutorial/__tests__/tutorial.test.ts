import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GROUPS, SCREENS, guideFor, parseMarks, tourStops } from "@/lib/tutorial";

/*
 * The guide must cover every screen a customer can open, and name only
 * screens that exist. The app's screen list lives in src/App.tsx (SCENES);
 * it is read as text so this test does not mount the whole app.
 */
const app = readFileSync(resolve(__dirname, "../../../App.tsx"), "utf8");
const block = app.slice(app.indexOf("const SCENES: SceneDef[] = ["), app.indexOf("];", app.indexOf("const SCENES: SceneDef[] = [")));
const scenes = [...block.matchAll(/id: "([a-z]+)",[\s\S]*?label: "([^"]+)",[\s\S]*?group: "(primary|utility|hidden)"/g)].map((m) => ({
  id: m[1],
  label: m[2],
  group: m[3],
}));

describe("the in-app guide", () => {
  it("reads the app's screen list", () => {
    expect(scenes.length).toBeGreaterThan(25);
  });

  it("explains every screen a customer can open", () => {
    const missing = scenes.filter((s) => s.group !== "hidden" && !guideFor(s.id)).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it("names only screens that exist, each once, with the app's own label", () => {
    const ids = new Set(scenes.map((s) => s.id));
    expect(SCREENS.filter((g) => !ids.has(g.scene)).map((g) => g.scene)).toEqual([]);
    expect(new Set(SCREENS.map((g) => g.scene)).size).toBe(SCREENS.length);
    for (const g of SCREENS) {
      const def = scenes.find((s) => s.id === g.scene)!;
      expect(def.label.toLowerCase()).toBe(g.label.toLowerCase());
    }
  });

  it("gives every screen a plan, an answer and three or more steps", () => {
    for (const g of SCREENS) {
      expect(["Free", "Pro", "Institutional", "Enterprise"]).toContain(g.plan);
      expect(g.answers.length).toBeGreaterThan(10);
      expect(g.steps.length).toBeGreaterThanOrEqual(2);
    }
    expect(GROUPS.length).toBeGreaterThan(5);
  });

  it("tours only the screens a view can see, in sidebar order", () => {
    const exec = tourStops((id) => ["home", "verify", "plans"].includes(id)).map((g) => g.scene);
    expect(exec).toEqual(["home", "verify", "plans"]);
  });

  it("splits bold labels and keys out of a step", () => {
    expect(parseMarks("Press **Check** or `Ctrl/⌘`+`Enter`.")).toEqual([
      { text: "Press " },
      { text: "Check", mark: "bold" },
      { text: " or " },
      { text: "Ctrl/⌘", mark: "key" },
      { text: "+" },
      { text: "Enter", mark: "key" },
      { text: "." },
    ]);
  });
});
