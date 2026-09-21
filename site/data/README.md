# `site/data/updates.json` — the mission log source

Entries written here appear on the landing page, on `/status/` and in
`/api/project-feed`, merged with the GitHub releases feed and sorted by
date. Releases do **not** belong here: they arrive automatically from the
Releases API, because a release should exist only when CI produced an
artifact.

This file is what the site uses to say *"we are working on it"*.

```jsonc
{
  "date":  "2026-09-17T11:30:00Z",   // required, ISO 8601, UTC
  "kind":  "maintenance",            // release | maintenance | incident | milestone | note
  "title": "Short line, ≤120 chars",
  "body":  "One paragraph, ≤320 chars. Say what changed and what it means.",
  "link":  "/status/"                // optional; internal path or absolute URL
}
```

`kind` drives more than a label:

| kind | effect |
|---|---|
| `incident` | Status board drops to **DEGRADED** for 72 hours from `date`. |
| `maintenance` | Status board drops to **MAINTENANCE** for 72 hours from `date`. |
| `milestone`, `note` | Logged only; the board stays operational. |
| `release` | Reserved for the GitHub feed. Do not write one by hand. |

The window is deliberate: an incident that is over should stop colouring
the board without anyone remembering to delete the entry, and the entry
itself stays in the log permanently as a record.

Newest first is conventional but not required — entries are sorted on
read. Malformed entries (no parseable `date`, no `title`) are dropped
silently rather than breaking the page.
