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
