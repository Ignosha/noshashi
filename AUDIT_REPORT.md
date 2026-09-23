# Noshashi Codebase Audit Report

**Date:** 2026-09-22  
**Version:** 1.0.5  
**Purpose:** Pre-transformation audit for institutional-grade platform evolution

---

## 1. EXISTING ARCHITECTURE DISCOVERED

### 1.1 Project Structure (Hybrid Multi-App)

```
noshashi/
├── src/                    # Tauri Desktop App (React + TypeScript) - PRIMARY
├── src-tauri/              # Tauri Rust Backend
├── frontend/               # Next.js Marketing Website
├── site/                   # Static Marketing Site (generated)
├── supabase/functions/     # Edge Functions (Stripe, Verification)
├── server.js               # Express Server (Ethereum/Solana/Meme Coin - LEGACY)
├── main.js                 # Electron Main Process (LEGACY)
├── contracts/              # Solidity Contracts
└── scripts/                # Build/Deploy Scripts
```

### 1.2 Primary Product: Tauri Desktop App (src/)

**Framework:** React 18.3 + TypeScript 5.6 + Vite 5.4 + Tauri 2.2  
**Styling:** Tailwind CSS 4.0 + tw-animate-css + Radix UI primitives  
**State:** Custom stores + React Context (Auth, Billing, Appearance)  
**Routing:** Custom scene-based navigation (no React Router)

**Key Directories:**
- `src/components/scenes/` - 30+ scene components (main views)
- `src/components/nova/` - Design system components (40+)
- `src/lib/xrpl/` - XRPL integration (client, types, link)
- `src/lib/policy.ts` - Policy Engine (GO/HOLD/NO-GO)
- `src/lib/billing/` - Billing catalog, entitlements, Stripe integration
- `src/lib/roadmap.ts` - Product roadmap, tiers, capabilities
- `src/lib/agent/` - AI agent (local Ollama integration)

### 1.3 Tauri Backend (src-tauri/)

**Rust Commands (15):**
- Window management: `toggle_tray_window`, `open_console_window`, `set_global_shortcut_enabled`
- Secrets: `store_api_secret`, `has_api_secret`, `clear_api_secret`
- Provider keys: `store_provider_key`, `get_provider_key`, `has_provider_key`, `clear_provider_key`
- Export: `export_text_file` (downloads audit trails)
- External: `open_external` (secure URL opening)
- Integrity: `verify_integrity` (SHA-256 of running binary)
- Updater: `updater_configured`

**Capabilities:** Minimal - core window, notification, store, autostart, global-shortcut, positioner, updater, process

**Security:** Strict CSP, freezePrototype, no unnecessary permissions

### 1.4 XRPL Integration (src/lib/xrpl/)

**WebSocket-based** (no HTTP due to CORS on public rippled)
- Live ledger subscription (`subscribeLedger`)
- Account info, trust lines, credentials (XLS-70)
- Order book & AMM pool analysis (with funded vs listed depth)
- Issuer posture (freeze, clawback, transfer rate, deep freeze)
- Issuer obligations (gateway_balances)
- Server info, wallet transactions

**Key Innovation:** `taker_gets_funded` / `taker_pays_funded` - distinguishes advertised vs executable liquidity

### 1.5 Policy Engine (src/lib/policy.ts)

**Deterministic GO/HOLD/NO-GO/INSUFFICIENT-DATA**
- Pure synchronous evaluation (client + server)
- SHA-256 receipt digests (tamper-evident)
- Checks: account activation, credentials, reserve, spendable, transfer ceiling, domain governance, domain attestation, evidence availability
- Severity: `block` (NO-GO) vs `warn` (HOLD)
- Evidence-unavailable tracking

### 1.6 Billing System

**Tiers (5):**
1. `operator` (FREE) - console, gate, agent, export
2. `desk` (PRO $749/seat/mo) - + portfolios, alerts, receipt_anchoring, authority_certificate, compliance_api (5k/mo)
3. `institution` (INSTITUTIONAL $4k/mo) - + webhooks, regulator_seats, white_label, sla, sso, audit_log, bulk_monitoring, custom_alert_logic (100k/mo)
4. `enterprise` (ENTERPRISE $10k/mo) - contact_sales only
5. `strategic` (STRATEGIC INFRASTRUCTURE $20.85k/mo) - contact_sales only

**Architecture:** Catalog (src) ↔ Webhook (Supabase) parity enforced by tests

### 1.7 Marketing Website

**Two implementations:**
1. **Next.js** (`frontend/`) - Modern, deployed to Vercel
2. **Static Site Generator** (`scripts/build-site.mjs` → `site/`) - Server-rendered, deployed to Cloudflare/Vercel

**Features:** Newsroom, Status, Progress, Certificate, Pricing, Enterprise, Strategic, Developers pages

### 1.8 Legacy/Secondary: Electron + Express (server.js)

**Purpose:** Meme coin trading terminal (Ethereum/Solana)
- Real on-chain deployment + bonding curve simulation
- WebSocket for real-time updates
- SQLite (better-sqlite3) for local data
- **NOT part of XRPL compliance product** - appears to be a different product line

---

## 2. EXISTING FUNCTIONALITY PRESERVED (Must Not Break)

| Feature | Location | Status |
|---------|----------|--------|
| XRPL Live Ledger Stream | `src/lib/xrpl/link.ts`, `client.ts` | ✅ Working |
| GO/HOLD/NO-GO Policy Engine | `src/lib/policy.ts` | ✅ Working |
| SHA-256 Receipt Digests | `src/lib/policy.ts` | ✅ Working |
| Asset Verification (freeze, clawback, etc.) | `src/lib/xrpl/client.ts` | ✅ Working |
| Order Book + AMM Analysis | `src/lib/xrpl/client.ts` | ✅ Working |
| Issuer Posture & Obligations | `src/lib/xrpl/client.ts` | ✅ Working |
| Credential Registry (XLS-70) | `src/lib/xrpl/client.ts` | ✅ Working |
| Permissioned Domains (XLS-80) | `src/lib/policy.ts` | ✅ Working |
| Billing Tiers & Entitlements | `src/lib/billing/catalog.ts` | ✅ Working |
| Stripe Checkout/Webhook | `supabase/functions/` | ✅ Working |
| Local AI Agent (Ollama) | `src/lib/agent/` | ✅ Working |
| Binary Integrity Verification | `src-tauri/src/main.rs` | ✅ Working |
| Menu Bar HUD + Tray | `src-tauri/src/main.rs` | ✅ Working |
| Global Shortcuts | `src-tauri/src/main.rs` | ✅ Working |
| Secure Keyring Storage | `src-tauri/src/main.rs` | ✅ Working |
| Export Audit Trails | `src-tauri/src/main.rs` | ✅ Working |
| Desktop Notifications | Tauri plugins | ✅ Working |
| Auto-updater | Tauri updater plugin | ⚠️ Needs pubkey |
| 30+ Scene Components | `src/components/scenes/` | ✅ Working |
| Design System (Nova) | `src/components/nova/` | ✅ Working |

---

## 3. NEW ARCHITECTURE REQUIREMENTS

### 3.1 Visual Redesign (Phase 1)
- **Aesthetic:** Japanese Zen + NASA Mission Control
- **Dark aerospace primary** with subtle technical elements
- **Floral/garden accents** using `flower.png` as primary icon
- **Bloomberg-style density** with superior hierarchy
- **Typography:** Modern technical sans-serif (Space Grotesk + IBM Plex Mono)

### 3.2 Core Product Modules (Phase 2)

| Module | Status | Notes |
|--------|--------|-------|
| Asset Intelligence | ⚠️ Partial | Has verification, needs unified profile |
| Asset Passports | ❌ Missing | PDF/JSON/CSV export architecture needed |
| Policy Engine | ✅ Core exists | Needs institutional policy config UI |
| Liquidity Intelligence | ✅ Strong | Has executable vs advertised depth |
| Monitoring & Alerts | ❌ Missing | Architecture only |
| Counterparty Profiles | ❌ Missing | Architecture only |
| Institution Profiles | ❌ Missing | Architecture only |

### 3.3 Tier Mapping (Phase 3)

| Feature | Explorer (Free) | Professional | Team | Institution | Enterprise |
|---------|-----------------|--------------|------|-------------|------------|
| Asset Verification | ✅ | ✅ | ✅ | ✅ | ✅ |
| GO/HOLD/NO-GO | ✅ | ✅ | ✅ | ✅ | ✅ |
| Asset Passports | ❌ | ✅ | ✅ | ✅ | ✅ |
| Policy Engine | ❌ | Read-only | ✅ | ✅ | ✅ |
| Liquidity Simulator | ❌ | ✅ | ✅ | ✅ | ✅ |
| Monitoring | ❌ | ❌ | 3 alerts | 50 alerts | Unlimited |
| Counterparty Intel | ❌ | ❌ | ✅ | ✅ | ✅ |
| API Access | ❌ | ❌ | ❌ | 100k/mo | Custom |
| Webhooks | ❌ | ❌ | ❌ | ✅ | ✅ |
| Audit Export | ❌ | CSV | CSV | Signed | Immutable |
| SSO/SCIM | ❌ | ❌ | ❌ | ✅ | ✅ |
| SLA | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## 4. SECURITY IMPROVEMENTS NEEDED

- [ ] Tauri: Review all 15 commands for input validation
- [ ] CSP: Tighten further (remove `'unsafe-inline'` where possible)
- [ ] Keyring: Audit all 3 secret types (compliance, providers, API)
- [ ] IPC: Validate all command inputs on Rust side
- [ ] Environment: No secrets in frontend bundle
- [ ] Supabase: RLS policies on `noshashi` schema tables
- [ ] Stripe: Webhook signature verification (✅ implemented)

---

## 5. FEATURES REQUIRING EXTERNAL SERVICES

| Feature | Service | Status |
|---------|---------|--------|
| Stripe Billing | Stripe | ✅ Configured |
| Supabase Auth/DB | Supabase | ✅ Configured |
| XRPL Nodes | Public rippled | ✅ Working |
| AI Reasoning | Ollama (local) | ✅ Working |
| Email (alerts) | Not configured | ❌ Needs SendGrid/Resend |
| Slack/Teams Webhooks | Not configured | ❌ Needs impl |
| PDF Generation | Not implemented | ❌ Needs pdf-lib or similar |

---

## 6. FEATURES REQUIRING BACKEND INFRASTRUCTURE

| Feature | Infrastructure Needed |
|---------|----------------------|
| Monitoring/Alerts | Background job scheduler, notification queue |
| Historical Intelligence | Time-series DB (TimescaleDB/InfluxDB) |
| Counterparty Attribution | Entity resolution pipeline |
| API Gateway | Rate limiting, auth, versioning |
| Audit Log | Append-only store (Supabase + RLS) |
| Asset Passports (PDF) | PDF generation service |

---

## 7. FEATURES REQUIRING HUMAN/LEGAL REVIEW

- [ ] Terms of Service / Privacy Policy (exist in `site/legal/`)
- [ ] Disclaimer language (exists in `site/legal/disclaimer/`)
- [ ] SLA commitments (marketing claims vs reality)
- [ ] Regulatory positioning (not a custodian, not investment advice)
- [ ] Data retention policies
- [ ] Subprocessor list (Supabase, Stripe, public XRPL nodes)

---

## 8. TRANSFORMATION STAGES (Per Directive)

### Stage 1: Audit Complete ✅
### Stage 2: Document Architecture ✅ (This Report)
### Stage 3: Create Design System
### Stage 4: Redesign Application Shell
### Stage 5: Redesign Analysis Workflow
### Stage 6: Implement Evidence Architecture
### Stage 7: Implement Policy Architecture
### Stage 8: Implement Monitoring Architecture
### Stage 9: Implement Institutional Dashboard
### Stage 10: Implement Asset Passport
### Stage 11: Implement Historical Intelligence
### Stage 12: Prepare API Architecture
### Stage 13: Upgrade Marketing Website
### Stage 14: Upgrade Security/Trust Surfaces
### Stage 15: Testing and Performance
### Stage 16: Final Production Review

---

## 9. IMMEDIATE NEXT STEPS

1. **Create Design System** - Tokens, components matching website aesthetic
2. **Unify Visual Language** - Apply garden/Zen aesthetic to Tauri app
3. **Asset Intelligence Unification** - Combine existing scenes into unified profile
4. **Asset Passport Architecture** - PDF/JSON/CSV export with evidence
5. **Monitoring Foundation** - Alert rules engine, notification abstraction
6. **Website Sync** - Ensure marketing site reflects actual capabilities

---

## 10. PRODUCTION BLOCKERS

| Blocker | Severity | Mitigation |
|---------|----------|------------|
| Tauri updater pubkey missing | Medium | Generate keypair, add to tauri.conf.json |
| No PDF export for passports | High | Implement pdf-lib or server-side generation |
| No background job scheduler | High | Add Tauri plugin or external worker |
| Email/Slack notifications not wired | Medium | Implement notification abstraction |
| Historical data persistence | Medium | Add TimescaleDB or use Supabase with hypertables |
| Cross-platform code signing | High | Requires Apple Developer + Windows cert |

---

*This audit preserves all working functionality. Transformation proceeds in stages with verification at each step.*