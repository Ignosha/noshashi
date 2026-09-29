# Security threat model

Last reviewed 2026-09-29 against the code on `main`. Update this file when a
trust boundary, a data flow or a component changes. Every mitigation named
here points at code that exists; where a control is missing it is listed
under residual risks, not implied.

## 1. What NOSHASHI is, for this model

- A **desktop app** (Tauri 2: Rust shell, React web view) for macOS,
  Windows and Linux. It reads XRPL mainnet over WebSockets to public
  servers, evaluates deterministic rules, and records verdicts with SHA-256
  receipts on the operator's machine.
- A **server** (Supabase project, schema `noshashi`): Postgres with
  row-level security, eleven Edge Functions, pg_cron jobs.
- A **website and Vercel functions** (`site/`, `api/`): marketing, docs,
  checkout, contact.

NOSHASHI **only reads** the ledger. It has no code path that signs or
submits a transaction and never asks for a secret key (checked by
`src/lib/trust/__tests__/boundary.test.ts`: no wallet or key-pair library
is imported by any covered file).

## 2. Assets

| Asset | Where | Why it matters |
|---|---|---|
| Recorded verdicts and receipts | Local store on the device; shared org investigations and exceptions in Postgres | Evidence an institution may rely on; tampering must be detectable |
| Institutional policies (versions, hashes) | Local store; `noshashi.org_policies` | Decide verdicts; an unauthorized change changes outcomes |
| Exceptions and their decisions | `noshashi.policy_exceptions`, notes | A person's override; must be four-eyes and auditable |
| Audit log | `noshashi.audit_log` | Accountability for every administrative action |
| Accounts, org membership, roles | Supabase Auth, `noshashi.organization_members` | Who may do what |
| API keys (Compliance API) | Hashed in Postgres; secret shown once | Access to paid verification |
| Hosted-model API keys (user's own) | OS keychain via Rust (`keyring`) | Third-party spend and data |
| Billing state and entitlements | Stripe; `noshashi.org_entitlements` | Access to paid features |
| Release artifacts and updater signatures | GitHub Releases; updater public key in `tauri.conf.json` | A tampered update would run on users' machines |

## 3. Threat actors

- **Opportunistic attacker on the internet**: scans the website, API and
  Edge Functions; credential stuffing; abuse of free endpoints.
- **Malicious or compromised organization member**: tries to activate their
  own policy, approve their own exception, or edit records after the fact.
- **Malicious XRPL data source**: a public server returning wrong or stale
  ledger state, deliberately or by fault.
- **Prompt-injection content**: text in ledger memos, domains or web pages
  that an AI model reads and might follow.
- **Supply-chain attacker**: a compromised npm, crates.io or GitHub Actions
  dependency, or a tampered release download.
- **Local attacker with access to the device**: reads or edits the local
  store.

## 4. Attack surfaces and trust boundaries

1. **Web view ↔ Rust** (Tauri IPC). Capabilities in
   `src-tauri/capabilities/default.json` are an allowlist: window control,
   notifications, store, autostart, global shortcut, positioner, updater,
   process restart. No shell, no arbitrary filesystem access. File export
   goes through `export_text_file` / `export_binary_file`, which refuse any
   name with a separator, drive prefix or control character and write only
   to the Downloads folder, capped at 64 MB.
2. **App ↔ XRPL public servers** (WebSocket, TLS). Untrusted data.
3. **App ↔ Supabase** (HTTPS with the user's JWT). Authorization is enforced
   in the database (RLS) and in Edge Functions, never in the client.
4. **App ↔ hosted model provider** (optional, user's own key, via Rust).
5. **Browser ↔ website / Vercel functions**.
6. **Stripe → webhook**, **NOSHASHI → customer webhooks**.
7. **GitHub Actions → release artifacts → updater**.

## 5. Threat scenarios and mitigations

| # | Scenario | Mitigation in place |
|---|---|---|
| T1 | A public XRPL server returns wrong or stale state, producing a false GO | Before a verdict is recorded, every public node is asked for the ledger hash and the account state at the same validated ledger (`src/lib/net/agreement.ts`); disagreement, a single answering node, or state that moved withholds GO. Reads are pinned to validated ledgers (enforced by a test). |
| T2 | A stored receipt or verdict is edited after the fact | The receipt is SHA-256 over a canonical body including every rule result and the policy hash; re-verification recomputes it; replay re-reads the ledger at the receipt's index and diffs rule by rule. Edits are detected, not prevented, on a local device. |
| T3 | A member activates a policy they wrote, or approves their own exception | Database constraints and triggers enforce author ≠ activator and requester ≠ decider; activation and decisions run only through service-role functions that re-check role and membership in one transaction. |
| T4 | Audit records are altered or deleted | `noshashi.audit_log` has a trigger refusing UPDATE and DELETE; writes happen inside the same security-definer functions that change state. |
| T5 | Cross-organization data access | RLS on every `noshashi` table; non-members receive NOT_FOUND rather than a permission hint. |
| T6 | Forged Stripe events grant a paid plan | `noshashi-stripe-webhook` verifies the `Stripe-Signature` HMAC with a timing-safe compare before reading the event; entitlements are written server-side only. |
| T7 | Forged NOSHASHI webhooks to a customer | Deliveries are signed HMAC-SHA256 over timestamp and payload (`X-Noshashi-Signature: t=…,v1=…`) with a per-endpoint secret. |
| T8 | API abuse or credential stuffing on the Compliance API | Keys are hashed at rest; durable per-key, tier-aware rate limits (`noshashi.api_rate_windows`); every key lifecycle event is audited. |
| T9 | Breached passwords | `noshashi-password` screens against known breaches; TOTP second factor available. |
| T10 | XSS in the web view reaches Rust or exfiltrates data | CSP: `script-src 'self'`, `connect-src` limited to named XRPL servers, the project's Supabase host and local model ports, `object-src`/`frame-src 'none'`. Developer tools cannot be toggled from the web view. Reports HTML-escape every recorded value (tested). |
| T11 | Prompt injection makes the assistant state false figures or take actions | The assistant has read-only tools, never decides a verdict and never signs; its answers list the readings they rest on, and the deterministic engine is stated to be authoritative. |
| T12 | Hosted-model API key stolen from the web view | Keys are stored in the OS keychain and used only in Rust (`model_request`); the web view never receives them. |
| T13 | Tampered update | The Tauri updater verifies each update against the public key in `tauri.conf.json` before installing; releases publish SHA-256 checksums. |
| T14 | Throttling by public servers denies service | Requests are paced (at most four in flight), throttled replies cool down and retry, and repeated throttling moves to another server (`src/lib/xrpl/pacer.ts`). |

## 6. Residual risks

- **Unsigned builds** (macOS notarisation, Windows Authenticode): users can be
  trained to click through OS warnings. Needs the owner's certificates.
- **Local store is not encrypted at rest** beyond the OS account's own
  protection. A local attacker can read or edit it; edits are detectable
  (T2) but not preventable.
- **Public XRPL servers are the only data sources.** Agreement between them
  reduces, but does not remove, the risk of a shared upstream fault.
- **`style-src 'unsafe-inline'`** remains in the CSP.
- **No penetration test, no SOC 2 or ISO 27001.**
- **Live posture indicators** (tray, Mission Control) are not gated on
  source agreement; recorded verdicts are.
- **Dependency supply chain**: `npm audit --omit=dev` is clean as of this
  review; no SBOM or dependency pinning policy beyond lockfiles.

## 7. Out of scope

- Compromise of the user's operating system or hardware.
- Compromise of Supabase, Vercel, GitHub or Stripe themselves.
- Correctness of the XRP Ledger protocol and its validators.
- Legal or regulatory interpretation: NOSHASHI's rules implement an
  institution's configured policy; whether that policy meets a legal
  obligation is the institution's determination.
