# Weekly finding #1: what an issuer can still do

Source: a live reading from the free endpoint, taken 2026-10-08 14:14:54 UTC.

```
GET https://www.noshashi.app/api/authority?issuer=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De
ledgerIndex  107518139
verdict      hold
digest       BB4F087FCF32CF142801F10546912A81FEA008C4344DEAAAFF1542ED8F5DA1FC
```

| Check | Result at that ledger |
|---|---|
| Freeze permanently surrendered (lsfNoFreeze) | no: the issuer can still freeze holders' lines |
| Issuance frozen now (lsfGlobalFreeze) | no |
| Holding requires issuer permission (lsfRequireAuth) | no |
| Single key controls the issuer | no: master key disabled, no regular key, no signer list |
| Supply concentration | not measured in this reading. The tool abstained; it is not a pass |

Before posting:
1. Re-run the URL above and replace the ledger index, digest and time.
2. Don't name the token unless you have confirmed which token this
   address issues on the issuer's own page. The post below does not
   name it.
3. "No single key controls the issuer" means the account cannot sign
   anything right now. Don't make claims beyond that.

## X (under 280 characters)

```
An XRPL issuer address, read at ledger 107,518,139:

- can still freeze holders: yes
- global freeze on now: no
- needs permission to hold: no
- any key that can sign for it: none

Paste any issuer and get the same reading, with a SHA-256 digest:
noshashi.app/certificate
```

## LinkedIn

```
Before you hold an issued asset on the XRP Ledger, it's worth knowing
what the issuer can still do to your balance. The ledger records it
openly, but few people read it.

I read one issuer address (rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De) at
ledger 107,518,139 on 8 October 2026:

• It has not given up the power to freeze holders' trust lines.
• No global freeze is on right now.
• Anyone can hold the asset without the issuer's permission.
• The master key is disabled, and there is no regular key and no
  signer list.

None of this is a judgement. Regulated stablecoin issuers are often
expected to keep freeze powers. The point is to know before you hold,
and to have a record of what you knew and when.

I built a free tool that does this reading for any issuer and binds it
to a ledger index and a SHA-256 digest:
https://www.noshashi.app/certificate/

The source is public: https://github.com/Ignosha/noshashi
```

## Later weeks

Use the same format: one reading, its ledger index and date, one link.
Readings you can take for free:
- Issuer authority for any issuer: `/api/authority?issuer=…`. Add
  `&walk=1` to include supply concentration.
- Cases on `/misread/` where a basic read of the ledger and a verified
  read give different answers.
