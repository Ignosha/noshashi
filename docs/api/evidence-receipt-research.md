# Evidence Receipt — local research digest (NOT a signed receipt)
Status: deterministic prototype. Implementation: scripts/evidence-receipt.mjs. Tests: scripts/evidence-receipt.test.mjs.

This research format accepts only a non-simulated VERIFIED_FACT Autopsy report with validated=true, a pinned ledger index/hash, and two named corroborating RPC sources. It canonicalizes JSON by sorting keys and records a SHA-256 digest. The verifier detects local modifications to the receipt's evidence. It cannot prove that an issuer, institution, RPC provider or NOSHASHI actually authored the evidence. Any attacker who can replace both evidence and digest can create a different internally consistent unsigned receipt.

The receipt always declares signed=false and independentlyAuthenticated=false. It must never be called cryptographically signed, notarized, immutable, legally sufficient, or independently verified. UNKNOWN, simulated, and unvalidated inputs are rejected.

To build a commercial Evidence Receipt API, add authenticated actor/tenant provenance, verifiable asymmetric signatures with key rotation, replay/expiry and policy-version binding, durable append-only audit storage, canonical schema/version evolution, external verification tool, revocation handling, source attestation, signed ledger evidence, privacy/retention controls, legal review, security testing, and independent audit.

No API endpoint, signing key, billing or production storage is enabled by this prototype.
