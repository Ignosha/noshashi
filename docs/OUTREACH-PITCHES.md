# Outreach pitches

Copy for institutional outreach. **You send these, from your own client,
to contacts you have chosen** — see *Sending this without burning the
domain* at the bottom, which is not boilerplate and is the part most
likely to cost you something if skipped.

Every claim below is one the site already makes and the product already
does. Nothing here promises a capability that does not exist, and
nothing states a figure that is not on the pricing page. If you edit
these, keep that property: the product's entire argument is that it does
not overstate, and an outreach email that overstates is the first thing
a compliance officer will notice.

---

## 1 · Trading desks and funds

**The angle:** they already have market data. They do not have the join
between "can this move" and "can I get out."

**Subject lines** (pick one, do not A/B more than two at a time):
- `Exit liquidity on XRPL positions — freeze rights included`
- `The half of XRPL risk your terminal doesn't show`
- `Can you exit that position, and is the issuer allowed to stop you?`

```
Hi {first name},

Quick question about how {firm} sizes XRPL positions.

An issued balance on XRPL is only an asset if two things are true at
once: the issuer cannot immobilise it, and there is somewhere to sell
it. Compliance tooling reads the account flags and never opens the
order book. Market terminals read the book and never check the flags.
Desks carry both risks and most measure neither, because the tooling is
split.

NOSHASHI reads both from the same validated ledger state, in the same
second, and returns a GO / HOLD / NO-GO with the rule that decided it
and a SHA-256 receipt attached.

Concretely, it answers: what depth could you actually fill — not quoted
depth, but offers whose owners can still honour them — and can the
issuer freeze you before you get there.

It runs on your machine. No custody, no signing path, no server-side
state. The console is free and there is no account to create:
https://www.noshashi.app

Worth fifteen minutes? Happy to walk through it against a position
you already hold.

{your name}
NOSHASHI Labs
```

---

## 2 · Custodians and regulated venues

**The angle:** they are not buying insight, they are buying a defensible
record. Lead with what survives an examination.

**Subject lines:**
- `Freeze-rights and Travel Rule evidence an examiner can replay`
- `XRPL adjudication with a chain of custody`
- `Discharging R.16 scoping on XRPL — with the receipt`

```
Hi {first name},

I build compliance tooling for the XRP Ledger and wanted to put one
idea in front of {institution}.

Most XRPL compliance output is a screenshot of a dashboard. It cannot
be replayed, it cannot be handed to an examiner, and it does not record
what the ledger actually said at the moment of the decision.

NOSHASHI produces a deterministic verdict — GO, HOLD or NO-GO — against
validated ledger state, with the exact rule that decided it, the
evidence behind it, and a SHA-256 receipt. The institutional tier adds
Travel Rule (FATF R.16) scoping, signed audit export with a chain of
custody, offline adjudication on segregated networks, and regulator
read-only seats.

Two things it deliberately is not: it is not advice, and it has no
custody or signing path. A GO means the rules you configured passed —
not that a transaction is lawful in your jurisdiction. That distinction
is on every screen, because the alternative is a tool that invites
someone to rely on it for something it cannot carry.

Everything is verifiable before you trust it: the builds are produced
by CI from a public commit, each artifact publishes its SHA-256, and
the source is public.

Would a technical walkthrough with your compliance lead be useful?

{your name}
NOSHASHI Labs
https://www.noshashi.app
```

---

## 3 · XRPL ecosystem — issuers, gateways, infrastructure

**The angle:** peer-to-peer, not vendor-to-buyer. This group responds to
substance and reacts badly to sales language.

**Subject lines:**
- `Issuer drift monitoring on XRPL — open to feedback`
- `Built an XRPL adjudication tool; would value your read`

```
Hi {first name},

Not a sales email — I would value your read on something.

I have been building NOSHASHI, which reads validated XRPL state and
reports whether a position is both permitted and exitable: freeze
rights and XLS-77 deep freeze, counterparty concentration, funded
versus quoted book depth, delivered versus requested on settlement,
AMM pool governance.

One finding that shaped it: measuring ledger cadence by differencing
ledger_time is wrong, because XRPL rounds close times to the ledger's
close_time_resolution. Consecutive closes inside one bucket report
exactly 1s and the boundary reports 8-9s. Measured against mainnet,
that made a completely healthy network look like it was failing
eighteen closes out of twenty-eight. It is measured from arrival now,
and labelled as that.

It is free, runs locally, has no account, and the source is public.
If you have ten minutes to tell me where it is wrong, that would be
more useful to me than a sale:

https://www.noshashi.app
https://github.com/Ignosha/noshashi

{your name}
```

---

## Follow-up (once, after 5–7 days)

Never more than one. A second follow-up converts almost nothing and
costs you the domain reputation you are trying to build.

```
Hi {first name},

Following up once on the note below, then I will leave it.

If XRPL exposure is not on {firm}'s roadmap this quarter, just say and
I will stop. If it is and the timing is wrong, tell me when to come
back.

{your name}
```

---

## Sending this without burning the domain

This matters more than the copy.

**noshashi.app was verified in Resend today and has no sending
reputation.** A cold domain that suddenly sends a few hundred
unsolicited messages is the textbook spam signature. The realistic
outcome is not "low open rates" — it is the domain landing on a
blocklist, which would also take down the contact form, the only
inbound channel the site has.

1. **Do not send bulk from Resend.** Resend's terms prohibit
   unsolicited bulk email, and the contact form depends on that account
   staying in good standing. Send outreach from your normal mailbox
   (Gmail, Google Workspace) where each message is an individual,
   manually-sent email — which is also what makes it lawful cold B2B
   contact in most jurisdictions rather than a marketing blast.
2. **Warm up.** 5–10 messages a day for the first two weeks. Increase
   only if replies are coming and nothing is bouncing.
3. **Personalise the first line for real.** Not a merge field — one
   specific sentence about that institution. This is the single largest
   factor in reply rate, and it is also the thing that makes the email
   genuinely not spam.
4. **Identify yourself and offer an exit.** A real name, a real
   organisation, a physical address if you have one, and a plain line
   saying they can tell you to stop. CAN-SPAM requires it in the US;
   GDPR and PECR make it a condition of legitimate-interest B2B contact
   in the EU and UK. You are selling a compliance product — getting
   this wrong is a story that follows the product.
5. **Do not buy a list, and do not scrape one.** Contacts should be
   people with a plausible reason to hear from you. `targets.json` in
   `noshashi-outreach.zip` already has your own research in it.
6. **Never send to a regulator's general inbox** to introduce a product.

**Expected reality:** well-researched cold outreach to financial
institutions converts at roughly 1–3% to a first conversation. Fifty
carefully chosen, genuinely personalised messages will beat five hundred
merged ones, and will not put the domain at risk.

The XRPL community route in pitch 3 will almost certainly outperform
both institutional pitches at this stage, because a beta with unsigned
binaries is an easier ask for a builder than for a custodian's
procurement process.
