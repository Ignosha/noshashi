#!/usr/bin/env node
/*
 * State snapshot for the ponytail skill.
 *
 * Reports what is true in the working tree right now. Read-only by
 * design: this runs at the start of a session, when the one thing
 * nobody wants is a script that changes the state it is describing.
 *
 *   node .claude/skills/ponytail/scripts/trail.mjs [--verbose]
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const VERBOSE = process.argv.includes("--verbose");

function run(args, { keepLeading = false } = {}) {
  try {
    const out = execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    /*
     * `--porcelain` encodes the index state in column 1, so an unstaged
     * modification begins with a space. Trimming both ends eats that
     * space on the first line only, shifting the path by one character —
     * which showed up as a single mangled filename at the top of the
     * list and nowhere else. Status output is trimmed at the end only.
     */
    return keepLeading ? out.replace(/\s+$/, "") : out.trim();
  } catch {
    return "";
  }
}

const git = (...args) => run(args);
const gitRaw = (...args) => run(args, { keepLeading: true });

const inRepo = git("rev-parse", "--is-inside-work-tree") === "true";
if (!inRepo) {
  console.log("Not a git repository. The trail needs one — every section of a\n" +
              "handoff is anchored to a branch and a commit.");
  process.exit(0);
}

const root = git("rev-parse", "--show-toplevel");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
const status = gitRaw("status", "--porcelain");
const changed = status ? status.split("\n").filter(Boolean) : [];

const line = (label, value) => console.log(`${label.padEnd(18)}${value}`);

console.log("── TRAIL ─────────────────────────────────────────────────────");
line("repository", path.basename(root));
line("branch", branch || "(detached)");
line("upstream", upstream || "(none — nothing to push to yet)");

if (upstream) {
  const counts = git("rev-list", "--left-right", "--count", `${upstream}...HEAD`);
  const [behind, ahead] = counts.split(/\s+/);
  line("divergence", `${ahead || 0} ahead · ${behind || 0} behind`);
}

line("working tree", changed.length ? `${changed.length} path(s) changed` : "clean");

console.log("\n── LAST COMMITS ──────────────────────────────────────────────");
const log = git("log", "-6", "--pretty=format:%h  %ad  %s", "--date=short");
console.log(log || "(no commits)");

if (changed.length) {
  console.log("\n── UNCOMMITTED ───────────────────────────────────────────────");
  /*
   * Grouped by status rather than listed flat: twenty modified files and
   * one deleted file is a very different situation from the reverse, and
   * a flat list buries the deletion.
   */
  const groups = new Map();
  for (const entry of changed) {
    const code = entry.slice(0, 2).trim() || "?";
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(entry.slice(3));
  }
  const NAMES = { M: "modified", A: "added", D: "deleted", R: "renamed", "??": "untracked" };
  for (const [code, files] of groups) {
    console.log(`  ${(NAMES[code] || code).padEnd(10)} ${files.length}`);
    for (const file of files.slice(0, VERBOSE ? files.length : 12)) console.log(`    ${file}`);
    if (!VERBOSE && files.length > 12) console.log(`    … ${files.length - 12} more (--verbose)`);
  }
}

console.log("\n── HANDOFF ───────────────────────────────────────────────────");
const handoff = path.join(root, "HANDOFF.md");
if (existsSync(handoff)) {
  const text = readFileSync(handoff, "utf8");
  const age = Math.round((Date.now() - statSync(handoff).mtimeMs) / 86400000);
  line("HANDOFF.md", `${text.split("\n").length} lines · last touched ${age}d ago`);

  /*
   * The reconciliation the skill asks for, pre-computed. A handoff
   * older than the newest commit was written before that commit and
   * cannot describe it — which is exactly the case where trusting it
   * costs a session.
   */
  const lastCommitAt = Number(git("log", "-1", "--format=%ct")) * 1000;
  if (lastCommitAt && statSync(handoff).mtimeMs < lastCommitAt) {
    console.log("\n  ⚠ STALE: commits landed after this handoff was written.");
    console.log("    It cannot describe them. Reconcile against the tree before trusting it.");
  }
  if (changed.length) {
    console.log("\n  ⚠ UNTIED: the tree has uncommitted changes.");
    console.log("    Work happened that was never tied off. Read it before continuing.");
  }
  console.log("\n" + text.split("\n").slice(0, VERBOSE ? 200 : 24).join("\n"));
} else {
  console.log("No HANDOFF.md. If this work will outlive the session, tie off before it ends.");
}

console.log("\n── NOTE ──────────────────────────────────────────────────────");
console.log("Snapshot is fact; HANDOFF.md is intent. Where they disagree, the");
console.log("snapshot wins — and the disagreement is the finding.");
