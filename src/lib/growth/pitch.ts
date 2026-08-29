/**
 * Pitch composer.
 *
 * Assembles an outreach note from findings this console actually measured,
 * for a named audience. It drafts; the operator sends. There is no send
 * button here for the same reason there is no publish button next to the
 * social drafts — and, separately, because the strategy is worse: grant
 * reviewers and protocol engineers recognise automated outreach, and being
 * recognised costs exactly the credibility a real measurement buys.
 *
 * The rule every template obeys: LEAD WITH THE MEASUREMENT.
 *
 * The pitch that works is not "I built a compliance tool for XRPL" — there
 * are many, and the reader has no way to rank them. It is "92.8% of the
 * visible ask depth on USD/Bitstamp could not fill, here is how I measured
 * it, here is the code." That is checkable, and being checkable is the
 * entire advantage a solo builder has over a deck.
 *
 * Every figure below is carried with the date it was taken and what would
 * need re-checking, because a measurement quoted as current when it is
 * three weeks old is the failure this product exists to prevent — and
 * quoting a stale number at someone who can verify it is also the fastest
 * way to lose them.
 */

export type Audience = {
  id: string;
  label: string;
  /** Who is actually reading, and what they are deciding. */
  reader: string;
  /** What this reader is scanning for in the first ten seconds. */
  wants: string;
  /** The mistake most pitches to this reader make. */
  pitfall: string;
  /** Rough length that fits the channel. */
  lengthHint: string;
};

export const AUDIENCES: Audience[] = [
  {
    id: "grants",
    label: "XRPL GRANTS",
    reader:
      "A reviewer reading dozens of applications, most of which describe a wallet or an explorer.",
    wants:
      "Evidence you have already built something and found something. Working software beats a roadmap.",
    pitfall:
      "Describing the category rather than the finding. 'Compliance tooling for XRPL' tells them nothing they can rank.",
    lengthHint: "300–500 words, structured",
  },
  {
    id: "ripplex",
    label: "RIPPLEX / DEVREL",
    reader:
      "An engineer on the XRPL Developer Discord or a GitHub thread, who can check your claim in about a minute.",
    wants:
      "A specific, reproducible observation about the ledger. They will run it themselves.",
    pitfall:
      "Pitching at all. Post the measurement and the method; let the tool be discovered rather than sold.",
    lengthHint: "150–250 words, no preamble",
  },
  {
    id: "desk",
    label: "A TRADING DESK",
    reader:
      "Someone responsible for positions who has been told a book was deeper than it was.",
    wants: "What it costs them today, in their own terms, and what they do about it.",
    pitfall:
      "Leading with features. They do not want a console; they want to stop being wrong about depth.",
    lengthHint: "120–200 words, one ask",
  },
  {
    id: "institution",
    label: "A REGULATED INSTITUTION",
    reader:
      "A compliance or risk officer who must justify the tool to an examiner, not just use it.",
    wants:
      "Determinism, an audit trail, and an explicit statement of what the tool does NOT do.",
    pitfall:
      "Overclaiming. One unqualified sentence and the whole thing reads as marketing.",
    lengthHint: "250–400 words, plain",
  },
];

/**
 * Findings this product measured, each with the date and the caveat.
 *
 * These are the assets. They are the reason a pitch from here is not
 * interchangeable with a pitch from anyone else, and each is stated with
 * what would need re-checking before it is repeated to someone who can
 * verify it.
 */
export type Evidence = {
  id: string;
  headline: string;
  detail: string;
  measuredOn: string;
  /** What must be re-run before quoting this to someone. */
  staleAfter: string;
};

export const EVIDENCE: Evidence[] = [
  {
    id: "depth",
    headline: "92.8% of a major order book's visible depth could not fill",
    detail:
      "On USD/Bitstamp, 1,606,485 units were advertised on the ask side and 116,107 were backed by an owner who still held the asset. One offer advertised 1,400,100 USD against an owner balance of 22,273. The gap is reported by rippled in taker_gets_funded and ignored by anything that sums TakerGets.",
    measuredOn: "2026-08-28",
    staleAfter:
      "Order books move constantly. Re-run the measurement the day you send this and quote the fresh figure.",
  },
  {
    id: "partial",
    headline: "A tesSUCCESS payment that delivered 0.4% of its stated amount",
    detail:
      "Amount said 999,332.87 LRC. delivered_amount said 3,958.64. The transaction succeeded. Any system crediting the stated figure over-credits by roughly 250x, which is the mistake that has drained exchanges. Three of 223 consecutive payments carried the partial-payment flag.",
    measuredOn: "2026-08-28",
    staleAfter:
      "The transaction is immutable, so the example keeps. The 3-in-223 frequency is a sample and should be re-measured.",
  },
  {
    id: "impersonation",
    headline: "A live impersonation campaign, 1.1M transactions deep",
    detail:
      "One account had sent 1,116,900 transactions in nine days, issuing checks denominated in USDT from an issuer with zero obligations outstanding — a token that has never been issued to anyone, so no check it backs could ever be cashed. Sender and issuer publish the same domain.",
    measuredOn: "2026-08-28",
    staleAfter:
      "Check whether the campaign is still running before describing it in the present tense.",
  },
  {
    id: "quorum",
    headline: "Multi-signature that provides no second approval",
    detail:
      "XRPL compares a signer quorum against the sum of signing weights, not a count of signers. A list of five signers where one carries the quorum is a single-key account wearing a committee's clothes, and no interface reports it that way.",
    measuredOn: "2026-08-27",
    staleAfter: "A property of the protocol rather than a measurement. It keeps.",
  },
  {
    id: "reserve",
    headline: "XRPL's reserve prices out an attack that plagues other chains",
    detail:
      "Address poisoning costs only gas on an account-free chain. On XRPL every lookalike address must first be funded with the 1 XRP base reserve, so a thousand of them costs 1,000 XRP before a single dust payment. Fourteen accounts scanned for lookalike counterparties turned up none.",
    measuredOn: "2026-08-28",
    staleAfter:
      "The reserve is a protocol parameter and can be changed by amendment. Confirm it before quoting.",
  },
];

export type Pitch = {
  audience: Audience;
  subject: string;
  body: string;
  /** Named so the operator can strike anything they have not personally re-run. */
  evidenceUsed: Evidence[];
  /** Checked before sending, not after. */
  beforeYouSend: string[];
};

const NEVER_CLAIM = [
  "Do not describe NOSHASHI as endorsed by, partnered with, or affiliated with Ripple or the XRPL Foundation.",
  "Do not present a measured figure as current without re-running it the day you send.",
  "Do not imply the app signs, custodies or moves anything. It reads.",
];

export function composePitch(audienceId: string, evidenceIds: string[]): Pitch {
  const audience = AUDIENCES.find((a) => a.id === audienceId) ?? AUDIENCES[0];
  const evidence = EVIDENCE.filter((e) => evidenceIds.includes(e.id));
  const lead = evidence[0];

  const beforeYouSend = [
    ...evidence.map((e) => `${e.headline} — ${e.staleAfter}`),
    ...NEVER_CLAIM,
    "Read it aloud. If a sentence sounds like it was generated, rewrite it in your own voice before sending.",
  ];

  if (!lead) {
    return {
      audience,
      subject: "",
      body: "Choose at least one measurement. A pitch with no finding in it is a description of a category, which is the thing that does not work.",
      evidenceUsed: [],
      beforeYouSend,
    };
  }

  const others = evidence.slice(1);
  const secondary = others.length
    ? `\n\nTwo other things the same approach turned up:\n\n${others
        .map((e) => `· ${e.headline}. ${e.detail}`)
        .join("\n\n")}`
    : "";

  let subject = "";
  let body = "";

  if (audience.id === "grants") {
    subject = `XRPL Grants — ${lead.headline}`;
    body = `I build NOSHASHI, a desktop tool that reads XRPL mainnet and reports what the ledger publishes but does not make obvious. I am applying because the work is already done and running, not because I need funding to begin.

The finding that started it: ${lead.headline.toLowerCase()}. ${lead.detail}

I found this by measuring rather than assuming, and it was in my own shipped code first — the tool was summing advertised depth, which meant it was telling operators they could exit positions the book could not absorb. Fixing it is what turned it into a feature.${secondary}

What exists today: a Tauri desktop app reading validated mainnet state, a deterministic GO / HOLD / NO-GO adjudication engine with SHA-256 receipts, and ${EVIDENCE.length >= 4 ? "a dozen" : "several"} read tools. Four of them are free and need no account. There are 231 tests over the logic that makes claims, verified by mutation rather than by passing — I deliberately break each safety rule to confirm a test catches it.

What I would use a grant for is the part I cannot do alone: a self-hosted rippled node. Several things worth building — validator decentralisation analysis, per-validator amendment voting — are admin-only commands that public clusters refuse, so that work is blocked on infrastructure rather than on effort.

The app signs nothing, holds no keys and takes no custody. It reads.`;
  } else if (audience.id === "ripplex") {
    subject = `${lead.headline}`;
    body = `Measurement, not a pitch — you can reproduce this in a minute.

${lead.detail}

Method: book_offers returns taker_gets_funded only when an offer's owner cannot cover the listed amount, so its absence means fully funded and its presence means that is all they actually have. Summing TakerGets counts offers nobody can honour. Measured ${lead.measuredOn}.

I found it in my own code first — it was overstating exit depth by roughly fourteen times before I checked.${secondary}

Repo and the tool that reports it are available if useful. Mostly I wanted this measured somewhere findable, because every interface I can see sums the advertised number.`;
  } else if (audience.id === "desk") {
    subject = `The depth you are quoted is not the depth you can fill`;
    body = `Quick one, because it is worth about a minute of your time.

${lead.detail}

If you size an exit off displayed depth on XRPL, you are sizing off a number that includes offers whose owners no longer hold the asset. Nothing removes those until someone tries to cross them.

I built the thing that separates the two. It reads mainnet, shows quoted against fillable per side, and is free to try without an account.${secondary}

If it is useful, it is $749 a seat. If it is not, the measurement above is still worth having.`;
  } else {
    subject = `Adjudication you can hand to an examiner`;
    body = `NOSHASHI adjudicates XRPL settlements before they are signed and returns GO / HOLD / NO-GO with a SHA-256 receipt over the exact facts that decided it.

Three properties that matter for your file:

The engine is deterministic. The same facts produce the same verdict and the same digest. The digest covers the verdict, the subject, the amount and every check result — and deliberately not the wording, so rewording a sentence does not invalidate historical receipts.

It never fabricates. Where a figure cannot be established it says so rather than showing zero. ${lead.detail}

It does not move money. It reads validated mainnet state, signs nothing, holds no key, and takes no custody. There is no path in the software to transmit value.${secondary}

Offline adjudication runs from captured state on a segregated network, stamped with the ledger index and age it was captured at, and every verdict carries that disclosure so a stale reading cannot be mistaken for a live one.

What it is not: it is not a sanctions list, it invents no reputation score, and it is not legal advice. Those are stated in the product, not just here.`;
  }

  return { audience, subject, body, evidenceUsed: evidence, beforeYouSend };
}
