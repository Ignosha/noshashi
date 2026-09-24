# First emails: batch 1 (24 institutions)

Drafted 2026-09-24 with the `institutional-outreach` skill. Nothing here has been sent.

**Before sending any of these:**

1. Open the row's `contact_page` in `outreach/contacts.csv` and confirm the address is still published there. Then set `status` to `verified`.
2. **Re-measure dated figures on the day you send.**
   - The depth sample is from 2026-09-08, ledger 106,850,266. Re-run it in the app under Desk → order book integrity.
   - The issuer facts were read today through `https://www.noshashi.app/api/authority`, at ledgers 107,207,971 to 107,207,975. Re-open each certificate link.
   - If a figure has changed, update the sentence or drop it.
3. **Merge fields.** `{{sender_name}}`, `{{postal_address}}` and `{{unsubscribe_url}}` are filled by the outreach engine. If you send by hand:
   - use your real name;
   - include a real postal address (a PO box is fine; CAN-SPAM requires one);
   - include a line telling people how to opt out, and honour it.
4. **Forms.** Where the channel is `form`, paste the body into the institution's contact form.
5. **Pace.** Send about 20 a day. Send one follow-up at most, a week later, and stop at the first "no".

Every depth figure below is covered by the same method note:

- the 10% band around mid is a parameter we chose;
- AMM pools are excluded;
- `book_offers` returns at most 60 levels.

All three push the gap up, so each email that cites depth says so in one line.

The footer on every email:

```
{{sender_name}}
NOSHASHI · https://www.noshashi.app
{{postal_address}}
Not relevant? One click and you won't hear from us again: {{unsubscribe_url}}
```

---

## Treasury holders

### 1. Wellgistics Health

- **To:** IR@wellgisticshealth.com (investor relations)
- **Subject:** For finance: on-ledger evidence for the XRP treasury position

> For whoever owns the XRP treasury position. If IR is the wrong desk, finance or the audit committee is the right one.
>
> When auditors test a digital asset balance, they ask two things: does it exist at the reporting date, and who can move it. On the XRP Ledger, both are readable facts, but they are easy to get wrong. A wallet's real signing control comes from summed signer weights, not a headcount. A master key can bypass a signer list that looks strict. Escrow and reserve lock part of the balance.
>
> NOSHASHI reads those from validated mainnet. It exports a signed record stamped with the ledger index that your auditor can re-check independently. It never asks you for balances; it reads the public ledger.
>
> NOSHASHI is in beta (v1.0.9), and we are working with a small number of treasury teams. Would a 20-minute call before your next quarter-end be useful?

### 2. VivoPower International

- **To:** shareholders@vivopower.com (investor relations)
- **Subject:** For finance: on-ledger evidence for the XRP treasury

> For whoever owns VivoPower's XRP treasury reporting. Please pass it to finance if this inbox is IR only.
>
> A listed company holding XRP gets two audit questions each period: does the balance exist at the reporting date, and who can move it. On the XRP Ledger both can be read directly. They are also easy to misstate: signing control comes from summed signer weights, and a master key can quietly bypass a signer list.
>
> NOSHASHI reads the treasury wallets' control surface from validated mainnet: quorum, master key, regular key, escrow and reserve. It exports a signed, ledger-stamped record your auditor can reproduce without trusting us.
>
> We are in beta (v1.0.9) and onboarding a few treasury teams. Would 20 minutes be useful ahead of your next reporting date?

### 3. Hyperscale Data

- **To:** IR@hyperscaledata.com (investor relations)
- **Subject:** For finance: ledger evidence for digital asset positions

> For the team responsible for Hyperscale Data's digital asset positions. Please forward to finance if IR is the wrong desk.
>
> For XRP held on its own ledger, the audit questions are existence at the reporting date and control. Both can be read from the XRP Ledger, and both are easy to misstate: a master key can bypass a signer list, and escrow locks part of a balance that still shows as held.
>
> NOSHASHI reads those facts from validated mainnet and exports a signed record stamped with the ledger index. An auditor can re-run it independently. It works from public ledger data and asks you for nothing.
>
> NOSHASHI is in beta (v1.0.9). We are working with a small number of treasury teams, and I would value 20 minutes with yours.

### 4. Linklogis

- **To:** ir@linklogis.com (investor relations)
- **Subject:** For the digital asset team: ledger-stamped evidence on XRPL holdings

> For the team running Linklogis's digital asset strategy. Please forward if IR is the wrong desk.
>
> If any of that strategy touches the XRP Ledger, there are two questions every auditor and regulator will ask: does the position exist, and who can move it. The ledger answers both directly. Signing control is summed signer weight, and a master key can bypass a signer list. It also shows whether an issued token's issuer can freeze or claw it back.
>
> NOSHASHI reads these from validated mainnet and produces a signed, ledger-stamped record that anyone can re-check. It is in beta (v1.0.9).
>
> Would a 20-minute call be useful to see whether it fits your reporting?

### 5. Gumi Inc.

- **To:** contact form, https://gu3.co.jp/en/contact.html
- **Subject:** For the digital asset team: evidence for the XRP treasury

> For the team responsible for gumi's XRP treasury.
>
> As XRP becomes gumi's primary crypto holding, auditors will test two things each period: that the XRP exists at the reporting date, and who can move it. Both are readable on the XRP Ledger. They are also easy to misstate: signing control is summed signer weight, not the number of signers, and a master key can bypass a signer list.
>
> NOSHASHI reads the treasury wallets' control from validated mainnet. It exports a signed record stamped with the ledger index, which your auditor can reproduce independently.
>
> NOSHASHI is in beta (v1.0.9). Would a 20-minute call in English be useful? I am glad to follow up in writing if that is easier.

---

## XRPL issuers

### 6. Bitstamp

- **To:** info@bitstamp.net (general)
- **Subject:** What counterparties' tooling reads about your XRPL issuing account

> For the team responsible for Bitstamp's XRP Ledger issuance.
>
> Two readings from validated mainnet:
>
> 1. **Today, at ledger 107,207,971, the issuing account rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B shows:**
>    - no signer list;
>    - the master key disabled and one regular key signing alone;
>    - NoFreeze not set;
>    - a 0.15% transfer fee.
>
>    Freeze rights are normal for a regulated issuer. But this is what an institutional counterparty's compliance tooling now reads, and a signer list would change the single-key finding.
> 2. **The good news:** your USD book was the control in our depth sample on 8 September (ledger 106,850,266). Funded depth within 10% of mid equalled listed depth, 1.0x.
>
> NOSHASHI produces both readings, with a signed record. It is in beta (v1.0.9). Certificate: https://www.noshashi.app/certificate/?issuer=rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B
>
> Worth 20 minutes?

(Method note on the depth figure: 10% band, AMM excluded, 60 levels.)

### 7. Sologenic

- **To:** partnerships form, https://www.sologenic.com/contact-partnerships
- **Subject:** SOLO's issuer passes every authority check. The book is the gap

> For the partnerships or market-structure team.
>
> Today, at ledger 107,207,975, SOLO's issuer (rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz) is blackholed and has NoFreeze set. No party can act on the issuance. That is the strongest authority profile we read on the XRP Ledger.
>
> The order book tells holders a different story. On 8 September (ledger 106,850,266), 94.7% of the SOLO depth listed within 10% of mid came from offers their owners could not fund. For comparison, Bitstamp USD was 1.0x. Holders who read listed depth overestimate their exit.
>
> NOSHASHI shows funded depth next to listed depth, and issues a signed certificate for the issuer. It is in beta (v1.0.9).
>
> Would 20 minutes be useful?
>
> (Method: the 10% band is our parameter; AMM pools excluded; 60 levels.)

### 8. Braza Group (Braza Bank)

- **To:** "Fale com um especialista" form, https://www.brazabank.com.br/fale-com-um-especialista
- **Subject:** For the BBRL/USDB team: independent issuer evidence on XRPL

> For the team responsible for BBRL and USDB on the XRP Ledger. Please forward if this reaches the FX desk.
>
> A regulated stablecoin issuer is expected to keep freeze and clawback rights, and holders' compliance tooling now reads them directly from the ledger. That tooling reads four more things with them: whether one key can sign for the issuer, the transfer fee, who holds the supply and how concentrated it is, and any change to those since yesterday.
>
> NOSHASHI produces that reading as a signed certificate stamped with the ledger index. It then watches the issuer and alerts when a flag changes. That gives Braza independent evidence of its own configuration to show institutional holders and supervisors.
>
> NOSHASHI is in beta (v1.0.9). Would a 20-minute call be useful? Glad to do it in Portuguese by email if easier.

### 9. Schuman Financial

- **To:** contact form, https://schuman.io/contact/
- **Subject:** For the EURØP team: independent issuer evidence on the XRP Ledger

> For the team responsible for EURØP on the XRP Ledger.
>
> As a MiCA e-money token issuer, you keep freeze and clawback rights, and institutional holders now read those directly from the ledger. With them they read whether one key can sign for the issuer, the transfer fee, and how concentrated the supply is. Some tooling reads a retained freeze right as a risk. Evidence that shows the configuration, and that it has not changed, helps.
>
> NOSHASHI produces that as a signed, ledger-stamped certificate. It then monitors the issuer and alerts on any flag change: evidence for holders and for your supervisor, produced from the ledger rather than self-reported.
>
> NOSHASHI is in beta (v1.0.9). Would 20 minutes be useful?

### 10. Novatti Group (AUDD)

- **To:** investorrelations@novatti.com (investor relations; ask them to forward to the AUDD team)
- **Subject:** For the AUDD team: issuer evidence on the XRP Ledger

> For the team responsible for AUDD on the XRP Ledger. Please forward from IR if needed.
>
> Institutional holders of a stablecoin now read the issuer's powers straight from the ledger:
> - freeze and clawback rights;
> - whether a single key can sign for the issuer;
> - the transfer fee;
> - how concentrated the holders are.
>
> They also check payments into their own accounts against `delivered_amount`, because a partial payment can succeed while delivering a fraction of its stated amount. In one measured case, a payment that stated 999,332 delivered 3,958.
>
> NOSHASHI produces the issuer reading as a signed certificate stamped with the ledger index, and monitors it for changes.
>
> NOSHASHI is in beta (v1.0.9). Would a 20-minute call be useful for AUDD's institutional distribution?

---

## Tokenization platforms

### 11. Zoniqx

- **To:** hello@zoniqx.com (general)
- **Subject:** Issuer evidence for the tokens you issue on the XRP Ledger

> For the product or compliance lead.
>
> When Zoniqx issues a token on the XRP Ledger, the issuing account's configuration is the investor's real terms: freeze rights, required authorisation, clawback, who can sign, and the transfer fee. Institutional investors' compliance teams now read those directly. They also notice when a setting changes after issuance.
>
> NOSHASHI produces a signed, ledger-stamped certificate of an issuer's authority. It monitors issuers for flag changes and measures holder concentration. You could attach the certificate to each issuance as independent evidence for investors and regulators.
>
> NOSHASHI is in beta (v1.0.9), and we are looking for a few tokenization partners. Would 20 minutes be useful?

### 12. Meld Gold

- **To:** info@meld.gold (general)
- **Subject:** Independent issuer evidence for Meld Gold's XRP Ledger tokens

> For the team responsible for Meld Gold's tokens on the XRP Ledger.
>
> A holder of tokenized gold carries two risks the ledger can answer:
> - **Issuer powers:** can the issuer freeze, require authorisation, or claw back, and can one key do it alone?
> - **Exit:** could the holder actually sell? Resting XRPL offers stay listed after their owner stops funding them, so listed depth can overstate what fills.
>
> NOSHASHI reads both from validated mainnet. It produces a signed, ledger-stamped certificate for the issuer, and shows funded depth next to listed depth. Both are useful when a bullion dealer or institution asks.
>
> NOSHASHI is in beta (v1.0.9). Would a 20-minute call be useful?

### 13. Ctrl Alt

- **To:** info@ctrl-alt.co (general)
- **Subject:** For the issuer services team: ledger-stamped issuer evidence

> For Ctrl Alt's issuer services or compliance team.
>
> As a VARA-licensed issuer bringing Dubai real estate onto the XRP Ledger, you set issuing-account permissions that become the investor's actual terms: freeze, required authorisation, clawback, signing control. Investors' compliance teams, and your regulator, can read those from the ledger. They can also see if they change.
>
> NOSHASHI produces a signed certificate of an issuer's authority, stamped with the ledger index. It monitors each issuer and alerts on any flag change. You get a record you can hand to investors and VARA, produced from the ledger rather than self-reported.
>
> NOSHASHI is in beta (v1.0.9). Would 20 minutes be useful?

### 14. Zeconomy

- **To:** info@zeconomy.com (general)
- **Subject:** Issuer and settlement evidence for tokenized trade finance on XRPL

> For the product or compliance lead.
>
> If any assets Zeconomy structures are issued or settled on the XRP Ledger, two ledger facts matter to institutional counterparties:
> - **The issuing account's powers:** freeze, required authorisation, clawback, who can sign.
> - **What a payment actually delivered:** a partial payment can succeed while delivering a fraction of its stated amount.
>
> Crediting the stated amount instead of `delivered_amount` is the mistake that drained exchanges.
>
> NOSHASHI reads both from validated mainnet. It produces signed, ledger-stamped records a counterparty can re-check.
>
> NOSHASHI is in beta (v1.0.9). Would a 20-minute call be useful?

---

## Compliance functions

### 15. Uphold

- **To:** compliance@uphold.com (compliance)
- **Subject:** For compliance: XRPL partial payments and issuer freeze rights

> For the compliance team.
>
> Two XRP Ledger facts that wallet screening does not cover:
>
> 1. **Partial payments.** A payment can succeed while delivering a fraction of its stated amount. In one we measured, the stated amount was 999,332.87 and `delivered_amount` was 3,958.64. Across 223 consecutive payments, 3 carried the partial-payment flag. Crediting the stated figure is the known exchange exploit.
> 2. **Issuer powers.** An issuer can freeze, require authorisation or claw back. That is issuer configuration, not counterparty behaviour, so a clean holder can still hold a clawback-enabled asset.
>
> NOSHASHI checks both before settlement: a GO / HOLD / NO-GO gate with a SHA-256 receipt and a signed audit export.
>
> NOSHASHI is in beta (v1.0.9). Would 20 minutes be useful?

### 16. Euro Exim Bank

- **To:** complianceteam@euroeximbank.com (compliance)
- **Subject:** For compliance: checking what an XRPL payment actually delivered

> For the compliance team, regarding XRP Ledger settlement.
>
> On the XRP Ledger, a payment's stated amount is a ceiling, not a delivery. With the partial-payment flag set, a transaction can succeed while delivering a fraction of its stated amount. In one measured case, it stated 999,332 and delivered 3,958. The authoritative figure is `delivered_amount` in the metadata; XRPL's own documentation says to credit that.
>
> NOSHASHI checks every settlement against `delivered_amount`. It also reads the counterparty's account age and origin, and scopes Travel Rule obligations against your threshold. Each verdict carries a SHA-256 receipt and a signed export for audit.
>
> NOSHASHI is in beta (v1.0.9). Would a 20-minute call be useful?

### 17. Upbit

- **To:** partnership@upbit.com (partnerships)
- **Subject:** For compliance and listings: XRPL issuer powers and partial payments

> For the listings or compliance team; please forward from partnerships.
>
> For XRP Ledger tokens, two facts sit outside wallet screening:
> - **The issuer's configured powers:** freeze, required authorisation, clawback, and whether one key can sign for the issuer.
> - **Partial payments:** a deposit can succeed while delivering a fraction of its stated amount, and crediting the stated figure is a known exchange exploit.
>
> NOSHASHI reads issuer powers from validated mainnet into a signed, ledger-stamped certificate. That is useful at listing review and as a monitor that alerts when a listed issuer changes a flag. It also checks deposits against `delivered_amount`.
>
> NOSHASHI is in beta (v1.0.9). Would a 20-minute call be useful? Happy to continue by email in English.

### 18. Archax

- **To:** info@archax.com (general)
- **Subject:** For compliance: independent evidence on XRPL-issued assets

> For the compliance or digital securities team. We are writing because Archax lists tokenized assets, some of which are issued on the XRP Ledger.
>
> An XRPL token's issuing account can keep powers the holder never sees in a wallet:
> - freezing the holder's line;
> - requiring authorisation;
> - clawing tokens back;
> - letting a single key sign for all of it.
>
> These are readable ledger facts, and they change the risk of the asset whatever the holder's own behaviour.
>
> NOSHASHI reads them from validated mainnet into a signed certificate stamped with the ledger index. It then monitors each issuer and alerts on changes: evidence you can keep for the FCA.
>
> NOSHASHI is in beta (v1.0.9). Would 20 minutes be useful? If not, reply and we won't write again.

---

## Asset managers

### 19. 21Shares

- **To:** compliance@21.co (compliance, 21Shares AG)
- **Subject:** For compliance: ledger evidence for physically backed XRP products

> For the compliance team at 21Shares AG, regarding the physically backed XRP products.
>
> For XRP held on its own ledger, the questions an auditor or regulator asks are existence and control. Does the backing exist at a given moment, and who can move it? The XRP Ledger answers both. Signing control is summed signer weight, and a master key can bypass a signer list. Escrow locks part of a balance that still appears as held.
>
> NOSHASHI reads those from validated mainnet for the wallets you choose. It exports a signed record stamped with the ledger index that anyone can re-check. It works from public data only.
>
> NOSHASHI is in beta (v1.0.9). Would 20 minutes be useful?

---

## Payments corridors

### 20. Unicambio

- **To:** comercial.corporate@unicambio.pt (corporate sales)
- **Subject:** For compliance: what an XRP Ledger payment actually delivered

> For whoever handles compliance for Unicâmbio's cross-border settlement. We are writing to this business address because it is the one Unicâmbio publishes for corporate contact.
>
> If any corridor settles on the XRP Ledger, one protocol detail matters. A payment's stated amount is a ceiling, not a delivery. A partial payment can succeed while delivering a fraction: in one measured case, 999,332 was stated and 3,958 delivered. The figure to credit is `delivered_amount`.
>
> NOSHASHI checks every settlement against it. It reads counterparty age and origin, and scopes Travel Rule obligations against your threshold, with a receipt for each decision.
>
> NOSHASHI is in beta (v1.0.9). Would a 20-minute call be useful? If not, just reply "no".

### 21. Nium

- **To:** partnerships@nium.com (partnerships)
- **Subject:** Settlement checks for XRP Ledger payouts

> For the partnerships team; please route to payments compliance if that fits better.
>
> For any payout flow that touches the XRP Ledger, one protocol detail causes real losses. A payment's stated amount is a maximum. With the partial-payment flag, a transaction succeeds having delivered only part of it: in one measured case, 999,332 stated and 3,958 delivered. Systems that credit the stated amount over-credit.
>
> NOSHASHI checks settlements against `delivered_amount` and reads counterparty provenance. It scopes Travel Rule obligations by jurisdiction threshold and issues a SHA-256 receipt for every decision. There is also a Compliance API for integration.
>
> NOSHASHI is in beta (v1.0.9). Would a 20-minute call be useful?

---

## Trading and funds

### 22. Logan Stone Capital

- **To:** info@loganstonecap.com (general)
- **Subject:** Funded vs listed depth on XRP Ledger order books

> For the portfolio or risk team.
>
> On the XRP Ledger, an offer stays on the book after its owner stops holding the asset. Listed depth is not what fills. We measured six pairs on 8 September (ledger 106,850,266):
> - Bitstamp USD: funded depth within 10% of mid equalled listed, 1.0x;
> - GateHub USD: 1.1x;
> - SOLO: 2,545x smaller than listed, with 94.7% of listed depth unfunded;
> - median across the six: 4.4x.
>
> NOSHASHI shows funded depth next to listed depth before size goes on. It checks the issuer's freeze and clawback powers alongside, from the same ledger reading.
>
> NOSHASHI is in beta (v1.0.9). Would 20 minutes be useful?
>
> (Method: the 10% band is our parameter; AMM pools excluded; 60 levels. Each pushes the gap up.)

### 23. Arrington Capital

- **To:** contact@arringtoncapital.com (general; check the firm's official channels page first, since impersonation is common)
- **Subject:** XRP Ledger exit depth and issuer powers, measured

> For the team covering XRP Ledger positions.
>
> Two measurements from validated mainnet:
>
> 1. **Listed depth overstates what fills.** On 8 September (ledger 106,850,266), funded depth within 10% of mid equalled listed depth on Bitstamp USD (1.0x). On SOLO it was 2,545x smaller. The median across six pairs was 4.4x. The gap is offers whose owners cannot fund them.
> 2. **Issuer powers.** Issuer powers such as freeze, clawback and single-key control are readable per issuer, and they change what a position is worth to hold.
>
> NOSHASHI puts both in one reading, with a signed record. It is relevant to your XRP work and to portfolio companies holding XRP on balance sheet.
>
> NOSHASHI is in beta (v1.0.9). Would 20 minutes be useful?
>
> (Method: the 10% band is our parameter; AMM excluded; 60 levels.)

---

## Audit

### 24. The Network Firm

- **To:** form on https://www.thenetworkfirm.com/financial-statement-audit-services
- **Subject:** Ledger-stamped existence and control evidence on the XRP Ledger

> For the digital asset audit and attestation team.
>
> For clients holding or issuing assets on the XRP Ledger, most of the evidence you need is on the ledger itself:
> - **Balances at a ledger index.**
> - **Control:** summed signer weight, and whether a master key bypasses the signer list.
> - **Issuer obligations**, per currency, from `gateway_balances`.
> - **What each payment actually delivered.** A partial payment succeeds while delivering a fraction of its stated amount.
>
> NOSHASHI reads these from validated mainnet and exports signed records stamped with the ledger index. An auditor can reproduce every one independently, without trusting the tool or the client.
>
> NOSHASHI is in beta (v1.0.9). We would value your view on what an audit team needs from it. Would a 20-minute call work?

---

## Not in this batch, and why

- **GateHub:** a strong fit, since its books appear in our measurements, but it publishes only a support portal. Find a business contact first.
- **StablR:** could not confirm that it issues on the XRP Ledger.
- **OpenEden, Mercado Bitcoin, Doppler Finance, Evernorth:** no published business channel was found. Evernorth is better reached through an introduction from its investors.
- **Kraken, Gemini, OKX, GSR, Grayscale, CoinShares and the other form-only priority-2 firms:** held for batch 2. The skill's order puts treasury holders, issuers and compliance functions first.
- **ProShares, Teucrium, Defiance:** their XRP products are futures or swap based, so there is no on-ledger position for NOSHASHI to evidence. Not a fit yet.
