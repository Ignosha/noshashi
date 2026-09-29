# NOSHASHI

**XRPL intelligence for institutional decisions.**

NOSHASHI helps institutions understand whether XRPL assets and transactions
can move under their policies, whether enough real liquidity exists to
execute the intended operation, and why the system reached its conclusion.
Every analysis produces evidence that can be reviewed and verified.

## One ledger. Three questions.

| | Question | What NOSHASHI does |
|---|---|---|
| **Compliance** | Can this move? | Evaluates an account or settlement against your configured policy and returns GO, HOLD or NO-GO, with every rule's result (pass, fail, review, insufficient data, not applicable) and the reason. |
| **Liquidity** | Can this actually exit? | Separates what the order book quotes from what its owners can actually deliver, simulates an exit against the fillable depth, and joins it to the issuer's freeze rights. |
| **Evidence** | Can we prove why? | Binds each decision to the ledger it was read at, the rules evaluated and the exact policy version in a SHA-256 receipt that anyone can recompute. |

## How a decision is made

Ledger → validate (several independent public servers must agree) →
deterministic rules → your policy version → decision → receipt → a person
approves.

The AI assistant (NOSHX) explains results and answers questions about the
evidence. It never issues a decision and never signs anything.

## What is built today

- Desktop app for macOS, Windows and Linux; read-only against XRPL mainnet.
- Deterministic policy engine with versioned institutional policies: HHI
  concentration, counterparty share, Travel Rule threshold, reserve
  headroom, strict freeze. Every setting states its unit, trigger and effect.
- Four-eyes controls: a policy's author cannot activate it; an exception's
  requester cannot approve it; exceptions expire.
- Organizations with roles (owner, admin, compliance, risk, analyst,
  viewer, API, regulator), row-level security and an audit log.
- Permissioned domains and credentials read from the real mainnet directory.
- Audit trail export with delivered amounts (not the Amount field), OFAC
  SDN screening and a SHA-256 manifest.
- Compliance API with keys, rate limits and signed webhooks.

## What it is not

Not a wallet, an exchange or a block explorer. It does not hold keys, move
funds, give legal advice or replace your compliance team. It does not
guarantee compliance or liquidity; it shows what the ledger supports and
proves how the conclusion was reached.

## Honest status

- Builds are not yet code-signed or notarised (needs the company's Apple
  Developer ID and a Windows certificate; the pipeline is ready for them).
- No SOC 2 or ISO 27001 certification. Security controls are documented.
- Data comes from public XRPL servers; if they disagree or do not answer,
  no GO is issued.

## Plans

Free · Pro $749/seat/month · Institutional $4,000/month ·
Enterprise $10,000/month · Strategic Infrastructure $20,850/month.
Details: <https://www.noshashi.app>

**Try it:** <https://github.com/Ignosha/noshashi/releases/latest>
