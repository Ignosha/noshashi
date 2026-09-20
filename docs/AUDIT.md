# NOSHASHI — codebase audit and implementation map

Phase 1 of the master directive. Written from inspection of the tree at
the commit that adds this file, not from assumption. Every count and
every claim below was produced by running something; where a claim could
not be verified from here, it says so.

The directive is written as though NOSHASHI were to be built. It is
largely already built. The useful output of Phase 1 is therefore a **gap
map**, not a rebuild plan, and the rest of this document is organised
that way.

## 1. What exists

| Surface | Files | Lines | Runtime |
|---|---|---|---|
| `src/` — console | 154 | 38,626 | Vite / TypeScript / React |
| `api/` — public endpoints | 24 | 4,343 | Node on Vercel |
| `supabase/functions/` | 3 | 2,003 | Deno |
| `scripts/` — site build | 5 | 1,548 | Node |
| `src-tauri/` — desktop shell | 2 | 549 | Rust |

32 scenes in `src/components/scenes/`. 20 domain modules in
`src/lib/desk/`. 484 tests across 22 files, all passing.

**Three runtimes cannot import from each other.** The console, the Vercel
endpoints and the Deno functions each hold their own copy of the shared
logic. This is the single most important structural fact about the
codebase, and the reason parity tests exist that *execute* both copies
rather than compare their text.

## 2. Directive coverage — what is already there

The directive's intelligence domains map onto existing modules:

| Directive section | Exists as | State |
|---|---|---|
| §10 Asset Intelligence | `desk/issuance.ts`, `desk/control.ts` | built |
| §12 Liquidity Intelligence | `desk/liquidity.ts`, `desk/book.ts`, `desk/amm.ts` | built |
| §14 Counterparty Intelligence | `desk/risk.ts`, `desk/portfolio.ts` | partial |
| §17 Policy Engine | `lib/policy.ts` | built, single policy |
| §6 Evidence | `lib/policy.ts` digests, `desk/provenance.ts` | built |
| §21 Monitoring | `desk/watch.ts` | partial |
| §28 API | `api/`, `supabase/functions/noshashi-verify` | built |
| §29 API security | `desk/apiKeys.ts`, hashed keys, scopes, expiry | built |
| §8 XRPL data layer | `lib/xrpl/` | built |
| §11 Asset Passport | `desk/authority.ts` certificate | built (authority only) |

## 3. Gaps that are real

Ordered by how much else depends on them.

### G1 — The decision engine has three outcomes, not five  (§5, §18)  — PARTLY CLOSED

```
src/lib/xrpl/types.ts:1: export type Status = "go" | "hold" | "no-go";
```

The directive requires `WATCH` and `INSUFFICIENT DATA` as distinct
outcomes. Their absence is not cosmetic. The authority certificate
already abstains when the holder distribution cannot be read, and today
it must express that abstention as `hold` — which is the directive's §4
failure exactly: "I checked and it is concerning" and "I could not
check" are different claims and currently share a symbol.

Blast radius, measured: 24 files reference `Status`, 7 exhaustive
`Record<Status, …>` maps would fail to compile until updated (which is
the type system working for us), and `verdict` is **inside the authority
digest scope** — so widening it changes certificate digests and must be
mirrored across all three runtimes.

**Done:** `insufficient-data` is now a real verdict with a real trigger
(a source that threw), produced by `verdictFor` in both the console and
the Node mirror, with precedence NO-GO > INSUFFICIENT DATA > HOLD > GO.
NO-GO deliberately outranks it so a failed read cannot suppress an
established blocking finding. All ten presentation sites were updated;
the state renders neutral rather than borrowing a verdict colour.

**Still open:** `PolicyCheck.passed` is a boolean, so §18's per-check
`PASS / FAIL / WARNING / NOT APPLICABLE / INSUFFICIENT DATA` does not
exist — abstention is still encoded as `passed: false` plus prose. That
field is hashed by `digestOf` in all three runtimes and set at every
check construction, so converting it is a large refactor of its own.

**WATCH is deliberately not added.** Nothing in the codebase produces a
signal that separates WATCH from HOLD, and a verdict no evaluation can
return would be a control that does nothing (§83). It belongs with
historical monitoring, which supplies the trend a WATCH rests on.

### G2 — No data-freshness state machine  (§24, §65)

`src/lib/live.ts` has no `LIVE / RECENT / CACHED / DELAYED / STALE /
UNAVAILABLE` vocabulary. Individual call sites reason about staleness ad
hoc. §65 forbids showing `LIVE` unless verified; there is currently no
single place that decides what "verified" means.

### G3 — Counterparty attribution has no confidence states  (§14, §66)

`desk/risk.ts` handles counterparties but there is no
`VERIFIED / ATTRIBUTED / PROBABLE / UNVERIFIED / UNKNOWN` enum. §66
forbids naming an institution without evidence, source, timestamp and
confidence. The type system does not currently make that impossible.

### G4 — Policies are not versioned  (§17, §58)

One policy set, compiled in. §17 requires named, versioned, authored
policies, and §58 requires that historical analyses stay interpretable
after the algorithm changes. Today a policy change silently reinterprets
every past receipt.

### G5 — No organisations, roles or audit log  (§26, §27)

There is authentication and there are entitlements, but no
Organization → Workspace → Member → Role model and no audit log table.
This is the largest single piece of unbuilt work in the directive.

## 4. What is already correct, and should not be "fixed"

Worth recording so a later pass does not undo it:

- **§64 no fake data.** A scan of `src/lib` and `api/` for mock or
  fabricated data found none in domain logic. The `placeholder` matches
  are Stripe config *guarding against* placeholder keys — honest
  configuration detection, the opposite of fake data.
- **§44 Tauri least privilege.** `src-tauri/capabilities/default.json`
  grants window, notification, store, autostart, shortcut, positioner
  and updater permissions and nothing else. No filesystem, no shell, no
  arbitrary HTTP. This already satisfies §44.
- **§52 honest failure.** Reads that fail resolve to explicit
  `unreadable` state rather than to a default that looks like a real
  reading. Three separate bugs of exactly that shape were found and
  fixed earlier; the pattern is now guarded by tests.
- **§6 evidence provenance.** The authority digest binds subject,
  currency, ledger index, verdict and the source of the holder
  distribution, and the certificate publishes every field the digest
  binds so a third party can recompute it.

## 5. Sequencing

The directive's §79 order is sound, with one correction: G1 must precede
the Evidence and Policy phases, because both encode a verdict and
widening the verdict vocabulary afterwards would invalidate anything
already issued.

1. **G1** — five-outcome decision engine, all three runtimes. *Gates the rest.*
2. **G2** — freshness state machine.
3. **G3** — attribution confidence.
4. **G4** — policy versioning.
5. **G5** — organisations, roles, audit log.

## 6. Constraints any later phase must respect

- **Three runtimes, no shared imports.** Any change to digest or verdict
  logic lands in `src/lib/`, `api/_lib/` and `supabase/functions/`
  together, with a parity test that executes all copies.
- **Digest stability.** `receiptDigest`'s body is frozen. `digestOf` is
  the canonical form for everything after settlement. Changing either
  breaks stored receipts.
- **`site/` is generated.** `templates/` is the source. Committed
  generated artifacts (`templates/hero-bloom.svg`) have a CI guard;
  anything else generated needs one too.
- **CSP.** `default-src 'self'`, `font-src 'self'`. No third-party
  assets, fonts or scripts.
- **The sandbox cannot reach the network.** XRPL hosts, supabase.co and
  indexers are all egress-blocked. Live validation goes through Vercel
  preview deploys; nothing here can be confirmed by calling it directly.

## 7. Not verified from here

Stated so no one mistakes absence of a finding for a clean result:

- No end-to-end HTTP test of any deployed endpoint (egress blocked).
- `cargo` was not run; the Rust shell is audited by reading only.
- `npm audit` results are not recorded in this document.
- No load, latency or performance measurement was taken.
