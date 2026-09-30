
(function(){
  var Q = [
    ["ROUND 1 · THE XRP LEDGER"],
    ["What makes a ledger 'validated'?", ["It is older than a day","At least 80% of trusted validators agreed on it, so it is final","NOSHASHI approved it","It contains only XRP payments"], 1, "Validators vote; when 80% of a server's trusted list agree, the ledger is validated and can never change."],
    ["Roughly how often does the XRPL produce a new ledger?", ["Every 10 minutes","Every 3 to 5 seconds","Once a day","Only when someone pays"], 1, "A new ledger closes every 3 to 5 seconds, each with a higher ledger index."],
    ["What happens to the XRP paid as a transaction cost?", ["It goes to validators","It is destroyed","It goes to Ripple","It returns to the sender"], 1, "The cost is burned, which protects the network from spam without paying anyone."],
    ["Why can't all of an account's XRP always be spent?", ["Because of the reserve","Because XRP expires","Because of the transfer fee","Because of consensus"], 0, "Every account locks a base reserve plus an owner reserve per object it owns."],
    ["An account's Sequence number is 91,000,000. What does that tell you?", ["It made 91 million transactions","Its counter started near the ledger index when it was created","It is blackholed","Nothing at all"], 1, "Sequence starts at the creation ledger index, not zero, so it hints at age, not activity."],
    ["A transaction result starts with tec. What does that mean?", ["Success","It failed but was recorded and the fee was charged","It was never submitted","It is still pending"], 1, "tec means claimed cost only: the transaction failed but is in the ledger and the fee is gone."],
    ["Two tokens are both called USD. What tells them apart?", ["Their price","The issuer address","The colour in your wallet","Nothing, they are the same"], 1, "Anyone can use the code USD. The issuer address is the token's identity."],
    ["What must you open before you can hold an issued token?", ["An escrow","A trust line to the issuer","An AMM pool","A signer list"], 1, "A trust line records your limit and balance with that issuer."],
    ["What does an issuer's gateway_balances show?", ["Its XRP balance","Its obligations: how much of each token others hold","Its fees","Its validators"], 1, "It is the real circulating supply of each token the issuer has issued."],
    ["Which amendment rule is correct?", ["51% for a day","80% of validators for two weeks","Any validator can switch it on","Ripple decides alone"], 1, "An amendment needs at least 80% support held for two weeks."],
    ["ROUND 2 · ISSUERS, MARKETS AND PAYMENTS"],
    ["An issuer has set No Freeze. What does that mean?", ["It can freeze whenever it likes","It has permanently given up freezing","The token is frozen now","Only XRP can be frozen"], 1, "No Freeze is permanent and cannot be switched back off."],
    ["Which power lets an issuer take tokens back from your account?", ["Transfer fee","Require Auth","Clawback","Destination tag"], 2, "Clawback, which can only be enabled before the issuer has any trust lines."],
    ["What does a deep freeze add to a normal freeze?", ["Nothing","The holder can neither send nor receive the token","It freezes XRP too","It is temporary"], 1, "Deep freeze (XLS-77) blocks receiving as well as sending."],
    ["A signer list has weights 3, 2, 2, 1, 1 and a quorum of 5. What is the fewest number of signers needed?", ["Five","Three","Two","One"], 2, "The weight-3 and a weight-2 signer reach 5 together. Count weights, not people."],
    ["What makes an issuer blackholed?", ["It was hacked","Master key disabled, regular key set to an address nobody controls, no signer list","It has no holders","It charges no fee"], 1, "Nobody can ever sign for it again."],
    ["What is an unfunded offer?", ["An offer with no price","An offer still listed although its owner cannot fill it","An offer in XRP","A cancelled offer"], 1, "Offers stay listed after owners stop holding the funds."],
    ["Three offers list 10,000 each; owners hold 10,000, 500 and 0. What is the funded depth?", ["30,000","10,500","10,000","500"], 1, "10,000 + 500 + 0 = 10,500. Listed depth would say 30,000."],
    ["Which field does book_offers add when an owner cannot cover an offer?", ["delivered_amount","taker_gets_funded","TransferRate","Sequence"], 1, "taker_gets_funded shows what the owner can actually deliver."],
    ["Who votes on an AMM pool's trading fee?", ["Validators","LP token holders, weighted by holdings","The issuer","Nobody, it is fixed"], 1, "Votes are weighted by LP tokens, so large holders carry more weight."],
    ["A payment shows tesSUCCESS with the partial-payment flag. What should you credit?", ["The Amount field","delivered_amount","The fee","Nothing"], 1, "With the flag, Amount is only a maximum. delivered_amount is what arrived."],
    ["ROUND 3 · COMPLIANCE AND THE APP"],
    ["What does the Travel Rule require?", ["Slow payments","Sender and receiver details travel with transfers above a threshold","Freezing all tokens","Only domestic payments"], 1, "FATF Recommendation 16. Thresholds vary: USD/EUR 1,000 suggested, USD 3,000 in the US, none in the EU."],
    ["Why can't behaviour screening alone catch issuer risk?", ["It is too slow","Issuer powers are a property of the asset, not of the person holding it","Issuers are always safe","Screening reads flags already"], 1, "A clean holder can hold a clawback-enabled token. Only the issuer's flags reveal that."],
    ["An HHI of 10,000 means what?", ["Perfectly spread out","One party has everything","Ten thousand holders","The fee is 100%"], 1, "HHI sums squared percentage shares; 100² = 10,000 is total concentration."],
    ["What are the two questions NOSHASHI answers?", ["Price and volume","Am I allowed to move this, and could I actually get out of it?","Who owns XRP, and when to buy","Which wallet is fastest"], 1, "Compliance and exit liquidity, from the same ledger reading."],
    ["A check shows INSUFFICIENT_DATA. How should you treat it?", ["As a pass","As a fail","As an abstention: the ledger did not give enough to decide","As a bug"], 2, "It is never a pass. NOSHASHI would rather say it cannot tell than guess."],
    ["An issuer fails 'no single key controls the issuer'. Which verdict follows?", ["GO","HOLD","NO-GO","NOT_APPLICABLE"], 2, "That check is blocking, so a failure gives NO-GO."],
    ["Which screen tells you who can really move a treasury?", ["Order Book","Control Surface","Inbox","Ledger Sync"], 1, "Control Surface derives minimum signers from weights and flags a master-key bypass."],
    ["You need to check a payment really arrived. Which screen and button?", ["Settlement · READ SETTLEMENT","Passport · GENERATE PASSPORT","Authority · CERTIFY AUTHORITY","Ledger Watch"], 0, "Settlement compares requested with delivered."],
    ["Why does every reading carry a ledger index and a SHA-256 digest?", ["Decoration","So anyone can re-check the same moment and prove the record was not changed","To make files bigger","It is required by the Travel Rule"], 1, "The index fixes the moment; the digest proves the contents are unchanged."],
    ["What does four-eyes approval mean for a policy change?", ["It needs four approvers","A second person must approve before it goes live","It is reviewed by four validators","It lasts four days"], 1, "One person drafts and submits; a different person approves."],
    ["ROUND 4 · VOCABULARY", "vocab"],
    ["What is a drop?", ["A token removed by clawback","The smallest unit of XRP: 1 XRP = 1,000,000 drops","A ledger that failed consensus","The fee an issuer charges"], 1, "Balances and fees are recorded in drops. A reserve of 1 XRP is 1,000,000 drops.", 1],
    ["What is the UNL (Unique Node List)?", ["The validators a server trusts not to collude","A list of banned addresses","Every unfunded offer on the DEX","The tokens NOSHASHI has approved"], 0, "A ledger is validated when 80% of the validators on a server's UNL agree.", 1],
    ["What are an issuer's obligations?", ["Its legal duties under MiCA","The XRP it keeps in reserve","The total of its tokens held by others: its real circulating supply","Offers it is forced to fill"], 2, "gateway_balances reports them per currency. It is the figure concentration is measured against.", 1],
    ["What is a regular key?", ["The first key an account ever had","A validator's signing key","The key that opens a permissioned domain","A second key an account nominates to sign for it"], 3, "If a regular key is set, it can sign even when the master key is disabled. That is why blackholing needs both handled.", 1],
    ["What does Require Auth mean?", ["You need the issuer's approval to hold its token","Every payment needs two signatures","The token can only be sold for XRP","The issuer must approve every trade"], 0, "It is an issuer setting. It is one of the six authority checks, a warning when it is on.", 1],
    ["What is a transaction's metadata?", ["The memo the sender typed","Its price in US dollars","The record of what it actually did, attached once it is validated","The list of validators that voted"], 2, "Metadata is where delivered_amount lives, which is why NOSHASHI reads it rather than the Amount field.", 1],
    ["In NOSHASHI, what is provenance?", ["Where an account came from: its age and first funder","The country an issuer is based in","The price history of a token","Who wrote the rules version"], 0, "The Provenance screen traces it with TRACE PROVENANCE, useful before paying a new counterparty.", 1],
    ["What is a destination tag?", ["A label for NFTs","A number telling a shared account which customer a payment is for","A tag that freezes a payment","The name of a trust line"], 1, "Exchanges hold many customers in one address. Without the right tag, a payment arrives but nobody knows whose it is.", 1],
    ["What is a credential (XLS-70)?", ["A password for the app","A paid NOSHASHI plan","A validator's licence","An on-ledger proof that an account passed a check"], 3, "An issuer of credentials (for example a KYC provider) records the proof on the ledger. Permissioned domains (XLS-80) can require it.", 1],
    ["What does selective disclosure mean?", ["Publishing every customer's data","Proving a credential exists without revealing the personal data behind it","Only disclosing profits","Hiding transactions from validators"], 1, "It lets a counterparty confirm a check was passed without receiving the documents.", 1],
    ["What is the spread?", ["The gap between the best bid and the best ask","How many holders a token has","The AMM trading fee","The time between ledgers"], 0, "A wide spread means trading costs more. It says nothing about how much can be filled; funded depth does.", 1],
    ["In NOSHASHI, what is an exception?", ["A crash report","A check that was skipped","An approved, recorded override of a NO-GO for a stated reason","A payment that bounced"], 2, "It never erases the NO-GO. The override, its reason and its reviewer are kept alongside it.", 1],
    ["ROUND 5 · HOW IT HELPS INSTITUTIONS AND ENTERPRISES"],
    ["A listed company holds XRP in its treasury. Its auditor asks whether the year-end value is defensible. How does NOSHASHI help?", ["It sets the price itself","It measures how much could really be sold in the market at a stated ledger index, so the auditor can re-check the figure","It guarantees the auditor signs off","It moves the XRP into cold storage"], 1, "Auditors need evidence of the principal market. Funded depth stamped with a ledger index is evidence anyone can reproduce."],
    ["A compliance officer is asked to approve holding a new stablecoin. Which reading answers 'could the issuer freeze or claw back what we hold?'", ["Learn","Ledger Sync","Authority: CERTIFY AUTHORITY reads the issuer's flags and returns GO, HOLD or NO-GO","The HUD"], 2, "Freeze, clawback, Require Auth, key control, transfer fee and concentration are properties of the asset. Screening the people involved cannot see them."],
    ["An examiner asks a bank to show why a transfer was allowed eight months ago. What does NOSHASHI give it?", ["A screenshot","The receipt: ledger index, rules version, checks and digest, so the decision can be reproduced exactly","A phone number for support","Nothing; the ledger has changed since"], 1, "The ledger index fixes the moment. The digest proves the record was not edited afterwards."],
    ["Why does four-eyes approval matter to an enterprise?", ["It makes changes faster","No single employee can quietly change the rules that decide what the firm may do","It is needed to install the app","It lowers the price"], 1, "Segregation of duties is a basic control auditors and regulators expect. Drafts can be simulated before anyone approves them."],
    ["A trading desk is about to take a large position in an XRPL token. What risk does NOSHASHI check that a price chart hides?", ["Whether the logo is official","Whether the listed depth includes unfunded offers, so the way out is far thinner than it looks","The token's age in days","The colour of the chart"], 1, "In the 8 September sample, listed depth was a median 4.4 times funded depth within the band."],
    ["A payments company receives XRPL payments on behalf of customers. Which two details stop it crediting the wrong amount or the wrong customer?", ["delivered_amount and the destination tag","Sequence and the fee","The currency code and the spread","The UNL and the ledger index"], 0, "Credit delivered_amount, never the Amount field of a partial payment, and match the destination tag to the customer."],
    ["An enterprise already runs its own case management and alerting. How does NOSHASHI fit in?", ["It replaces them","It does not; it is desktop only","Signed webhooks push events to your systems, and the Compliance API gives read access to verdicts and readings","It emails a spreadsheet each week"], 2, "Webhooks are signed so your systems can prove they came from NOSHASHI."],
    ["Why is a hash-chained investigation log valuable to a regulated firm?", ["It saves disk space","Entries cannot be quietly edited or removed, so the record of what the team knew, and when, holds up under review","It hides the log from auditors","It is faster to search"], 1, "Each entry carries the fingerprint of the one before. Changing any entry breaks every link after it."],
    ["A NO-GO blocks a trade the business has a legitimate reason to make. What is the controlled way forward?", ["Turn NOSHASHI off","Edit the receipt","Request an exception; a reviewer approves, rejects or asks for more evidence, and the decision stays with the verdict","Ask the issuer to change its flags"], 2, "Overrides happen in the open, with a reason and a second person, which is what an examiner looks for."],
    ["A token issuer wants to show institutional buyers exactly what they would be exposed to. What can it share?", ["Its marketing deck","A link to the free authority certificate for its issuer address, which anyone can re-check","Its private keys","Its bank statements"], 1, "The certificate page at /certificate/ runs the same six checks with the ledger index and digest, free and without an account."],
    ["Which plan is built for regulated teams that need organisation features and unlimited seats?", ["Free","Pro","Institutional","None; each seat is separate"], 2, "Institutional is $4,000 a month. Enterprise and Strategic, from $120,000 a year, are for larger organisations and infrastructure partners."],
    ["What does answering both questions from one ledger reading save a compliance team?", ["Nothing","Reconciling a screening tool and a market terminal that looked at the ledger at different moments","Hiring an auditor","Paying transaction costs"], 1, "When compliance and liquidity come from the same WebSocket in the same second, the file tells one consistent story."],
    ["NOSHASHI is in beta. What should an institution take from that today?", ["The readings are invented","It provides information, not financial or legal advice; re-measure a reading before relying on it for a decision","It cannot be installed","Beta means free forever"], 1, "Every build is labelled beta. Every reading is real and stamped with its ledger, so re-checking it is straightforward."],
    ["ROUND 6 · ACCOUNT SECURITY AND INCIDENT RESPONSE"],
    ["How are most XRP Ledger accounts actually emptied?", ["The ledger is hacked","The secret seed is exposed: a fake wallet site, a cloud backup, a screenshot or malware","Validators take the funds","Another account guesses the address"], 1, "The ledger is not broken into. Whoever holds a key that can sign owns the account, so protecting the seed is the whole game."],
    ["What does a regular key held in a hardware wallet give you?", ["A second copy of your balance","Day-to-day signing without the master seed, and a key you can replace in one transaction if it leaks","Faster payments","Protection from fees"], 1, "The master seed stays offline; if the regular key is ever exposed, the master key sets a new one."],
    ["A treasury has a 2-of-3 signer list but its master key is still enabled. What is the risk?", ["None","One stolen master seed skips the whole approval","The signers cannot sign","The account is blackholed"], 1, "Disable the master key once the signers are confirmed, or the quorum is optional."],
    ["What is address poisoning?", ["A virus in your wallet","A lookalike address, matching the start and end of one you use, sent to you so you copy it from history","A frozen trust line","A fake token"], 1, "Always take destinations from your own records. NOSHASHI's SAFE SEND checks a pasted address against your book."],
    ["Your XRP was stolen an hour ago. What can reverse the payment?", ["Validators, if asked quickly","A recovery service, for a fee","Nothing: validated transactions are final; recovery happens off-ledger","Deleting your account"], 2, "Paid 'recovery' offers are the second half of the scam. Exchanges freezing tagged deposits and issuers freezing their own tokens are the real paths."],
    ["Stolen XRP reached an account that requires destination tags. Who can help?", ["Nobody","The exchange or service behind it, which can freeze the customer behind that tag if reached quickly","The first validator","NOSHASHI, by reversing it"], 1, "Send the transaction hash, amount, time and tag, ideally with a police reference."],
    ["Why do thieves send hundreds of 1-drop payments after a theft?", ["To pay fees","To bury the real transfers in noise and spread phishing links","To close the account","To vote on amendments"], 1, "A trace that ignores the dust and follows AccountDelete sweeps sees through it."],
    ["What does NOSHASHI's hardening plan contain?", ["Your secret key","Unsigned transactions for you to review and sign in your own wallet","A password reset","Nothing, it only scores"], 1, "NOSHASHI reads the ledger and never signs or asks for a key."],
    ["An escrow to you matured last week. Why has the XRP not arrived?", ["It was stolen","An escrow never pays out by itself: someone must submit EscrowFinish","Escrows take a month to settle","The issuer froze it"], 1, "RECOVER FUNDS lists matured escrows with the EscrowFinish to sign."],
    ["A site asks you to sign a SetRegularKey naming an address you do not recognise. What happens if you sign?", ["Nothing, it only reads","Whoever holds that key can move everything in your account from then on","Your fees go down","The account is deleted"], 1, "PRE-SIGN CHECK answers DO NOT SIGN for exactly this: it is the quickest way to take over an account."],
    ["Your exchange deposit failed with tecDST_TAG_NEEDED. Where is the XRP?", ["At the exchange, unassigned","Still in your account: only the fee was spent","Burned","In escrow"], 1, "A tec result means the payment did nothing but charge its fee. Send again with the tag."],
    ["An account's Domain field says bitstamp.net. What proves it really belongs to Bitstamp?", ["Nothing more is needed","bitstamp.net listing the account in its /.well-known/xrp-ledger.toml","A large balance","An old account age"], 1, "Anyone can write any domain. DOMAIN CHECK reads the site's file and says VERIFIED only when the account is listed."],
    ["What is the XRP Ledger equivalent of revoking a token approval?", ["There is nothing to revoke","Cancelling what you left open: checks you wrote, NFT sell offers, payment channels, old orders, keys and signers","Deleting your trust lines","Changing your password"], 1, "EXPOSURE AUDIT lists each open permission with the one transaction that revokes it."],
    ["An exchange shows a large XRP balance. Why is that not proof customers are safe?", ["It always is","It says nothing about what the exchange owes; proof needs liabilities too","Balances cannot be read","Only validators can check"], 1, "Reserves divided by published liabilities is the coverage ratio. Reserves alone can hide larger debts."],
    ["What does a customer's inclusion proof let them check?", ["Everyone else's balance","That their own balance is counted in the published total, without seeing anyone else's","The exchange's password","Their seed"], 1, "The path from their leaf to the published root reproduces it only if their balance is in it."],
    ["A protection fund sits in an account controlled by one key. How much of it is secured?", ["All of it","None: whoever holds that key can move it","Half","It depends on the balance"], 1, "Only XRP locked in escrow, or under a signer list with the master key disabled, is counted as secured."],
    ["Is NOSHASHI's Customer Asset Protection insurance?", ["Yes, it pays claims","No: it verifies and publishes what is set aside; nobody pays claims and no government scheme stands behind it","Yes, backed by a government","Only on Strategic"], 1, "It gives customers facts they can check, not a guarantee."],
    ["A customer asks to withdraw to an address created an hour ago. Why screen it?", ["Old addresses are slower","Most stolen withdrawals go to freshly created accounts","New accounts pay more fees","It is illegal"], 1, "WITHDRAWALS flags destinations hours old, and lookalikes of past destinations."],
    ["An account placed 171 orders on a token in minutes, replaced or cancelled all of them, and none filled. What does that show?", ["Proven fraud","Depth that is constantly re-quoted and never trades: the book looks deeper than it is","A broken ledger","Nothing at all"], 1, "It is an indicator, not a verdict: an ordinary market maker re-quoting looks the same."]
  ];
  var V = [
    ["Account","A place on the ledger that holds XRP and tokens, identified by an address starting with r."],
    ["AccountSet","The transaction that changes an account's settings and flags."],
    ["Address","An account's public identifier, 25 to 35 characters starting with r."],
    ["Adjudication","NOSHASHI's process of checking something against rules and returning a verdict."],
    ["Amendment","A change to the XRPL's rules, enabled after 80% of validators support it for two weeks."],
    ["Amendment blocked","A server that has not upgraded when an amendment activates, and stops following the ledger."],
    ["AML","Anti-Money-Laundering: rules to stop criminal money moving."],
    ["AMM","Automated market maker: a pool of two assets that trades automatically (XLS-30)."],
    ["Auction slot","A seat in an AMM pool that gives its holder discounted trading for a time."],
    ["Auto-bridging","Routing a token-to-token trade through XRP when that gives a better price."],
    ["Blackholed","An account nobody can sign for again: master key disabled, regular key unusable, no signer list."],
    ["Blocking check","A check whose failure gives NO-GO."],
    ["book_offers","The server call that returns an order book's offers."],
    ["CASP / VASP","A crypto (or virtual) asset service provider: a regulated business handling digital assets."],
    ["Check (payment)","A deferred payment the receiver cashes when they choose."],
    ["Clawback","An issuer power to take tokens back from a holder. Must be enabled before any trust lines exist (XLS-39)."],
    ["Closed ledger","A ledger that has stopped taking transactions but is not yet validated."],
    ["Compliance","Following the laws and rules that apply to moving money."],
    ["Compliance API","NOSHASHI's read-only interface for verdicts and readings."],
    ["Concentration","How much of an asset or activity sits with a few parties; measured with the HHI."],
    ["Consensus","How validators agree on the next ledger without mining."],
    ["Counterparty","Whoever is on the other side of a transaction."],
    ["Credential","An on-ledger proof that an account passed a check (XLS-70)."],
    ["Currency code","A token's name, 3 characters or 40 hex. Anyone can use any code, so it proves nothing alone."],
    ["Deep freeze","A freeze where the holder can neither send nor receive the token (XLS-77)."],
    ["delivered_amount","The amount a payment actually delivered, in its metadata. The figure to credit."],
    ["Depth","How much is on offer in an order book."],
    ["Destination tag","A number telling a shared account which customer a payment is for."],
    ["Domain verification","Proof that an account belongs to a website: the site lists the account in its /.well-known/xrp-ledger.toml."],
    ["DEX","The decentralised exchange built into the XRPL."],
    ["Digest (SHA-256)","A fixed-length fingerprint of data. Change anything and the digest changes completely."],
    ["Domain","A web domain an account claims, verifiable against a file on that domain."],
    ["Drops","The smallest unit of XRP: 1 XRP = 1,000,000 drops."],
    ["Escrow","Funds locked until a time passes or a condition is met."],
    ["EscrowFinish","The transaction that releases a matured escrow. Nothing pays out until someone submits it."],
    ["Exception","An approved, recorded override of a NO-GO for a stated reason."],
    ["Fee pressure","How high transaction costs are running because the network is busy."],
    ["Flag","An on/off setting on an account or trust line."],
    ["Four-eyes","A control where a second person must approve a change."],
    ["Freeze","An issuer power to stop a holder sending its token on."],
    ["Funded depth","Depth backed by owners who can actually deliver."],
    ["gateway_balances","The server call that returns an issuer's obligations."],
    ["Global freeze","An issuer freezing every holder of its tokens at once."],
    ["GO","A verdict meaning every check passed."],
    ["Hash","A transaction's or object's 64-character hexadecimal identifier."],
    ["Hash-chained log","A log where each entry includes the fingerprint of the previous one, so edits show."],
    ["HHI","Herfindahl-Hirschman Index: the sum of squared percentage shares; 10,000 is total concentration."],
    ["HOLD","A verdict meaning a person should review before moving."],
    ["HUD","NOSHASHI's small live panel in the macOS menu bar."],
    ["INSUFFICIENT_DATA","A check state meaning the ledger did not give enough to decide. Never a pass."],
    ["Investigation","A case in NOSHASHI collecting verdicts, readings and notes, with a hash-chained log."],
    ["IOU","Another name for an issued token: a promise from its issuer."],
    ["Issuer","The account that creates a token and sets its rules."],
    ["KYC","Know Your Customer: verifying who a customer is."],
    ["Ledger","One numbered snapshot of the whole XRPL, produced every 3 to 5 seconds."],
    ["Ledger index","A ledger's number. Fixes a reading to a moment anyone can re-check."],
    ["Limit","The most of a token you are willing to hold on a trust line."],
    ["Listed depth","All the depth shown on a book, including offers nobody can fill."],
    ["LP token","A token received for adding assets to an AMM pool; carries a fee vote."],
    ["Mainnet","The real, live XRP Ledger, as opposed to test networks."],
    ["Master key","An account's original key pair. It can be disabled."],
    ["Metadata","The record of what a transaction actually did, attached once it is validated."],
    ["MiCA","The EU's regulation for crypto-assets, including stablecoin issuers."],
    ["Mid price","The average of the best bid and best ask."],
    ["Multi-signature","Several keys signing together, set with a signer list."],
    ["NFT","A unique token (XLS-20). Its ID encodes the rights its issuer kept."],
    ["NFTokenID","The 64-character identifier of an NFT, which encodes its flags."],
    ["No Freeze","A permanent promise by an issuer never to freeze."],
    ["NO-GO","A verdict meaning a blocking check failed."],
    ["NOT_APPLICABLE","A check state meaning the check does not apply."],
    ["Obligations","The total of an issuer's tokens held by others: its real circulating supply."],
    ["Observer","NOSHASHI's agent mode that watches for changes and opens investigations."],
    ["Offer","An order posted on the DEX to trade one asset for another."],
    ["Order book","All the offers for one trading pair."],
    ["Owner reserve","XRP locked for each object an account owns, such as a trust line or offer."],
    ["Partial payment","A payment whose Amount is only a maximum; it can deliver less and still succeed."],
    ["Passport","NOSHASHI's signed, portable record of an asset's posture."],
    ["Path","A route that lets a payment convert currencies on the way."],
    ["Payment channel","Many small off-ledger payments settled later in one transaction."],
    ["Permissioned domain","An area where only accounts with the right credentials may take part (XLS-80)."],
    ["Policy","An organisation's own thresholds and rules applied to verdicts."],
    ["Provenance","Where an account came from: its age and first funder."],
    ["Quorum","The minimum total signing weight needed to act for an account."],
    ["Receipt","NOSHASHI's record of a verdict: ledger index, rules version, checks and digest."],
    ["Regular key","A second key an account nominates to sign for it."],
    ["Require Auth","An issuer setting: you need its approval to hold its token."],
    ["Reserve","XRP an account must keep locked: a base reserve plus an owner reserve per object."],
    ["Pre-sign check","Decoding a transaction before signing it, to see what it really does. Most thefts start with a signature the owner did not understand."],
    ["REVIEW","A check state meaning a human decision is needed."],
    ["Selective disclosure","Proving a credential exists without revealing the personal data behind it."],
    ["Sequence","An account's transaction counter, starting at its creation ledger index."],
    ["Signer list","The keys and weights used for multi-signature."],
    ["Spread","The gap between the best bid and the best ask."],
    ["Stablecoin","A token meant to hold a steady value, such as one US dollar."],
    ["taker_gets_funded","The field book_offers adds when an owner cannot cover an offer."],
    ["tec","A result prefix: failed, but recorded and the fee charged."],
    ["tesSUCCESS","The success result. It does not mean the full Amount arrived."],
    ["Token","An asset on the XRPL other than XRP, created by an issuer."],
    ["Transaction","A signed instruction that changes the ledger."],
    ["Transaction cost","The small XRP fee each transaction pays, which is destroyed."],
    ["Transfer fee","A percentage (0% to 100%) an issuer charges when holders send its token to each other."],
    ["Travel Rule","FATF Recommendation 16: sender and receiver details travel with transfers above a threshold."],
    ["Trust line","The link you open to an issuer to hold its token."],
    ["UNL","Unique Node List: the validators a server trusts not to collude."],
    ["Unfunded offer","An offer still listed although its owner cannot fill it."],
    ["Validated ledger","A ledger at least 80% of trusted validators agreed on. It is final."],
    ["Validator","A server that votes on which ledger is the true next one."],
    ["Warning check","A check whose failure gives HOLD rather than NO-GO."],
    ["Webhook","A signed notification NOSHASHI sends to your own system when an event happens."],
    ["X-address","An address format that packs an address and destination tag together."],
    ["XLS","A numbered proposal for a new XRPL standard, such as XLS-30 for AMMs."],
    ["XRP","The XRP Ledger's own currency."],
    ["XRPL","The XRP Ledger."],
    ["Address poisoning","Sending someone a tiny payment from a lookalike address, matching the start and end of one they use, so they copy it from their history by mistake."],
    ["AccountDelete","The transaction that deletes an account and sends its remaining XRP to another; thieves use it to sweep throwaway accounts."],
    ["Proof of reserves","Showing, from the ledger, the XRP an institution holds in the accounts it names for its customers."],
    ["Merkle sum tree","A tree of hashes and sums over customer balances whose root proves the total without revealing any balance."],
    ["Inclusion proof","The path from one customer's leaf to the published root, which proves their balance is counted."],
    ["Coverage ratio","Reserves divided by published customer liabilities; 100% or more means fully backed."],
    ["Protection fund","XRP set aside to make customers whole up to a per-customer limit, secured only if no single key can move it."],
    ["Withdrawal screening","Checking an outbound payment before it is signed: will it bounce, and is the destination new, a lookalike, sanctioned or reported."],
    ["Scam registry","Addresses reported by institutions with transaction evidence and confirmed by an independent reviewer."],
    ["Quote churn","Orders placed and replaced again and again without filling; it makes an order book look deeper than it is."],
    ["Hardening plan","NOSHASHI's list of unsigned transactions that make an account harder to take over, for the owner to sign in their own wallet."],
    ["Incident dossier","NOSHASHI's plain-text record of a theft trail and recovery paths, with a SHA-256 fingerprint anyone can re-check."],
    ["Seed","The secret an account's keys are derived from. Whoever has it controls the account; no legitimate service ever asks for it."],
    ["Security Guardian","NOSHASHI's Strategic alert: a signed security_alert webhook when a watched account's keys change or it is deleted."]
  ];
  V.sort(function(a, b){ return a[0].toLowerCase().localeCompare(b[0].toLowerCase()); });
  // Words from the word list that appear in a question, its answer or its
  // explanation, so a newcomer can read the question without scrolling away.
  // "Check (payment)" would match the everyday word "check" in every question.
  var TERMS = V.filter(function(v){ return v[0] !== "Check (payment)"; }).map(function(v){
    var names = v[0].replace(/\s*\(.*\)$/, "").split(" / ");
    return { term: v[0], def: v[1], res: names.map(function(n){
      return new RegExp("(^|[^A-Za-z0-9_-])" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(s|es)?(?![A-Za-z0-9_-])", n === n.toUpperCase() || /_/.test(n) ? "" : "i");
    }) };
  }).sort(function(a, b){ return b.term.length - a.term.length; });
  function wordsIn(text){
    var out = [], taken = text;
    TERMS.forEach(function(t){
      if (out.length >= 5) return;
      if (t.res.some(function(re){ return re.test(taken); })) {
        out.push(t);
        t.res.forEach(function(re){ taken = taken.replace(new RegExp(re.source, re.flags + "g"), "$1 "); });
      }
    });
    return out;
  }
  var form = document.getElementById("quiz"), qs = [];
  Q.forEach(function(q){
    if (q.length <= 2) {
      var h = document.createElement("p"); h.className = "quizgroup"; h.textContent = q[0]; form.appendChild(h);
      if (q[1] === "vocab") { var n = document.createElement("p"); n.className = "quiznote"; n.textContent = "Each question is a word from the word list. Pick the meaning that fits."; form.appendChild(n); }
      return;
    }
    var i = qs.length; qs.push(q);
    var fs = document.createElement("fieldset"); fs.className = "q"; fs.id = "q" + i;
    var lg = document.createElement("legend"); lg.textContent = (i + 1) + ". " + q[0]; fs.appendChild(lg);
    q[1].forEach(function(opt, j){
      var lb = document.createElement("label");
      var inp = document.createElement("input"); inp.type = "radio"; inp.name = "q" + i; inp.value = j; inp.id = "q" + i + "o" + j;
      lb.appendChild(inp); lb.appendChild(document.createTextNode(" " + opt)); fs.appendChild(lb);
    });
    // Vocabulary questions (flag 1) skip the word help, which would give the answer away.
    var words = q[4] ? [] : wordsIn(q[0] + " " + q[1][q[2]] + " " + q[3]);
    if (words.length) {
      var d = document.createElement("details"); d.className = "words";
      var sm = document.createElement("summary"); sm.textContent = "Words used here (" + words.length + ")"; d.appendChild(sm);
      var wl = document.createElement("dl");
      words.forEach(function(w){
        var dt = document.createElement("dt"); dt.textContent = w.term;
        var dd = document.createElement("dd"); dd.textContent = w.def;
        wl.appendChild(dt); wl.appendChild(dd);
      });
      d.appendChild(wl); fs.appendChild(d);
    }
    var why = document.createElement("p"); why.className = "why";
    why.textContent = "Answer: " + q[1][q[2]] + ". " + q[3]; fs.appendChild(why);
    form.appendChild(fs);
  });
  document.getElementById("grade").addEventListener("click", function(){
    var right = 0, answered = 0;
    qs.forEach(function(q, i){
      var fs = document.getElementById("q" + i), pick = form.querySelector('input[name="q' + i + '"]:checked');
      fs.classList.remove("right", "wrong");
      if (!pick) return;
      answered++;
      if (Number(pick.value) === q[2]) { right++; fs.classList.add("right"); } else fs.classList.add("wrong");
    });
    var s = document.getElementById("score");
    s.textContent = answered < qs.length
      ? "You scored " + right + " of " + answered + " answered. " + (qs.length - answered) + " still to answer."
      : "You scored " + right + " of " + qs.length + "." + (right === qs.length ? " Every answer right." : right >= Math.ceil(qs.length * 0.8) ? " Strong result. Read the explanations for the ones you missed." : " Revisit the lessons behind the ones you missed, then try again.");
  });
  document.getElementById("reset").addEventListener("click", function(){
    form.reset(); form.querySelectorAll(".q").forEach(function(f){ f.classList.remove("right", "wrong"); });
    document.getElementById("score").textContent = "";
  });

  var dl = document.getElementById("vlist");
  function draw(f){
    dl.textContent = "";
    V.forEach(function(v){
      if (f && (v[0] + " " + v[1]).toLowerCase().indexOf(f) < 0) return;
      var dt = document.createElement("dt"); dt.textContent = v[0];
      var dd = document.createElement("dd"); dd.textContent = v[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
  }
  draw("");
  document.getElementById("vfilter").addEventListener("input", function(e){ draw(e.target.value.trim().toLowerCase()); });
})();
