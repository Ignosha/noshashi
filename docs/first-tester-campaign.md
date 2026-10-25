# First institutional tester campaign

Goal: get five people who investigate XRPL tokens for a living to use the
issuer analysis on a token they care about, and learn what they would need
before relying on it. This is research, not a sales push. No accounts,
gating or waitlist; anyone can open https://www.noshashi.app/app/issuer/.

## Targets

| Stage | Target | Where tracked |
|---|---|---|
| Prospects identified | 15 | `outreach/contacts.csv`, one row each |
| Invitations sent | 10 | `status` = `contacted` |
| Tests completed | 5 | feedback received with the "Tester feedback" subject |
| Interviews held | 3 | notes in the table at the end of this file |

Who counts as a prospect: someone whose job includes deciding whether to
list, hold, accept or report on an XRPL-issued token. In order:
1. compliance and listing teams at exchanges that support XRPL tokens;
2. XRPL issuers checking how their own issuer looks from outside;
3. crypto audit and attestation firms;
4. XRPL treasury holders and their advisers.

Contact them only through addresses they publish themselves (see the
`institutional-outreach` skill). One invitation and at most one follow-up,
a week apart.

## What the tester sees

- `/app/issuer/` opens with a three-step guide (dismissible, remembered per
  browser) and the "Help us improve NOSHASHI" card with **Start analyzing**
  and **Share feedback**.
- Every result shows the facts read from a validated ledger, what they
  mean, the evidence (ledger index, raw reply), and a "Not shown by the
  ledger: verify yourself" list.
- **Share feedback** opens a private form: category, a required description,
  optional questions, and an optional email that is only kept with consent.
  It goes to support@noshashi.app; nothing is published.
- `https://www.noshashi.app/app/issuer/?feedback=1` opens the form directly.
- The homepage demo video shows the whole workflow on live mainnet data.

NOSHASHI never says a token is safe or fraudulent. It shows what the ledger
records and what still needs checking.

## Invitation (under 120 words, plain text)

> Subject: Would you investigate this token further? (12-minute test)
>
> Hello, this is for whoever reviews XRPL tokens before listing or holding
> them.
>
> I'm Joshua, building NOSHASHI, a read-only tool that reads an issuer's
> controls (freeze, clawback, authorization, transfer fee) straight from a
> validated XRPL ledger, with the evidence attached.
>
> I'm looking for five people to try it on a token they actually care about
> and tell me what's missing. It takes about 12 minutes, there's no sign-up,
> and nothing you type is stored:
> https://www.noshashi.app/app/issuer/
>
> If you'd rather talk it through, reply and I'll set up a 20-minute call.
>
> Joshua, founder of NOSHASHI
> [postal address]
> Reply "no" and I won't write again.

## The 12-minute scenario: "Would you investigate this token further?"

**Audience:** an XRPL builder, token researcher, digital-asset operator, or
developer evaluating an unfamiliar issued token.

**Task, read to the tester word for word:** "Inspect this XRPL-issued token
and its issuer. Identify the observable issuer controls and other available
signals that deserve further attention. Explain what you can conclude from
the evidence and what remains unknown."

Run it live on a call (screen shared by the tester) or send it as written
instructions. Don't explain the product first; watching where people get
stuck is the point.

**Minutes 0–2: current process.** Ask how the tester currently investigates
a new XRPL token. What do they open first? Which sources do they trust?
What would make them stop and escalate? Write down their words.

**Minutes 2–4: pick a token.** The tester picks an XRPL-issued token they
know or want to investigate and pastes its issuer address. If they have
none in mind, offer one of the examples on the page (Bitstamp USD, GateHub,
Ripple RLUSD). Note whether they found the input and the examples without
help.

**Minutes 4–7: read the findings.** Ask them to read the result aloud and
say what each control means for their decision: can the issuer freeze
holders, claw back balances, require authorization, charge a transfer fee?
Note any term they misread or skip.

**Minutes 7–9: the decision.** Ask the title question: "Would you
investigate this token further? Why?" Then: "Which finding changed what you
would do next?" Ask them to open the evidence and say whether it is enough
to put in a file or a memo.

**Minutes 9–11: what's missing.** Point at "Not shown by the ledger: verify
yourself". Ask which of those they would check, how, and which they wish
NOSHASHI checked for them. Ask what else they expected to see.

**Minutes 11–12: feedback.** Ask them to press **Share feedback** and write
one or two sentences in their own words. Ask whether you may follow up.

Never ask for their own balances, positions, keys or confidential trading
information.

## Interview questions (20 minutes, for the three interviews)

1. Walk me through the last token you were asked to review. What happened?
2. Where did the information come from, and how did you record it?
3. What in today's result would you have needed anyway? What was new?
4. What would stop you from putting this result in a file you hand to
   someone else?
5. Which of the "verify yourself" items take you the longest today?
6. Who else in your team would use this, and for what?
7. If this did exactly what you needed, what would it replace?

Ask about the past, not about hypotheticals; don't pitch during the
interview.

## After each test

1. Set the row's `status` in `outreach/contacts.csv` (`replied`, `declined`).
2. Copy the feedback into the log below, without names or email addresses.
3. Tag each point: `accuracy`, `missing-info`, `terminology`, `usability`,
   `reliability`, `feature`.
4. Fix anything that is plainly broken within a week and tell the tester.

## Log

| Date | Role | Token tested | Would investigate further? | Most useful | Missing | Tags |
|---|---|---|---|---|---|---|
| | | | | | | |
