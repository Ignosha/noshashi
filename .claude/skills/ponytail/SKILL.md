---
name: ponytail
description: Use to make a long-running piece of work survive across sessions, context compaction, and handoffs. Captures and restores the trail behind the current task — what changed, why, what is verified, what is still open, and the exact command to resume — into HANDOFF.md. Invoke when picking work back up after a break, when context is about to run out, before switching to an unrelated task, at the end of a working session, or whenever the answer to "where was I?" is not immediately obvious. Not for one-off edits that finish inside a single reply.
version: 1.0.0
user-invocable: true
argument-hint: "[pick-up | tie-off | check] [topic]"
license: Apache 2.0
allowed-tools:
  - Bash(node .claude/skills/ponytail/scripts/*)
---

# Ponytail

A ponytail is the length of work trailing behind you. This skill keeps hold
of it, so a project that takes twenty sessions does not get re-derived from
scratch nineteen times.

The failure this exists to prevent is specific and expensive. A long task
runs, context fills, the session ends or compacts, and the next session
opens with the repository but not the reasoning: which of these three
approaches was already tried and rejected, whether the tests were green
before or after the last edit, what the half-finished file was on its way to
becoming. The work then gets redone — usually slightly differently, which is
worse than redoing it identically.

The trail lives in `HANDOFF.md` at the repository root. One file, committed,
reviewed like code. Not a scratch directory, not session memory, not a
comment buried in a branch: a thing a human can read and a fresh session
reads first.

## Commands

| Command | When | What it does |
|---|---|---|
| `pick-up` | Starting, or resuming after any gap | Reads `HANDOFF.md`, runs the state snapshot, and reconciles the two before touching anything |
| `tie-off` | Ending a session, before a context compaction, before switching tasks | Writes the trail: what moved, what is verified, what is open, how to resume |
| `check` | Mid-task, when unsure | Snapshot only — no writes. Answers "what is actually true right now" |

With no command, infer: an empty or stale `HANDOFF.md` and a dirty tree means
`pick-up`; a request that sounds like an ending means `tie-off`.

## Setup

Run the snapshot first, always. It is the ground truth the trail is checked
against:

```
node .claude/skills/ponytail/scripts/trail.mjs
```

Add `--verbose` for full diffs against the upstream branch. The script reads;
it never writes and never commits.

## pick-up

1. Run the snapshot.
2. Read `HANDOFF.md` if it exists.
3. **Reconcile before trusting either.** The handoff describes intent; the
   snapshot describes fact. Where they disagree, the snapshot wins and the
   disagreement is itself the most important thing you have just learned —
   it means work happened that was never tied off, and you are about to
   walk into it.
4. State, in two or three sentences, where the work actually is. Then start.

Do not skip step 3 because the handoff looks tidy. A handoff that says
"tests passing" next to a snapshot that says three files changed since the
last commit is a handoff written before the last edit, not after it.

## tie-off

Write `HANDOFF.md` with these sections, in this order. The order is the order
a person resuming needs them.

```markdown
# Handoff — <topic>

Updated <ISO date> · branch `<branch>` · <n> commits ahead of <upstream>

## Where this is
One paragraph. What is being built and what state it is in right now.

## Verified
What has actually been run and passed, with the command. "Build succeeds and
272 tests pass — `npm run build && npm test`." Nothing goes here on the
strength of looking correct.

## Open
What is unfinished, in priority order. Each line says what is needed, not
just what is missing.

## Rejected
Approaches already tried that did not work, and why. This section is the one
that pays for the file — without it, the next session spends an hour
rediscovering a dead end.

## Resume with
The literal commands. Copy-pasteable, in order.
```

Rules for writing it:

- **Verified means executed.** If you did not run it in this session, it goes
  under Open, not Verified. A handoff that overstates what is tested is worse
  than no handoff, because the next session builds on it.
- **Rejected is not optional.** It is the only section carrying information
  that cannot be recovered by reading the repository.
- **Absolute dates.** "Yesterday" is meaningless to a session three weeks
  later. Convert every relative date before writing it.
- **Keep it short enough to be read.** Under 80 lines. A handoff nobody reads
  is a handoff that does not exist; if a section is growing without bound,
  the work needs splitting, not the document.
- **Replace, do not append.** This file describes the present. History lives
  in git, and an append-only handoff becomes a log nobody scrolls to the
  bottom of.

## check

Snapshot only, reported in a few lines. Use it when a decision depends on
what is actually true — whether the tree is clean before a risky edit,
whether the last build was before or after the change in question.

## What this skill will not do

- It will not commit, push, or stage anything. The trail is written; whether
  it is committed is the user's call.
- It will not invent a Verified line. If nothing was run, the section says
  so.
- It will not be used as a substitute for finishing a task that could have
  been finished. Tying off is for work that genuinely spans sessions, not a
  way to stop early with a tidy note.
