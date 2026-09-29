# Institutional demo — five minutes

A script for a meeting with a compliance, risk or treasury team. Every step
uses the desktop app against XRPL mainnet, live. Nothing is staged, so the
numbers will differ from the ones quoted here; the *steps* and what they
prove are the same every time. Where a fixed example helps, it is a recorded
mainnet reading and says so.

**Before the meeting (2 minutes):**

- Install the current release from
  <https://github.com/Ignosha/noshashi/releases/latest>. The builds are not
  yet code-signed: macOS will warn about an unidentified developer and
  Windows SmartScreen will warn too. Say so if you share the link.
- Open the app once so it connects. The status rail at the bottom shows the
  live ledger index when it is connected.
- Sidebar: switch to **Executive** for the opening, **Analyst** for the
  deep-dive questions.
- Have one account address ready that the audience cares about. If they
  have none, use Bitstamp's hot wallet `rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1`
  (a real, long-lived mainnet account).

**The one sentence to open with:**

> NOSHASHI tells you whether an XRPL asset or transaction can move under
> your policy, whether there is enough real liquidity to do it, and why it
> reached that conclusion. Every answer comes with evidence you can check
> without trusting us.

---

## 1. Retrieve and validate (45 s) — Ledger Sync

Open **Ledger Sync**. Four public XRPL servers, named, each with its ledger
index and state.

Say: *"We never ask one server and call it the network. We ask several and
treat disagreement as the signal."*

Point at: nodes in step with the leader; any node that did not answer is
shown as not answering, not hidden.

## 2. Analyze compliance (60 s) — Verification

Open **Verification**, enter an amount, run the gate.

Point at, in order:

1. **The decision**: GO, HOLD or NO-GO. There is no score and no
   confidence percentage.
2. **The rules**: each one reads PASS, FAIL, REVIEW, INSUFFICIENT DATA or
   NOT APPLICABLE, with the reason.
3. **Independent sources agree on the reading**: before a GO is issued,
   every public node is asked for the ledger hash and the account's state at
   the same ledger. If they disagree, or only one answers, the result is
   HOLD, never GO.
4. **The receipt**: a SHA-256 digest over the decision, the rules and the
   policy version.

Say: *"The decision is deterministic. The same ledger state and the same
policy version always produce the same answer and the same digest."*

## 3. Analyze liquidity (60 s) — Order Book

Open **Order Book** on USD.Bitstamp.

Point at **FILLABLE** against **quoted**. An offer rests on the ledger
whether or not its owner still holds the funds; the ledger says how much
each owner can actually deliver.

Recorded example (XRP/USD.Bitstamp, ledger 107,312,802, 2026-09-29): one
ask quoted **1,450,000.7 USD** while its owner could deliver
**3,370.63 USD**. On the bid side near the touch, most resting offers were
funded at zero.

Say: *"A basic interface shows the quote. We show what would actually
fill, and we simulate exits against that, never against the quote."*

Optional: **Exposure Analysis → Exit** for an account holding tokens, to
show freeze rights and exit depth together.

## 4. Show the evidence (60 s) — Overview and Ledger & Policy

Open **Overview**. The **Decision Card** shows the verdict just recorded:
the policy, how many rules passed, the ledger it was read at, the receipt
re-verified on the spot, how many nodes agreed, and "people decide".

Open **Ledger & Policy**. Pick the entry; the receipt is recomputed in
front of them. Change nothing and it verifies; any edit to a stored record
and it will not.

Say: *"An auditor does not need to trust NOSHASHI. They recompute the
digest from the record."*

## 5. Show the policy (45 s) — Ledger & Policy → Policy

Show the rule sheet: for each setting, its value and unit, what it reads
from the ledger, exactly when it triggers, and what that does to the
verdict. In an organization: Draft → In review → Approved & active
(approved by someone other than the author) → Superseded.

Exceptions: requested with a reason and evidence, decided by a second
authorized person, and they **expire**. The original verdict and receipt
never change.

## 6. AI explanation (30 s) — NOSHX

Ask NOSHX: *"Why was the last verdict a HOLD?"*

Say: *"The assistant explains; it never decides. Its figures come from the
same readings, and where it and the deterministic engine could differ, the
engine wins."*

## 7. Export (30 s)

From **Ledger & Policy**, export the signed record, or from **Audit Trail**
export the CSV and its SHA-256 manifest. Hand the file over as the takeaway.

---

## Questions you will get

**Is it certified (SOC 2, ISO 27001)?** No. Say so. The security model is
documented; certifications are planned, not held.

**Who are your customers?** Answer truthfully. Do not name anyone who has
not agreed to be named.

**Does it hold keys or sign transactions?** No. NOSHASHI only reads. It has
no signing path at all.

**What if the public servers are down or disagree?** No GO is issued. The
screen says which sources did not answer and what to do.

**Does it replace our compliance team?** No. It analyses and produces
evidence; authorized people decide.

**Why are the installers unsigned?** Signing needs the company's Apple
Developer ID and a Windows code-signing certificate. The release workflow is
ready for them; until then each download publishes its SHA-256 checksum,
and the app hashes its own binary (Settings › Binary integrity).
