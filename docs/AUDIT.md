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

### G2 — No data-freshness state machine  (§24, §65)  — CLOSED

`src/lib/live.ts` had no `LIVE / RECENT / CACHED / DELAYED / STALE /
UNAVAILABLE` vocabulary. It had `stalenessLabel`, which renders prose
("4m ago") and leaves each scene its own private threshold. Prose
cannot be reasoned about or tested.

**Done:** `freshnessOf` classifies a reading against **the scene's own
refresh interval**, not a fixed number of seconds — a 4-second book and
a 5-minute panel do not agree on what "live" means, and one global
threshold would be wrong for both. `isLive` is the single predicate, so
§65 is enforced in one place. A failed attempt can never report `live`
however young the reading, and a paused loop reports `cached`, never
`live`. A paused reading still expires to `stale` rather than being
held indefinitely. Wired into NetworkScene, whose cadence now feeds
both the loop and the thresholds from one constant. 10 tests.

**Still open:** only NetworkScene consumes it. The other scenes using
`useLiveRefresh` still render prose alone.

### G3 — A fabricated compliance finding  (§14, §66, §83, §87)  — CLOSED

The gap here turned out not to be the missing confidence enum. NOSHASHI
attributes nothing: `lib/public/counterparty.ts` states outright that it
keeps no list of known actors, "because NOSHASHI does not have one and
pretending otherwise would be the worst kind of fabrication". Adding a
`VERIFIED / ATTRIBUTED / PROBABLE / …` enum with no attribution source
would have been a second WATCH — a type with no producer.

The real defect was in the Travel Rule panel. `analyseTravelRule` took
an optional `knownCounterparties` set; **RiskScene never passed one**.
The set was therefore always empty, `counterpartyUnknown` was always
true, and so:

- every in-scope transfer rendered a red `MISSING` badge,
- a `DATA MISSING` figure counted every transfer, and
- the panel raised a finding, "N in-scope transfers without counterparty
  data", on an evaluation that had never run.

That is a fabricated compliance claim (§87) presented as a per-row
result (§83). A test asserted the behaviour, so it was encoded rather
than merely overlooked.

**Done:** `counterpartyUnknown: boolean` is now
`counterpartyRecord: "held" | "missing" | "not-evaluated"`, because "we
looked and found nothing" and "nobody gave us anything to look in" are
different claims and only the first is a finding. The report carries
`recordsSupplied` and a separate `notEvaluated` count; `unresolved`
counts only genuine misses. The badge renders neutral "NOT CHECKED"
unless a register was supplied, and the finding only raises on a real
evaluation. The test that encoded the defect was replaced by three that
cover each state.

**Still open:** nothing supplies a register yet. That is an operator
address book, and it belongs with G5.

### G4 — Policies are not versioned  (§17, §58)  — AUTHORITY DONE

One policy set, compiled in. §58 requires that a historical analysis
stay interpretable after the algorithm changes; before this, a rule
change silently reinterpreted every past reading.

**Done for the authority rule set.** `AUTHORITY_RULES_VERSION` is in
the digest scope in all three runtimes and published on the
certificate, for the same reason `source` is: a verifier recomputes
from the body, so a bound field the issuer withholds makes the
certificate unverifiable. The verb requires `rules_version` rather
than defaulting it, so a certificate issued under older rules cannot
verify as though issued under the current ones. The public page prints
it and its explainer names it.

**The version is enforced, not remembered.** A constant a human has to
bump is a comment, not a control.
`authority-rules-version.test.ts` runs the rules over a 19-surface
battery aimed at each check in both directions, hashes the
[id, severity, passed] outcomes, and fails when that fingerprint moves
while the version does not. Verified by silently moving
HHI_CONCENTRATED 2500 → 2400: the lock fails with the instruction to
bump and re-record. It fingerprints OUTCOMES, not source text —
hashing the file would fire on a reworded comment and stay silent on a
threshold reached through a renamed constant. A second test asserts
the battery emits all seven check ids, so a rule cannot be added
outside the lock's reach.

**Still open — settlement.** `receiptDigest`'s body is frozen (see §6),
so a policy version cannot be added to it without breaking every
stored settlement receipt. That needs either a versioned second digest
beside the frozen one, or a `policy_version` carried next to the
receipt rather than inside it — a contract change, not an addition.
§17's named, authored, stored policy records also remain unbuilt and
belong with G5's schema.

### G5 — No organisations, roles or audit log  (§26, §27)  — SCHEMA DONE

There was authentication and entitlements, but no
Organization → Member → Role model and no audit log.

**Timing.** Every table in `noshashi` is empty except one row in
`portfolio_wallets`. Re-parenting billing and evidence onto an
organization is a schema addition today and a backfill with a
dual-read path once there are customers. This was the cheapest this
change will ever be, and the window closes at first customer.

**Done** — `supabase/migrations/20260920190000_organizations_roles_audit.sql`:

- `organizations`, a `member_role` enum of the seven roles §26 names,
  and `organization_members`.
- `organization_id` on entitlements, api_keys, verification_events,
  receipts, portfolios and alerts. **Nullable deliberately**: the
  deployed `noshashi-verify` inserts verification_events without one,
  so NOT NULL would have failed every insert the moment it landed.
- Evidence uses ON DELETE SET NULL, not CASCADE. Deleting an
  organization must not erase the record of adjudications it made.
- `audit_log`, append-only, enforced twice: UPDATE/DELETE/TRUNCATE
  revoked from every role (the real control, because `service_role`
  bypasses RLS) and a trigger that refuses them regardless of grant
  (which catches a superuser, or a later migration re-granting by
  accident).
- RLS: members read their own organizations and roster; owners/admins
  write; the log is readable only by owner, admin, compliance and risk.

**Verified against a real Postgres 16**, not by reading: a throwaway
cluster with a harness mirroring the live schema, `service_role` given
BYPASSRLS as it has in production. Append succeeds; UPDATE and DELETE
are refused for `service_role` and for a superuser; a non-member sees
zero organizations and zero audit rows; an owner sees both. Applying
the file twice was what caught it not being idempotent — Postgres has
no CREATE POLICY IF NOT EXISTS, so it looked re-runnable and failed
halfway.

**Still open:** nothing writes to the audit log yet, no organization
bootstrap path exists, and the nullable `organization_id` columns are
not yet populated by any writer. `accounts.organization` (free text)
is left in place rather than dropped — a dropped column is the one
thing here a later migration cannot undo. The migration is NOT applied
to production; it is committed for review.

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
