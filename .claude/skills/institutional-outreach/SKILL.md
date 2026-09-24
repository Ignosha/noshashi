---
name: institutional-outreach
description: Find, source and keep the list of institutions that would buy NOSHASHI (compliance officers, auditors, XRPL issuers, treasury holders, trading desks, payments corridors), and draft first emails to them. Use when asked to find prospects or leads, add institutions, find contact emails, build or update the outreach CSV, or write a pitch or cold email to an institution. Not for social posts or grant applications; the Growth scene's pitch composer covers those.
---

# Institutional outreach

The list lives in `outreach/contacts.csv`, one row per institution. This
skill keeps that list honest and turns rows into first emails. Sending is
done by the outreach engine (the Cloudflare Worker in `noshashi-outreach.zip`,
sending through Resend from `institutions@mail.noshashi.app`), or by the
owner by hand. It is never done from this session.

## The rule every contact follows

**An address goes in the CSV only if the institution published it itself**:
on its own site, in its own press release, or in a regulatory filing,
for the purpose it is being used for. Record the page in `contact_page` and
the date in `checked_on`. When nothing suitable is published, the row
carries the contact form or the website instead, and the email stays blank.
A blank field is correct; a guessed one is not.

Why this matters more than volume: the buyers are compliance officers. A
cold email to an address they never published is the first compliance
failure they see from a compliance vendor. Guessed addresses also bounce,
and bounces on a newly authenticated sending domain (`mail.noshashi.app`)
get it filtered for everyone.

Never:
- build an address from a name and an "email format" (`first.last@`);
- copy addresses from people-search or data-broker sites (RocketReach,
  ZoomInfo, ContactOut, Lusha, LeadIQ, Apollo, SignalHire, Hunter and
  similar). Search results are full of them; skip those links;
- pitch a complaints, ombudsman, consumer support, press, PR agency,
  security, privacy or legal inbox, even when it is the only address
  published. Use the form instead;
- store a named person's address unless the institution published it for
  business contact. Named buyers are found by role on LinkedIn, and the
  owner contacts them personally.

`check.mjs` enforces the mechanical parts of this. Run it after every edit:

```bash
node .claude/skills/institutional-outreach/check.mjs
```

## The CSV

| column | meaning |
|---|---|
| `institution` | name as the institution writes it |
| `vertical` | `treasury_holder`, `token_issuer`, `compliance_function`, `regulated_institution`, `trading_desk`, `payments_corridor`, `audit_firm`, `channel_partner` |
| `segment`, `country` | what it is, ISO country |
| `priority` | 1 approach now; 2 after 2-3 named references; 3 needs SOC 2 and references (2027); 0 do not pitch |
| `channel` | `compliance`, `partnerships`, `institutional`, `business`, `investor_relations`, `general` (an email), or `form`, `website`, `none`, `not_researched` |
| `email` | published address, or blank |
| `contact_page` | the page it was published on, or the form to use |
| `note` | what the channel is for, and anything to know before writing |
| `fit` | why this institution would buy. A hypothesis, not intelligence |
| `checked_on` | date the contact was last seen on the source |
| `status` | `verify_before_send` → `verified` → `contacted` → `replied` / `declined` / `unsubscribed` / `bounced`; `find_contact`; `skip` |

`verify_before_send` means the address came from a web search and has not
been read on the page itself. Someone opens `contact_page`, confirms the
address is there, and sets `verified`. Only `verified` rows are sent.

## Finding contacts for a new institution

1. Check the name first. Several target names were ambiguous (two firms
   called Aurum Equity Partners; "Licuido" matched nothing). Confirm it is
   the firm with the XRPL, compliance or treasury exposure before anything else.
2. Search for the institution's own contact, institutional, partnerships,
   compliance or investor relations page. Good queries: `<name> contact
   email institutional`, `<name> partnerships contact`, `<name> investor
   relations email`.
3. Prefer, in order: a compliance or institutional desk address; a
   partnerships or business address; investor relations (for listed
   treasury holders, where the pitch is about audit defensibility); a
   general `info@`/`contact@`; the contact form.
4. In a cloud session, direct page fetches are usually blocked by the
   network policy and only search works. Say so in `note` and leave
   `status` at `verify_before_send`.
5. Add the row, run the checker, commit.

Where to look for more institutions that fit:
- XRPL issuers: stablecoin and RWA issuers announced on ripple.com press
  and xrpl.org (Braza, Schuman, StablR and OpenEden came from there).
- Listed XRP treasury holders: SEC and exchange filings, company IR pages.
- Crypto audit and attestation firms: auditors must support fair-value
  marks in the principal market, and fillable depth is audit evidence.
  They are buyers and a referral channel.
- Regulators' public registers (FCA Cryptoasset Register, VARA, Bank of
  Lithuania, MAS FID) list licensed firms with their official contact.

## Order of approach

Treasury holders first: a CFO whose auditor is asking whether the XRP mark
is defensible has a deadline, a budget line and no incumbent vendor. Then
XRPL issuers, then compliance functions at exchanges. Evernorth's disclosed
investors (Ripple, Arrington, SBI, Pantera, Kraken, GSR) make it a warm
intro rather than a cold email; ask for the intro instead of writing.

## Drafting the first email

Follow the rules in `src/lib/growth/pitch.ts`: lead with a measurement the
reader can check, not a description of the product.

- Cite only figures with a ledger index, a date and a control pair, and
  carry the three disclosures (the 10% band is a chosen parameter, AMM
  pools are excluded, `book_offers` caps at 60 levels).
- Never cite the retired 913x figure. It did not reproduce (1.1x on
  2026-09-08).
- Never ask the recipient for their own data, balances or positions.
- Say who it is for in the first line, so whoever opens a shared inbox
  knows where to forward it.
- Under 150 words, plain text, one link, one ask (a 20-minute call or a
  reply).
- Every email carries the sender's real name, a physical postal address
  and a working one-click unsubscribe (CAN-SPAM; the engine holds the
  queue until `POSTAL_ADDRESS` is set). For UK and EU recipients, write
  only to role addresses, say why you are writing to them, and stop at
  the first "no" (PECR/GDPR legitimate interest).
- One email and at most one follow-up, a week apart. Then mark the row
  and move on.
- On a new sending domain, ramp slowly: about 20 a day for the first
  weeks, watching bounces and complaints in Resend.

Draft, show the owner, and let them send or queue it. Update `status` and
commit when something is sent or answered.
