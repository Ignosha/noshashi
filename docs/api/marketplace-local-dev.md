# NOSHASHI Marketplace — local synthetic API playground

Status: DEVELOPMENT ONLY. This is not a deployed API and does not query XRPL.

## Start
From the repository root (Node 18+):

```sh
node --test scripts/marketplace-dev.test.mjs
node scripts/marketplace-dev.mjs
```

Visit http://127.0.0.1:1441/marketplace/ and use the Transaction Autopsy fixture form.

The local server listens on `127.0.0.1` only. The fixed fixture hash is 64 capital `A` characters; its outcome is synthetic `tecNO_DST`. Any other valid hash returns UNKNOWN. Every response contains `simulated: true` and `evidenceSource: "synthetic-fixture"`. The form does not issue a real ledger request.

## Example local call
```sh
curl -sS http://127.0.0.1:1441/v1/xrpl/transactions/autopsy \
  -H 'Content-Type: application/json' \
  -d '{"network":"xrpl-mainnet","hash":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'
```

## Distinction between development pieces
- `scripts/marketplace-dev.mjs`: synthetic local HTTP playground, no real ledger reads.
- `src/lib/continuity/autopsy-lookup.ts`: read-only XRPL RPC adapter, not exposed as a hosted endpoint.
- `src/lib/continuity/autopsy.ts`: deterministic normalization of supplied RPC evidence.
- `docs/api/openapi-autopsy.yaml`: future hosted API proposal; does not imply endpoint availability.
- `site/marketplace/index.html`: concept catalog and local demo form.

## Before a real API
1. Verify actual XRPL `tx` response shapes and transaction identity/validation/ledger provenance independently, including metadata formats, failure codes and pruned or unavailable history.
2. Add a server-side read-only XRPL adapter with explicit network timeouts, upstream failover and bounded concurrency. Never expose an unauthenticated arbitrary RPC proxy.
3. Validate requests and responses against the versioned OpenAPI schema; implement authentication, tenant isolation, rate limits, request IDs and observability.
4. Add integration fixtures, end-to-end browser tests, security review and operational runbooks.
5. Add keys, billing and production deployment only after explicit approval and release gates.

No production authorization, signing, custody integration, deployment or billing is implemented.

## Local real-ledger Autopsy research gateway (separate port; never public)

This component is opt-in, read-only, single-secret, bound to loopback and NOT a multi-tenant production service. No developer portal or browser JavaScript receives its bearer secret. There is no automatic signing/submission, custody access, public exposure, billing or real account API key.

```sh
# Use a random local secret of at least 32 characters, never commit it.
export NOSHASHI_AUTOPSY_LOCAL_KEY="$(node -p 'require("crypto").randomBytes(32).toString("hex")')"
node scripts/autopsy-gateway.mjs
# In another terminal with the same env value:
curl -sS http://127.0.0.1:1442/v1/xrpl/transactions/autopsy \
  -H "Authorization: Bearer $NOSHASHI_AUTOPSY_LOCAL_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"network":"xrpl-mainnet","hash":"C53ECF838647FA5A4C780377025FEC7999AB4182590510CA461444B207AB74A9"}'
```

The gateway queries only the two configured HTTPS XRPL mainnet RPC operators (InFTF and Honeycluster). It requires agreement on transaction hash, validated status, ledger index, ledger hash, and result code; one unavailable provider or a disagreement produces UNKNOWN, not an invented failed/success outcome. Two consistent RPC operators are NOT a cryptographic proof of consensus. Network resources may be rate-limited, unavailable or missing old transactions.

```sh
node --test scripts/marketplace-dev.test.mjs scripts/autopsy-gateway.test.mjs
node scripts/autopsy-live-smoke.mjs
```

The final command is a network-dependent historical mainnet check using the example documented at https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/tx. If either public RPC provider is unavailable it should fail, and this is a *release blocker* until the cause is investigated. Never replace UNKNOWN with SUCCESS to make CI green.

### Production gate (not implemented)
Multi-tenant identity, scoped key issuance/rotation, persistent distributed quotas, secure audit logging, incident response, telemetry/SLOs, full-history provider contract, threat modeling, security test, staging rollout, institutional/legal signoff, and pilot-measured ROI are required before enterprise sales claims or exposing a public gateway. See docs/institutional-sales-package.md.
