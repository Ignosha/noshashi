# Access control

Authorities: [organization/RLS migration](../../supabase/migrations/20260920190000_organizations_roles_audit.sql), [governance](../../supabase/migrations/20260923210000_governance_policies_exceptions.sql), [reviewer/auditor roles](../../supabase/migrations/20260930120100_reviewer_auditor_signin_audit.sql), [terminal](../../supabase/functions/noshashi-terminal/index.ts).

| Role | Intended boundary implemented in the current model |
|---|---|
| Owner / admin | Organization roster/settings; author policies; second-person approval where permitted |
| Compliance | Policy authoring/review and exceptions; evidence review |
| Reviewer | Second-person activation/exception decisions; no policy authorship or roster administration |
| Analyst / risk | Analysis/cases and permitted draft work; cannot activate policy or decide exceptions |
| Viewer | Read permitted organization data; no approval or case mutation |
| Auditor | Read-only, including audit visibility |
| Regulator | Time-limited read access; feature/expiry restrictions |
| API | Scoped keys; not an interactive owner role |

This is a summary, not a blanket permission grant. Each table/RPC has its own grants and RLS. Source role helpers alone are not authorization. The SQL tests exercise actual roles, tenant read/write denial, service-only activation, requester/approver separation and concurrent decision serialization. They do not prove every deployed table or external integration.

The private terminal obtains the actor from `auth.getUser(token)`, checks assurance and derives access in service-only SQL. Pro personal storage does not grant Institutional team storage. Assigned, current paid contracts and appropriate organization roles are required for team scope. Current-terminal payment/downgrade behavior was exercised in an isolated Stripe sandbox; no production paid grant was made.

Draft policy/exception and billing-portal hardening validates the explicit bearer token with Auth and checks that enrolled MFA is satisfied before database work. Missing/indeterminate assurance fails closed. AAL1 remains supported for accounts without an enrolled verified factor; this is not mandatory organization-wide MFA enrollment. Owners must define enrollment/reauthentication and break-glass policy before an enterprise launch.

Protected/special entry-point inventory:

| Surface | Authority / review limitation |
|---|---|
| `noshashi-terminal`, `noshashi-payment-review` | User session, MFA, service-only storage RPCs / account-scoped reads |
| `noshashi-policy-activate`, `noshashi-exception-decide` | User session, draft MFA gate, transactional role/four-eyes guards |
| `noshashi-checkout`, `noshashi-portal` | User/account billing paths; portal source recovered for review; checkout-wide MFA consistency remains a follow-up |
| `noshashi-stripe-webhook` | Raw-body Stripe HMAC + bounded timestamp; no gateway user JWT; persistence/replay hardening reviewed separately |
| `noshashi-verify` | Hashed/scoped API key, entitlement and durable rate/quota checks; public evidence does not confer paid rights |
| `noshashi-password` | Intentionally public pre-signup screening; bounded input/provider timeout added in draft; no password logging |
| `noshashi-support-notify` | Authenticated caller and support-record scope; operational delivery requires separate validation |
| `noshashi-xrpl-watch` | Scoped organization key or scheduler-token RPC, bounded work |
| `noshashi-ledger-registry`, `noshashi-issuer-alerts`, `noshashi-evidence-report` | Public read/verify routes where defined; scheduled mutation uses private token/RPC, not email instructions |
| `noshashi-return` | Static billing-return information; grants nothing; recovered source; canonical emblem and truthful return-state wording |
| Public `api/*.js` | Read-only research or explicitly public contact/subscription/checkout paths; input/rate controls, not organization-admin APIs |
| Native Tauri bridge | Bundled-window IPC, CSP, target/path checks and native keyring; physical platform verification outstanding |

Offboarding checklist (owner/administrator): remove or expire memberships; revoke account/API credentials and relevant Auth sessions; remove support/device grants; review scheduled hooks and cached/local exports; reconcile Stripe/contract access independently; append an audit record; prove subsequent account/key access is denied. Access-token lifetime and Auth revocation behavior must be measured against the actual provider, not inferred from a mocked refusal.
