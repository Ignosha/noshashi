# Release signing and notarisation

Builds are produced by `.github/workflows/release.yml` on GitHub Actions for
macOS (Apple Silicon and Intel), Windows (MSI and NSIS) and Linux (deb, rpm,
AppImage). Today they are **not code-signed**. Every release already carries:

- SHA-256 checksums you can verify (`shasum -a 256`, `certutil -hashfile`);
- updater signatures (`*.sig`, minisign) that the in-app updater checks
  against the public key in `src-tauri/tauri.conf.json` before installing.

Code signing is what removes the macOS "unidentified developer" and Windows
SmartScreen warnings. It needs credentials only the company can obtain.
**Never commit any of them.** Add them as repository secrets
(GitHub → Settings → Secrets and variables → Actions).

## macOS: signing and notarisation (wired, off until configured)

What you need:

1. An Apple Developer Program membership for the company.
2. A **Developer ID Application** certificate, exported from Keychain Access
   as a `.p12` with a password.
3. An app-specific password for the Apple ID used to notarise
   (appleid.apple.com → Sign-In and Security → App-Specific Passwords).

Repository secrets:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | The `.p12`, base64-encoded on one line: `base64 -i cert.p12 \| tr -d '\n'` |
| `APPLE_CERTIFICATE_PASSWORD` | The `.p12` export password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Company Name (TEAMID1234)` |
| `APPLE_ID` | The Apple ID email used for notarisation |
| `APPLE_PASSWORD` | Its app-specific password |
| `APPLE_TEAM_ID` | The 10-character team ID |

The workflow step **"Enable macOS signing when configured"** exports these
to the build only when `APPLE_CERTIFICATE` and `APPLE_SIGNING_IDENTITY` are
set, and turns on notarisation only when all three notarisation secrets are
set. With none set, the build is unchanged. The step's log line says which
of signing and notarisation is on.

Check a signed build on a Mac:

```
codesign --verify --deep --strict --verbose=2 /Applications/NOSHASHI.app
spctl --assess --type execute --verbose /Applications/NOSHASHI.app
xcrun stapler validate /Applications/NOSHASHI.app
```

## Windows: Authenticode (not wired yet)

What you need: an OV or EV code-signing certificate. EV certificates are
issued on hardware tokens or cloud HSMs and are signed with a vendor tool,
so the integration depends on the provider chosen (for example Azure
Trusted Signing, DigiCert KeyLocker or SSL.com eSigner).

To wire it: set `bundle.windows.signCommand` in `src-tauri/tauri.conf.json`
to the provider's signing command, with its credentials supplied as
repository secrets in the Windows job. Until then Windows builds are
unsigned and SmartScreen warns.

## Linux

Linux packages are not signed by convention; the AppImage, deb and rpm each
have an updater signature and a published checksum.

## Updater signing key

`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are
already repository secrets. The matching public key is in
`src-tauri/tauri.conf.json`. Losing the private key means installed copies
can no longer auto-update; keep an offline backup.

## Release checklist

1. Version bumped in `package.json`, `package-lock.json` (two places),
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`.
2. `CHANGELOG.md` heading for the version; site pages and the website's
   NOSHX bundle regenerated.
3. `npx vitest run`, `npx tsc --noEmit`, `npm run build`,
   `npm run check:functions`, `npm run check:noshx-web` all pass.
4. Pull request green, merged to `main`.
5. Run the **Release** workflow on `main` (edition `full`).
6. Confirm the release has every platform's installer, `.sig` files and
   `latest.json`, and that the macOS step reported signing as expected.
