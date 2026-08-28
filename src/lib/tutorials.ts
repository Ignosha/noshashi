/**
 * Animated explainers.
 *
 * Each tutorial is a list of timed beats. A beat carries copy and a scene
 * key; the renderer draws the scene and the player advances through them.
 *
 * Three rules, all of which come from the same place as the rest of this
 * product:
 *
 *   1. Nothing is narrated that the application does not do. These explain
 *      real behaviour, not a roadmap.
 *   2. Every number shown in a diagram is one that was actually measured —
 *      the depth figures are the real GateHub reading, not a round number
 *      chosen because it looks good on a slide.
 *   3. Under `prefers-reduced-motion` the whole sequence is presented as a
 *      static list rather than animated. The information is the point; the
 *      movement is not.
 */

export type BeatScene =
  | "gate-describe"
  | "gate-adjudicate"
  | "gate-receipt"
  | "freeze-holding"
  | "freeze-flag"
  | "freeze-frozen"
  | "freeze-nofreeze"
  | "book-naive"
  | "book-outlier"
  | "book-banded"
  | "check-paste"
  | "check-read"
  | "check-verdict";

export type Beat = {
  /** Milliseconds this beat holds before advancing. */
  hold: number;
  scene: BeatScene;
  title: string;
  body: string;
  /** Optional mono caption — a figure, a flag name, a command. */
  caption?: string;
};

export type Tutorial = {
  id: string;
  title: string;
  /** One sentence: what you will understand afterwards. */
  promise: string;
  minutes: number;
  beats: Beat[];
};

export const TUTORIALS: Tutorial[] = [
  {
    id: "gate",
    title: "How the gate works",
    promise:
      "Why NOSHASHI can check a settlement before it exists, and what the three answers mean.",
    minutes: 1,
    beats: [
      {
        hold: 5200,
        scene: "gate-describe",
        title: "You describe a settlement",
        body: "Destination, amount, and the permissioned domain it is headed into. Nothing is signed, nothing is broadcast, and no fee is at risk — because no transaction exists yet.",
        caption: "DESCRIBE",
      },
      {
        hold: 6400,
        scene: "gate-adjudicate",
        title: "Rules run in a fixed order",
        body: "Account activation, credentials, reserve solvency, spendable balance, transfer ceiling, domain governance, attestation. The order never changes, so the same inputs always produce the same answer.",
        caption: "ADJUDICATE · 8 RULES",
      },
      {
        hold: 6800,
        scene: "gate-receipt",
        title: "The verdict is hashed",
        body: "A canonical SHA-256 over the evaluation. Anyone re-running the same check gets the same digest, which is what makes it worth handing to an auditor — it proves the check ran without exposing what was checked.",
        caption: "SHA-256 RECEIPT",
      },
    ],
  },
  {
    id: "freeze",
    title: "Freeze rights, in ninety seconds",
    promise:
      "Why a balance in your wallet is not necessarily yours, and which flag decides it.",
    minutes: 1,
    beats: [
      {
        hold: 5200,
        scene: "freeze-holding",
        title: "You hold an issued token",
        body: "Not XRP — a dollar, a euro, or a token some company put on the ledger. It is closer to a gift card than to cash: an issuer stands behind it, and the ledger records who holds how much.",
        caption: "ISSUED CURRENCY",
      },
      {
        hold: 6600,
        scene: "freeze-flag",
        title: "The issuer holds a switch",
        body: "Most issuers can freeze what they issued. It is a built-in power of the ledger, not a loophole. The balance stays visible in your wallet — it simply stops being able to move.",
        caption: "lsfGlobalFreeze",
      },
      {
        hold: 6400,
        scene: "freeze-frozen",
        title: "Frozen means stuck, not gone",
        body: "You still see the number. You cannot send it, sell it or redeem it. XLS-77 deep freeze goes further and stops you receiving too — which matters, because an ordinary freeze leaves a sanctioned address still able to accept funds.",
        caption: "XLS-77 · DEEP FREEZE",
      },
      {
        hold: 6600,
        scene: "freeze-nofreeze",
        title: "Some issuers give the right up",
        body: "lsfNoFreeze is permanent and cannot be undone. An issuer that has set it can never immobilise your balance. NOSHASHI reads this for every issuer behind every position you hold.",
        caption: "lsfNoFreeze · IRREVERSIBLE",
      },
    ],
  },
  {
    id: "depth",
    title: "Why a price can be false",
    promise:
      "How an order book can advertise millions of dollars of depth and mean almost none of it.",
    minutes: 1,
    beats: [
      {
        hold: 5600,
        scene: "book-naive",
        title: "The book looks deep",
        body: "Add up every resting offer and this pair appears to have twelve and a half million dollars of buyers waiting. That is the number most tools would show you.",
        caption: "12,692,991 USD — APPARENT",
      },
      {
        hold: 7000,
        scene: "book-outlier",
        title: "One offer is priced at 29× the market",
        body: "A single stale order sits at the very top of the book. Take it as the best bid and every spread and slippage figure computed from it is wrong — this one produced a spread of minus eighteen thousand basis points.",
        caption: "BEST BID 19.90 vs MARKET 0.68",
      },
      {
        hold: 7200,
        scene: "book-banded",
        title: "Only nearby depth is an exit",
        body: "Anchor on the tightest uncrossed pair, then count only what sits within ten percent of it. Everything further out is a wish, not a bid. What remains here is 13,894 dollars — 913 times less than advertised.",
        caption: "13,894 USD — REACHABLE",
      },
    ],
  },
  {
    id: "check",
    title: "Checking an address",
    promise: "What the free public check reads, and what it deliberately refuses to tell you.",
    minutes: 1,
    beats: [
      {
        hold: 4800,
        scene: "check-paste",
        title: "Paste any address",
        body: "A shop, a token issuer, someone on the other end of a trade. No account, nothing signed, and the address never leaves your machine except as a public ledger query.",
        caption: "r…",
      },
      {
        hold: 6600,
        scene: "check-read",
        title: "Published facts only",
        body: "Can they freeze what they issue? What do they charge to transfer? What is outstanding? What credentials do they hold, and who have they actually dealt with? All of it is already public — almost nobody looks.",
        caption: "READ · NEVER WRITTEN",
      },
      {
        hold: 7200,
        scene: "check-verdict",
        title: "It will not tell you they are honest",
        body: "There is no bad-actor list behind this and no reputation score, because we do not have one. A clean result means nothing is recorded against them — which is not the same as a recommendation, and the interface says so.",
        caption: "NO INVENTED REPUTATION",
      },
    ],
  },
];

export function totalMs(t: Tutorial): number {
  return t.beats.reduce((sum, b) => sum + b.hold, 0);
}
