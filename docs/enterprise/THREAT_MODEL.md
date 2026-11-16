# Threat model — engineering draft

Assets: credentials/session tokens; tenant policies and evidence; billing/access state; native keyring contents; release/update trust roots; source/CI; customer and contact metadata.

Trust boundaries: public browser → Vercel/Edge → Auth → service-role RPC/database; desktop webview → restricted native commands → OS keyring/network/files; public XRPL providers → untrusted source readings; Stripe → signature-checked webhook; repository/CI → signed release artifacts. External news, emails and AI output are untrusted data, never approval or policy authority.

| Threat | Existing/draft mitigation | Residual verification |
|---|---|---|
| Cross-tenant object access | RLS, scoped RPCs, verified actor; new real SQL denial tests | Complete production catalog and every export/key/support route need assessment |
| First-factor session used for privileged changes | Draft enrolled-MFA gate before policy/exception/portal work | Mandatory enrollment, reauthentication freshness and revocation E2E |
| Approval replay / concurrent decisions | Row locks, four-eyes guards, status/version checks; actual concurrent SQL test | Different-policy-version races and all operational actor-removal races |
| Unsupported exception reuse | Draft current-approval/receipt binding; expired/unrelated/tampered evidence tests | Owner acceptance of legacy-renewal behavior and production validation |
| Billing replay / partial persistence | Signed events, durable checkout reservation and risk holds; separate fulfillment hardening | Full lifecycle ordering, refunds, disputes and live reconciliation remain gated |
| Untrusted node / stale liquidity | Validated references, provider agreement, explicit unavailable/stale states | Live outages, load, disagreement and ingestion continuity in realistic environment |
| Credential or evidence leak | Server-only secrets, native keyring, CSP, draft redacted errors and focused scan | History scanning, native IPC review, external assessment and telemetry review |
| Native file/URL misuse | Filename and target restrictions, fixed/pinned hosts | Symlink/overwrite semantics, OS permissions and physical-device tests |
| Supply-chain / malicious update | Locked native dependencies, updater public key, CI and release checks | Independent artifact/signing verification; branch protections and secret owners |
| Backup loss / undecryptable restore | Encrypted scheduled dump and restore-test workflow | Last restore run failed before restoring; a successful backup is not recovery proof |
| Administrator misuse | Change review, application-role audit restrictions | Database owners can alter controls; no independent WORM guarantee |

Assumptions requiring owner confirmation: identity-provider configuration, service-role access ownership, CI secret protections, approved signers, production regional/network controls, alert routing and customer data rules. Do not publish exploit reproduction details or customer records; retain sensitive findings privately and coordinate remediation with the owner.
