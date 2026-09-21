# Seven written approaches

Drafted against `data/targets.json` in `noshashi-outreach.zip` — your own
research, including the note on each entry explaining why it is a fit.
That note is what each email is built on, which is the whole reason
these read as written rather than merged.

**Every capability named here is on the site.** No figure appears that
the pricing page does not carry, and each email states the beta channel
rather than burying it. If you edit them, keep that property: you are
selling a tool whose argument is that it does not overstate, and the
first person to notice an overstatement will be a compliance officer.

**Before sending any of these:** confirm the organisation still uses
XRPL the way the note assumes. Several entries on that sheet are
historical, and `targets.json` flags them — approaching MoneyGram on an
XRPL premise is called out there as "the single most damaging own-goal
available on this sheet". The seven below were chosen because their
notes describe a current, live problem.

You still need a named recipient. `contacts.treasury.json` has three;
the rest need a person found before the email is worth sending. A
role-title guess in the greeting undoes the personalisation.

---

## 1 · Wellgistics Health — listed company holding XRP

*Why them: a public company carrying XRP on the balance sheet. Auditors
will ask how the position is marked and whether it can be exited at the
marked price.*

**Subject:** `Can the XRP on your balance sheet be exited at the marked price?`

```
Hi {first name},

A question your auditors will ask before I do: the XRP on the balance
sheet is marked at a price — could the position actually be exited at
that price, and who is able to stop it?

Those are two different risks and most tooling answers neither. A mark
comes from a quoted price; quoted depth includes offers whose owners
can no longer honour them. And an issued balance is only an asset if the
issuer cannot immobilise it.

NOSHASHI reads both from validated XRPL state in the same second: exit
liquidity as freeze risk against fillable depth against holder
concentration, with the rule that produced the answer and a SHA-256
receipt attached. That receipt is the part that matters for an audit
file — it can be replayed rather than screenshotted.

It runs on your own machine, holds nothing, and signs nothing. The
console is free and there is no account to create.

Worth fifteen minutes before your next mark?

{your name}
NOSHASHI Labs · noshashi.app
Beta channel — builds are unsigned and publish their SHA-256.
```

---

## 2 · GSR — XRPL market maker

*Why them: quotes size exactly where advertised and fillable depth
diverge most. A desk head can buy seats without procurement.*

**Subject:** `Quoted depth vs fillable depth on XRPL`

```
Hi {first name},

You already know the gap between what an XRPL order book advertises and
what can actually be filled. I built the thing that measures it.

NOSHASHI reads the book and counts only offers whose owners can still
honour them — an offer resting against an asset the owner has since
spent still quotes a price nobody can take. It reports that alongside
the issuer's freeze rights on the same asset, from the same validated
ledger state, in the same second. Compliance tooling never opens the
book; market terminals never check the flags. Holding both is the
product.

For a desk your size the relevant surfaces are order-book integrity,
exit liquidity under concentration, and settlement forensics — delivered
versus requested, which is where partial payments quietly cost money.

Free tier, no account, runs locally. If it tells you something you
already knew, tell me and I will stop.

{your name}
NOSHASHI Labs · noshashi.app
Beta channel — unsigned builds, SHA-256 published for each.
```

---

## 3 · Ondo Finance — tokenized treasuries on XRPL

*Why them: institutional holders will demand exactly the permission
registry NOSHASHI produces.*

**Subject:** `The permission question your institutional holders will ask`

```
Hi {first name},

When a regulated holder takes a tokenized treasury position on XRPL,
their first question is not about yield. It is: who can freeze this,
under what conditions, and can I evidence that answer to my own
compliance function six months from now?

NOSHASHI answers it from validated ledger state — issuer freeze rights
including XLS-77 deep freeze, the credential registry and domain grid,
holder concentration, and the control surface on the issuing account
itself: signers, locked value, what could change without notice.

The output is a GO / HOLD / NO-GO with the deciding rule and a SHA-256
receipt, which is the difference between a holder believing you and a
holder being able to show their reviewer why.

I would rather it was pointed at your issuance and found nothing than
have an institutional holder find something first.

Fifteen minutes?

{your name}
NOSHASHI Labs · noshashi.app
Beta channel — unsigned builds, hashes published.
```

---

## 4 · Uphold — multi-asset exchange, deep XRP flow

*Why them: unusually deep XRP flow and a mid-size compliance org that
can still move.*

**Subject:** `XRPL adjudication your reviewers can replay`

```
Hi {first name},

Most XRPL compliance output is a screenshot of a dashboard. It cannot be
replayed, it cannot be handed to an examiner, and it does not record
what the ledger said at the moment of the decision.

Given the XRP flow you carry, that gap is a live one. NOSHASHI produces
a deterministic verdict against validated ledger state — GO, HOLD or
NO-GO — with the exact rule that decided it, the evidence behind it, and
a SHA-256 receipt. Verdicts persist to an adjudication ledger, so a
review six months later reads the same answer for the same reason.

Two things it deliberately is not: it is not advice, and it has no
custody or signing path. A GO means your configured rules passed, not
that a transaction is lawful in your jurisdiction — that distinction is
on every screen, because a tool that blurs it invites reliance it cannot
carry.

Everything is checkable before you trust it: builds come from CI on a
public commit, each publishes its SHA-256, and the source is public.

Would a walkthrough with your compliance lead be useful?

{your name}
NOSHASHI Labs · noshashi.app
```

---

## 5 · Tranglo — XRPL settlement at corridor volume

*Why them: delivered-versus-requested value is a live reconciliation
problem, not a hypothetical.*

**Subject:** `Delivered vs requested on XRPL corridors`

```
Hi {first name},

At corridor volume, the difference between the amount a payment
requested and the amount that was delivered is a reconciliation line
somebody closes by hand every month.

NOSHASHI reads it directly from validated XRPL state: settlement
forensics comparing delivered against requested, which surfaces partial
payments and the path they took, alongside the issuer conditions on each
asset moved. It is the same read that answers whether a counterparty
could have been frozen mid-corridor.

The output carries the deciding rule and a SHA-256 receipt, so a
discrepancy becomes an evidenced explanation rather than an
investigation.

It runs on your own infrastructure, has no custody path, and cannot
broadcast a transaction. The console is free.

Happy to run it against a corridor you already reconcile and show you
what it says — including if the answer is nothing.

{your name}
NOSHASHI Labs · noshashi.app
Beta channel — builds unsigned, SHA-256 published.
```

---

## 6 · Archax — FCA-regulated exchange and custodian

*Why them: a regulated venue where the obligation, not the insight, is
what gets bought.*

**Subject:** `R.16 scoping and freeze-rights evidence on XRPL`

```
Hi {first name},

As an FCA-regulated venue your XRPL question is not "is this a good
asset" but "can I evidence the determination I made, to the standard my
reviewer expects".

NOSHASHI produces that evidence from validated ledger state: Travel Rule
(FATF R.16) scoping, issuer freeze rights including XLS-77 deep freeze,
counterparty concentration, and a signed audit export carrying a SHA-256
chain of custody. It adjudicates offline on segregated networks, and the
institutional tier includes regulator read-only seats — so the reviewer
reads the same record you did rather than a report about it.

It is informational tooling and says so on every screen. It holds
nothing, signs nothing, and a GO means your configured rules passed, not
that anything is lawful in a given jurisdiction.

Builds are produced by CI from a public commit and publish their
SHA-256, so it can be verified before it is admitted.

Would a technical session with your compliance and custody leads be
worth an hour?

{your name}
NOSHASHI Labs · noshashi.app
```

---

## 7 · Ripple Custody — the ecosystem approach

*Your own note on this entry: "This is Ripple. Ecosystem steward,
plausible partner or acquirer, and the party most likely to build this
in-house. Handle personally, never through a sequence."*

That note is correct and this email is written to it. It is not a vendor
pitch — pitching Ripple a product Ripple could build is the fastest way
to be politely declined. It offers the work and asks for a read.

**Subject:** `Built an XRPL adjudication layer — would value Ripple's read`

```
Hi {first name},

Not a pitch — I would value your read on something, and you are better
placed than anyone to tell me where it is wrong.

I have built NOSHASHI: it reads validated XRPL state and reports whether
a position is both permitted and exitable. Issuer freeze rights and
XLS-77 deep freeze, credential registry and domain grid, funded versus
quoted book depth, delivered versus requested on settlement, AMM pool
governance, counterparty concentration. One verdict, with the deciding
rule and a SHA-256 receipt.

One finding that shaped it, as a sense of the standard I am holding
myself to: measuring ledger cadence by differencing ledger_time is
wrong, because XRPL rounds close times to close_time_resolution.
Consecutive closes inside one bucket report exactly 1s and the boundary
reports 8–9s. Measured against mainnet that made a healthy network look
like it was failing eighteen closes out of twenty-eight. It is measured
from arrival now, and labelled as that rather than as the ledger's own
rhythm.

It is free, runs locally, holds nothing, and the source is public. If
this is a direction Ripple is already covering, I would rather know that
from you than find out slowly. And if it is useful, I would rather it
strengthened the ecosystem than competed with it.

Ten minutes, whenever suits:
noshashi.app · github.com/Ignosha/noshashi

{your name}
```

---

## Sending these

The rules in `OUTREACH-PITCHES.md` apply and are not decoration:

- **Send from your own mailbox, individually.** Not Resend — that
  account carries the contact form and the update list, and unsolicited
  bulk from it risks both.
- **Five to ten a day.** These seven are two days of sending, not one
  afternoon.
- **Replace `{first name}` with a real name**, and delete any email
  where you could not find one.
- **Identify yourself and offer an exit.** Required under CAN-SPAM, and
  a condition of legitimate-interest B2B contact under GDPR and PECR.
- **Expect 1–3% to a first conversation.** Seven well-aimed emails
  beating fifty merged ones is the realistic shape of this.

Number 7 goes last, and only after at least one of the others has had a
reply. An ecosystem steward is more interested in something with traction
than something with a deck.
