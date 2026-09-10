# Automatic updates

NOSHASHI can update itself in place. Everything needed is wired: the plugin,
the capability grants, the Settings panel, the startup check, and the signing
environment in `release.yml`. One thing is missing and only you can supply it —
the signing keypair.

Until that keypair exists the feature is **inert, not broken**. The updater
plugin is registered only when `plugins.updater.pubkey` in
`src-tauri/tauri.conf.json` is non-empty (see `updater_configured` in
`src-tauri/src/main.rs`), because the plugin refuses to initialise without a
key and that failure takes the whole application down at launch rather than
merely hiding a button. Settings › Updates says so in as many words.

## What the design guarantees

The release host is not trusted; the key is.

Every bundle is signed with a minisign key that lives only in the release
pipeline. The application verifies that signature against the public key
compiled into it *before* anything is written to disk. A compromised GitHub
account, a hijacked DNS record or a proxy rewriting the download can serve
whatever they like — every installed copy will decline it.

This matters more here than it would elsewhere. The application is published
unsigned and un-notarised, which is stated on every release page, so the
updater is the one channel that reaches every desk automatically. It is also
why the install is a click and never a silent background swap: an adjudication
engine that changed its own rule set between two receipts, with nobody at the
desk knowing which build produced which, would undermine exactly the property
the product is sold on. Checking is automatic. Applying is deliberate.

## Turning it on

**1. Generate the keypair.** Once, on a machine you control:

```bash
npm run tauri signer generate -- -w ~/.tauri/noshashi.key
```

It prints a public key and writes the private key to that path. Keep the
private key out of the repository — it is the only thing standing between your
users and a forged update.

**2. Paste the public key** into `src-tauri/tauri.conf.json`, and into
`src-tauri/tauri.demo.conf.json` if the demo should update too:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/Ignosha/noshashi/releases/latest/download/latest.json"
    ],
    "pubkey": "PASTE_THE_PUBLIC_KEY_HERE"
  }
}
```

**3. Ask Tauri to produce and publish the update artefacts.** In the same
file, inside `bundle`:

```json
"createUpdaterArtifacts": true
```

and in `.github/workflows/release.yml`, on the `tauri-apps/tauri-action` step:

```yaml
          includeUpdaterJson: true
```

**4. Add the repository secrets** the workflow already reads:

- `TAURI_SIGNING_PRIVATE_KEY` — the contents of `~/.tauri/noshashi.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password you set, or empty

Do steps 3 and 4 together. `createUpdaterArtifacts` without the secrets fails
the bundle step with a message about the missing signing key.

## How a release reaches an installed copy

Tagging `v0.2.3` runs the release workflow, which builds each platform, signs
each bundle, and attaches a `latest.json` manifest to the GitHub Release
alongside the installers. Installed copies read that manifest from the
`endpoints` URL above, compare its version against their own, verify the
signature on whatever they download, and install only on a click.

The endpoint is pinned to `releases/latest/download/latest.json`, so a draft
release publishes nothing to anyone. Existing installs see a new version at
the moment you publish the draft, not when the tag is pushed.

## Checking that it works

The honest test is an end-to-end one, because a signature check that silently
passes everything looks exactly like one that works:

1. Build and install `v0.2.2` locally.
2. Tag and publish `v0.2.3`.
3. Open the installed `v0.2.2` → Settings › Updates → CHECK NOW. It should
   offer v0.2.3, install it, and restart into it.

Then confirm the refusal path, which is the half that carries the security
claim. Re-sign `latest.json` with a *different* key, publish that, and check
again: the download must fail and the application must stay on the version it
has. If it installs, the key is not being enforced and the whole scheme is
decoration.
