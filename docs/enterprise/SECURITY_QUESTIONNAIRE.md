# Security questionnaire — truthful draft answers

| Buyer question | Current answer / evidence |
|---|---|
| Are you SOC 2 or ISO 27001 certified? | No certification or independent report is established. See existing [SOC 2 readiness register](../soc2/README.md). |
| Do you support enterprise SSO? | Not validated/available as a working enterprise integration. OIDC-first plan only; no SAML claim. |
| Is access server-authorized? | Organization RLS, service-only RPCs and role/four-eyes controls exist. Scoped SQL and HTTP fixture tests are recorded; a complete deployed access assessment remains open. |
| Is MFA mandatory? | Enrollment exists. Draft privileged checks require enrolled MFA to be satisfied; this is not mandatory organization-wide enrollment or a tested IdP policy. |
| Is evidence immutable or signed? | No independent immutability or digital-signature guarantee. Canonical hashes and application-role append restrictions detect/prevent specified mutations. Database owners remain trusted. |
| Do you custody keys or funds? | The evaluated public evidence workflows require no wallet keys or real funds. Verify any separate write-capable feature before including it in a customer scope. |
| Are payment details stored? | Checkout uses Stripe-hosted collection. This implementation stores provider references/access state, not card numbers; no PCI certification assertion is made. |
| Are backups tested? | Latest backup reports success; latest restore job failed before restore. Recovery remains unverified. |
| Are macOS installers signed/notarized? | Not established. Current v1.0.27 release notes explicitly do not claim Developer ID/notarization. Updater signatures are separate. |
| Are all environments supported? | Source/release targets exist; physical Intel Monterey and customer-environment validation remain required. |
| Do you offer an uptime/security SLA? | No verified operational SLA or service-credit commitment is offered by this engineering work. |
| Has an independent penetration test been completed? | Not established. Tests here are engineering checks, not an independent assessment. |

SOC 2 control gap mapping (planning, not audit evidence):

| Control area | Available technical evidence | Remaining gap / owner |
|---|---|---|
| CC6 logical access | RLS, roles, MFA gates, negative tests | Identity enrollment/offboarding and access reviews; security owner |
| CC7 monitoring/incident handling | Runtime logs, CI, incident runbook | Alert delivery, on-call ownership, incident drill; operations owner |
| CC8 change management | Reviewed branches, CI, explicit merge/deploy approval | Enforced branch/ruleset review and emergency change records; repository owner |
| CC9 risk/vendor management | Threat model, supplier-boundary inventory | Formal risk acceptance and supplier reviews; founder/legal |
| A1 availability/recovery | Encrypted backup and restore-test workflow | Successful supervised recovery with measured objectives; operations owner |
| Confidentiality/privacy | Data-class register, scoped storage, secret handling | Retention/deletion agreement and legal review; privacy/legal owner |

Do not replace open gaps with marketing assurances. Attach dated evidence and specify the exact evaluated product/version/scope for each procurement answer.
