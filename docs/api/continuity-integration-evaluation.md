# Continuity read-only integration evaluation

Dfns and EXFIL are potential future collaborators. The runnable evaluation uses local, simulated observations. It has no external account, provider API endpoint, SDK, subscription, or deployment. Both adapters expose a read method. They consume references and public ledger identifiers. Signing and execution stay with the wallet and its operator.

## Contracts

The [evaluation module](../../src/lib/continuity/integration-evaluation.ts) defines the request, adapter, observation and receipt types. The evaluator accepts parsed JSON and rejects missing or unknown request fields before calling an adapter. The host supplies an evaluation clock and a maximum observation age between 1 millisecond and seven days. An observation must be dated at or before the evaluation time, within this age limit, and before its exclusive expiration time.

| Field group | Validation and evidence meaning |
| --- | --- |
| Scope | Case-sensitive `tenantId`, `network`, and wallet-intent reference or classic XRPL address. IDs are opaque ASCII references bounded at 128 characters. XRPL addresses must pass the classic-address checksum. Network support is limited to `xrpl-mainnet`. |
| Wallet request | `schema`, `walletIntentRef`, `intent`, `policyHash`, `ledgerHash`, and `prior`. The existing intent commitment covers tenant, source, destination, tag, asset, exact amount and payload digest. XRP uses drops. Issued assets use exact decimal strings, a standard three-character or 40-hex currency code and an issuer. |
| Wallet observation | `tenantId`, `network`, `walletIntentRef`, `intentHash`, nullable `transactionHash`, and `provenance`. Scope and intent digest must match. A resulting transaction hash is provider-reported and requires independent reconciliation. |
| Prior context | Null, or `intentHash`, `policyHash`, `ledgerHash`, `expiresAtMs`. Differences yield `CHANGED`. A matching expired baseline yields `EXPIRED`. Missing context yields `UNKNOWN`. A host resolves and verifies the prior tenant-scoped record separately. |
| Threat request | `schema`, `tenantId`, `network`, `address`. Use approved public subjects in this evaluation. |
| Threat observation | Scope, `provenance` and up to 32 indicators with unique IDs. Each indicator supplies `id`, `network`, `address`, `kind`, `disposition`, and `provenance`. Supported kinds are `SUSPICIOUS_DESTINATION`, `COUNTERPARTY_INCIDENT`, and `OPERATIONAL_ALERT`. |
| Provenance | `provider`, `sourceRef`, `observedAtMs`, `expiresAtMs`. Use opaque references and keep URLs, free text, credentials and case details outside these fields. Provider labels are attributed assertions. |
| Output | Versioned schema, mode (`SIMULATED` or `EXTERNAL`), exact scope, clock and freshness configuration, `review: "HOLD"`, reason codes and the relevant wallet binding/drift or threat observation. `UNKNOWN` covers missing, invalid, stale or mismatched evidence. The receipt carries the record and its canonical, domain-separated `sha256`. |

A current indicator has fresh provenance and a provider-reported disposition of `UNREVIEWED`. `DISPUTED` and `DISMISSED` reports retain their labels in the record. A stale indicator can appear as historical context under a fresh observation envelope. A feed with no current indicators returns `UNKNOWN` and stays on `HOLD`. Rejected batches are withheld. Analysts retain responsibility for findings about suspicious addresses.

Verify the digest by recomputing it with the module's `evaluationDigest`. It covers the exact record and needs independent trust in the expected digest. The evaluation issues no attestation, authorization, provider authentication or evidence of XRPL execution.

## Dfns evaluation

1. Keep credentials, approvals and execution with the wallet operator. Construct the fixture intent from payment fields and compute its hash with `hashContinuityIntent`.
2. Compare a wallet reference with the adapter observation. The fixture specifies a policy hash and a ledger hash. A production host would independently verify ledger state and applicable policy and compare trusted approval context.
3. Change the amount, destination, destination tag, signing payload digest, policy hash, or ledger hash. The approval context changes and the review stays on `HOLD`.
4. If an adapter reports a transaction hash after a wallet-controlled payment, use the separate Autopsy API on PR #209 to read validated public XRPL evidence. Reconcile destination, tag where supplied, exact asset and delivered amount against the original intent. Resolve missing or conflicting reads before relying on the result. [Autopsy API contract](https://github.com/Ignosha/noshashi/blob/8a9954bd381c3bc9c94b0139363653dfdd931212/docs/api/openapi-autopsy.yaml)

## EXFIL evaluation

1. Resolve an approved tenant and XRPL address. Ask the adapter for the exact scope. Preserve report and indicator provenance.
2. Feed a synthetic report, change its tenant or subject, expire it, duplicate an indicator, or mark an indicator `DISPUTED` or `DISMISSED`. Inspect the receipt and review reasons.
3. In a future authorized evaluation, keep separate records for pinned public chain observations, external provider reports and analyst conclusions. Preserve dismissals, disputes, source and expiration in incident history. Correlate on exact network, subject and time windows. Retain external intelligence and analyst notes within the tenant's authorized controls.

## Sample payloads

All data below is simulated. XRPL addresses are public identifiers. Repeated hex values and the resulting transaction reference are synthetic. Clock values are fixed for reproducible tests.

<details>
<summary>Wallet request</summary>

```json
{
  "schema": "noshashi.continuity.wallet-evaluation.v1",
  "walletIntentRef": "fixture-wallet-01",
  "intent": {
    "schema": "noshashi.continuity.intent.v1",
    "tenantId": "synthetic-tenant-01",
    "network": "xrpl-mainnet",
    "requestId": "synthetic-request-01",
    "transactionType": "Payment",
    "sourceAccount": "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY",
    "destinationAccount": "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
    "asset": {
      "currency": "XRP",
      "issuer": null
    },
    "amount": "1000000",
    "destinationTag": 0,
    "lastLedgerSequence": 108000100,
    "signingPayloadSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "policyHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "ledgerHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "prior": {
    "intentHash": "45cc0854c476588810090fb50191ee11cd2f82688e69bcb3ec31180d76c49af0",
    "policyHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "ledgerHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "expiresAtMs": 10500
  }
}
```

</details>

<details>
<summary>Wallet receipt</summary>

```json
{
  "record": {
    "schema": "noshashi.continuity.wallet-evaluation.v1",
    "mode": "SIMULATED",
    "review": "HOLD",
    "evaluatedAtMs": 10000,
    "maxEvidenceAgeMs": 1000,
    "scope": {
      "tenantId": "synthetic-tenant-01",
      "network": "xrpl-mainnet",
      "walletIntentRef": "fixture-wallet-01"
    },
    "binding": {
      "intentHash": "45cc0854c476588810090fb50191ee11cd2f82688e69bcb3ec31180d76c49af0",
      "policyHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "ledgerHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    },
    "prior": {
      "intentHash": "45cc0854c476588810090fb50191ee11cd2f82688e69bcb3ec31180d76c49af0",
      "policyHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "ledgerHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "expiresAtMs": 10500
    },
    "approvalDrift": "UNCHANGED",
    "providerObservation": "MATCHED",
    "observation": {
      "tenantId": "synthetic-tenant-01",
      "network": "xrpl-mainnet",
      "walletIntentRef": "fixture-wallet-01",
      "intentHash": "45cc0854c476588810090fb50191ee11cd2f82688e69bcb3ec31180d76c49af0",
      "transactionHash": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      "provenance": {
        "provider": "synthetic-source",
        "sourceRef": "fixture-observation-01",
        "observedAtMs": 9900,
        "expiresAtMs": 11000
      }
    },
    "reasons": []
  },
  "sha256": "37c5403ec315389fbd7daec6da61f4026b4f6d98db4f3e0b2bf0feff7e6e8f2f"
}
```

</details>

<details>
<summary>Threat request</summary>

```json
{
  "schema": "noshashi.continuity.threat-evaluation.v1",
  "tenantId": "synthetic-tenant-01",
  "network": "xrpl-mainnet",
  "address": "rrrrrrrrrrrrrrrrrrrrrhoLvTp"
}
```

</details>

<details>
<summary>Threat receipt</summary>

```json
{
  "record": {
    "schema": "noshashi.continuity.threat-evaluation.v1",
    "mode": "SIMULATED",
    "review": "HOLD",
    "evaluatedAtMs": 10000,
    "maxEvidenceAgeMs": 1000,
    "scope": {
      "tenantId": "synthetic-tenant-01",
      "network": "xrpl-mainnet",
      "address": "rrrrrrrrrrrrrrrrrrrrrhoLvTp"
    },
    "providerObservation": "INDICATORS_REPORTED",
    "observation": {
      "tenantId": "synthetic-tenant-01",
      "network": "xrpl-mainnet",
      "address": "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
      "provenance": {
        "provider": "synthetic-source",
        "sourceRef": "fixture-observation-01",
        "observedAtMs": 9900,
        "expiresAtMs": 11000
      },
      "indicators": [
        {
          "id": "fixture-alert-01",
          "network": "xrpl-mainnet",
          "address": "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
          "kind": "OPERATIONAL_ALERT",
          "disposition": "UNREVIEWED",
          "provenance": {
            "provider": "synthetic-source",
            "sourceRef": "fixture-observation-01",
            "observedAtMs": 9900,
            "expiresAtMs": 11000
          }
        }
      ]
    },
    "reasons": [
      "INDICATOR_REQUIRES_REVIEW"
    ]
  },
  "sha256": "4ae6f00db1ebcaf12e6d9a60b730c8e304263bd9d03a807eb66e8f1518e9e904"
}
```

</details>

## Reproduce and evaluate

Run from the repository root:

    npm run continuity:check
    npm run continuity:test

The [contract tests](../../src/lib/continuity/integration-evaluation.test.ts) cover digest recomputation, intent and approval drift, reported transaction references, scope mismatches, provenance freshness, invalid input, missing data, provider errors and disputed or dismissed observations.

An external evaluation requires approved scope before outreach or provisioning. A host must resolve tenant identity from authenticated context, verify access to the selected wallet or indicator, resolve trusted providers and approvals, enforce input sizing and adapter timeouts, and review retention, redaction and audit controls. Ledger corroboration, actual policy checks and institutional case retention need their own acceptance tests. Provider-specific response mapping, external alert delivery and additional networks remain future work.
