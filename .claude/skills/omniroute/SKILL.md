---
name: omniroute
description: Use before editing anything in a repository that has several distinct surfaces — a desktop app, a website, serverless functions, a native shell, edge functions, generated output — to work out which surface owns the change, which file is the source rather than the artifact, and what else must move with it. Invoke when a change could plausibly land in more than one place, when a file might be generated, when a value appears to be defined twice, or when a fix in one surface keeps failing to show up. Not needed for a change confined to one file whose ownership is already certain.
version: 1.0.0
user-invocable: true
argument-hint: "[path or topic]"
license: Apache 2.0
allowed-tools:
  - Bash(node .claude/skills/omniroute/scripts/*)
---

# Omniroute

Long projects do not usually die of hard problems. They die of edits landing
in the wrong place — a fix made in a generated file and wiped by the next
build, a constant changed in one of the three places it is declared, a page
updated in the deployed copy and not in the template it is rendered from.
Each costs an hour and none of them look like mistakes while they are being
made.

This skill answers one question before an edit: **which surface owns this,
and what moves with it.**

## Setup

```
node .claude/skills/omniroute/scripts/route.mjs <path-or-topic>
```

With no argument it prints the whole surface map. Given a path, it reports
which surface owns it, whether it is a source or an artifact, and what is
coupled to it. It reads only.

## The rule that matters most

**Never edit an artifact.** If the router says a file is generated, the edit
belongs in its source and the artifact is refreshed by running the build.
An edit to a generated file survives exactly until the next deploy, and the
symptom — "I fixed this, why is it back?" — arrives days later, when the
connection is no longer obvious.

The second rule: **a value declared in more than one place is a coupling,
not a duplicate.** Changing one copy does not fix the thing; it creates a
disagreement that will surface somewhere neither copy is being read.

## Surfaces in this repository

| Surface | Source of truth | Notes |
|---|---|---|
| Desktop application | `src/` | React + Vite. Built by `npm run build`. Tests in `src/**/__tests__`. |
| Native shell | `src-tauri/` | Tauri config, Rust side, CSP allowlist, updater. |
| Public website | `templates/`, `site/assets/`, `site/data/` | **`site/index.html`, `site/news/`, `site/status/`, `site/progress/` and `site/contact/` are generated** by `scripts/build-site.mjs`. Edit the template, then rebuild. |
| Website — hand-written pages | `site/pricing/`, `site/guide/`, `site/research/`, `site/legal/`, `site/downloads/` | Not generated. Edit in place. |
| Serverless functions | `api/` | Vercel Node functions. `api/_lib/` is shared and not routable. Deploys with no `node_modules` — dependency-free by constraint. |
| Edge functions | `supabase/functions/` | Deno, checked with `npm run check:functions`. |
| Build and tooling | `scripts/` | `build-site.mjs` renders the site; `dev-site.mjs` previews it with real headers. |
| Design authority | `DESIGN.md` | Tokens, bans, the card-prison rule. A visual change that contradicts it is wrong even when it looks better. |

## Known couplings

These are the pairs that have to move together. The router prints them for a
given path; they are listed here because reading them once is worth more
than discovering them individually.

- **Supabase origin** — declared in `src/lib/supabase/client.ts`, and
  allowlisted in the CSP of both `src-tauri/tauri.conf.json` and
  `src-tauri/tauri.demo.conf.json`, once over `https` and once over `wss`.
  A test fails when the three disagree, which is the only reason this is
  survivable.
- **Site nav and footer** — defined in `api/_lib/shell.js` for generated
  pages, and inline in `templates/home.html` and each hand-written page. A
  link added to one must be added to the others or the site navigates
  inconsistently depending on which page you are on.
- **Support answers** — `api/_lib/kb.js` is the single source for both the
  support console and the landing page's questions section. Change the
  knowledge base, not the rendered page.
- **Release metadata** — the download section is generated from the GitHub
  Releases API at build time. It is never edited by hand, and a version
  number typed into the template is a bug.
- **Design tokens** — `src/index.css` for the application, `site/assets/core.css`
  and the inline block in `templates/home.html` for the site. All three trace
  to the table in `DESIGN.md`.

## How to route

1. Run the router on the path or topic.
2. If it reports an artifact, restate the task against the source file before
   doing anything else.
3. Check the couplings it prints. Decide explicitly whether each one moves —
   "no" is a fine answer, but it should be an answer, not an oversight.
4. Do the work in the source surface, then run that surface's verification:
   `npm test` for the application, `node scripts/build-site.mjs` for the site,
   `npm run check:functions` for edge functions.

## When the router does not know

It prints the map and says so. Do not guess from the filename: read the
nearest build script and find out what writes the file. A file nothing
generates is a source; a file something writes is an artifact, whatever it
is called.
