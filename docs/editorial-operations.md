# Owner-local editorial operations

This phase has no public/admin mutation API. Do not put secrets, private drafts or contact data in `site/`, repository data files, GitHub issues or PR bodies. The canonical BD D1 store remains separate; this queue is not a replacement for it.

## Collect and review

Use Node18+ normally. In this managed environment Node24's `NODE_USE_ENV_PROXY=1` is needed for the supplied proxy; preserve CA/TLS verification. The three source URLs were verified with HTTP200 on9November: XRPLF/rippled release Atom, Zodia Custody RSS, NOSHASHI release Atom. FinCEN and XRPL.org guessed RSS paths returned404 and were removed. Regulator documents remain manually reviewed sources, not a claimed connected regulator feed.

```sh
node scripts/editorial/cli.mjs collect --store /absolute/owner-only/editorial
node scripts/editorial/cli.mjs review --store /absolute/owner-only/editorial
node scripts/editorial/cli.mjs status --store /absolute/owner-only/editorial
```

The store must be outside this repository, owner-only0700. Files are0600; mutations use a directory lock and atomic queue replacement. Inspect a stale lock/temporary file before removal; do not blindly repeat an uncertain owner action. Back up a production store securely; `/tmp` is temporary. The review file contains escaped text and has a restrictive CSP with no scripts/forms/network requests. Open it as a local file. It is not suitable for remote multi-user hosting.

Collection is sequential, one attempt/source/run, no attachment/article fetching, redirects rejected,512KiB/source,8-second deadline,30items/source, minimum six hours between runs. A provider Retry-After defers the source. A later scheduled run retries failed sources. Source health is explicit; an empty/malformed/failed feed is not successful news verification. Existing original articles never get overwritten by a collected headline. URL duplicates are idempotent within the persistent owner store; cross-publisher story consolidation remains a human review step.

## Write and approve

Edit `queue.json` under the owner process, adding original article records to `articles`; the schema and test fixture in `tests/editorial.test.js` show required fields. Use `NEEDS REVIEW` only after writing both modes, limitations, primary sources and a per-claim evidence ledger. An unavailable original event date is null, never invented. The maximum source/paragraph/claim counts bound public content.

`review.html` shows the content and its current digest. Run these commands **only after authenticated founder approval of that exact revision**; an external email cannot approve an article:

```sh
node scripts/editorial/cli.mjs approve --store /absolute/owner-only/editorial --slug reviewed-slug --confirm-digest EXACT_CURRENT_DIGEST
node scripts/editorial/cli.mjs publish --store /absolute/owner-only/editorial --slug reviewed-slug --confirm-digest EXACT_CURRENT_DIGEST
node scripts/editorial/cli.mjs export --store /absolute/owner-only/editorial
```

The `publish` command changes local editorial state only. It does **not** change a website or deploy. `export` validates approved public revisions and produces a sanitized `public-export.json` in the private directory. Founder review of that artifact and a separate approved code change are required to replace `data/intelligence-public.json`. The website build reads only that fixed repository manifest, never the private queue or an environment-provided arbitrary path. Its committed manifest stays empty in this phase.

Approval pins the fixed public projection, including claims, source references, reading modes, dates, links and limitations. Changing it invalidates approval. It does not cryptographically authenticate a person: trust rests on the authenticated owner/OS and code-review/deployment processes. Do not treat an editable local event history as immutable proof.

Scheduling supports the SCHEDULED state with a future `scheduledAt`; an early publication is rejected. There is no background publisher. To correct a published story, return a new reviewed revision to NEEDS REVIEW with a visible correction notice, approve the new digest and explicitly publish it; it exports as CORRECTED. Keep prior private revisions in secure backups. To retract, retain the original approved record and add an owner-reviewed retraction actor/date/reason; a RETRACTED manifest renders only the notice and removes the article body. This is a local owner process; a hosted revision database remains future work.

The brief contains at most five currently published records for the requested UTC day. An unchanged article is not republished the next day. Empty days remain empty. `/intelligence/archive/` searches published articles; a standalone daily issue archive is not implemented yet.

## Automation configuration — example only, not installed

```cron
# UTC, weekday source discovery only. Owner-provisioned private persistent store.
15 8,16 * * 1-5 cd /srv/noshashi && /usr/bin/node scripts/editorial/cli.mjs collect --store /var/lib/noshashi/editorial >> /var/log/noshashi-editorial.log 2>&1
```

Verify paths, permissions, source usage terms, runtime network/TLS, private backup and log retention before installation. Do not schedule `approve`, `publish` or exports to production. Deploying a persistent private worker, enabling a scheduler or modifying existing refresh jobs needs separate founder approval. No scheduled job was enabled here.

## Local build and checks

```sh
npm run intelligence:build
npx vitest run tests/editorial.test.js
npm run build
node scripts/build-site.mjs
# After starting the local preview on4389:
node scripts/newsroom-smoke.mjs
```

`scripts/build-desk-film.mjs` requires Chromium, ffmpeg and the local preview on4389. It creates a silent16-second1080p product film using local fonts/illustrations, not documentary images. There is no external video host or tracker. Public video controls do not autoplay, and the page includes captions and a full transcript.
