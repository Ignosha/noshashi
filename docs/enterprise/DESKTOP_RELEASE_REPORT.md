# Desktop release report

Verified release metadata on 2026-11-15: [v1.0.27](https://github.com/Ignosha/noshashi/releases/tag/v1.0.27), published 2026-11-04, source `671a68c19d7a7fa05ab00482caa8a70e1afe337a`. The release contains Intel/Apple Silicon macOS artifacts, Windows and Linux packages, updater files and checksums. Artifact presence is not runtime, signing or enterprise-readiness verification.

| Item | Evidence / status |
|---|---|
| Main app versions | package.json, Cargo.toml and tauri.conf.json: 1.0.27 |
| Main configured macOS minimum | 10.15 in Tauri configuration; actual Mach-O deployment targets and physical execution are not reverified here |
| Release build targets | aarch64-apple-darwin, x86_64-apple-darwin, Linux x64, Windows x64 in existing release workflow |
| Apple Developer ID / notarization | Not claimed by current release notes; conditional setup exists, actual verified artifact required |
| Updater | HTTPS GitHub endpoint and pinned minisign public key; updater signature is not OS publisher signing |
| Native secret storage | Keyring backends selected for macOS, Windows, Linux; physical persistence test required |
| CSP / IPC | Scoped bundled windows/capabilities and restrictive CSP; no broad filesystem plugin permission. Custom commands still require native review. |
| Export behavior | Filename/path checks exist. Symlink/overwrite and large binary export semantics need native review before enterprise acceptance. |
| Native build this environment | BLOCKED: Linux workspace has no Rust/Cargo or macOS SDK/toolchain installed |
| Physical Intel Monterey / Apple Silicon | NOT EXECUTED. A CI cross-build does not substitute for hardware operation. |
| Separate macOS Operator #152 | Open/unmerged; its claimed artifact checks are not main-app validation. |

Before desktop pilot acceptance: verify downloaded hashes and updater signatures, inspect architecture and actual minimum OS, run Developer ID signature verification, Gatekeeper assessment and stapled notarization validation, install/open/quit/relaunch on each supported device, test read-only lookup and outage recovery, confirm keyring persistence without disclosure, test logout/revocation, export safety, reduced motion and update failure/rollback. Record exact OS/build/CPU/browser-webview versions and evidence.

A review-only native artifact gate may be prepared separately. It must reject unsigned/ad-hoc/wrong-architecture/unstapled artifacts and report unavailable tools as BLOCKED. No certificates, Apple passwords, signing keys or installer release are created here.
