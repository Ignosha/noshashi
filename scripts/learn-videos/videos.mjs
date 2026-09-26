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
];
