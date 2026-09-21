import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The agent's console reference must describe the console that exists.
 *
 * This is a documentation-versus-code test, which is unusual, and it earns
 * its place because of one interaction: SHARED_RULES instructs the agent to
 * say it does not have a fact when the fact is absent from its context. An
 * incomplete reference therefore does not degrade gracefully into vagueness
 * — it makes the assistant assert that shipped features do not exist.
 *
 * When this was first checked the reference listed six of twenty-four
 * scenes and every keyboard shortcut in it was off by one, so it sent
 * operators to the wrong screen and denied the rest.
 *
 * Both files are read as text rather than imported. App.tsx pulls in the
 * entire component tree, which needs a DOM this suite deliberately does not
 * have, and the invariant under test is a textual one anyway.
 */

const root = resolve(import.meta.dirname, "../../../..");
const appSource = readFileSync(resolve(root, "src/App.tsx"), "utf8");
const agentSource = readFileSync(resolve(root, "src/lib/agent/context.ts"), "utf8");

type Scene = {
  id: string;
  /** Sidebar wording. */
  label: string;
  /** Header wording — differs from label on a couple of scenes. */
  title: string;
  digit: string;
  requires?: string;
};

/** Pull the SCENES array out of App.tsx. */
function parseScenes(): Scene[] {
  const start = appSource.indexOf("const SCENES: SceneDef[] = [");
  expect(start).toBeGreaterThan(-1);
  const body = appSource.slice(start, appSource.indexOf("\n];", start));

  const scenes: Scene[] = [];
  // Split on entry boundaries, then read fields individually — a single
  // monolithic regex over a multi-line object literal is unreadable and
  // silently drops entries when a field order changes.
  for (const chunk of body.split(/\n  \{\n/).slice(1)) {
    const id = /id:\s*"([\w-]+)"/.exec(chunk)?.[1];
    const label = /label:\s*"([^"]*)"/.exec(chunk)?.[1];
    const title = /title:\s*"([^"]*)"/.exec(chunk)?.[1];
    const digit = /digit:\s*"([^"]*)"/.exec(chunk)?.[1];
    if (!id || label === undefined || title === undefined || digit === undefined) continue;
    scenes.push({
      id,
      label,
      title,
      digit,
      requires: /requires:\s*"([\w_]+)"/.exec(chunk)?.[1],
    });
  }
  return scenes;
}

const scenes = parseScenes();

/** The reference block the support-mode prompt hands the model. */
const reference = agentSource.slice(
  agentSource.indexOf("Console reference"),
  agentSource.indexOf("Cmd+K opens the command palette")
);


/**
 * Find the reference line that DESCRIBES a scene, by its leading name.
 *
 * Substring matching is not good enough here and produced a false failure
 * when this test was written: the Verification line contains the word
 * "settlement" ("describe a settlement, run it against a domain"), so a
 * naive search for the Settlement scene matched Verification first and
 * reported it as missing its plan requirement. Reference lines are
 * `- <Name> (Cmd+N): …` or `- <Name>: …`, so the name is anchored.
 */
function lineFor(scene: Scene): string | undefined {
  const names = [scene.label, scene.title].map((n) => n.toLowerCase());
  return reference.split("\n").find((raw) => {
    const m = /^\s*"?-\s*([^(:]+)/.exec(raw);
    if (!m) return false;
    const leading = m[1].trim().toLowerCase();
    return names.some((n) => leading === n || leading.startsWith(n));
  });
}

describe("agent console reference", () => {
  it("parses a plausible scene list from App.tsx", () => {
    // Guards the parser itself: if App.tsx is restructured and this stops
    // matching, every assertion below would vacuously pass.
    expect(scenes.length).toBeGreaterThan(15);
    expect(scenes.map((s) => s.id)).toContain("settlement");
  });

  it("quotes the correct shortcut for every scene that has one", () => {
    const wrong: string[] = [];
    for (const scene of scenes) {
      if (!scene.digit) continue;
      // Find how the reference describes this shortcut, if at all.
      const claimed = new RegExp(`\\(Cmd\\+${scene.digit}\\):`).test(reference);
      if (!claimed) wrong.push(`${scene.title}: Cmd+${scene.digit} not present`);
    }
    expect(wrong).toEqual([]);
  });

  it("does not attach a shortcut to a scene that has none", () => {
    const digits = new Set(scenes.filter((s) => s.digit).map((s) => s.digit));
    const quoted = [...reference.matchAll(/\(Cmd\+(\w)\):/g)].map((m) => m[1]);
    for (const d of quoted) {
      expect(digits.has(d), `reference claims Cmd+${d} but no scene binds it`).toBe(true);
    }
  });

  it("mentions every user-facing scene", () => {
    // Sub-screens the operator reaches through other flows rather than as
    // destinations in their own right.
    const notDestinations = new Set(["home"]);
    const missing = scenes
      .filter((s) => !notDestinations.has(s.id))
      .filter((s) => lineFor(s) === undefined)
      .map((s) => s.label);
    expect(missing).toEqual([]);
  });

  it("states the plan requirement for every gated scene", () => {
    const gated = scenes.filter((s) => s.requires);
    expect(gated.length).toBeGreaterThan(0);
    for (const scene of gated) {
      const line = lineFor(scene);
      expect(line, `no reference line for ${scene.label}`).toBeDefined();
      // A gated scene must say so, or the agent will send a free user into
      // a paywall without warning.
      expect(
        /Requires (Desk|Institution)/.test(line!),
        `${scene.label} is gated on ${scene.requires} but its line does not say which plan`
      ).toBe(true);
    }
  });

  it("does not claim a plan for an ungated scene", () => {
    const ungated = scenes.filter((s) => !s.requires && s.digit);
    for (const scene of ungated) {
      const line = lineFor(scene);
      if (!line) continue;
      expect(
        /Requires (Desk|Institution)/.test(line),
        `${scene.label} is free but its line claims a paid plan`
      ).toBe(false);
    }
  });
});
