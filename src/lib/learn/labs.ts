import type { SceneId } from "@/App";

/**
 * Labs — learning NOSHASHI by using it.
 *
 * The explainers show what the product does; a lab has you do it. Each
 * step sends you to the real screen, often with a real mainnet address or
 * token already filled in, tells you what to look for, and then asks one
 * question about what you just saw. Answering it right finishes the step
 * and puts the question into your review deck, which brings it back a day
 * later, then three days, a week, and so on (see labProgress.ts). Being
 * asked again, just as you are about to forget, is what makes it stick.
 *
 * Every address and token id below is real, and every fact a step says you
 * will see was read from XRPL mainnet and is recorded in the repository
 * (src/lib/learn/misread.cases.json and the desk test fixtures), so the
 * labs test those recordings rather than trusting this file. Account state
 * can change after it was recorded; each step names the ledger it was read
 * at, and the screen always shows what the ledger says now.
 */

export type Checkpoint = {
  question: string;
  options: string[];
  /** Index into `options` of the right answer. */
  answer: number;
  /** Shown after answering, right or wrong: the reason, in one or two sentences. */
  why: string;
};

export type LabStep = {
  id: string;
  /** What to do, as an instruction. */
  task: string;
  /** Screen the step happens on. */
  scene: SceneId;
  /** Value handed to that screen (an address, a token id, a question). */
  subject?: string;
  /** What `subject` is, in a few words ("Bitstamp's USD issuer"). */
  subjectLabel?: string;
  /** What to look for once there. */
  lookFor: string;
  check: Checkpoint;
};

export type Lab = {
  id: string;
  title: string;
  /** One sentence: what you can do after finishing it. */
  outcome: string;
  minutes: number;
  /** Plan feature the lab's screens need, when they need one. */
  requires?: string;
  /** A cost worth knowing before starting, such as free checks used. */
  note?: string;
  steps: LabStep[];
};

/** Real mainnet subjects, named once so tests can check them against the recordings. */
export const LAB_SUBJECTS = {
  /** Bitstamp's USD issuing account. account_info recorded at ledger 107,193,471. */
  bitstamp: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
  /** Answered actNotFound at ledger 107,194,798. */
  unfunded: "rPGJe8F1FzegsNDJEMkq3hUrupovdBjQMi",
  /** Signer list (quorum 2, three weight-1 signers) recorded at ledger 107,194,532. */
  multisig: "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX",
  /** Transferable, 5% resale fee, issuer r4qHM7vWeLTtWPVoEzDjT6AskpQjSmui7B. */
  nftFixed: "00081388EF7C422EF52CEB969960BEF4144D7BC3F862C4679F0C0036059EAF97",
  /** Transferable and mutable, 10% resale fee, issuer rKDFM3xaC3B7ijWkX4iHcMTcLFgxW2dK74. */
  nftMutable: "00182710C7DEC772B41E9496AA92D148C4FD64D239AA629847C852FD05B7EEED",
} as const;

const S = LAB_SUBJECTS;

export const LABS: Lab[] = [
  {
    id: "address",
    title: "Check an address before you pay it",
    outcome: "Read what the ledger publishes about any account, and know what each verdict does and does not mean.",
    minutes: 4,
    note: "Uses 2 of your 10 free address checks this month.",
    steps: [
      {
        id: "order",
        task: "Open CHECK AN ADDRESS with Bitstamp's USD issuing account filled in, and press CHECK.",
        scene: "safeshop",
        subject: S.bitstamp,
        subjectLabel: "Bitstamp's USD issuer",
        lookFor:
          "The verdict at the top, then a list of findings. Each finding is one fact the account publishes and what it means for you.",
        check: {
          question: "In what order are the findings listed?",
          options: ["Most serious first", "Oldest first", "Alphabetically"],
          answer: 0,
          why: "Findings are sorted by severity: critical, then warnings, then information, then what is fine. The fact that could cost you money is always the first one you read.",
        },
      },
      {
        id: "freeze",
        task: "In the same report, find the finding about freezing.",
        scene: "safeshop",
        subject: S.bitstamp,
        subjectLabel: "Bitstamp's USD issuer",
        lookFor:
          "When this lab was written (ledger 107,193,471, 24 September 2026) the account had not set lsfNoFreeze, so the finding read \"This issuer can freeze your balance at any time\".",
        check: {
          question: "An issuer that can freeze holds your balance. What does a freeze do to it?",
          options: [
            "The balance stays visible but cannot be sent, sold or redeemed",
            "The issuer takes the tokens out of your wallet",
            "Nothing: freezing only applies to XRP",
          ],
          answer: 0,
          why: "Frozen means stuck, not gone. Taking tokens back is clawback, a separate flag. XRP itself can never be frozen; only issued tokens can.",
        },
      },
      {
        id: "fee",
        task: "Still in the same report, find what Bitstamp charges to transfer its token.",
        scene: "safeshop",
        subject: S.bitstamp,
        subjectLabel: "Bitstamp's USD issuer",
        lookFor:
          "\"Charges 15 basis points to transfer\". The account's TransferRate field was 1001500000 at ledger 107,193,471, which NOSHASHI turns into basis points for you.",
        check: {
          question: "One holder sends 1,000 Bitstamp USD to another. What does the 0.15% transfer fee add?",
          options: ["1.50 USD, paid by the sender", "15 USD, paid by the receiver", "Nothing: transfer fees only apply to XRP"],
          answer: 0,
          why: "15 basis points is 0.15%. The sender is debited 1,001.50 so the receiver gets exactly 1,000. Payments straight to or from the issuer pay no fee.",
        },
      },
      {
        id: "unfunded",
        task: "Check a second address: one that had never been funded when this lab was written.",
        scene: "safeshop",
        subject: S.unfunded,
        subjectLabel: "an address with no account",
        lookFor:
          "At ledger 107,194,798 the ledger answered actNotFound for it. The report says \"This address has never been funded\" under the verdict THINGS TO KNOW FIRST.",
        check: {
          question: "What does \"never been funded\" tell you?",
          options: [
            "No account exists there yet: a payment would have to create it, and nothing about it can be verified",
            "The account exists and is empty, so it is safe",
            "The address is mistyped",
          ],
          answer: 0,
          why: "A well-formed address with no account is not an account holding nothing. Nobody has ever used it, so there is nothing to check.",
        },
      },
      {
        id: "clear",
        task: "Look at the verdict line on any report.",
        scene: "safeshop",
        lookFor:
          "There are four verdicts: SERIOUS SIGNALS, THINGS TO KNOW FIRST, NOTHING RECORDED AGAINST IT, and NOT READABLE when the ledger could not be reached.",
        check: {
          question: "A report says NOTHING RECORDED AGAINST IT. What is NOSHASHI telling you?",
          options: [
            "The ledger publishes nothing that would stop you, which is not a recommendation",
            "The account has been vetted and is safe to pay",
            "The account is on an approved list",
          ],
          answer: 0,
          why: "There is no bad-actor list or reputation score behind the check. A clean result means nothing is recorded against the account, and the screen never says \"safe\".",
        },
      },
    ],
  },
  {
    id: "nft",
    title: "Know what an NFT's issuer can still do",
    outcome: "Read an NFT's rights from its id before you buy it: resale fee, whether it can be destroyed, and whether it can change.",
    minutes: 3,
    steps: [
      {
        id: "decode",
        task: "Open TOKEN RIGHTS with a real NFT id filled in, and press READ.",
        scene: "nft",
        subject: S.nftFixed,
        subjectLabel: "a real mainnet NFT",
        lookFor:
          "Its issuer, r4qHM7vWeLTtWPVoEzDjT6AskpQjSmui7B; \"The issuer cannot destroy this token\"; and \"The issuer takes 5.000% of every resale\".",
        check: {
          question: "Where do those rights come from?",
          options: [
            "They are packed into the token's 64-character id when it is minted, and never change",
            "From the marketplace listing",
            "From the image's metadata",
          ],
          answer: 0,
          why: "The id carries the flags, the transfer fee, the issuer and the taxon. That is why TOKEN RIGHTS can read them without trusting anyone's website.",
        },
      },
      {
        id: "royalty",
        task: "Stay on the same token and look at the resale fee again.",
        scene: "nft",
        subject: S.nftFixed,
        subjectLabel: "a real mainnet NFT",
        lookFor: "The fee is 5%, set at mint and fixed for the life of the token.",
        check: {
          question: "Someone resells this NFT for 200 XRP. How much goes to the issuer?",
          options: ["10 XRP", "5 XRP", "Nothing unless the issuer approves the sale"],
          answer: 0,
          why: "5% of 200 is 10. The ledger takes it on every sale between other people; nobody has to approve it.",
        },
      },
      {
        id: "mutable",
        task: "Read a second token, one minted with the mutable flag.",
        scene: "nft",
        subject: S.nftMutable,
        subjectLabel: "a mutable mainnet NFT",
        lookFor:
          "\"The issuer can change what this token points at\", plus a 10% resale fee. Its id carries flag 0x0010 (mutable).",
        check: {
          question: "Why does TOKEN RIGHTS never show the picture?",
          options: [
            "The picture is the one part the ledger does not guarantee, and on a mutable token the issuer can change it",
            "To save bandwidth",
            "Pictures need a paid plan",
          ],
          answer: 0,
          why: "The image lives off-ledger behind a URI. Showing it at the largest size would put the least reliable part of the token first, so the screen shows the rights instead.",
        },
      },
    ],
  },
  {
    id: "claims",
    title: "Tell a real claim from a fake one in your inbox",
    outcome: "Spot a check sent to you that can never be cashed, and know what an unwanted one costs you.",
    minutes: 3,
    steps: [
      {
        id: "combination",
        task: "Open INBOX and read an address you own or follow.",
        scene: "claims",
        lookFor:
          "Every Check other accounts have addressed to it. A Check is an offer to pay a token; nothing moves until it is cashed. The findings name any that cannot be cashed.",
        check: {
          question: "Which combination marks a check as one that can never be cashed?",
          options: [
            "A familiar ticker, such as USDT, from an issuer that has issued nothing to anyone",
            "Any check you did not ask for",
            "Any check for a small amount",
          ],
          answer: 0,
          why: "A currency code is not a name anyone owns: any account can issue a token called USDT. An issuer with no obligations outstanding has never issued a balance, so there is nothing the check could pay.",
        },
      },
      {
        id: "issuer",
        task: "Stay on INBOX and look at how a borrowed ticker from a real issuer is reported.",
        scene: "claims",
        lookFor:
          "A check in a well-known ticker whose issuer does have balances outstanding gets a warning, \"verify the issuer, not the ticker\", rather than the critical finding.",
        check: {
          question: "A check in \"USDT\" comes from an issuer that does have balances outstanding. What does INBOX tell you?",
          options: [
            "Verify the issuer, not the ticker: only the issuing address identifies a token",
            "It is confirmed as the real USDT",
            "It can never be cashed",
          ],
          answer: 0,
          why: "Someone genuinely holds that issuer's token, so calling it uncashable would be false. It still may not be the USDT you are thinking of.",
        },
      },
      {
        id: "cost",
        task: "Read the last finding on any INBOX report.",
        scene: "claims",
        lookFor: "\"None of this costs the recipient anything\".",
        check: {
          question: "An unwanted check is addressed to you. What does it cost you to leave it alone?",
          options: [
            "Nothing: a check counts against its creator's reserve, not yours",
            "Part of your XRP reserve until you delete it",
            "A small fee each day",
          ],
          answer: 0,
          why: "The Check object is owned by whoever created it. Ignoring it is free and there is nothing to clean up; the danger is only in following where it leads.",
        },
      },
    ],
  },
  {
    id: "gate",
    title: "Run a settlement through the gate",
    outcome: "Check a payment before it exists, read the rule-by-rule result, and know what the receipt proves.",
    minutes: 3,
    steps: [
      {
        id: "nothing-sent",
        task: "Open VERIFICATION, leave the amount at 100 XRP, and press RUN.",
        scene: "verify",
        lookFor:
          "A verdict, the results of each rule in order, and a SHA-256 receipt. The first rule, \"Account activated on mainnet\", checks the wallet loaded in SETTINGS.",
        check: {
          question: "Does running a verification sign or send anything?",
          options: [
            "No. No transaction exists yet, so nothing is signed, broadcast or charged",
            "It sends a zero-value test payment",
            "It signs the payment but does not broadcast it",
          ],
          answer: 0,
          why: "You describe a settlement and the gate judges the description. NOSHASHI never holds a key, so it could not sign even if asked.",
        },
      },
      {
        id: "no-wallet",
        task: "Look at the first rule's result.",
        scene: "verify",
        lookFor:
          "With a wallet loaded it passes. With none, it fails with \"No validated account object found for this address.\"",
        check: {
          question: "With no wallet loaded, the first rule fails. Why?",
          options: [
            "The gate checks the sending wallet, and without one there is nothing to check, so it refuses rather than assume",
            "The amount is too small",
            "The network is down",
          ],
          answer: 0,
          why: "A missing fact is never counted as a pass. That is the difference between a gate and a form.",
        },
      },
      {
        id: "receipt",
        task: "Find the receipt digest in the result.",
        scene: "verify",
        lookFor: "A SHA-256 digest over the whole evaluation.",
        check: {
          question: "What makes that receipt worth handing to an auditor?",
          options: [
            "Anyone re-running the same check on the same inputs gets the same digest, which proves it ran without revealing what was checked",
            "It is signed by Ripple",
            "It is stored on the ledger",
          ],
          answer: 0,
          why: "The rules run in a fixed order and the evaluation is hashed canonically, so the same inputs always give the same answer and the same digest.",
        },
      },
    ],
  },
  {
    id: "network",
    title: "See the network the way NOSHASHI does",
    outcome: "Read what several public XRPL nodes report, and know why disagreement between them matters.",
    minutes: 2,
    steps: [
      {
        id: "four",
        task: "Open LEDGER SYNC.",
        scene: "network",
        lookFor: "Four public XRPL nodes, each named, with what each reported and how fresh the reading is.",
        check: {
          question: "Why does NOSHASHI ask four nodes instead of one?",
          options: [
            "One node's answer is a single sample; where they disagree is itself the reading",
            "To make it four times faster",
            "Each node holds a quarter of the ledger",
          ],
          answer: 0,
          why: "One node's server_info under a NETWORK heading would be a claim about the whole ledger from a single sample. Showing each node, and where they differ, keeps the page honest.",
        },
      },
      {
        id: "fresh",
        task: "Look at the freshness label beside the reading.",
        scene: "network",
        lookFor: "The page re-reads every 30 seconds and says how old the reading is.",
        check: {
          question: "You leave LEDGER SYNC open and hide the window for an hour. What happens?",
          options: [
            "It stops reading while hidden and reads again as soon as you return, so an old reading is never shown as live",
            "It keeps asking the nodes every 30 seconds",
            "It shows the hour-old reading as live",
          ],
          answer: 0,
          why: "Disagreement between nodes is only a signal if it is current, and polling nobody is watching wastes free public infrastructure.",
        },
      },
    ],
  },
  {
    id: "noshx",
    title: "Ask NOSHX, then check its work",
    outcome: "Use NOSHX to read the ledger for you, check its answer yourself, and get a person when you need one.",
    minutes: 3,
    steps: [
      {
        id: "same-readers",
        task: "Open NOSHX with a question already typed, and send it.",
        scene: "agent",
        subject: `What can the issuer of NFT ${S.nftFixed} still do to it?`,
        subjectLabel: "a question about a real NFT",
        lookFor:
          "NOSHX reads the token with the same reader TOKEN RIGHTS uses and answers with the same facts: a 5% resale fee, and an issuer that cannot destroy it.",
        check: {
          question: "How do you check an answer NOSHX gave about the ledger?",
          options: [
            "Run the same lookup on its own screen. NOSHX uses the same readers, so the facts must match",
            "Ask it again until it agrees with itself",
            "You cannot; the model has to be trusted",
          ],
          answer: 0,
          why: "NOSHX answers from live ledger reads, not memory. Every tool it uses is also a screen you can open yourself.",
        },
      },
      {
        id: "seed",
        task: "Nothing to type. Read the GUARDRAILS panel beside the NOSHX chat.",
        scene: "agent",
        lookFor:
          "\"Will not send a message containing an XRPL secret seed, to any model.\" Support tickets refuse one the same way, before anything is sent.",
        check: {
          question: "Someone claiming to be NOSHASHI support asks for your wallet's secret key to \"verify\" it. What is true?",
          options: [
            "NOSHASHI never needs it. If it was ever shared, move the funds to a new wallet",
            "Share it only inside a support ticket",
            "Share only the first half",
          ],
          answer: 0,
          why: "NOSHASHI is read-only and never holds keys. Anyone asking for a seed is trying to take the wallet, whoever they say they are.",
        },
      },
      {
        id: "ticket",
        task: "Open the TICKETS tab in NOSHX.",
        scene: "agent",
        lookFor:
          "Once you are signed in, you can open a ticket with a subject, a topic and a priority, and follow the replies. SUPPORT REPLIED means it is your turn.",
        check: {
          question: "Where do support's answers to your ticket arrive?",
          options: [
            "In NOSHX › TICKETS, where you can reply, mark it resolved, or reopen it",
            "Only by post",
            "Nowhere: tickets are not answered",
          ],
          answer: 0,
          why: "Support answers in the ticket's thread, and when email is set up you are also told by email. The thread is the record.",
        },
      },
    ],
  },
  {
    id: "treasury",
    title: "Find out who can move a treasury",
    outcome: "Read a multi-signature account and work out the fewest people who can move its funds.",
    minutes: 2,
    requires: "portfolios",
    steps: [
      {
        id: "quorum",
        task: "Open CONTROL SURFACE with a real multi-signature account filled in.",
        scene: "treasury",
        subject: S.multisig,
        subjectLabel: "a real multi-signature account",
        lookFor:
          "At ledger 107,194,532 its signer list had three signers, each of weight 1, and a quorum of 2.",
        check: {
          question: "How many of those signers must sign together to move its funds?",
          options: ["2", "3", "1"],
          answer: 0,
          why: "The ledger compares the quorum (2) with the sum of the signers' weights. Any two weight-1 signers reach it.",
        },
      },
      {
        id: "weights",
        task: "Apply the same rule to a list you design yourself.",
        scene: "treasury",
        subject: S.multisig,
        subjectLabel: "a real multi-signature account",
        lookFor: "CONTROL SURFACE reports the fewest signers who can reach the quorum, not how many are listed.",
        check: {
          question: "A signer list has quorum 3 and signers of weight 2, 1 and 1. What is the fewest who can move funds?",
          options: ["2: the weight-2 signer and either weight-1 signer", "3: all of them", "1: the weight-2 signer"],
          answer: 0,
          why: "2 + 1 = 3 reaches the quorum. The headcount says three people control the account; the weights say two are enough.",
        },
      },
    ],
  },
];

export const labById = (id: string) => LABS.find((l) => l.id === id);

/** Every step in every lab, keyed the way progress is stored: "lab/step". */
export function allSteps(): Array<{ key: string; lab: Lab; step: LabStep }> {
  return LABS.flatMap((lab) => lab.steps.map((step) => ({ key: `${lab.id}/${step.id}`, lab, step })));
}
