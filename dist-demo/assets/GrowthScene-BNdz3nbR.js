import{r as m,j as e}from"./motion-DwHWhnCj.js";import{a as v,m as x,c as f,e as g,P as k,f as N,T,O as A,Q as j}from"./index-BXh0KF_V.js";import"./radix-DpoGBNMO.js";const y=[{id:"x",label:"X",limit:280,register:"One claim, one number, no preamble."},{id:"linkedin",label:"LinkedIn",limit:3e3,register:"Institutional. Lead with the operational problem, not the product."},{id:"reddit",label:"Reddit — r/Ripple, r/XRP",limit:1e4,register:"Technical and unbranded. This audience punishes a pitch."},{id:"hn",label:"Hacker News",limit:2e3,register:"The engineering finding is the story. The product is a footnote."}],b=[{id:"depth",title:"The 913× depth overstatement",hook:"A measured, checkable finding about XRPL order books that nobody has written up.",usesLiveData:!1},{id:"freeze",title:"Your balance may not be yours",hook:"Most holders do not know issuers can freeze issued balances, and it is one flag read away.",usesLiveData:!1},{id:"amendments",title:"Implemented is not activated",hook:"Tooling ships features the network rejects, because it checks the wrong endpoint.",usesLiveData:!0},{id:"check",title:"Check an address before you pay it",hook:"A free public utility, useful to someone who has never heard of a permissioned domain.",usesLiveData:!1}];function L(t){return{ledger:t.ledger?.ledgerIndex?.toLocaleString()??null,fee:t.ledger?.openLedgerFeeXrp??null}}const s={advertised:"12,692,991",reachable:"13,894",factor:"913×",spreadBefore:"−18,675 bps",spreadAfter:"20 bps",pair:"GateHub USD/XRP",when:"2026-08-23"},d={active:93,version:"3.3.0",notActivated:["LendingProtocol","SingleAssetVault","ConfidentialMPT","Batch"],when:"2026-08-24"};function P(t,o,l){const c=y.find(i=>i.id===t),r=L(l),h=[];let n="";o==="depth"&&(h.push(`The ${s.pair} figures were measured on ${s.when}. Re-run the exit analysis before posting — a book moves.`),n=t==="x"?`An XRPL order book advertised $${s.advertised} of depth.

$${s.reachable} was actually reachable within 10% of mid. ${s.factor} overstatement.

The touch was a single stale offer at 29× the real market. Naive depth summing counts bids nobody would ever fill against.`:t==="hn"?`Measuring XRPL order book depth honestly is harder than it looks

Summing resting offers on ${s.pair} gives $${s.advertised} of apparent depth. Only $${s.reachable} sits within 10% of mid — a ${s.factor} overstatement.

Two failure modes, both found by probing mainnet rather than reading docs:

1. The touch is routinely poisoned. Best bid read 19.90 against a real market of 0.68 — one stale offer at 29×. Anchoring spread on it produced ${s.spreadBefore}. Using the tightest *uncrossed* pair instead gives ${s.spreadAfter}.

2. A depth percentile is worse, not better. Bid sides carry enormous size at absurd lowball prices, so the 10th percentile of depth lands in the junk rather than the market.

What works: anchor on the tightest uncrossed pair, then count only depth within a band of it. Everything further out is a wish, not a bid.`:t==="reddit"?`Why "book depth" on the XRPL DEX is mostly fiction

If you add up every resting offer on ${s.pair} you get about $${s.advertised} of buyers. That is the number most tools show.

Only $${s.reachable} of it is within 10% of the real mid — everything else is lowball bids that would never fill at a price you would accept.

Worse, the top of the book had a single stale offer priced at 29× the market. Take that as your best bid and every spread you compute from it is garbage (${s.spreadBefore} in this case).

Happy to share the method if useful. The fix is to anchor on the tightest uncrossed pair and band the depth around it.`:`Most tools reading XRPL order books are overstating liquidity by orders of magnitude.

Measured on ${s.pair}: $${s.advertised} of apparent depth, $${s.reachable} actually reachable within 10% of mid. A ${s.factor} overstatement.

For anyone marking an issued position to market, that is the difference between a holding you can exit and one you cannot. The book had a single stale offer at 29× the market sitting at the touch, which poisons every spread and slippage figure computed from it.

We built the correction into NOSHASHI because the alternative was reporting a number we could not stand behind.`),o==="freeze"&&(n=t==="x"?`If you hold an issued token on XRPL — a dollar, a euro, anything that is not XRP — the issuer can usually freeze it.

The balance stays visible in your wallet. It simply stops being able to move.

One account flag decides it. Almost no wallet shows you.`:t==="linkedin"?`An issued balance on the XRP Ledger is only an asset if two things are true at once.

The issuer cannot immobilise it — a compliance fact, sitting in account flags that most wallets never read.

And there is somewhere to sell it — a market fact, sitting in the DEX and the AMM pools.

Either one alone is a half-answer. A position with clean freeze rights and no order book is untradeable. A position with deep liquidity behind an issuer who can freeze it at will is not owned.

Institutions carry both risks and the tooling is split: compliance vendors never read the book, market terminals never read the flags.`:t==="reddit"?`PSA: issued tokens on XRPL can be frozen by their issuer

This is not a bug or a loophole — it is a built-in power of the ledger, and it applies to most issued currencies (not XRP itself).

Three flags worth knowing:

- lsfGlobalFreeze — the issuer has frozen everything it issued, right now
- lsfNoFreeze — the issuer has permanently given the right up, and it cannot be undone
- XLS-77 deep freeze — blocks a specific holder from sending AND receiving

That last one matters: an ordinary freeze still lets a sanctioned address accept funds.

You can read all of this yourself with account_info on the issuer. Most people never do.`:`Issued tokens on the XRP Ledger can be frozen by whoever issued them.

The balance stays in your wallet and stays visible. It just stops being able to move. lsfGlobalFreeze does it in one transaction, with no warning.

Some issuers set lsfNoFreeze, which is irreversible and means they can never do it. That distinction is one account_info call away and almost nothing surfaces it.`),o==="amendments"&&(h.push(`Amendment counts were read on ${d.when}. Re-read Settings › Network capabilities before posting; amendments activate on a two-week majority.`),r.ledger&&h.push(`Ledger ${r.ledger} is from this session and will be stale by the time you post — drop it or refresh it.`),n=t==="hn"?`A feature your node knows about is not a feature the network accepts

XRPL ships features as amendments, and one exists in three distinct states:

1. Specified — an XLS document exists
2. Implemented — rippled knows the transaction type, so server_definitions lists it
3. Activated — validator majority reached, and only now will a transaction succeed

Most tooling checks (2) and calls it support. That is how you end up shipping a lending product every validator on the network rejects.

On mainnet today (rippled ${d.version}, ${d.active} amendments active): Credentials, PermissionedDomains, PermissionedDEX, DeepFreeze and TokenEscrow are live. ${d.notActivated.join(", ")} are not — despite all appearing in server_definitions.

The check is cheap: read the amendments object from the validated ledger and compare against SHA-512Half of each feature name. No lookup table to drift.`:t==="x"?`XRPL tooling keeps shipping features the network rejects.

rippled knowing a transaction type ≠ the amendment being activated. server_definitions lists both.

${d.notActivated.slice(0,3).join(", ")} are all implemented and all still rejected by every validator.

Read the amendments object, not the definitions.`:t==="reddit"?`If you are building on XRPL: server_definitions will lie to you about what works

An amendment goes through three states — specified, implemented in rippled, activated by validator majority. Only the third one actually works.

server_definitions lists transaction types the binary knows, including ones no validator will accept yet. Check that and you will confidently build against ${d.notActivated[0]} or ${d.notActivated[1]} and wonder why everything fails.

The reliable check is the amendments object in the validated ledger. Amendment IDs are SHA-512Half of the feature name, so you can compute them locally and never depend on someone else's table.`:`A lesson from building on the XRP Ledger.

A feature exists in three states: specified, implemented in the node software, and activated by validator majority. Only the third one works.

Most tooling checks the second and calls it support — which is how a product ends up offering a capability the network rejects on every attempt.

We made our platform read the ledger's own amendment record and refuse to surface anything not genuinely live. It means saying "not available yet" more often. It also means never promising something that cannot work.`),o==="check"&&(n=t==="x"?`New and free: paste any XRPL address and read what the ledger already publishes about it.

Can they freeze your balance? What do they charge to transfer? What have they issued?

No account, nothing signed. No reputation score either — we do not have one and will not invent one.`:t==="linkedin"?`We have made the counterparty check in NOSHASHI free and public.

Paste any XRP Ledger address — a merchant, a token issuer, the other side of a trade — and read what the ledger already publishes: whether they can freeze what they issue, what they charge to transfer, what is outstanding, which credentials they hold.

All of it is public today. Almost nobody looks.

One deliberate omission: there is no reputation score and no bad-actor list, because we do not have one. A clean result means nothing is recorded against that address — which is not the same as a recommendation, and the interface says so plainly.`:t==="reddit"?`Made a free tool for checking an XRPL address before you send to it

Reads what is already public: issuer freeze rights, transfer fees, outstanding obligations, credentials held, recent counterparties.

Deliberately does NOT do: reputation scores, bad-actor lists, sanctions screening. We do not have that data and inventing it would be worse than useless, because people act on it.

No account needed, nothing signed, read-only.`:`A free public check for XRPL addresses.

Paste an address and read what the ledger publishes: issuer freeze rights, transfer fees, outstanding supply, credentials, counterparty history.

Explicitly not included: any reputation score. We do not hold that data, and a score people act on is the worst thing to invent.`);const u=n.length;return{platform:t,angle:o,body:n,chars:u,overLimit:c.limit!==void 0&&u>c.limit,verifyBefore:h}}function I({data:t}){const{push:o}=v(),[l,c]=m.useState("x"),[r,h]=m.useState(b[0].id),n=y.find(a=>a.id===l),u=b.find(a=>a.id===r),i=m.useMemo(()=>P(l,r,t),[l,r,t]),w=async()=>{try{await navigator.clipboard.writeText(i.body),o({title:"COPIED",body:`${n.label} draft on the clipboard.`,tone:"go"})}catch{o({title:"CLIPBOARD UNAVAILABLE",body:"Select the text and copy it manually.",tone:"hold"})}};return e.jsxs("div",{className:"flex h-full min-w-0 flex-col gap-3 p-4",children:[e.jsx(x,{index:"13",kicker:"CONTENT STUDIO · DRAFTS ONLY · NOTHING IS POSTED",title:"GROWTH",sub:"Platform-native drafts built from figures this build actually measured. You post them.",status:"go",statusLabel:"NO AUTOMATION"}),e.jsxs("div",{className:"grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5",children:[e.jsxs("div",{className:"flex min-h-0 flex-col gap-3 lg:col-span-2",children:[e.jsx(f,{label:"ANGLE",className:"shrink-0",children:e.jsx("div",{className:"grid gap-1.5",children:b.map(a=>{const p=a.id===r;return e.jsxs("button",{onClick:()=>h(a.id),"aria-pressed":p,className:g("inset-row px-3 py-2.5 text-left",p&&"border-brand/50 bg-brand/10"),children:[e.jsxs("div",{className:"flex items-baseline gap-2",children:[e.jsx("span",{className:g("text-[12px] font-medium",p?"text-brand":"text-foreground"),children:a.title}),a.usesLiveData&&e.jsx("span",{className:"ml-auto font-mono text-[8.5px] tracking-[0.14em] text-telemetry",children:"LIVE"})]}),e.jsx("p",{className:"mt-1 text-[10.5px] leading-relaxed text-muted-foreground",children:a.hook})]},a.id)})})}),e.jsxs(f,{label:"WHY THERE IS NO PUBLISH BUTTON",className:"min-h-0 flex-1",children:[e.jsx("p",{className:"text-[11px] leading-relaxed text-muted-foreground",children:"Posting to X, LinkedIn or Reddit outside their own APIs breaks those platforms’ terms, and automated promotional posting is what their spam systems exist to catch. The realistic outcome is a banned account."}),e.jsx("p",{className:"mt-2.5 text-[11px] leading-relaxed text-muted-foreground",children:"The human step also earns its place. Every draft here quotes a figure NOSHASHI measured, and measurements go stale — reading your own post before it goes out is what stops an old number being broadcast as current."})]})]}),e.jsxs(f,{label:`${n.label.toUpperCase()} DRAFT`,className:"relative min-h-0 lg:col-span-3",bodyClassName:"flex min-h-0 flex-col p-0",right:e.jsx(T,{value:l,onValueChange:a=>c(a),children:e.jsx(A,{children:y.map(a=>e.jsx(j,{value:a.id,children:a.id.toUpperCase()},a.id))})}),children:[e.jsx(k,{element:"hatch",size:150,opacity:.05,className:"-right-8 -top-4"}),e.jsx("div",{className:"border-b border-border/50 px-4 py-2.5",children:e.jsxs("p",{className:"text-[10.5px] leading-relaxed text-faint",children:[e.jsx("span",{className:"font-mono tracking-[0.14em] text-muted-foreground",children:"REGISTER"})," ",n.register]})}),e.jsx("div",{className:"min-h-0 flex-1 overflow-y-auto p-4",children:e.jsx("pre",{className:"whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-foreground",children:i.body})}),i.verifyBefore.length>0&&e.jsxs("div",{className:"shrink-0 border-t border-border/50 px-4 py-3",children:[e.jsx("p",{className:"font-mono text-[9px] tracking-[0.18em] text-hold",children:"VERIFY FIRST"}),e.jsx("ul",{className:"mt-1.5 grid gap-1",children:i.verifyBefore.map(a=>e.jsx("li",{className:"text-[10.5px] leading-relaxed text-muted-foreground",children:a},a))})]}),e.jsxs("div",{className:"flex shrink-0 items-center gap-3 border-t border-border/60 px-4 py-3",children:[e.jsx(N,{size:"sm",onClick:()=>void w(),children:"COPY DRAFT"}),e.jsxs("span",{className:g("font-mono text-[10px] tabular-nums",i.overLimit?"text-no-go":"text-faint"),children:[i.chars.toLocaleString(),n.limit?` / ${n.limit.toLocaleString()}`:"",i.overLimit?" — OVER LIMIT":""]}),e.jsx("span",{className:"ml-auto font-mono text-[9px] tracking-[0.14em] text-faint",children:u.title.toUpperCase()})]})]})]})]})}export{I as GrowthScene};
