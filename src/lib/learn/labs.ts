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
  /** The tab of the scene that reads the subject, when the scene has several. */
  view?: string;
  /**
   * Values to type on a screen that does not take a handed-over value, or
   * extra fields for one that does (an invoice's account and amount). Each
   * is shown with a COPY button.
   */
  copy?: Array<{ label: string; value: string }>;
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

/** What each screen a lab uses is called in NOSHASHI's own navigation. */
export const LAB_SCREENS: Partial<Record<SceneId, string>> = {
  safeshop: "CHECK AN ADDRESS",
  nft: "TOKEN RIGHTS",
  claims: "INBOX",
  verify: "VERIFICATION",
  network: "LEDGER SYNC",
  agent: "NOSHX",
  treasury: "CONTROL SURFACE",
  authority: "AUTHORITY",
  book: "ORDER BOOK",
  amm: "POOL GOVERNANCE",
  settlement: "SETTLEMENT",
  provenance: "PROVENANCE",
  workstation: "LEDGER & POLICY",
  credentials: "CREDENTIALS",
  security: "SECURITY CENTER",
};

export const screenName = (scene: SceneId) => LAB_SCREENS[scene] ?? scene.toUpperCase();

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
  /** A phishing relay account: sprayed 1-drop dust, then deleted itself into the next account (recorded 2026-09-28; actNotFound). */
  phishingRelay: "rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN",
  /** Ripple Escrow Wallet #03 in ripple.com's xrp-ledger.toml: ten escrows to itself, recorded at ledger 107,296,847. */
  rippleEscrow: "rB3WNZc45gxzW31zxfXdkx8HusAhoqscPn",
  /** An NFT trader with 35 open sell offers and four buy offers that had expired, recorded at ledger 107,296,847. */
  nftTrader: "rP4pHjuJyaZ9RNVg48mMVRvGSwi7byj4BZ",
  /** XRP Toolkit's donations account: its Domain names xrptoolkit.com, whose xrp-ledger.toml lists it. */
  toolkit: "rTooLkitCksh5mQa67eaa2JaWHDBnHkpy",
  /** An AMM pool's account (it carries an AMMID), recorded at ledger 107,194,965. */
  ammPool: "rHUpaqUPbwzKZdzQ8ZQCme18FrgW9pB4am",
  /** A partial payment that asked for 100,000 XRP and delivered 0.077162 XRP, validated in ledger 107,194,530. */
  partialXrp: "307662378F518778F01116DBB93A43B882015FFB5EAB6899962741DF46FF19AA",
  /** A partial CSC payment: asked 162.6994990013102, delivered 161.1605415577872, ledger 107,587,014. */
  cscPayment: "F3B8B18E6AEFDCEA3388D0B0932820C4F10F4849847E7989876FA9CD19687A70",
  /** Where the CSC payment was sent. */
  cscDestination: "rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6",
  /** The CSC issuer. */
  cscIssuer: "rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr",
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
  {
    id: "security",
    title: "Lock down an account, and know what to do if one is emptied",
    outcome: "Read who can sign for an account, catch a lookalike address before you pay it, and know what can and cannot be done after a theft.",
    minutes: 5,
    steps: [
      {
        id: "who-signs",
        task: "Open SECURITY CENTER with a real multi-signature account filled in.",
        scene: "security",
        subject: S.multisig,
        subjectLabel: "a real 2-of-3 multi-signature account",
        lookFor:
          "\"At least 2 of 3 signers must agree\", the master key disabled, and a hardening plan of unsigned AccountSet transactions that refuse unsolicited NFT offers, checks and payment channels.",
        check: {
          question: "The hardening plan hands you transactions. Who signs them?",
          options: [
            "You, in your own wallet. NOSHASHI reads the ledger and never signs or asks for a key",
            "NOSHASHI signs them for you once you approve",
            "Anyone with the address can sign them",
          ],
          answer: 0,
          why: "An address is public; a secret key is not. Any site or app that offers to 'secure' your account by taking your seed is stealing it.",
        },
      },
      {
        id: "lookalike",
        task: "Open SECURITY CENTER › SAFE SEND and read how it checks a pasted address.",
        scene: "security",
        lookFor: "Your own address book, kept on this device, and a check that names any address which starts and ends like one in it but is a different account.",
        check: {
          question: "A tiny payment arrives from rDS6r59h…xaMan. You usually pay rDS6r59h…xaMan. What should you do next time you pay?",
          options: [
            "Take the address from your own records, never from history: a lookalike can match the start and end and still be a different account",
            "Copy it from the most recent transaction, since it is the newest",
            "Nothing: two addresses that start and end the same are the same account",
          ],
          answer: 0,
          why: "Wallets show only the first and last few characters. Address poisoning generates an address matching those and sends dust so it sits in your history, waiting to be copied.",
        },
      },
      {
        id: "no-reversal",
        task: "Check a real phishing account that has since disappeared.",
        scene: "security",
        subject: S.phishingRelay,
        subjectLabel: "a real phishing relay account",
        lookFor:
          "There is no account at this address any more. It sprayed 1-drop payments carrying a fake 'gift' link, then deleted itself, sweeping its balance by AccountDelete into the next account in a series that all end in \"xaman\".",
        check: {
          question: "Someone's XRP was stolen and moved on. What can undo a validated XRP Ledger payment?",
          options: [
            "Nothing on the ledger. Recovery happens off-ledger: an exchange freezing a tagged deposit, or a token's issuer freezing or clawing back its own token",
            "Validators can reverse it if you ask within 24 hours",
            "A recovery service can, for a fee",
          ],
          answer: 0,
          why: "Validated transactions are final. Paid 'recovery' offers are the second half of the scam. INCIDENT RESPONSE follows the value and lists the paths that really exist, with the evidence each needs.",
        },
      },
    ],
  },
  {
    id: "authority",
    title: "Certify what an issuer can still do",
    outcome: "Run an Authority certificate on a real issuer and read each of its checks without mistaking a fact for an accusation.",
    minutes: 4,
    requires: "authority_certificate",
    steps: [
      {
        id: "certify",
        task: "Open AUTHORITY, paste Bitstamp's USD issuing account into ISSUER, and press CERTIFY AUTHORITY.",
        scene: "authority",
        copy: [{ label: "Bitstamp's USD issuer", value: S.bitstamp }],
        lookFor: "A VERDICT, the ledger it was read at, the checks one by one, and a digest you can copy with COPY DIGEST.",
        check: {
          question: "Which kind of check, if it fails, makes the whole verdict NO-GO?",
          options: [
            "A blocking check, such as \"No single key controls the issuer\"",
            "Any warning check, such as the transfer fee",
            "None: the verdict is always GO for a well-known issuer",
          ],
          answer: 0,
          why: "A failed blocking check gives NO-GO. Failed warnings give HOLD. That is how every NOSHASHI verdict is decided.",
        },
      },
      {
        id: "single-key",
        task: "Find the check \"No single key controls the issuer\".",
        scene: "authority",
        copy: [{ label: "Bitstamp's USD issuer", value: S.bitstamp }],
        lookFor:
          "At ledger 107,193,471 (24 September 2026) Bitstamp's master key was disabled and one regular key, rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ, could sign for the account.",
        check: {
          question: "Why does one regular key fail this check even though the master key is disabled?",
          options: [
            "Whoever holds that one regular key can still sign for the issuer alone",
            "Regular keys are not allowed on issuers",
            "The check only looks at the master key",
          ],
          answer: 0,
          why: "Disabling the master key only matters if signing then needs several people. One regular key is still one key.",
        },
      },
      {
        id: "freeze",
        task: "Find the check \"Freeze permanently surrendered\".",
        scene: "authority",
        lookFor: "At ledger 107,193,471 Bitstamp had not set lsfNoFreeze, so this warning check did not pass.",
        check: {
          question: "Bitstamp keeps the right to freeze. How should a compliance officer read that?",
          options: [
            "As a fact to weigh: regulated issuers often must keep freeze rights",
            "As proof Bitstamp intends to freeze holders",
            "As a reason to report Bitstamp",
          ],
          answer: 0,
          why: "The certificate states what the issuer can still do so a holder decides knowingly. It is not an accusation.",
        },
      },
    ],
  },
  {
    id: "book",
    title: "Measure what a book can really fill",
    outcome: "Read an order book's listed and funded depth, and say how much of it you could actually trade into.",
    minutes: 3,
    requires: "portfolios",
    steps: [
      {
        id: "read",
        task: "Open ORDER BOOK with Bitstamp's USD issuer filled in. The currency is already USD.",
        scene: "book",
        subject: S.bitstamp,
        subjectLabel: "Bitstamp's USD issuer",
        lookFor: "FILLABLE — BIDS and FILLABLE — ASKS beside what is listed, and OFFERS THAT CANNOT FILL.",
        check: {
          question: "What does \"fillable\" count that \"listed\" does not?",
          options: [
            "Only what each offer's owner actually holds and can deliver",
            "Offers from verified companies only",
            "Offers placed in the last hour",
          ],
          answer: 0,
          why: "An offer stays listed after its owner runs out of funds. The ledger reports the real amount as taker_gets_funded.",
        },
      },
      {
        id: "worked",
        task: "Look at OFFERS THAT CANNOT FILL.",
        scene: "book",
        subject: S.bitstamp,
        subjectLabel: "Bitstamp's USD issuer",
        lookFor: "Each offer listed there is on the book but its owner cannot cover it.",
        check: {
          question: "Three offers list 10,000 each; their owners hold 10,000, 500 and 0. How much could you sell into them?",
          options: ["10,500", "30,000", "20,000"],
          answer: 0,
          why: "Only funded amounts trade: 10,000 + 500 + 0. Adding the listed amounts overstates the market by almost three times.",
        },
      },
    ],
  },
  {
    id: "amm",
    title: "Find out who governs a pool",
    outcome: "Read an AMM pool's trading fee, its fee votes and its auction slot, and say who really sets the price of using it.",
    minutes: 3,
    requires: "portfolios",
    steps: [
      {
        id: "read",
        task: "Open POOL GOVERNANCE, paste the pool account below, and press READ POOL GOVERNANCE.",
        scene: "amm",
        copy: [{ label: "AMM pool account", value: S.ammPool }],
        lookFor:
          "TRADING FEE, FEE VOTES with the LARGEST VOTER, and the AUCTION SLOT. The account is an AMM's own account: it carried an AMMID at ledger 107,194,965.",
        check: {
          question: "Whose votes decide the pool's trading fee?",
          options: [
            "LP token holders, weighted by how many LP tokens each holds",
            "The account that created the pool, forever",
            "Validators",
          ],
          answer: 0,
          why: "Voting power follows LP tokens, which is why the screen shows what share the largest voter carries.",
        },
      },
      {
        id: "slot",
        task: "Look at the AUCTION SLOT.",
        scene: "amm",
        lookFor: "Who holds the slot, if anyone, and whether it has EXPIRED.",
        check: {
          question: "What does holding the auction slot give an account?",
          options: [
            "A heavily discounted trading fee for a while",
            "Ownership of the pool's assets",
            "The right to freeze the pool",
          ],
          answer: 0,
          why: "The slot rewards active traders who keep the pool's price in line with the market.",
        },
      },
    ],
  },
  {
    id: "settlement",
    title: "See what a payment really delivered",
    outcome: "Read a real partial payment and credit what arrived, not what was asked for.",
    minutes: 3,
    requires: "portfolios",
    steps: [
      {
        id: "partial",
        task: "Open SETTLEMENT with the transaction below filled in.",
        scene: "settlement",
        subject: S.partialXrp,
        subjectLabel: "A real partial payment",
        lookFor:
          "REQUESTED and DELIVERED side by side, and PARTIAL FLAG. Validated in ledger 107,194,530, it asked for 100,000 XRP and delivered 0.077162 XRP, with RESULT tesSUCCESS.",
        check: {
          question: "How much should a business credit for this payment?",
          options: ["0.077162 XRP, the delivered amount", "100,000 XRP, the Amount", "Nothing, because it failed"],
          answer: 0,
          why: "It succeeded, but the partial-payment flag made Amount only a maximum. delivered_amount is what arrived.",
        },
      },
      {
        id: "flag",
        task: "Find PARTIAL FLAG in the RECORD.",
        scene: "settlement",
        subject: S.partialXrp,
        subjectLabel: "A real partial payment",
        lookFor: "The flag is set: Flags 131072 is tfPartialPayment.",
        check: {
          question: "What does the partial-payment flag change?",
          options: [
            "Amount becomes a maximum; the payment may deliver less and still succeed",
            "The payment is split across several ledgers",
            "The fee is waived",
          ],
          answer: 0,
          why: "That is exactly how exchanges that credited Amount were drained.",
        },
      },
    ],
  },
  {
    id: "invoice",
    title: "Check a payment against an invoice",
    outcome: "Run the Invoice check on a real mainnet payment and get REJECTED and VERIFIED for the right reasons.",
    minutes: 5,
    requires: "portfolios",
    steps: [
      {
        id: "rejected",
        task: "Open SETTLEMENT with the CSC payment filled in. In INVOICE CHECK enter the values below, choose ISSUED TOKEN, leave partial payments off, and press CHECK AGAINST INVOICE.",
        scene: "settlement",
        subject: S.cscPayment,
        subjectLabel: "A real CSC payment",
        copy: [
          { label: "INVOICE ID", value: "INV-CSC-1" },
          { label: "RECEIVING ACCOUNT", value: S.cscDestination },
          { label: "CURRENCY CODE", value: "CSC" },
          { label: "ISSUER", value: S.cscIssuer },
          { label: "EXPECTED AMOUNT", value: "162.6994990013102" },
        ],
        lookFor:
          "REJECTED with reason PARTIAL_NOT_PERMITTED. REQUESTED 162.6994990013102, DELIVERED 161.1605415577872, ledger 107,587,014.",
        check: {
          question: "Why is it REJECTED when the result was tesSUCCESS?",
          options: [
            "It was a partial payment, and this invoice does not accept partial payments",
            "The receiving account is wrong",
            "CSC is not a real token",
          ],
          answer: 0,
          why: "It delivered 1.538957443523 CSC less than asked, using the partial-payment flag, and the invoice did not allow that.",
        },
      },
      {
        id: "verified",
        task: "Change EXPECTED AMOUNT to the delivered figure below, switch on \"Accept partial payments that still meet the invoice\", and check again.",
        scene: "settlement",
        subject: S.cscPayment,
        subjectLabel: "A real CSC payment",
        copy: [{ label: "EXPECTED AMOUNT", value: "161.1605415577872" }],
        lookFor: "VERIFIED with reason SETTLED_PARTIAL_PERMITTED, and DIFFERENCE 0.",
        check: {
          question: "Partial payments are now allowed, but you set the amount back to 162.6994990013102. What happens?",
          options: [
            "REJECTED, underpaid: allowing partial payments does not lower the amount owed",
            "VERIFIED, because partial payments are allowed",
            "HOLD, because the amounts are close",
          ],
          answer: 0,
          why: "The check compares exact amounts. Accepting a partial payment means accepting one that still meets the invoice, not one that falls short.",
        },
      },
    ],
  },
  {
    id: "provenance",
    title: "Find where a counterparty came from",
    outcome: "Trace an account's real age and first funder before you deal with it.",
    minutes: 2,
    requires: "portfolios",
    steps: [
      {
        id: "trace",
        task: "Open PROVENANCE with Bitstamp's USD issuer filled in.",
        scene: "provenance",
        subject: S.bitstamp,
        subjectLabel: "Bitstamp's USD issuer",
        lookFor: "FUNDED BY, the FUNDING CHAIN, and how long ago the account was created.",
        check: {
          question: "Which counterparty deserves more questions?",
          options: [
            "A days-old account funded by an unknown source",
            "A years-old account funded by a known exchange",
            "They deserve exactly the same questions",
          ],
          answer: 0,
          why: "Most stolen withdrawals go to fresh accounts, and an unknown funder is a gap in the story.",
        },
      },
    ],
  },
  {
    id: "workstation",
    title: "Keep a record an auditor can check",
    outcome: "Find your verdict history, try a policy change safely, and export a file an auditor can verify.",
    minutes: 3,
    requires: "portfolios",
    steps: [
      {
        id: "policy",
        task: "Open LEDGER & POLICY and look at the Policy and Simulate tabs.",
        scene: "workstation",
        lookFor: "A draft policy can be simulated against past verdicts before anyone approves it.",
        check: {
          question: "Why simulate a policy change before it goes live?",
          options: [
            "To see which past verdicts it would have changed",
            "To make it take effect faster",
            "Because simulation skips approval",
          ],
          answer: 0,
          why: "A change is judged by what it would have done to real past decisions, and still needs a second person to approve it.",
        },
      },
      {
        id: "export",
        task: "Open the Export tab.",
        scene: "workstation",
        lookFor: "An export carries a SHA-256 chain-of-custody signature, and the screen explains how the recipient verifies it.",
        check: {
          question: "An auditor gets your export and someone changed one line in transit. What happens?",
          options: [
            "The fingerprint no longer matches, so the change shows",
            "Nothing: the change is invisible",
            "The file deletes itself",
          ],
          answer: 0,
          why: "Change one character and a SHA-256 digest changes completely.",
        },
      },
    ],
  },
  {
    id: "credentials",
    title: "See how credentials work on the ledger",
    outcome: "Read the credential registry and explain how a credential proves something without revealing personal data.",
    minutes: 2,
    steps: [
      {
        id: "how",
        task: "Open CREDENTIALS and read HOW CREDENTIALS WORK.",
        scene: "credentials",
        lookFor: "HELD CREDENTIALS, each with its ISSUER, SUBJECT, whether it is ACCEPTED, and when it EXPIRES.",
        check: {
          question: "A credential sits on an account but was never ACCEPTED. What does it prove?",
          options: [
            "Nothing yet: the subject has not accepted it",
            "Everything, as soon as it is issued",
            "That the account is frozen",
          ],
          answer: 0,
          why: "Under XLS-70 a credential counts only once the subject accepts it, and only until it expires.",
        },
      },
    ],
  },
  {
    id: "recovery",
    title: "Get stuck XRP back, close what others could use, and read before you sign",
    outcome: "Find XRP an account can recover, revoke the permissions it has left open, and recognise the signatures that empty accounts.",
    minutes: 6,
    steps: [
      {
        id: "escrow",
        task: "Open SECURITY CENTER › RECOVER FUNDS with Ripple's escrow wallet #03 filled in.",
        scene: "security",
        view: "recover",
        subject: S.rippleEscrow,
        subjectLabel: "Ripple's escrow wallet #03",
        lookFor: "Escrows to itself, each maturing on a date, listed as ARRIVING LATER; and AccountDelete blocked while escrows exist.",
        check: {
          question: "One of these escrows matures tomorrow. What happens to its XRP then?",
          options: [
            "Nothing until someone submits EscrowFinish: an escrow never pays out by itself",
            "It lands in the account automatically at the FinishAfter time",
            "It returns to Ripple's treasury",
          ],
          answer: 0,
          why: "FinishAfter only makes finishing possible. RECOVER FUNDS lists a matured escrow with the EscrowFinish to sign, naming the sequence of the EscrowCreate.",
        },
      },
      {
        id: "expired-offers",
        task: "Open RECOVER FUNDS for a real NFT trader.",
        scene: "security",
        view: "recover",
        subject: S.nftTrader,
        subjectLabel: "an NFT trader",
        lookFor: "Offers that have expired listed as NOW, each freeing 0.2 XRP of reserve, and live sell offers listed as OPTIONAL.",
        check: {
          question: "An NFT buy offer expired weeks ago. Does it still cost its owner anything?",
          options: [
            "Yes: it still locks 0.2 XRP of owner reserve until someone cancels it",
            "No: expired objects are removed by the ledger automatically",
            "Yes: it keeps charging a daily fee",
          ],
          answer: 0,
          why: "Expired offers, checks and escrows stay on the ledger, and keep their reserve, until a transaction removes them.",
        },
      },
      {
        id: "exposure",
        task: "Open SECURITY CENTER › EXPOSURE AUDIT for the same trader.",
        scene: "security",
        view: "exposure",
        subject: S.nftTrader,
        subjectLabel: "an NFT trader",
        lookFor: "Every open NFT sell offer named with who can take the NFT and at what price, each with an NFTokenCancelOffer to revoke it.",
        check: {
          question: "A site asks you to sign an NFTokenCreateOffer selling your NFT for 0 XRP to 'verify ownership'. What is it?",
          options: [
            "A giveaway: whoever accepts it takes the NFT for nothing. Do not sign",
            "A harmless ownership check",
            "A listing that needs your approval before anyone can accept it",
          ],
          answer: 0,
          why: "PRE-SIGN CHECK answers DO NOT SIGN for a zero-price sell offer, a new regular key or signer list, and an AccountDelete: the signatures that empty accounts.",
        },
      },
      {
        id: "domain",
        task: "Open SECURITY CENTER › DOMAIN CHECK with XRP Toolkit's account filled in.",
        scene: "security",
        view: "domain",
        subject: S.toolkit,
        subjectLabel: "XRP Toolkit's donations account",
        lookFor: "VERIFIED: the account's Domain names xrptoolkit.com, and xrptoolkit.com lists the account in its xrp-ledger.toml.",
        check: {
          question: "Another account sets its Domain to xrptoolkit.com. What will DOMAIN CHECK say?",
          options: [
            "UNVERIFIED: the site does not list it, so treat it as impersonation",
            "VERIFIED, because the Domain field matches",
            "Nothing: domains cannot be checked",
          ],
          answer: 0,
          why: "Anyone can write any domain into an account. Only the website listing the account back proves the claim.",
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
