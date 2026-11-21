# Continuity V2 — standalone development application

The separate Continuity UI reuses the existing NOSHASHI Ledger Desk design system.
It is **read-only**. It neither signs nor submits transactions, and it does
not grant signing authorization.

## Run locally

```sh
npm install
npm run continuity:check
npm run continuity:test
npm run continuity:build
npm run continuity:dev
```

Open http://localhost:1430/continuity/ after starting the dev server.
The dedicated build outputs to `dist-continuity/continuity/index.html`.
The Vite commands do not deploy anything. A separate, minimal Tauri desktop scaffold is now present under `continuity/src-tauri/`; its native build has not yet been verified on macOS.

## Current workflow

Paste a JSON `ContinuityIntent` with no private keys. The application
validates its schema, attempts read-only XRPL mainnet account and ledger
queries, evaluates conservative settlement checks, and displays a HOLD or
NO-GO review. It does not yet verify institution policy, issuer attestations,
funded liquidity, or trusted decision issuance, so it cannot authorize GO.

The public XRPL WebSocket can be unavailable or incomplete. An absent
account response is **not** proof of account nonexistence. Reserve and fee
data may be unavailable or sourced at different ledger indexes. Do not
use this build as a production transaction gate.

## Release requirements

- CI TypeScript, Vitest, and production build all pass
- Verify live XRPL response shape and same-ledger evidence integrity
- Review canonical transaction signing payload binding
- Implement authenticated tenant policy and trusted signing keys
- Add replay protection, signed receipts, and independent verification
- Integrate custody enforcement with no bypass and complete failure testing
- Complete independent security review and desktop packaging

No signing, merging, deployment, billing, or policy activation is part of
this development increment.


## Release acceptance matrix (do not infer completion from green CI)

| Gate | Verification | Current evidence |
| --- | --- | --- |
| Automated Continuity checks | Typecheck, unit tests, build, website integration | Passed CI #1250 |
| Repository regression checks | Full tests, SQL, public website build, generated assets | Passed CI #1250 |
| Public website visual QA | Inspect homepage section at 320, 375, 768, 1024 and 1440 CSS pixels; verify overflow, CTAs, keyboard navigation, contrast, reduced motion and no-JS fallback | Not manually verified |
| Standalone Continuity UI QA | Verify JSON input errors, busy state, HOLD/NO-GO, narrow-window scrolling, keyboard use and screen-reader announcements | Not manually verified |
| Live XRPL validation | Use documented mainnet test accounts and known transactions; compare validated ledger index and account data against an independent XRPL source; simulate timeout and stale ledger | Not verified |
| Dedicated macOS package | Create separate Tauri app identity, bundle identifier, icon, permissions and update channel; test Intel macOS installation and launch | Not implemented |
| macOS distribution | Sign, notarize, staple and independently test on a clean supported Mac | Not verified |
| Enterprise controls | Tenant authentication, trusted policy versions, independent key registry, replay defense, signed receipts, custody integration and security review | Not implemented |

### Manual website and desktop QA record

For each tested viewport or machine, record date, OS/browser version, screenshot or screen recording, expected behavior, observed behavior, issue link and pass/fail. Test keyboard-only navigation and reduced-motion mode as well as pointer interaction. A passing build alone is not visual or accessibility certification.

For the public website, inspect the existing `#continuity-v2` section and both scoped-pilot and PR links. Do not imply that the Continuity app is publicly downloadable or that it can approve payments. For the separate app, test invalid JSON, missing account evidence, RPC failures and unavailable reserve data; these must never produce GO.

### Release rule

**No production deployment or institutional transaction-gate claim** until all required security, evidence, desktop packaging and QA gates are independently confirmed. This checklist is intentionally separate from the automated CI result.

## Separate desktop scaffold (experimental)

Run `npm run continuity:desktop:check` to verify the desktop configuration, then on a Mac with Rust and Tauri system prerequisites installed run `npm run continuity:tauri:dev`. An experimental DMG build can be attempted with `npm run continuity:tauri:build`.

The scaffold has a separate application identifier (`app.noshashi.continuity`), no custom native commands, no updater, no custody or signing capabilities, and no access to the original app's privileged plugins. It uses the shared NOSHASHI icon assets as a temporary development measure. It is **not** a signed, notarized, tested, or supported macOS release.

**Before distributing:** verify the dedicated Rust project builds on Intel macOS, ensure the production webview resolves `continuity/index.html`, confirm WebSocket connectivity under the production CSP, test installation and uninstall, replace temporary icon references with a dedicated packaged asset set, perform security review, then sign/notarize/staple and test on a clean Mac. Never treat a passing static config check as evidence of native packaging.

### Intel macOS CI validation

The manual GitHub Actions workflow `.github/workflows/continuity-macos-validation.yml` attempts a native Intel macOS compile **without bundling or distributing** the application. A maintainer must run it using Actions → Continuity macOS validation → Run workflow, selecting this feature branch. Inspect its complete logs before treating compilation as verified. This is distinct from the ordinary Linux Continuity checks and cannot establish physical-device installation, notarization, signing, runtime network connectivity or production security readiness.
