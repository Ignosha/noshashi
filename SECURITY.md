# Security posture

How NOSHASHI is built to resist compromise, and — just as importantly —
what is *not* yet hardened. Report anything you find to
**security@noshashi.app**; we ask for coordinated disclosure and reply
within one business day.

## The core principle

The safest data is data we do not hold. Without an account the app has no
server-side state at all: it reads public ledger data, keeps preferences
in a local file, and never identifies you to anything we operate. Signing
in adds exactly the data listed in the privacy policy and nothing more.

## Desktop application

| Control | Implementation |
|---|---|
| Content Security Policy | Strict allow-list. `default-src 'self'`, no `unsafe-eval`, `object-src 'none'`, `frame-src 'none'`, `frame-ancestors 'none'`. Every outbound host is named explicitly. |
| Global Tauri object | `withGlobalTauri: false` — the web view has no ambient bridge to invoke commands. |
| Capabilities | Minimal permission set. The window may show/hide/minimise itself and use notifications, store, autostart, shortcut and positioner. Nothing else. |
| Filesystem | No filesystem plugin. The only write path is one command that refuses path separators, resolves inside `~/Downloads`, and caps output at 64 MB. |
| Shell | No shell plugin. Opening a URL goes through one command that parses the URL and refuses any scheme other than `http`/`https`. |
| Secrets | Held in the macOS Keychain via the `keyring` crate, never in a preferences file, browser storage, or a log. The **compliance API secret** is write-only from the UI and is never read back into the web view. **Model-provider keys** are readable by the front end at call time — the request to the provider is made from the web view, so the key has to reach it — and are scoped one keyring entry per provider so revoking one does not disturb another. Routing those calls through the native layer, so the key never enters the web view at all, is tracked as a known gap below. |
| Fonts | Self-hosted. No font CDN is contacted, so opening the app announces itself to nobody and it works fully offline. |
| Telemetry | None. No analytics, no crash reporting, no advertising identifiers. |

## Authentication

- Passwords are passed straight to Supabase Auth, which hashes them with
  bcrypt server-side. The application never stores, logs, or transforms a
  password.
- Minimum twelve characters with mixed case, a digit and a symbol,
  enforced before the value leaves the field, with a strength meter.
- **TOTP two-factor** (RFC 6238) via authenticator app, and **email
  one-time codes** as an alternative sign-in path.
- Sessions use PKCE and rotating refresh tokens.

## Data isolation

- Row level security is enabled on **every** table. Each policy scopes
  rows to `auth.uid()`, so one account can never read another's.
- `entitlements` and `subscriptions` are **read-only to clients**. They
  are written exclusively by the Stripe webhook using the service role,
  so a tampered client cannot grant itself a paid plan.
- The service-role key exists only inside Edge Functions and is never
  shipped to any client.

## Payments

- No card detail ever reaches this application. Checkout and card
  management both happen on Stripe's own domain.
- The checkout function accepts **only** price IDs on a server-side
  allow-list, so a modified client cannot invent a cheaper plan.
- Seat quantities are clamped server-side (1–500).
- Webhook authenticity is established by verifying the `Stripe-Signature`
  HMAC in constant time, with a five-minute timestamp window that makes a
  captured request useless afterwards.

## API keys

- Generated from the platform CSPRNG (256 bits).
- Stored **only** as a SHA-256 digest. Losing the database leaks no
  working key, and support genuinely cannot recover one.
- Displayed exactly once, at creation.

## The AI agent

- Defaults to a **local** runtime. Prompts containing wallet addresses,
  receipts and rule traces never cross the network boundary.
- Remote providers are opt-in, restricted to a named allow-list in the
  CSP, and **must** be HTTPS — the endpoint validator refuses plaintext
  for anything that is not loopback.
- The interface states plainly, on the screen where you choose, whether
  the selected runtime is local or remote.
- The system prompt forbids the agent from accepting seed phrases, keys
  or passwords, and from issuing verdicts itself.

## Known gaps

Named rather than hidden. Last reviewed 2026-09-29 against the code.

1. **Builds are not code-signed or notarised.** macOS Gatekeeper and
   Windows SmartScreen warn on first launch. Signing needs the company's
   Apple Developer ID (with notarisation) and a Windows code-signing
   certificate; `docs/RELEASE_SIGNING.md` lists exactly what to add. Until
   then each release publishes SHA-256 checksums and updater signatures, and
   the app hashes its own binary (Settings › Binary integrity).
2. **`style-src` still allows `'unsafe-inline'`.** Tailwind and the
   animation layer write inline style attributes. Removing this needs a
   nonce-based build pipeline. Scripts are already `'self'` only.
3. **Supabase Auth's own leaked-password toggle is off.** It is a paid-plan
   setting. Passwords are screened against known breaches by NOSHASHI's own
   hook instead (`noshashi-password`); a breached password is refused.
4. **No independent penetration test or certification** (SOC 2, ISO 27001).
   Controls are documented in `docs/SECURITY_THREAT_MODEL.md`; do a
   penetration test before taking institutional production traffic.
5. **Live posture indicators are not gated on source agreement.** Recorded
   verdicts are (SOURCE_AGREEMENT); the tray, Mission Control and status-rail
   indicators evaluate the rules without it. They carry no receipt.

Closed since the last review: Edge Functions and the Compliance API are
rate limited per key (durable windows in `noshashi.api_rate_windows`); the
Compliance API (`noshashi-verify`) is deployed; hosted-model API keys are
held in the OS keyring and used only by the Rust layer (`model_request`),
never passed through the web view; the web view can no longer toggle
developer tools (`core:webview:allow-internal-toggle-devtools` removed).
