# Handoff — `fix/compliance-api-keychain-and-updates`

Working notes for picking this branch back up. **Disposable** — delete this file
before merging; it is not product documentation.

Written 2026-09-10. Branch head at the time: `0507981`, CI green.

---

## Where things stand

| | |
|---|---|
| Branch | `fix/compliance-api-keychain-and-updates` |
| Commit | `0507981` — 20 files, +540 / −42 |
| Base | `main` @ `a230443`, untouched |
| CI | **passing** — run on the branch, conclusion `success` |
| PR | not opened yet |

Open the PR here:
<https://github.com/Ignosha/noshashi/compare/fix/compliance-api-keychain-and-updates?expand=1>

### Verified

Run locally on Windows and again on the CI runner:

- `npm ci` — lockfile and manifest agree
- `npx tsc --noEmit` — exit 0
- `npm test` — 245 passed, 14 files
- `npm run build` — ✓
- `npm run build:demo` — ✓ (this could not run on Windows at all before)
- `npm audit --omit=dev --audit-level=high` — 0 vulnerabilities

Two things checked end-to-end rather than assumed:

- the built bundle contains `0.2.2`, no `0.1.0`, and no unsubstituted
  `__APP_VERSION__`
- `dist/` and `dist-demo/` main chunks have different hashes, so the edition
  split survived moving off the shell env prefix

### NOT verified — the one open risk

**Nothing in `src-tauri/` has been compiled.** There was no Rust toolchain on the
machine this was prepared on, and `ci.yml` never runs `cargo` — only
`release.yml` does, and only on a tag. So the Rust changes would first be
exercised during a release build, which is the worst possible moment to find a
problem.

Two files carry that risk:

- `src-tauri/Cargo.toml` — `keyring` split into three per-target dependency
  sections
- `src-tauri/src/main.rs` — `tauri::Builder` chain converted to a `let mut`
  binding, `export_text_file` validation rewritten, `open_external` Windows arm
  changed, `updater_configured` command added

Every identifier used was confirmed against upstream docs (keyring's
`apple-native` / `windows-native` / `sync-secret-service` / `crypto-rust`;
`updater:default`; `process:allow-restart`), so the risk is a compile error,
not a wrong design. But it is unconfirmed.

**Close it with:**

```bash
cd src-tauri
cargo check
```

Needs rustup plus MSVC Build Tools on Windows. Consider adding a `cargo check`
step to `ci.yml` permanently — a project shipping three desktop targets probably
wants Rust in the PR gate, not only at release.

---

## What the commit fixes

Full prose is in `CHANGELOG.md` under **Unreleased**. Short version:

1. **Compliance API refused every credentialed subject.** `CredentialType` is a
   VL blob and arrives hex-encoded; the edge function compared
   `4B59435F4C4556454C5F31` against `KYC_LEVEL_1`. Never matched — `no-go`
   regardless of the ledger.
2. **The same function invented ledger state.** rippled's HTTP JSON-RPC reports
   command errors *inside* `result` with HTTP 200; only the WebSocket API puts
   them at the top level, which is what the code tested. An unreadable account
   became a zero-balance account and got adjudicated.
3. **Windows and Linux stored no secrets.** `keyring` compiles no backend unless
   a feature asks for one (0 default features) and falls back to an in-process
   mock silently. Only `apple-native` was listed.
4. **`open_external` command injection on Windows.** `cmd /C start` re-parses its
   command line with rules Rust's quoting does not cover — a URL carrying `&`
   ran what followed it.
5. **`export_text_file` could escape Downloads on Windows.** `join` *replaces*
   the base path for a drive-prefixed argument, so `C:audit.csv` survived the
   last-segment split.
6. **Version hard-coded at 0.1.0** in the About panel, footer, legal BUILD row
   and both DMG scripts — at version 0.2.2. The release script therefore never
   found the DMG it had just built and silently repackaged the `.app` every time.
7. **`build:demo` was Windows-incompatible.** Now uses `--mode demo`.
8. **Signed automatic updates added** — see below.

---

## Automatic updates: the one manual step left

The feature is fully wired but **inert by design**. It stays inert until a
signing keypair exists, and the Settings panel says so rather than showing a
button that cannot work. `src-tauri/src/main.rs` registers the updater plugin
only when `plugins.updater.pubkey` is non-empty, because the plugin fails
initialisation without a key and that failure takes the whole app down at
launch.

`docs/UPDATES.md` has the full procedure. Condensed:

```bash
npm run tauri signer generate -- -w ~/.tauri/noshashi.key
```

Then:

1. paste the public key into `plugins.updater.pubkey` in
   `src-tauri/tauri.conf.json`
2. add `"createUpdaterArtifacts": true` to `bundle` in the same file
3. add `includeUpdaterJson: true` to the `tauri-action` step in `release.yml`
4. add repo secrets `TAURI_SIGNING_PRIVATE_KEY` and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Do 2 and 4 together — `createUpdaterArtifacts` without the secrets fails the
bundle step.

`tauri.demo.conf.json` needs no change: Tauri v2's `--config` is an RFC 7396
merge patch, so it inherits `plugins.updater` from the base config. (Confirmed
against the Tauri v2 docs.)

**Test the refusal path, not just the happy path.** Re-sign `latest.json` with a
*different* key, publish it, and check for updates: the download must fail and
the app must stay put. A signature check that silently passes everything looks
exactly like one that works.

---

## Deliberately left alone

Two real issues found during review that were out of scope for this commit:

- **CSV formula injection** in the audit-trail export (`csvCell` in
  `src/lib/format.ts`). A cell beginning `=`, `+`, `-` or `@` executes when the
  export is opened in Excel. Prefixing those with a `'` is the usual fix.
- **The edge function's rate limiter is per-instance and in-memory**
  (`rateBuckets` in `supabase/functions/noshashi-verify/index.ts`). Its own
  README already flags this; buckets also never get evicted.

---

## Environment notes

Prepared on a machine with no toolchain at all. Node 22.20.0 and MinGit 2.47.1
were extracted as portable zips under `%TEMP%` (`%TEMP%\nodejs`,
`%TEMP%\mingit`) — **these are temp and will be gone.** Install Node and Rust
normally before resuming.

A working clone was left at `%TEMP%\nsh-git` and a full patched tree at
`~/Downloads/noshashi-patched`. Both are also disposable; the branch on the
remote is the real artefact. `~/Downloads/noshashi-fixes.patch` and
`noshashi-fixes.bundle` carry the same commit if either copy is needed again.

---

## Resume checklist

- [ ] `cargo check` in `src-tauri/` — the only unverified thing
- [ ] Open the PR, review the diff (especially `main.rs` and `Cargo.toml`)
- [ ] Consider adding `cargo check` to `ci.yml`
- [ ] Generate the updater keypair and complete `docs/UPDATES.md` steps 1–4
- [ ] Delete this file
- [ ] Merge, then tag a release and confirm `latest.json` is attached
