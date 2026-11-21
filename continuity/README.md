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
No deployment or desktop packaging is configured by these commands.

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
