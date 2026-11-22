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
