// The Learn page's narrated explainers: what each video shows and says.
//
// Every figure here is a reading already published on /learn/, quoted
// with the ledger index and date it was taken at. Nothing is invented and
// nothing is staged: where the app needs a live ledger connection, the
// video explains the screen instead of showing made-up results.
//
// A scene is a title plus a body of HTML. `say` is the narration, one
// beat per entry; body elements marked data-at="n" appear as beat n
// begins. The same beats become the captions (.vtt).

const row = (at, cells, cls = "") =>
  `<tr data-at="${at}" class="${cls}">${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

export const VIDEOS = [
  {
    id: "01-what-noshashi-does",
    title: "What NOSHASHI does",
    blurb: "The two questions it answers, the three verdicts, and the receipt behind every reading.",
    lesson: "l13",
    scenes: [
      {
        kick: "LEARN NOSHASHI · VIDEO 1",
        title: "What NOSHASHI does",
        body: `<p class="sub" data-at="0">A desktop app for macOS, Windows and Linux that reads the live XRP Ledger.</p>`,
        say: ["This is NOSHASHI: a desktop app for Mac, Windows and Linux that reads the live XRP Ledger, and tells an institution what it needs to know before it moves a token."],
      },
      {
        kick: "TWO QUESTIONS",
        title: "One reading, two answers",
        body: `
          <div class="cards two">
            <div class="c" data-at="1"><i>1</i><b>Am I allowed to move this?</b><span>Issuer powers · credentials · Travel Rule scope · counterparty provenance · your policy</span></div>
            <div class="c" data-at="2"><i>2</i><b>Could I actually get out of it?</b><span>Funded order-book depth · AMM pools · holder concentration</span></div>
          </div>
          <p class="note" data-at="3">Same WebSocket · same second · one result</p>`,
        say: [
          "Anyone holding a token on the XRP Ledger faces two questions.",
          "First: am I allowed to move this? That depends on what the issuer can still do, on credentials, on Travel Rule scope, on where the counterparty came from, and on your own policy.",
          "Second: could I actually get out of it? That depends on how much of the order book is really funded, on the pools, and on how concentrated the holders are.",
          "Compliance tools rarely read the order book, and market terminals rarely read the issuer's flags. NOSHASHI answers both from the same ledger reading, in the same second.",
        ],
      },
      {
        kick: "VERDICTS",
        title: "Three verdicts, five check states",
        body: `
          <div class="verdicts">
            <div class="v go" data-at="0"><b>GO</b><span>Every check passed.</span></div>
            <div class="v hold" data-at="1"><b>HOLD</b><span>A warning did not pass, or a check needs review.</span></div>
            <div class="v nogo" data-at="2"><b>NO-GO</b><span>A blocking check failed.</span></div>
          </div>
          <p class="chips" data-at="3"><em>PASS</em><em>FAIL</em><em>REVIEW</em><em>INSUFFICIENT_DATA</em><em>NOT_APPLICABLE</em></p>`,
        say: [
          "Every adjudication ends in one of three verdicts. GO means every check passed.",
          "HOLD means a warning-level check did not pass, or something needs a person to review it.",
          "NO-GO means a blocking check failed. Do not move until it is resolved, or formally excepted.",
          "Each check reports one of five states. Insufficient data is an abstention, never a pass: NOSHASHI would rather say it cannot tell than guess.",
        ],
      },
      {
        kick: "EVIDENCE",
        title: "Every verdict leaves a receipt",
        body: `
          <div class="receipt" data-at="0">
            <div><span>LEDGER INDEX</span><b>the exact moment read</b></div>
            <div><span>RULES VERSION</span><b>which rules decided</b></div>
            <div><span>CHECKS</span><b>each outcome and its rule</b></div>
            <div><span>SHA-256 DIGEST</span><b>a fingerprint over all of it</b></div>
          </div>
          <p class="note" data-at="1">Recompute the digest over the same contents → the same fingerprint.</p>`,
        say: [
          "Every verdict produces a receipt: the ledger index it was read at, the rules version, every check's outcome, and a SHA-256 digest over all of it.",
          "Anyone who recomputes the digest later gets the same fingerprint, so a compliance file can prove what was known, and when, without anyone having to trust NOSHASHI.",
        ],
      },
      {
        kick: "WHO IT IS FOR",
        title: "Built for the people who sign off",
        body: `
          <div class="grid3">
            <div class="c" data-at="0"><b>Compliance officers</b><span>Screening assets and settlements, evidence for regulators</span></div>
            <div class="c" data-at="0"><b>Trading desks &amp; funds</b><span>Which positions can really be exited</span></div>
            <div class="c" data-at="1"><b>Treasury teams</b><span>Who controls the treasury, for auditors</span></div>
            <div class="c" data-at="1"><b>Token issuers</b><span>Their issuance as holders see it</span></div>
            <div class="c" data-at="2"><b>Auditors</b><span>Ledger-stamped, reproducible evidence</span></div>
            <div class="c" data-at="2"><b>Anyone</b><span>Check an address before paying it, free</span></div>
          </div>`,
        say: [
          "It is built for compliance officers screening assets and settlements, and for trading desks that need to know which positions they could really exit.",
          "Treasury teams use it to show auditors who controls the treasury. Token issuers use it to see their token the way holders see it.",
          "Auditors get evidence stamped with a ledger index that they can reproduce. And anyone can check an address before paying it, for free.",
        ],
      },
      {
        kick: "BETA 1.0.9",
        title: "Start free, re-check everything",
        body: `
          <ul class="list">
            <li data-at="0">Free plan: Check an Address (10 a month), Ledger Sync and the website tools</li>
            <li data-at="1">Every build is labelled beta</li>
            <li data-at="1">Information, not financial or legal advice</li>
          </ul>
          <p class="url" data-at="2">noshashi.app/learn</p>`,
        say: [
          "You can start on the free plan: ten address checks a month, Ledger Sync, and the free tools on the website.",
          "NOSHASHI is in beta, at version one point zero point nine. It gives information, not financial or legal advice, and every reading carries its ledger index so you can re-check it.",
          "The full course, the knowledge check and the word list are at noshashi dot app slash learn.",
        ],
      },
    ],
  },

  {
    id: "02-xrpl-basics",
    title: "XRP Ledger basics",
    blurb: "Consensus, accounts and reserves, transactions and result codes, tokens and trust lines.",
    lesson: "l1",
    scenes: [
      {
        kick: "LEARN NOSHASHI · VIDEO 2",
        title: "XRP Ledger basics",
        body: `<p class="sub" data-at="0">Everything NOSHASHI reads sits on these five ideas.</p>`,
        say: ["Everything NOSHASHI reads sits on a few basic ideas about the XRP Ledger. Here they are, one at a time."],
      },
      {
        kick: "CONSENSUS",
        title: "How the ledger agrees on the truth",
        body: `
          <div class="flowrow">
            <span data-at="0">Transactions arrive</span><i data-at="1">→</i>
            <span data-at="1">Validators vote</span><i data-at="2">→</i>
            <span data-at="2" class="hi">80% of a server's UNL agree</span><i data-at="3">→</i>
            <span data-at="3" class="ok">Validated · final</span>
          </div>
          <p class="big" data-at="4">A new ledger every <b>3–5 seconds</b></p>`,
        say: [
          "There is no miner and no single company deciding what is true.",
          "Instead, independent servers called validators vote on which transactions go into the next ledger.",
          "Each server trusts a list of validators, its U N L. When at least eighty percent of that list agree,",
          "the ledger is validated. It is final, and it can never change.",
          "A new ledger closes every three to five seconds, each with a higher ledger index. That index is how NOSHASHI stamps the exact moment it read.",
        ],
      },
      {
        kick: "ACCOUNTS",
        title: "Accounts, keys and reserves",
        body: `
          <p class="mono addr" data-at="0">rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B <small>Bitstamp's issuing account</small></p>
          <div class="cards two">
            <div class="c" data-at="1"><b>The secret key</b><span>Whoever holds it controls the account. NOSHASHI never asks for one: it only reads public data.</span></div>
            <div class="c" data-at="2"><b>The reserve</b><span>1 XRP to exist + 0.2 XRP per object owned (trust line, offer…). Reserved XRP cannot be spent.</span></div>
          </div>`,
        say: [
          "An account is a place on the ledger that holds XRP and tokens. Its address starts with the letter r, like Bitstamp's issuing account here.",
          "Control comes from a secret key. Whoever holds the key owns the account, which is why NOSHASHI never asks for one. It only reads public data.",
          "Every account also keeps some XRP locked as a reserve: currently one XRP to exist, plus zero point two XRP for each object it owns, such as a trust line or an offer. So a balance is not the same as what can actually move.",
        ],
      },
      {
        kick: "TRANSACTIONS",
        title: "What a result code really means",
        body: `
          <table class="t">
            <tr><th>PREFIX</th><th>MEANING</th></tr>
            ${row(1, ["tes", "Success. It did what it said."], "okrow")}
            ${row(2, ["tec", "Failed, but recorded, and the fee was charged."], "midrow")}
          </table>
          <p class="note" data-at="3">The final result lives in the transaction's <b>metadata</b>, once validated.</p>`,
        say: [
          "Every change is a transaction: a payment, an offer, a new trust line, a changed setting. Each pays a tiny fee in XRP, which is destroyed rather than paid to anyone.",
          "A result starting with tes means success.",
          "A result starting with tec means it failed, but it was still recorded, and the fee is gone.",
          "The answer the server gives at first is only tentative. The final result is fixed in the transaction's metadata once the ledger is validated, and that is what NOSHASHI reads.",
        ],
      },
      {
        kick: "TOKENS",
        title: "Tokens are promises from an issuer",
        body: `
          <div class="flowrow">
            <span data-at="0">Your account</span><i data-at="0">— trust line · limit 10,000 USD · balance 2,500 —</i><span data-at="0">Issuer rvYAf…</span>
          </div>
          <div class="cards two">
            <div class="c" data-at="1"><b>Anyone can call a token USD</b><span>The issuer address is the token's identity, not its name.</span></div>
            <div class="c" data-at="2"><b>gateway_balances</b><span>The issuer's obligations: how much of each token others really hold.</span></div>
          </div>`,
        say: [
          "Any account can issue a token. To hold one, you open a trust line to its issuer, which records your limit and your balance.",
          "Anyone can use the code U S D, so the name proves nothing. Always ask who issued it: the issuer address is the token's real identity.",
          "The ledger reports each issuer's obligations, the total of its tokens that others hold. That is the real circulating supply.",
        ],
      },
      {
        kick: "AMENDMENTS",
        title: "How the rules change",
        body: `
          <p class="big" data-at="0"><b>80%</b> of validators · held for <b>two weeks</b></p>
          <p class="note" data-at="1">Then the new rule switches on for everyone, at the same ledger.</p>`,
        say: [
          "New features, like clawback or credentials, arrive as amendments. An amendment needs at least eighty percent of validators to support it, continuously, for two weeks.",
          "Then it switches on for everyone at once. NOSHASHI's Domain Grid shows which amendments are enabled on mainnet.",
        ],
      },
    ],
  },

  {
    id: "03-issuer-powers",
    title: "What an issuer can still do to your tokens",
    blurb: "Freeze, clawback, Require Auth, transfer fees and key control, with three real certificates.",
    lesson: "l5",
    scenes: [
      {
        kick: "LEARN NOSHASHI · VIDEO 3",
        title: "What an issuer can still do to your tokens",
        body: `<p class="sub" data-at="0">The powers are public. Almost no wallet shows them.</p>`,
        say: ["Issuers can switch on powers over the tokens they issue. The powers are public on the ledger, but almost no wallet shows them. They decide whether a token is really yours."],
      },
      {
        kick: "ISSUER POWERS",
        title: "Seven settings that matter to a holder",
        body: `
          <table class="t">
            <tr><th>POWER</th><th>WHAT IT MEANS FOR YOU</th></tr>
            ${row(0, ["Freeze", "Your trust line is frozen: you can only send the token back."])}
            ${row(0, ["Global freeze", "Every holder frozen at once."])}
            ${row(1, ["Deep freeze", "Frozen holders can neither send nor receive (XLS-77)."])}
            ${row(2, ["No Freeze", "Freezing given up, permanently."], "okrow")}
            ${row(3, ["Require Auth", "You need the issuer's approval to hold it."])}
            ${row(4, ["Clawback", "The issuer can take tokens back out of your account."], "badrow")}
            ${row(5, ["Transfer fee", "0% to 100% charged each time holders send it."])}
          </table>`,
        say: [
          "An issuer can freeze one holder's trust line, so that holder can only send the token back. Or it can freeze every holder at once with a global freeze.",
          "A deep freeze goes further: a frozen holder can neither send nor receive.",
          "An issuer can also give freezing up for good by setting No Freeze. It can never be switched back off.",
          "Require Auth means you need the issuer's approval before you can hold the token at all.",
          "Clawback lets the issuer take tokens back out of your account. It can only be switched on before the issuer has any trust lines, so for that token it is permanent.",
          "And a transfer fee charges a percentage every time holders send the token to each other.",
        ],
      },
      {
        kick: "KEY CONTROL",
        title: "Who can sign for the issuer?",
        body: `
          <div class="weights" data-at="1">
            <span class="w on">3</span><span class="w on">2</span><span class="w">2</span><span class="w">1</span><span class="w">1</span>
            <b>quorum 5 → 2 signers are enough</b>
          </div>
          <div class="cards two">
            <div class="c" data-at="2"><b>Master-key bypass</b><span>If the master key is still enabled, one person can skip the signer list completely.</span></div>
            <div class="c" data-at="3"><b>Blackholed</b><span>Master key disabled, regular key unusable, no signer list: nobody can ever sign again.</span></div>
          </div>`,
        say: [
          "The powers matter less than who can use them. An account can be signed for by its master key, by a regular key, or by a signer list.",
          "A signer list gives each person a weight and sets a quorum. With weights three, two, two, one and one, and a quorum of five, just two signers are enough. Count weights, not people.",
          "And if the master key is still enabled, one person holding it can bypass the signer list completely. NOSHASHI flags this as a master-key bypass.",
          "An issuer whose keys are all disabled or unusable is blackholed. Nobody can ever sign for it again, so its settings are frozen in time, for better and for worse.",
        ],
      },
      {
        kick: "REAL READINGS · VALIDATED MAINNET · 24 SEPTEMBER 2026",
        title: "Three real authority certificates",
        body: `
          <table class="t">
            <tr><th>ISSUER</th><th>LEDGER</th><th>NO FREEZE</th><th>SINGLE KEY SIGNS</th><th>FEE</th><th>VERDICT</th></tr>
            ${row(1, ["Bitstamp", "107,207,971", "Not set", "Yes (regular key)", "0.15%", '<b class="nogo">NO-GO</b>'])}
            ${row(1, ["GateHub", "107,207,973", "Not set", "Yes (regular key)", "0.20%", '<b class="nogo">NO-GO</b>'])}
            ${row(3, ["Sologenic", "107,207,975", '<span class="ok">Set</span>', '<span class="ok">No, blackholed</span>', "0.01%", '<b class="hold">HOLD</b>'])}
          </table>
          <p class="note" data-at="2">NO-GO here is not an accusation: keeping freeze rights is normal for a regulated issuer.</p>`,
        say: [
          "Here are three real certificates, read from validated mainnet on the twenty-fourth of September twenty twenty-six.",
          "Bitstamp and GateHub both score no go. In each case a single regular key can sign for the issuer, which fails a blocking check.",
          "That is not an accusation. Keeping freeze rights is normal, and often required, for a regulated issuer. The certificate simply states what the issuer can still do, so a holder decides knowingly.",
          "Sologenic has set No Freeze and is blackholed. It scores hold, not go, only because it charges a small transfer fee, which is a warning, and its supply concentration was not measured.",
        ],
      },
      {
        kick: "THE SIX CHECKS",
        title: "How the authority verdict is decided",
        body: `
          <ul class="list two">
            <li data-at="0"><em class="nogo">BLOCKING</em> Not globally frozen now</li>
            <li data-at="0"><em class="nogo">BLOCKING</em> No single key controls the issuer</li>
            <li data-at="1"><em class="hold">WARNING</em> Freeze permanently surrendered</li>
            <li data-at="1"><em class="hold">WARNING</em> Holding needs no permission</li>
            <li data-at="1"><em class="hold">WARNING</em> No transfer fee</li>
            <li data-at="1"><em class="hold">WARNING</em> Supply concentration</li>
          </ul>
          <p class="url" data-at="2">Free, no account: noshashi.app/certificate</p>`,
        say: [
          "The Authority screen runs six checks. Two are blocking: the token must not be globally frozen right now, and no single key may control the issuer. Fail either, and the verdict is no go.",
          "The other four are warnings: freeze not surrendered, permission needed to hold, a transfer fee, and concentrated supply. Any failed warning gives hold.",
          "You can run the same six checks on any issuer for free, without an account, on the certificate page at noshashi dot app.",
        ],
      },
    ],
  },

  {
    id: "04-funded-depth",
    title: "Listed depth versus funded depth",
    blurb: "Why an order book can look far deeper than it is, with six real pairs measured on 8 September 2026.",
    lesson: "l7",
    scenes: [
      {
        kick: "LEARN NOSHASHI · VIDEO 4",
        title: "Listed depth versus funded depth",
        body: `<p class="sub" data-at="0">Could you actually get out of it?</p>`,
        say: ["The second question NOSHASHI answers is: could you actually get out of a position? The answer is in the order book, but not in the number most tools show."],
      },
      {
        kick: "THE DEX",
        title: "A built-in exchange since 2012",
        body: `
          <div class="book" data-at="0">
            <div class="side bid"><b>BIDS</b><span>buy offers</span></div>
            <div class="mid"><b>mid price</b><span>the gap is the spread</span></div>
            <div class="side ask"><b>ASKS</b><span>sell offers</span></div>
          </div>`,
        say: [
          "The XRP Ledger has had a built-in exchange since twenty twelve. Anyone can post an offer, and all the offers for one pair form an order book: bids on one side, asks on the other. The average of the best bid and best ask is the mid price, and the gap between them is the spread.",
        ],
      },
      {
        kick: "THE CATCH",
        title: "Offers stay listed after the money is gone",
        body: `
          <div class="bars">
            <div class="bar" data-at="1"><span class="fill" style="--f:100%"></span><b>Offer 1 · lists 10,000 · owner holds 10,000</b></div>
            <div class="bar" data-at="1"><span class="fill" style="--f:5%"></span><b>Offer 2 · lists 10,000 · owner holds 500</b></div>
            <div class="bar" data-at="1"><span class="fill" style="--f:0%"></span><b>Offer 3 · lists 10,000 · owner holds 0</b></div>
          </div>
          <p class="big" data-at="2">Listed <b class="hold">30,000</b> · Funded <b class="go">10,500</b></p>`,
        say: [
          "Here is the catch most tools miss. An offer stays on the book even after its owner no longer has the funds to fill it. It is still listed, but it cannot trade.",
          "Say three offers each list ten thousand. The first owner holds ten thousand, the second holds five hundred, and the third holds nothing.",
          "Listed depth says thirty thousand. Funded depth, what owners can actually deliver, is ten thousand five hundred. Try to sell twenty thousand into that book and most of it will not fill.",
        ],
      },
      {
        kick: "THE LEDGER SAYS SO ITSELF",
        title: "taker_gets_funded",
        body: `<p class="note" data-at="0">When an owner cannot cover an offer, <b>book_offers</b> adds <b>taker_gets_funded</b>: what they can really deliver.</p>`,
        say: ["NOSHASHI is not guessing. When a server returns a book, any offer whose owner cannot cover it carries an extra field, taker gets funded, showing what they really have. NOSHASHI adds up those funded amounts instead of the listed ones."],
      },
      {
        kick: "REAL MEASUREMENT · 8 SEPTEMBER 2026 · LEDGER 106,850,266",
        title: "Six XRPL pairs, same method",
        body: `
          <table class="t num">
            <tr><th>PAIR</th><th>LISTED</th><th>FUNDED IN BAND</th><th>RATIO</th></tr>
            ${row(1, ["USD · Bitstamp", "567,974", "565,590", '<span class="ok">1.0×</span>'])}
            ${row(1, ["USD · GateHub", "248,521", "234,690", '<span class="ok">1.1×</span>'])}
            ${row(1, ["EUR · GateHub", "249,570", "130,588", "1.9×"])}
            ${row(2, ["CNY (rKiCet…)", "932,823", "135,270", '<span class="hold">6.9×</span>'])}
            ${row(2, ["SOLO · Sologenic", "17,573,534", "6,906", '<span class="nogo">2,545×</span>'])}
            ${row(2, ["BTC · Bitstamp", "115", "0", '<span class="nogo">4,841×</span>'])}
          </table>
          <p class="big" data-at="3">Median <b>4.4×</b></p>`,
        say: [
          "Here are six real pairs, measured on the eighth of September twenty twenty-six at ledger one hundred six million, eight hundred fifty thousand, two hundred sixty-six. The ratio is listed depth divided by funded depth, within ten percent of the mid price.",
          "The deep stablecoin books are close to honest: Bitstamp and GateHub dollars are at one point zero and one point one times.",
          "The long tail is where the gap lives. The Sologenic book listed about two and a half thousand times more than was funded, and the Bitstamp bitcoin book had nothing funded in the band at all.",
          "The median across the six was four point four times.",
        ],
      },
      {
        kick: "THREE HONEST DISCLOSURES",
        title: "What this measurement leaves out",
        body: `
          <ul class="list">
            <li data-at="0">The 10% band is a parameter we chose; a wider band gives a smaller gap.</li>
            <li data-at="1">AMM pools are left out, so where a pool exists the real exit is better.</li>
            <li data-at="2">book_offers returns at most 60 price levels.</li>
          </ul>
          <p class="note" data-at="3">Books change every few seconds: re-measure before you quote any figure.</p>`,
        say: [
          "Three honest disclosures. The ten percent band is a parameter we chose, and a wider band gives a smaller gap.",
          "Automated market maker pools are left out, so where a pool exists, the real exit is better.",
          "And a server returns at most sixty price levels of a book.",
          "All three push the gap upward. Books change every few seconds, so re-measure before you quote any figure. In the app, the Order Book screen does this with one button: Read this book.",
        ],
      },
    ],
  },

  {
    id: "05-payments",
    title: "Payments: what really arrived",
    blurb: "Partial payments, delivered_amount and destination tags, with a real case measured on 28 August 2026.",
    lesson: "l9",
    scenes: [
      {
        kick: "LEARN NOSHASHI · VIDEO 5",
        title: "Payments: what really arrived",
        body: `<p class="sub" data-at="0">tesSUCCESS does not mean the full amount arrived.</p>`,
        say: ["A payment that finishes with tes success did not necessarily deliver what it said. Here is why, and what to read instead."],
      },
      {
        kick: "PARTIAL PAYMENTS",
        title: "Amount is only a maximum",
        body: `
          <div class="cards two">
            <div class="c" data-at="0"><b>Amount</b><span>What should arrive. With the partial-payment flag, only a <em>maximum</em>.</span></div>
            <div class="c" data-at="1"><b>delivered_amount</b><span>What actually arrived. In the metadata. This is what to credit.</span></div>
          </div>`,
        say: [
          "A payment's Amount field says how much should arrive. But if the sender sets the partial payment flag, the Amount becomes only a maximum. The payment can deliver far less, and still succeed.",
          "The figure to trust is delivered amount, in the transaction's metadata. The XRP Ledger's own documentation tells applications to credit that. Exchanges that credited the Amount instead have been drained.",
        ],
      },
      {
        kick: "A REAL CASE NOSHASHI MEASURED · 28 AUGUST 2026",
        title: "Stated versus delivered",
        body: `
          <div class="bars">
            <div class="bar" data-at="0"><span class="fill hold" style="--f:100%"></span><b>Amount · 999,332.87 LRC</b></div>
            <div class="bar" data-at="1"><span class="fill" style="--f:0.4%"></span><b>delivered_amount · 3,958.64 LRC · about 0.4%</b></div>
          </div>
          <p class="big" data-at="2">Result: <b class="go">tesSUCCESS</b> · over-credit ≈ <b class="nogo">250×</b></p>
          <p class="note" data-at="3">In the same sample, 3 of 223 consecutive payments carried the flag.</p>`,
        say: [
          "Here is a real case NOSHASHI measured on the twenty-eighth of August twenty twenty-six. The payment stated nine hundred ninety-nine thousand, three hundred thirty-two L R C.",
          "It delivered three thousand, nine hundred fifty-eight. About zero point four percent.",
          "The result was still tes success. Any system crediting the stated figure would have over-credited by roughly two hundred fifty times.",
          "In the same sample, three of two hundred twenty-three consecutive payments carried the partial payment flag.",
        ],
      },
      {
        kick: "OTHER PAYMENT TOOLS",
        title: "Tags, escrow and paths",
        body: `
          <table class="t">
            <tr><th>TOOL</th><th>WHAT IT DOES</th></tr>
            ${row(0, ["Destination tag", "Tells a shared account which customer a payment is for."])}
            ${row(1, ["Paths", "Convert currencies on the way, through books and pools."])}
            ${row(1, ["Escrow", "Locks funds until a time passes or a condition is met."])}
          </table>`,
        say: [
          "Exchanges and custodians hold many customers in one address. The destination tag tells them which customer a payment is for. A missing tag is a common cause of lost deposits.",
          "Paths let a payment convert currencies on the way, through order books and pools. And escrow locks funds until a time passes or a condition is met.",
        ],
      },
      {
        kick: "IN THE APP",
        title: "Settlement · READ SETTLEMENT",
        body: `
          <div class="flowrow">
            <span data-at="0">Paste the 64-character transaction hash</span><i data-at="0">→</i>
            <span data-at="0" class="hi">READ SETTLEMENT</span><i data-at="1">→</i>
            <span data-at="1">requested · delivered · flag · fee burned</span>
          </div>`,
        say: [
          "In NOSHASHI, open Settlement, paste the sixty-four character transaction hash, and press Read settlement.",
          "You see the type, the sender, the result, whether the partial payment flag was set, the requested amount, the delivered amount, and the fee that was burned.",
        ],
      },
    ],
  },

  {
    id: "06-for-institutions",
    title: "How NOSHASHI helps institutions and enterprises",
    blurb: "Treasuries, compliance teams, desks, payments firms, issuers and auditors, plus the organisation controls.",
    lesson: "l18",
    scenes: [
      {
        kick: "LEARN NOSHASHI · VIDEO 6",
        title: "How NOSHASHI helps institutions and enterprises",
        body: `<p class="sub" data-at="0">Six teams, six questions, one ledger reading.</p>`,
        say: ["NOSHASHI is built for institutions. Here is how it helps six kinds of team, and the controls an organisation gets around them."],
      },
      {
        kick: "BY TEAM",
        title: "The question each team brings",
        body: `
          <table class="t">
            <tr><th>TEAM</th><th>THE QUESTION</th><th>WHERE IN NOSHASHI</th></tr>
            ${row(0, ["Treasury", "Is our XRP mark defensible to the auditor?", "Order Book · Control Surface"])}
            ${row(1, ["Compliance", "Can the issuer freeze or claw back what we hold?", "Authority · Verification"])}
            ${row(2, ["Trading desk", "Could we exit this position at size?", "Order Book · Exposure"])}
            ${row(3, ["Payments firm", "What arrived, and for which customer?", "Settlement"])}
            ${row(4, ["Issuer", "What do buyers see when they check us?", "Issuance · Passport"])}
            ${row(5, ["Auditor", "Can I reproduce this figure myself?", "Receipts · Export"])}
          </table>`,
        say: [
          "A treasury team holding XRP needs its year-end value to stand up to the auditor. Funded depth, stamped with a ledger index, is evidence of what the market could really absorb. Control Surface shows who can move the treasury.",
          "A compliance officer approving a new token needs to know whether the issuer can freeze it or claw it back. The Authority screen answers in one reading, and the Verification gate runs a settlement through the organisation's policy.",
          "A trading desk needs to know whether it could exit at size before it takes the position. The Order Book and Exposure screens show the funded depth, not the listed one.",
          "A payments company needs to credit what really arrived, to the right customer. Settlement shows the delivered amount and the flag.",
          "An issuer wants to show buyers exactly what they are exposed to. It can share a Passport, or a link to its free authority certificate.",
          "And an auditor can recompute every receipt's digest, so the figures are reproducible rather than taken on trust.",
        ],
      },
      {
        kick: "ORGANISATION CONTROLS",
        title: "The controls an examiner looks for",
        body: `
          <div class="grid2">
            <div class="c" data-at="0"><b>Four-eyes policy</b><span>Draft → simulate → submit → a second person approves</span></div>
            <div class="c" data-at="1"><b>Exceptions</b><span>Approve, reject or request more evidence; kept with the verdict</span></div>
            <div class="c" data-at="2"><b>Investigations</b><span>Hash-chained case log: entries cannot be quietly edited</span></div>
            <div class="c" data-at="3"><b>Webhooks &amp; Compliance API</b><span>Signed events and read access for your own systems</span></div>
          </div>`,
        say: [
          "Around this, an organisation gets the controls an examiner looks for. Policy changes are drafted, simulated against past verdicts, and only go live when a second person approves them.",
          "When a no go must be overridden for a good reason, it goes through an exception. A reviewer can approve, reject, or ask for more evidence first, and the decision stays with the verdict.",
          "Investigations keep a hash-chained log. Each entry carries the fingerprint of the one before, so nothing can be quietly edited or removed.",
          "Signed webhooks push events to your own systems, and the Compliance API gives them read access to verdicts and readings.",
        ],
      },
      {
        kick: "PLANS",
        title: "From a free check to an enterprise contract",
        body: `
          <table class="t num">
            <tr><th>PLAN</th><th>FOR</th><th>PRICE</th></tr>
            ${row(0, ["Free", "Check an Address (10 a month), Ledger Sync, website tools", "$0"])}
            ${row(0, ["Pro", "A desk: every screen, per seat", "$749 / seat / month"])}
            ${row(1, ["Institutional", "Regulated teams, unlimited seats, organisation features", "$4,000 / month"])}
            ${row(1, ["Enterprise · Strategic", "Larger organisations and infrastructure partners", "from $120,000 / year"])}
          </table>
          <p class="note" data-at="2">Beta 1.0.9 · information, not financial or legal advice</p>`,
        say: [
          "It starts free. Pro gives a desk every screen, at seven hundred forty-nine dollars per seat per month.",
          "Institutional covers regulated teams with unlimited seats and the organisation features, at four thousand dollars a month. Enterprise and Strategic start at one hundred twenty thousand dollars a year.",
          "NOSHASHI is in beta. It gives information, not financial or legal advice. Current details are on the pricing page at noshashi dot app.",
        ],
      },
    ],
  },

  {
    id: "07-app-tour",
    title: "The app, screen by screen",
    blurb: "Every section of the desktop app, what it is for and which button to press.",
    lesson: "l17",
    scenes: [
      {
        kick: "LEARN NOSHASHI · VIDEO 7",
        title: "The app, screen by screen",
        body: `<p class="sub" data-at="0">Sidebar order, with every button named exactly as it appears.</p>`,
        say: ["A quick tour of the desktop app, in sidebar order, with every button named exactly as it appears on screen."],
      },
      {
        kick: "START HERE",
        title: "Overview and Mission Control",
        body: `
          <div class="grid2">
            <div class="c" data-at="0"><b>Overview</b><span>What NOSHASHI does and what is coming</span></div>
            <div class="c" data-at="0"><b>Mission Control</b><span>Latest validated ledger, network health, fee pressure, wallet gate status</span></div>
          </div>
          <p class="note" data-at="1">A ledger number that stops climbing means the connection dropped.</p>`,
        say: [
          "Overview summarises the app. Mission Control shows live mainnet telemetry: the latest validated ledger, network health, fee pressure and the gate status.",
          "Open it before relying on any reading. If the ledger number is climbing every few seconds, you are connected and current. If it stops, readings are stale until it resumes.",
        ],
      },
      {
        kick: "ADJUDICATION · AM I ALLOWED TO MOVE THIS?",
        title: "Verification, Provenance, Credentials, Domain Grid",
        body: `
          <table class="t">
            ${row(0, ["Verification", "The gate: GO, HOLD or NO-GO with a receipt"])}
            ${row(1, ["Provenance", '<span class="btn">TRACE PROVENANCE</span> real age and first funder'])}
            ${row(2, ["Credentials", "XLS-70 credentials an account holds, and who issued them"])}
            ${row(2, ["Domain Grid", "XLS-80 permissioned domains and enabled amendments"])}
          </table>`,
        say: [
          "Verification is the gate. Enter the account, and optionally a destination and amount, run it, and read the verdict, then each check. Copy the receipt into your records.",
          "Provenance traces where a counterparty came from. Paste the address and press Trace provenance to see its real age and the account that first funded it.",
          "Credentials lists the on-ledger credentials an account holds and who issued them. Domain Grid shows permissioned domains, their rules, and which amendments are live.",
        ],
      },
      {
        kick: "MARKETS & EXPOSURE · COULD I GET OUT OF IT?",
        title: "Exposure, Portfolio, Order Book, Pool Governance",
        body: `
          <table class="t">
            ${row(0, ["Exposure Analysis", "Freeze capability, Travel Rule scope, HHI, book exposure, stress test"])}
            ${row(1, ["Portfolio & Radar", '<span class="btn">ADD TO BOOK</span> watch several wallets at once'])}
            ${row(2, ["Order Book", '<span class="btn">READ THIS BOOK</span> listed vs funded depth, spread, mid'])}
            ${row(3, ["Pool Governance", '<span class="btn">READ POOL GOVERNANCE</span> fee votes and auction slot'])}
          </table>`,
        say: [
          "Exposure Analysis puts a position's risks in one view. Set your jurisdiction first, so the Travel Rule threshold is right.",
          "Portfolio and Radar watches several wallets. Enter an address and a label, press Add to book, and the radar keeps re-checking it.",
          "Order Book takes a currency code and an issuer. Press Read this book to see listed and funded depth, the unfunded share, the spread and the mid price.",
          "Pool Governance shows who votes an A M M pool's fee, on what share of its L P tokens, and who holds the auction slot.",
        ],
      },
      {
        kick: "TREASURY & ISSUANCE",
        title: "Control Surface, Issuance, Authority, Passport",
        body: `
          <table class="t">
            ${row(0, ["Control Surface", '<span class="btn">READ CONTROL SURFACE</span> master key, signers, reserve'])}
            ${row(1, ["Issuance", "Supply, holders, concentration, freezes and clawbacks"])}
            ${row(2, ["Authority", '<span class="btn">CERTIFY AUTHORITY</span> six checks, verdict and digest'])}
            ${row(3, ["Passport", '<span class="btn">GENERATE PASSPORT</span> a portable record to hand over'])}
          </table>`,
        say: [
          "Control Surface answers who can move a treasury. Press Read control surface to see the master key, the signer list, the minimum signers and what is locked in reserve.",
          "Issuance shows a token from the issuer's side. If too few holder lines could be read, it withholds the concentration figure rather than guess.",
          "Authority runs the six issuer checks. Press Certify authority for the verdict, the ledger index and the digest.",
          "Passport packages an asset's posture into a signed record. Press Generate passport, then copy it as JSON or CSV, or export it.",
        ],
      },
      {
        kick: "RECORD",
        title: "Audit Trail, Settlement, Ledger & Policy",
        body: `
          <table class="t">
            ${row(0, ["Audit Trail", "Transaction history with compliance details, filterable"])}
            ${row(0, ["Settlement", '<span class="btn">READ SETTLEMENT</span> requested vs delivered'])}
            ${row(1, ["Ledger & Policy", '<span class="btn">PREV</span> <span class="btn">NEXT</span> <span class="btn">EXPORT</span> history, policy, cases'])}
          </table>`,
        say: [
          "Audit Trail is a wallet's history with compliance details attached. Settlement shows what a transaction really delivered.",
          "Ledger and Policy holds your adjudication history. Step through it with previous and next, draft and simulate policy changes, open investigations, and press Export for a file with a SHA-256 chain-of-custody signature.",
        ],
      },
      {
        kick: "PUBLIC TOOLS & INTELLIGENCE",
        title: "Free checks, the Agent and the Garden",
        body: `
          <table class="t">
            ${row(0, ["Check an Address", '<span class="btn">CHECK THIS ADDRESS</span> free, 10 a month'], "okrow")}
            ${row(1, ["Inbox", '<span class="btn">READ CLAIMS</span> spot impersonation tokens'])}
            ${row(2, ["Token Rights", '<span class="btn">READ TOKEN RIGHTS</span> what an NFT issuer can still do'])}
            ${row(3, ["Ledger Sync", '<span class="btn">QUERY AGAIN</span> four public servers compared, free'], "okrow")}
            ${row(4, ["Agent · Ledger Garden", "An AI analyst, and a visual walk from issuer to evidence"])}
          </table>`,
        say: [
          "Check an Address is free, ten times a month. Remember that nothing recorded against an address is not the same as safe.",
          "Inbox reads tokens strangers have sent you. A familiar ticker from an issuer with no obligations is an impersonation, and is flagged as uncashable.",
          "Token Rights reads what an N F T's issuer can still do after you own it.",
          "Ledger Sync compares what four public servers report right now, free and without an account.",
          "And the Agent and the Ledger Garden let you explore: walk from issuer to asset to holder to evidence, and ask the agent about what you find. The full reference for every screen is in lesson seventeen.",
        ],
      },
    ],
  },
  {
    id: "08-transactions",
    title: "Transactions and what results mean",
    blurb: "Every change is a signed transaction, only validated results are final, and success does not mean all of it arrived.",
    lesson: "l3",
    scenes: [
      {
        kick: "NOSHASHI ACADEMY · VIDEO 8",
        title: "Transactions and what results mean",
        body: `<p class="sub" data-at="0">Every change to the ledger is a signed instruction.</p>`,
        say: ["Everything that changes on the XRP Ledger happens through a transaction: a signed instruction from an account. This video shows how to read what happened to one."],
      },
      {
        kick: "TYPES",
        title: "A few you will meet",
        body: `
          <div class="grid2">
            <div class="c" data-at="0"><b>Payment</b><span>Sends XRP or a token</span></div>
            <div class="c" data-at="0"><b>OfferCreate</b><span>Places a trade on the exchange</span></div>
            <div class="c" data-at="1"><b>TrustSet</b><span>Opens a trust line to hold a token</span></div>
            <div class="c" data-at="1"><b>AccountSet</b><span>Changes an account's settings</span></div>
          </div>
          <p class="note" data-at="2">Each one pays a tiny fee in XRP that is <b>destroyed</b>, not paid to anyone.</p>`,
        say: [
          "A Payment sends XRP or a token. OfferCreate places a trade on the built-in exchange.",
          "TrustSet opens a trust line so an account can hold a token, and AccountSet changes an account's settings.",
          "Every transaction pays a tiny fee in XRP. The fee is destroyed, not paid to anyone, which protects the network from spam.",
        ],
      },
      {
        kick: "FINAL OR NOT",
        title: "Only a validated result counts",
        body: `
          <div class="flowrow" data-at="0"><span>Signed and submitted</span><i>→</i><span>Tentative result</span><i>→</i><span class="ok">In a validated ledger</span><i>→</i><span class="hi">Final, in the metadata</span></div>
          <p class="note" data-at="1">A tentative result can still change. Read the result from a <b>validated</b> ledger.</p>`,
        say: [
          "When a transaction is first submitted, the server gives a tentative result. It becomes final only when the transaction is in a validated ledger, and the final result is stored in its metadata.",
          "So never treat the first answer as the last. NOSHASHI reads validated ledgers only.",
        ],
      },
      {
        kick: "RESULT CODES",
        title: "Reading the code",
        body: `
          <div class="verdicts">
            <div class="v go" data-at="0"><b>tes…</b><span>tesSUCCESS: it did what it said.</span></div>
            <div class="v hold" data-at="1"><b>tec…</b><span>Failed but recorded. The fee was charged.</span></div>
            <div class="v nogo" data-at="2"><b>tef tel tem ter</b><span>Not applied at all. No fee.</span></div>
          </div>`,
        say: [
          "A result starting with t e s means success: the transaction did what it said.",
          "A result starting with t e c means it failed but was still recorded in the ledger, and the fee was charged. Nothing else moved.",
          "Results starting with t e f, t e l, t e m or t e r mean the transaction was not applied at all, and no fee was charged.",
        ],
      },
      {
        kick: "WATCH OUT",
        title: "Success does not mean all of it arrived",
        body: `<p class="big" data-at="0">A payment can say <b class="go">tesSUCCESS</b> and deliver a <b class="nogo">tiny part</b> of its stated amount.</p>
          <p class="note" data-at="1">Credit <b>delivered_amount</b>. Video 5 shows a real case.</p>`,
        say: [
          "One warning. A payment can say success and still deliver only a tiny part of the amount it states.",
          "That is a partial payment. The figure to trust is delivered amount, in the metadata. Video five shows a real case on mainnet.",
        ],
      },
    ],
  },
  {
    id: "09-who-controls",
    title: "Who really controls an account",
    blurb: "Master key, regular key and signer lists; counting a quorum by weight; the master-key bypass; blackholed accounts.",
    lesson: "l6",
    scenes: [
      {
        kick: "NOSHASHI ACADEMY · VIDEO 9",
        title: "Who really controls an account",
        body: `<p class="sub" data-at="0">Count weights, not people.</p>`,
        say: ["Before you trust a treasury or an issuer, ask who can actually sign for it. This video shows how to count it properly."],
      },
      {
        kick: "THREE WAYS TO SIGN",
        title: "More than one can be active at once",
        body: `
          <div class="grid3">
            <div class="c" data-at="0"><b>Master key</b><span>The account's original key pair</span></div>
            <div class="c" data-at="1"><b>Regular key</b><span>A second key the account chooses, so the master can stay offline</span></div>
            <div class="c" data-at="2"><b>Signer list</b><span>Up to 32 signers, each with a weight, and a quorum to reach</span></div>
          </div>`,
        say: [
          "There are three ways to sign for an account. The master key is the account's original key pair.",
          "A regular key is a second key the account nominates, which lets the master key stay offline.",
          "And a signer list names up to thirty-two signers, each with a weight. A transaction is valid when the weights of the people who signed add up to the quorum.",
        ],
      },
      {
        kick: "WORKED EXAMPLE",
        title: "Quorum 5",
        body: `
          <div class="weights" data-at="0"><span class="w on">3</span><span class="w on">2</span><span class="w">2</span><span class="w">1</span><span class="w">1</span><b>Alice 3 + Bob 2 = 5</b></div>
          <p class="big" data-at="1">Two people are enough, not "three of five".</p>`,
        say: [
          "Here is a treasury with five signers. Alice has weight three, Bob two, Carol two, Dan one and Eve one. The quorum is five.",
          "Alice and Bob together reach five, so only two people are needed, not three of five as the headcount suggests. NOSHASHI's Control Surface works this out from the weights.",
        ],
      },
      {
        kick: "WATCH OUT",
        title: "The master key can skip the list",
        body: `<p class="note" data-at="0">If the master key is still enabled, <b>one person</b> holding it can sign alone and bypass the whole signer list.</p>`,
        say: ["And if the master key is still enabled, one person holding it can sign alone and skip the whole signer list. NOSHASHI flags that as a master-key bypass."],
      },
      {
        kick: "BLACKHOLED",
        title: "Nobody can ever sign again",
        body: `
          <ul class="list">
            <li data-at="0">Master key disabled</li>
            <li data-at="0">Regular key set to an address nobody can sign for</li>
            <li data-at="0">No signer list</li>
          </ul>
          <p class="note" data-at="1">Its settings and supply are frozen in time, for better and worse.</p>`,
        say: [
          "An account whose master key is disabled, whose regular key points at an address nobody can sign for, and which has no signer list, is blackholed.",
          "Nobody can ever sign for it again. Its settings and its supply are frozen in time, for better and for worse.",
        ],
      },
    ],
  },
  {
    id: "10-nfts",
    title: "NFTs and the rights issuers keep",
    blurb: "What an NFTokenID encodes: burnable, transferable, mutable and the resale fee, with two real tokens.",
    lesson: "l10",
    scenes: [
      {
        kick: "NOSHASHI ACADEMY · VIDEO 10",
        title: "NFTs and the rights issuers keep",
        body: `<p class="sub" data-at="0">Owning an NFT does not mean the issuer is done with it.</p>`,
        say: ["An N F T on the XRP Ledger is a one-of-a-kind token: art, a ticket, a deed or a membership. Owning one does not mean its issuer is done with it."],
      },
      {
        kick: "THE ID HOLDS THE RULES",
        title: "64 characters, read without the ledger",
        body: `<p class="note" data-at="0">Each NFT has a 64-character <b>NFTokenID</b>. The rules the issuer set when minting are inside it.</p>`,
        say: ["Each N F T has a sixty-four character ID, and the rules its issuer set at minting are written inside that ID. NOSHASHI's Token Rights screen decodes them without even asking the ledger."],
      },
      {
        kick: "RIGHTS AN ISSUER CAN KEEP",
        title: "Four things to check",
        body: `
          <div class="grid2">
            <div class="c" data-at="0"><b>Burnable</b><span>The issuer can destroy it, even while you own it</span></div>
            <div class="c" data-at="1"><b>Not transferable</b><span>You can only sell it back to the issuer</span></div>
            <div class="c" data-at="2"><b>Mutable</b><span>The issuer can change what it points to</span></div>
            <div class="c" data-at="3"><b>Transfer fee</b><span>Up to 50% of every resale</span></div>
          </div>`,
        say: [
          "Burnable means the issuer can destroy the token, even while you own it.",
          "If it is not transferable, you can only sell it back to the issuer.",
          "Mutable means the issuer can change what it points to, so the picture or document can change after you buy it.",
          "And the transfer fee lets the issuer take up to half of every resale.",
        ],
      },
      {
        kick: "TWO REAL TOKENS",
        title: "Decoded from their IDs",
        body: `
          <table class="t">
            <tr><th>TOKEN</th><th>TRANSFERABLE</th><th>MUTABLE</th><th>RESALE FEE</th></tr>
            ${row(0, ["Issued by r4qHM7…mui7B", "yes", "no", "5%"])}
            ${row(1, ["Issued by rKDFM3…2dK74", "yes", '<span class="hold">yes</span>', "10%"])}
          </table>`,
        say: [
          "Here are two real tokens from mainnet, decoded from their IDs. The first can be resold, cannot be changed, and pays its issuer five percent of every resale.",
          "The second is mutable: its issuer can change what it points to, and it takes ten percent of every resale. Both labs in the Academy use these same two tokens.",
        ],
      },
    ],
  },
  {
    id: "11-amendments",
    title: "How the rules change",
    blurb: "Amendments need 80% of validators for two weeks; servers that fall behind become amendment blocked.",
    lesson: "l11",
    scenes: [
      {
        kick: "NOSHASHI ACADEMY · VIDEO 11",
        title: "How the rules change",
        body: `<p class="sub" data-at="0">New features arrive as amendments.</p>`,
        say: ["The XRP Ledger's rules do change, but never quietly. New features arrive as amendments, and this is how they switch on."],
      },
      {
        kick: "THE VOTE",
        title: "80% for two weeks in a row",
        body: `
          <div class="flowrow" data-at="0"><span>Written into the server software</span><i>→</i><span>Validators vote</span><i>→</i><span class="hi">80% support, held for two weeks</span><i>→</i><span class="ok">Enabled</span></div>`,
        say: ["A new feature is written into the server software, and then validators vote on it. It switches on only after it keeps at least eighty percent support for two weeks in a row."],
      },
      {
        kick: "FALLING BEHIND",
        title: "Amendment blocked",
        body: `<p class="note" data-at="0">A server that has not upgraded when an amendment switches on becomes <b>amendment blocked</b> and stops following the ledger.</p>`,
        say: ["A server that has not upgraded when an amendment switches on becomes amendment blocked. It stops following the ledger until it is upgraded."],
      },
      {
        kick: "FEATURES THAT ARRIVED THIS WAY",
        title: "Each one has a public proposal",
        body: `
          <p class="chips" data-at="0"><em>AMM · XLS-30</em><em>Clawback · XLS-39</em><em>NFTs · XLS-20</em><em>Credentials · XLS-70</em><em>Permissioned Domains · XLS-80</em><em>Deep Freeze · XLS-77</em></p>
          <p class="note" data-at="1">What is enabled today can be read from the ledger itself.</p>`,
        say: [
          "Many features in this course arrived this way: pools, clawback, N F Ts, credentials, permissioned domains and deep freeze. Each X L S number is the public proposal behind a feature.",
          "And what is enabled today can always be read from the ledger itself.",
        ],
      },
    ],
  },
  {
    id: "12-amm",
    title: "AMM pools and who governs them",
    blurb: "Pools of two assets, LP tokens, fee votes weighted by LP tokens, and the auction slot.",
    lesson: "l8",
    scenes: [
      {
        kick: "NOSHASHI ACADEMY · VIDEO 12",
        title: "AMM pools and who governs them",
        body: `<p class="sub" data-at="0">A pool's fee is set by whoever holds the most LP tokens.</p>`,
        say: ["Besides order books, the XRP Ledger has automated market makers: pools that trade with anyone. Here is how they work, and who sets their fee."],
      },
      {
        kick: "THE POOL",
        title: "Two assets, priced by their ratio",
        body: `<p class="note" data-at="0">A pool holds two assets, for example XRP and a stablecoin, and prices every trade from the <b>ratio</b> of what it holds.</p>
          <p class="note" data-at="1">The exchange routes a trade through books and pools, whichever is better.</p>`,
        say: [
          "A pool holds two assets, for example X R P and a stablecoin, and prices every trade from the ratio of the two balances.",
          "When you trade, the ledger routes through order books and pools, whichever gives the better price.",
        ],
      },
      {
        kick: "LP TOKENS AND THE FEE",
        title: "Votes are weighted by LP tokens",
        body: `
          <div class="grid2">
            <div class="c" data-at="0"><b>LP tokens</b><span>Your share of the pool, for depositing both assets</span></div>
            <div class="c" data-at="1"><b>Trading fee</b><span>Up to 1% per swap, voted by LP token holders</span></div>
          </div>`,
        say: [
          "People who deposit both assets receive L P tokens: their share of the pool.",
          "Every swap pays a fee of up to one percent into the pool, and L P token holders vote on that fee, weighted by how many L P tokens each one holds.",
        ],
      },
      {
        kick: "THE AUCTION SLOT",
        title: "Cheaper trades for a while",
        body: `<p class="note" data-at="0">Anyone can bid LP tokens for the <b>auction slot</b>. Its holder trades at a heavily discounted fee for a period.</p>
          <p class="note" data-at="1">Pool Governance shows the fee, the largest voter and who holds the slot.</p>`,
        say: [
          "Anyone can bid L P tokens for the auction slot, which lets its holder trade at a heavily discounted fee for a period.",
          "NOSHASHI's Pool Governance screen shows the fee, who votes it and with what share, and who holds the slot. A pool whose fee is set by one large holder behaves differently from one with many voters.",
        ],
      },
    ],
  },
  {
    id: "13-invoice-check",
    title: "Did this payment pay this invoice?",
    blurb: "VERIFIED, HOLD or REJECTED, exact amounts, two node operators, and a real CSC partial payment.",
    lesson: "l9",
    scenes: [
      {
        kick: "NOSHASHI ACADEMY · VIDEO 13",
        title: "Did this payment pay this invoice?",
        body: `<p class="sub" data-at="0">The question a business really has.</p>`,
        say: ["Settlement tells you what a transaction moved. The Invoice check answers the question a business really has: did this transaction pay this invoice?"],
      },
      {
        kick: "THREE ANSWERS",
        title: "Only VERIFIED is green",
        body: `
          <div class="verdicts">
            <div class="v go" data-at="0"><b>VERIFIED</b><span>It paid the invoice.</span></div>
            <div class="v hold" data-at="1"><b>HOLD</b><span>A person should look first.</span></div>
            <div class="v nogo" data-at="2"><b>REJECTED</b><span>It did not pay, with the reason in plain words.</span></div>
          </div>`,
        say: [
          "You enter the receiving account, an optional destination tag, the asset and the amount you expect. Verified means it paid the invoice.",
          "Hold means a person should look first, for example when a payment is larger than the invoice.",
          "Rejected means it did not pay, and the reason is given in plain words. Only verified is green.",
        ],
      },
      {
        kick: "HOW IT DECIDES",
        title: "Exact, and read twice",
        body: `
          <ul class="list">
            <li data-at="0">Credits only what was <b>delivered</b>, never the stated amount</li>
            <li data-at="1">Compares amounts exactly, digit by digit</li>
            <li data-at="2">Reads two independent operators: XRPL Labs and Ripple</li>
          </ul>`,
        say: [
          "It credits only what was delivered, never the amount the payment states.",
          "It compares amounts exactly, digit by digit, and never rounds.",
          "And by default it reads the transaction from two independent node operators, X R P L Labs and Ripple, and says so if they disagree.",
        ],
      },
      {
        kick: "A REAL CASE · LEDGER 107,587,014",
        title: "A partial CSC payment",
        body: `
          <table class="t num">
            <tr><th>INVOICE</th><th>EXPECTED</th><th>PARTIAL ALLOWED</th><th>RESULT</th></tr>
            ${row(0, ["Full amount", "162.6994990013102", "no", '<span class="nogo">REJECTED</span>'])}
            ${row(1, ["Delivered amount", "161.1605415577872", "yes", '<span class="ok">VERIFIED</span>'])}
          </table>`,
        say: [
          "Here is a real payment on mainnet. It asked for one hundred sixty-two point six nine nine C S C and delivered one hundred sixty-one point one six. Checked against the full amount, with partial payments not allowed, it is rejected.",
          "Checked against the amount actually delivered, with partial payments allowed, it is verified. The Academy's labs let you run both, and five more real cases on testnet.",
        ],
      },
    ],
  },
  {
    id: "14-compliance-words",
    title: "Compliance words, made simple",
    blurb: "KYC, AML, sanctions screening, the Travel Rule, what screening misses, and compliance built into the ledger.",
    lesson: "l12",
    scenes: [
      {
        kick: "NOSHASHI ACADEMY · VIDEO 14",
        title: "Compliance words, made simple",
        body: `<p class="sub" data-at="0">Am I allowed to move this? Could I get out of it?</p>`,
        say: ["Compliance means following the laws for moving money. On the X R P Ledger it comes down to two questions: am I allowed to move this, and could I actually get out of it?"],
      },
      {
        kick: "THE WORDS",
        title: "Four you will hear every day",
        body: `
          <div class="grid2">
            <div class="c" data-at="0"><b>KYC</b><span>Know Your Customer: checking who a customer is</span></div>
            <div class="c" data-at="1"><b>AML</b><span>Rules and monitoring to stop criminal money</span></div>
            <div class="c" data-at="2"><b>Sanctions screening</b><span>Checking nobody is on a government blocklist</span></div>
            <div class="c" data-at="3"><b>Travel Rule</b><span>Sender and receiver details travel with larger transfers</span></div>
          </div>`,
        say: [
          "K Y C, know your customer, means checking who a customer is.",
          "A M L, anti-money-laundering, means the rules and monitoring that stop criminal money.",
          "Sanctions screening checks that nobody involved is on a government blocklist.",
          "And the Travel Rule means that for larger transfers between regulated firms, the sender's and receiver's details travel with the payment. The threshold depends on where you are: about one thousand dollars or euros suggested by the F A T F, three thousand in the United States, and no minimum in the European Union.",
        ],
      },
      {
        kick: "WHAT SCREENING MISSES",
        title: "The asset, not the person",
        body: `<p class="note" data-at="0">Screening asks whether a person is risky. It cannot see what a token's <b>issuer</b> can still do: freeze it or claw it back.</p>`,
        say: ["Behaviour screening asks whether a counterparty is risky. It cannot see what a token's issuer can still do. A perfectly clean holder can hold a token that can be frozen or clawed back. NOSHASHI reads both sides."],
      },
      {
        kick: "BUILT INTO THE LEDGER",
        title: "Credentials and permissioned domains",
        body: `
          <div class="grid2">
            <div class="c" data-at="0"><b>Credentials · XLS-70</b><span>A trusted issuer vouches for an account without revealing the personal data</span></div>
            <div class="c" data-at="1"><b>Permissioned domains · XLS-80</b><span>Only accounts holding the right credentials can take part</span></div>
          </div>`,
        say: [
          "The ledger now has compliance built in. With credentials, a trusted issuer such as a K Y C provider can vouch for an account without revealing the personal data behind it.",
          "And permissioned domains admit only accounts that hold the right credentials.",
        ],
      },
    ],
  },
  {
    id: "15-account-security",
    title: "Making an account hard to take over",
    blurb: "How accounts are emptied, the four defences, and a real address-poisoning series from mainnet.",
    lesson: "l20",
    scenes: [
      {
        kick: "NOSHASHI ACADEMY · VIDEO 15",
        title: "Making an account hard to take over",
        body: `<p class="sub" data-at="0">Nobody can reset an account, and nothing can be undone.</p>`,
        say: ["An X R P Ledger account belongs to whoever can sign for it. Nobody at a help desk can reset it, and no payment can be undone. So security comes down to protecting the keys."],
      },
      {
        kick: "HOW ACCOUNTS ARE EMPTIED",
        title: "The secret gets exposed",
        body: `
          <ul class="list two">
            <li data-at="0">Typed into a fake wallet or "airdrop" site</li>
            <li data-at="0">Saved in a cloud note or screenshot</li>
            <li data-at="0">Read off the clipboard by malware</li>
            <li data-at="0">The ledger itself is not broken into</li>
          </ul>`,
        say: ["Most accounts are emptied the same way: the secret is exposed. It is typed into a fake site, saved in a cloud note or a screenshot, or read by malware. The ledger itself is not broken into."],
      },
      {
        kick: "FOUR DEFENCES",
        title: "From simplest to strongest",
        body: `
          <ul class="list">
            <li data-at="0"><em>1</em>Keep the master seed offline, on paper or steel</li>
            <li data-at="1"><em>2</em>Sign day to day with a regular key in a hardware wallet</li>
            <li data-at="2"><em>3</em>Require several signers for a treasury, then disable the master key</li>
            <li data-at="3"><em>4</em>Close the doors strangers use: unsolicited offers, checks and channels</li>
          </ul>`,
        say: [
          "One: keep the master seed offline, on paper or steel. Nobody legitimate, including NOSHASHI, ever needs it.",
          "Two: sign day to day with a regular key held in a hardware wallet.",
          "Three: require several signers for a treasury, and then disable the master key, or the list can be bypassed.",
          "Four: close the doors strangers use, such as unsolicited N F T offers, checks and payment channels.",
        ],
      },
      {
        kick: "A REAL EXAMPLE FROM MAINNET",
        title: "Address poisoning",
        body: `
          <p class="addr mono" data-at="0">rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN<small>SENT 1-DROP PAYMENTS WITH A FAKE "FREE XRP" LINK</small></p>
          <p class="note" data-at="1">Then it deleted itself into the next account. Each one was made to end in <b>"xaman"</b>, the name of a real wallet.</p>
          <p class="big" data-at="2">Copy addresses from your <b>own records</b>, never from history.</p>`,
        say: [
          "Here is a real account. It sent payments of one drop, with a memo pointing to a fake free X R P site.",
          "Then it deleted itself into the next account, which did the same. Every account in the series was made to end in xaman, the name of a real wallet, so a hurried copy from history picks the wrong one.",
          "The habit that beats it: take addresses from your own saved records, never from your transaction history.",
        ],
      },
    ],
  },
  {
    id: "16-after-a-theft",
    title: "When an account is emptied",
    blurb: "Why nothing reverses a validated payment, the first hour, and the recovery paths that really exist.",
    lesson: "l21",
    scenes: [
      {
        kick: "NOSHASHI ACADEMY · VIDEO 16",
        title: "When an account is emptied",
        body: `<p class="sub" data-at="0">What can and cannot be done.</p>`,
        say: ["If an account has been emptied, here is what can and cannot be done, starting with the hard truth."],
      },
      {
        kick: "THE HARD TRUTH",
        title: "A validated payment is final",
        body: `<p class="note" data-at="0">Validators, Ripple, wallet makers and NOSHASHI <b>cannot reverse it</b>. Anyone offering to recover stolen XRP for a fee is running the second half of the scam.</p>`,
        say: ["A validated payment is final. Validators, Ripple, wallet makers and NOSHASHI cannot reverse it. Anyone offering to recover stolen X R P for a fee is running the second half of the scam."],
      },
      {
        kick: "THE FIRST HOUR",
        title: "Four things to do now",
        body: `
          <ul class="list">
            <li data-at="0"><em>1</em>Move anything left to a new account made on a clean device</li>
            <li data-at="1"><em>2</em>Check whether the thief added their own keys</li>
            <li data-at="2"><em>3</em>Follow where the value went</li>
            <li data-at="3"><em>4</em>Report it with hashes, amounts and times</li>
          </ul>`,
        say: [
          "First, move anything left to a brand-new account created on a device that never held the old seed.",
          "Second, check whether the thief added their own regular key or signer list, so they can keep signing.",
          "Third, follow where the value went. Every movement is public.",
          "Fourth, report it to the police with the evidence: transaction hashes, amounts and times. In the United States that is I C 3 dot gov.",
        ],
      },
      {
        kick: "PATHS THAT CAN WORK",
        title: "The right request to the right party",
        body: `
          <div class="grid3">
            <div class="c" data-at="0"><b>An exchange</b><span>Can freeze a deposit if reached quickly</span></div>
            <div class="c" data-at="1"><b>A token's issuer</b><span>Can freeze, or claw back, stolen tokens</span></div>
            <div class="c" data-at="2"><b>Authorities</b><span>Can act when a trail reaches a sanctioned address</span></div>
          </div>`,
        say: [
          "If stolen value reached an exchange, the exchange can identify and freeze the deposit if reached quickly, usually with a police reference.",
          "A token's issuer can freeze stolen tokens, or claw them back, unless it has given that right up.",
          "And authorities can act when a trail reaches a sanctioned address. NOSHASHI's Incident Response follows the value hop by hop and writes a fingerprinted dossier for all three.",
        ],
      },
    ],
  },
  {
    id: "17-getting-xrp-back",
    title: "Getting XRP back, and signing safely",
    blurb: "Stuck XRP you can recover, the signatures that empty accounts, and how to prove a domain claim.",
    lesson: "l22",
    scenes: [
      {
        kick: "NOSHASHI ACADEMY · VIDEO 17",
        title: "Getting XRP back, and signing safely",
        body: `<p class="sub" data-at="0">Some XRP is just waiting for one signature.</p>`,
        say: ["Stolen X R P cannot be pulled back, but a lot of X R P is simply stuck, waiting for its owner to sign one transaction. And most thefts start with one signature the owner did not understand."],
      },
      {
        kick: "XRP YOU CAN GET BACK",
        title: "Finish, cancel, cash, clean up",
        body: `
          <div class="grid3">
            <div class="c" data-at="0"><b>Matured escrows</b><span>Wait for an EscrowFinish</span></div>
            <div class="c" data-at="1"><b>Uncashed checks</b><span>Pay nothing until cashed</span></div>
            <div class="c" data-at="2"><b>Owner reserve</b><span>0.2 XRP back for each object removed</span></div>
          </div>
          <p class="note" data-at="3">Ripple's escrow wallet #03 holds ten escrows to itself, each waiting to be finished.</p>`,
        say: [
          "A matured escrow does not pay out on its own. Someone must finish it.",
          "A check written to you pays nothing until you cash it.",
          "And every object an account owns locks zero point two X R P. Removing ones you no longer need frees it.",
          "A real example: Ripple's escrow wallet number three holds ten escrows to itself, each waiting for a finishing transaction.",
        ],
      },
      {
        kick: "READ BEFORE YOU SIGN",
        title: "Signatures that empty accounts",
        body: `
          <ul class="list">
            <li data-at="0"><em>SetRegularKey · SignerListSet</em>Hand signing power to someone else</li>
            <li data-at="1"><em>AccountDelete</em>Sends everything to its destination</li>
            <li data-at="2"><em>NFTokenCreateOffer</em>Selling an NFT for nothing</li>
          </ul>`,
        say: [
          "A phishing site does not need your seed if you will sign for it. Set regular key and signer list set hand signing power to someone else.",
          "Account delete sends everything to its destination.",
          "And an N F T sell offer for zero gives the token away. Decode every request before signing it. The Security Center's free Pre-sign check does this.",
        ],
      },
      {
        kick: "IS THIS ACCOUNT WHO IT SAYS?",
        title: "A domain is proven only both ways",
        body: `<p class="note" data-at="0">Anyone can write a domain on an account. It is proven only when that website lists the account back in its <b>xrp-ledger.toml</b>.</p>`,
        say: ["Anyone can write a website name on an account. The claim is proven only when that website lists the account back in its x r p ledger dot toml file. X R P Toolkit's donations account does both, so it is verified. The free Domain check tests this."],
      },
    ],
  },
  {
    id: "18-protecting-customers",
    title: "Protecting customers' XRP",
    blurb: "Proof of reserves and liabilities with a Merkle sum tree, protection funds no single key can move, and what NOSHASHI is not.",
    lesson: "l23",
    scenes: [
      {
        kick: "NOSHASHI ACADEMY · VIDEO 18",
        title: "Protecting customers' XRP",
        body: `<p class="sub" data-at="0">A promise is worth what the ledger can show.</p>`,
        say: ["Customers of a business that holds X R P for them have no deposit insurance. The ledger cannot insure anyone, but it can prove a great deal."],
      },
      {
        kick: "RESERVES AND LIABILITIES",
        title: "Both halves of the picture",
        body: `<p class="note" data-at="0">A big balance proves little if the business owes more. A <b>Merkle sum tree</b> proves what it owes all customers without showing anyone's balance.</p>
          <p class="note" data-at="1">Each customer can check that their own balance is counted.</p>`,
        say: [
          "A large balance proves little if the business owes its customers more. A Merkle sum tree proves the total owed, without revealing anyone's balance.",
          "Each customer receives a path from their own balance to the published total, and can check that they are counted.",
        ],
      },
      {
        kick: "A REAL TREE",
        title: "138 holders of a real token",
        body: `<p class="big" data-at="0">Total: <b>33,733,671.32 USDB</b>, exactly what the ledger says the issuer owes.</p>
          <p class="note" data-at="1">Understate one holder and their path no longer reaches the root.</p>`,
        say: [
          "Built over the one hundred thirty-eight holders of a real token, the tree totals exactly what the ledger itself says the issuer owes.",
          "Understate one holder's balance, and their path no longer reaches the root. The cheat shows.",
        ],
      },
      {
        kick: "PROTECTION FUNDS",
        title: "A fund no single key can move",
        body: `
          <div class="verdicts">
            <div class="v go" data-at="0"><b>STRONG</b><span>Locked in escrow until a date</span></div>
            <div class="v go" data-at="0"><b>STRONG</b><span>Under a signer list, master key disabled</span></div>
            <div class="v nogo" data-at="1"><b>NOTHING</b><span>Behind one key: whoever holds it can take it</span></div>
          </div>
          <p class="note" data-at="2">This is verification, not insurance. NOSHASHI pays no claims.</p>`,
        say: [
          "A protection fund locked in escrow, or held under a signer list with the master key disabled, is real.",
          "A fund behind one key counts for nothing: whoever holds that key can take it.",
          "And remember, this is verification, not insurance. NOSHASHI shows what is really set aside. It pays no claims.",
        ],
      },
    ],
  },
];

// Spoken forms. Captions keep the written text; the voice reads these.
export const SPOKEN = [
  [/\bNOSHASHI\b/g, "Nohshahshee"],
  [/\bXRPL\b/g, "X R P L"],
  [/\bXRP\b/g, "X R P"],
  [/\bNO-GO\b/g, "no go"],
  [/\bSHA-256\b/g, "shah two fifty-six"],
  [/\bJSON\b/g, "jason"],
  [/\bCSV\b/g, "C S V"],
  [/\bAPI\b/g, "A P I"],
  [/\bL R C\b/g, "L R C"],
  [/\bNFTs\b/g, "N F Ts"],
  [/\bNFT\b/g, "N F T"],
];
