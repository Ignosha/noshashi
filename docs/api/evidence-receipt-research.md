# Research evidence receipts and detached attestations
Status: deterministic prototype. Implementation: scripts/evidence-receipt.mjs. Tests: scripts/evidence-receipt.test.mjs.

This research format accepts only a non-simulated VERIFIED_FACT Autopsy report with validated=true, a pinned ledger index/hash, and two named corroborating RPC sources. It canonicalizes JSON by sorting keys and records a SHA-256 digest. The verifier detects local modifications to the receipt's evidence. It cannot prove that an issuer, institution, RPC provider or NOSHASHI actually authored the evidence. Any attacker who can replace both evidence and digest can create a different internally consistent unsigned receipt.

The digest receipt declares signed=false and independentlyAuthenticated=false. It must never be called cryptographically signed, notarized, immutable, legally sufficient, or independently verified. UNKNOWN, simulated, and unvalidated inputs are rejected.

A local case reviewer can opt in by passing an Ed25519 private `KeyObject` as the server-side `attestationKey` option. The case response includes a detached `evidenceAttestation`. The underlying receipt retains its original format. Invalid signing configuration keeps the case on HOLD and returns `EVIDENCE_ATTESTATION_UNAVAILABLE`.

Call `verifyEvidenceAttestation(receipt, evidenceAttestation, trustedPublicKey)` with the expected Ed25519 public `KeyObject` obtained independently. The envelope's `keyId` is the lowercase SHA-256 fingerprint of the DER-encoded SPKI public key. The signature is unpadded base64url over UTF-8 canonical JSON containing the schema, algorithm, key ID and evidence digest. The verifier reapplies receipt eligibility, checks the digest and requires a signature from the expected key.

For a successful issued-asset payment with corroborated and transaction-bound controls, the composed reviewer also emits a separate `controlAttestation`. Call `verifyControlEvidenceAttestation(receipt, controls, controlAttestation, trustedPublicKey)`. This signature uses the same envelope layout with schema `noshashi.control-attestation.research.v0`. The signed digest is SHA-256 over canonical JSON containing `transactionDigest` and `controls`. Changes to either invalidate it. Transaction and control signatures are not interchangeable.

The attestation covers the transaction report. The separate control attestation binds the observed flags and provider diagnostics to the transaction receipt. Caller-supplied approvals, current policy, case verdict, tenant identity and event time remain outside both statements. The local tests and live smoke use ephemeral keys. A commercial implementation still requires managed key custody, rotation and revocation, actor and tenant binding, replay controls, durable append-only persistence, retention controls and independent review.

No API endpoint, signing key, billing or production storage is enabled by this prototype.

## Control flag consistency

Control attestation creation and verification require explicit boolean summary
flags that match their attached observations: destination tag requirement,
issuer global freeze and RequireAuth, and trust-line freeze and authorization.
The derived authorization condition must equal
`!issuerRequireAuth || trustLineAuthorized`. Missing or contradictory flags fail
with `INCONSISTENT_CONTROL_EVIDENCE` during signing, and verification returns
false. This validates internal consistency; provider corroboration and signer
trust remain separate requirements. Regression coverage exercises missing,
null, string and opposite values for each of the six summary fields.

Control attestation creation and verification require a current `noshashi.xrpl.trustline.corroborated.v1` observation. The older interpretation could mistake an owner reserve flag for issuer authorization. Legacy control attachments retain only the interpreted flags, so regenerate them from the pinned RippleState evidence before signing. Transaction-only receipts and attestations remain verifiable under their original rules.

## Deep-freeze consistency

The control attestation also requires `issuerDeepFrozen` and `holderDeepFrozen`
to be explicit booleans matching the attached corroborated trust-line
observation. Missing, malformed, or contradictory deep-freeze flags prevent
signing and make verification return false, including when the supplied
signature is cryptographically valid. Existing receipts without these fields
must be regenerated from complete corroborated evidence before control
attestation verification can succeed. All four matching boolean combinations
remain eligible for an evidence attestation; a signature records evidence and
does not grant payment permission or clear a freeze.

## Sparse-array rejection

Canonical evidence rejects JavaScript arrays with missing elements. Previously,
a one-element sparse array could canonicalize to `[]`, making its digest
indistinguishable from an empty array. Creation now rejects that input and
verification returns false for an altered receipt containing missing elements.
Dense JSON arrays, including explicit `null` elements, retain their existing
encoding. Regression coverage includes leading holes, multiple holes and
receipt substitution without changing the digest.
